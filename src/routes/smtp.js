const express  = require('express');
const router   = express.Router();
const smtpDb   = require('../db/smtp');
const email    = require('../services/emailService');
const log      = require('../middleware/logger');

// GET /api/smtp — retorna config mascarada
router.get('/', (req, res) => res.json(smtpDb.getMasked() || {}));

// PUT /api/smtp — salva config
router.put('/', (req, res) => {
  const { host, port, secure, user, password, from } = req.body || {};
  if (!host || !user) return res.status(400).json({ erro: 'host e user são obrigatórios' });

  // Preserva senha existente se o frontend enviar placeholder
  const current = smtpDb.get();
  const senhaFinal = (password && !password.startsWith('••')) ? password : (current?.password || '');

  const cfg = {
    host:   host.trim(),
    port:   parseInt(port) || 587,
    secure: secure === true || secure === 'true',
    user:   user.trim(),
    password: senhaFinal,
    from:   from?.trim() || user.trim(),
  };
  smtpDb.save(cfg);
  log.ok('SMTP configurado', { host: cfg.host, user: cfg.user });
  res.json(smtpDb.getMasked());
});

// POST /api/smtp/testar — testa conexão com config atual
router.post('/testar', async (req, res) => {
  try {
    await email.testarConexao();
    res.json({ ok: true, mensagem: 'Conexão SMTP funcionando corretamente.' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

module.exports = router;
