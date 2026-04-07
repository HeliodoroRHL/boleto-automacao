const express      = require('express');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const rateLimit    = require('express-rate-limit');
const router       = express.Router();
const users        = require('../db/users');
const auditoriaDb  = require('../db/auditoria');
const log          = require('../middleware/logger');
const requireAuth  = require('../middleware/authMiddleware');

// Brute-force protection: max 10 tentativas por IP a cada 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Hash fixo para comparação dummy (evita user enumeration via timing)
let DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8O/LH9mQy8v6v3ZxLm2';

const COOKIE = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   8 * 60 * 60 * 1000, // 8 horas
};

// POST /auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ erro: 'E-mail e senha são obrigatórios' });
  }

  const user = users.findByEmail(email);

  // Compara mesmo quando o usuário não existe (previne timing attack)
  const hash  = user ? user.passwordHash : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    log.warn('Tentativa de login inválida', { email: email.slice(0, 60), ip: req.ip });
    auditoriaDb.registrar({ tipo: 'login_falha', usuario: email.slice(0, 60), ip: req.ip, detalhe: 'Credenciais inválidas' });
    return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
  }

  const token = jwt.sign(
    { sub: user.email, nome: user.nome },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.cookie('bhtoken', token, COOKIE);
  auditoriaDb.registrar({ tipo: 'login', usuario: user.email, ip: req.ip });
  log.ok('Login bem-sucedido', { email: user.email });
  res.json({ ok: true, nome: user.nome, email: user.email });
});

// POST /auth/logout
router.post('/logout', requireAuth, (req, res) => {
  auditoriaDb.registrar({ tipo: 'logout', usuario: req.user?.sub, ip: req.ip });
  res.clearCookie('bhtoken', { httpOnly: true, sameSite: 'strict' });
  res.json({ ok: true });
});

// GET /auth/me — verifica sessão atual
router.get('/me', requireAuth, (req, res) => {
  res.json({ email: req.user.sub, nome: req.user.nome });
});

// PUT /auth/perfil — altera email, nome e/ou senha
router.put('/perfil', requireAuth, async (req, res) => {
  const { nome, email, senhaAtual, novaSenha } = req.body || {};

  const user = users.findByEmail(req.user.sub);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });

  // Sempre exige a senha atual para confirmar a identidade
  if (!senhaAtual) return res.status(400).json({ erro: 'Informe a senha atual para salvar alterações' });
  const valid = await bcrypt.compare(senhaAtual, user.passwordHash);
  if (!valid) return res.status(401).json({ erro: 'Senha atual incorreta' });

  const patch = {};
  if (nome?.trim())  patch.nome = nome.trim();
  if (email?.trim()) patch.email = email.trim().toLowerCase();
  if (novaSenha) {
    if (novaSenha.length < 8)
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 8 caracteres' });
    if (!/[A-Z]/.test(novaSenha))
      return res.status(400).json({ erro: 'A senha deve ter pelo menos uma letra maiúscula' });
    if (!/[0-9]/.test(novaSenha))
      return res.status(400).json({ erro: 'A senha deve ter pelo menos um número' });
    if (!/[^A-Za-z0-9]/.test(novaSenha))
      return res.status(400).json({ erro: 'A senha deve ter pelo menos um caractere especial (!@#$...)' });
    patch.passwordHash = await bcrypt.hash(novaSenha, 12);
  }

  users.update(req.user.sub, patch);

  // Regera o token com os novos dados
  const updated = users.findByEmail(patch.email || req.user.sub);
  const token = jwt.sign(
    { sub: updated.email, nome: updated.nome },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('bhtoken', token, COOKIE);
  auditoriaDb.registrar({ tipo: 'perfil_atualizado', usuario: updated.email, ip: req.ip, detalhe: novaSenha ? 'Senha alterada' : 'Dados atualizados' });
  log.ok('Perfil atualizado', { email: updated.email });
  res.json({ ok: true, nome: updated.nome, email: updated.email });
});

module.exports = router;
