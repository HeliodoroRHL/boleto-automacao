require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const cron         = require('node-cron');
const path         = require('path');
const bcrypt       = require('bcryptjs');

const db          = require('./db/database');
const usersDb     = require('./db/users');
const log         = require('./middleware/logger');
const requireAuth = require('./middleware/authMiddleware');

const authRoutes       = require('./routes/auth');
const webhookRoutes    = require('./routes/webhook');
const boletosRoutes    = require('./routes/boletos');
const painelRoutes     = require('./routes/painel');
const contasRoutes     = require('./routes/contas');
const automacoesRoutes = require('./routes/automacoes');
const smtpRoutes       = require('./routes/smtp');
const auditoriaRoutes  = require('./routes/auditoria');
const configRoutes     = require('./routes/config');
const autoSvc          = require('./services/automacaoService');

const app  = express();
const PORT = process.env.PORT || 3003;

// Confia no proxy reverso (nginx) — necessário para express-rate-limit ler o IP real
app.set('trust proxy', 1);

// ── Segurança: cabeçalhos HTTP ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],
      scriptSrcAttr:  ["'unsafe-inline'"],   // permite onclick nos elementos do SPA
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:'],
      connectSrc:     ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS — restrito à própria origem ──────────────────────────────────────────
app.use(cors({
  origin: false,           // bloqueia CORS de outras origens
  credentials: true,
}));

// ── Middlewares base ──────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(log.http);

// ── Frontend estático ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public'), {
  index: 'index.html',
  dotfiles: 'deny',          // nunca servir .env, .git etc.
}));

// ── Rotas públicas ────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);

// Webhook Asaas — usa token próprio do Asaas (não precisa de sessão de usuário)
app.use('/webhook/asaas', webhookRoutes);

// Health (sem autenticação — usado por monitoramento)
app.get('/health', (req, res) => res.json({ status: 'ok', servico: 'boleto-automacao' }));

// ── Rotas protegidas ──────────────────────────────────────────────────────────
app.use('/api/boletos',     requireAuth, boletosRoutes);
app.use('/api/painel',     requireAuth, painelRoutes);
app.use('/api/contas',     requireAuth, contasRoutes);
app.use('/api/automacoes', requireAuth, automacoesRoutes);
app.use('/api/smtp',       requireAuth, smtpRoutes);
app.use('/api/auditoria',  requireAuth, auditoriaRoutes);
app.use('/api/config',     requireAuth, configRoutes);

// Rota 404 para API
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Fallback SPA (todas as rotas não-API servem o index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Error handler global ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  log.error('Erro interno', { path: req.path, erro: err.message });
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

// ── Cron: automações de email (a cada minuto, verifica hora configurada) ──────
cron.schedule('* * * * *', async () => {
  try { await autoSvc.executarAgendadas(); }
  catch (err) { log.error('Cron automações', { erro: err.message }); }
});

// ── Cron: marca boletos locais como vencidos (09h) ────────────────────────────
cron.schedule('0 9 * * *', () => {
  const hoje = new Date().toISOString().split('T')[0];
  const boletos = db.getBoletos();
  let n = 0;
  boletos.forEach(b => {
    if (b.status === 'PENDING' && b.dataVencimento < hoje) {
      db.updateBoleto(b.id, { status: 'OVERDUE' });
      n++;
    }
  });
  if (n > 0) log.warn(`Cron: ${n} boleto(s) marcados como vencidos`);
});

// ── Usuário inicial ───────────────────────────────────────────────────────────
async function criarUsuarioInicial() {
  if (usersDb.count() > 0) return;

  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const nome     = process.env.ADMIN_NOME || 'Administrador';

  if (!email || !password) {
    log.warn('Nenhum usuário cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env e reinicie.');
    return;
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    log.warn('JWT_SECRET ausente ou muito curto (min 32 chars). Defina no .env.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  usersDb.create({ email, nome, passwordHash });
  log.ok(`Usuário inicial criado: ${email}`);
}

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, '127.0.0.1', async () => {
  await criarUsuarioInicial();
  log.ok(`BoletoHub iniciado na porta ${PORT}`);
});

process.on('SIGTERM', () => server.close(() => log.info('Servidor encerrado.')));
process.on('SIGINT',  () => server.close(() => log.info('Servidor encerrado.')));
