const express   = require('express');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
const db  = require('../db/database');
const log = require('../middleware/logger');

// Rate limit: máx 100 requisições por minuto por IP
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Validação do token Asaas — comparação timing-safe (evita timing attacks)
function validateToken(req, res, next) {
  const token    = req.headers['asaas-access-token']; // nunca aceita query string
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expected) {
    if (!token) {
      log.warn('Webhook: token ausente', { ip: req.ip });
      return res.status(401).json({ erro: 'Token ausente' });
    }
    try {
      const a = Buffer.from(token.padEnd(expected.length));
      const b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        log.warn('Webhook: token inválido', { ip: req.ip });
        return res.status(401).json({ erro: 'Token inválido' });
      }
    } catch {
      return res.status(401).json({ erro: 'Token inválido' });
    }
  }
  next();
}

// Handlers por evento
const handlers = {
  PAYMENT_RECEIVED(payload) {
    const { payment } = payload;
    db.updateBoleto(payment.externalReference, { status: 'RECEIVED', pagoEm: payment.paymentDate, valorPago: payment.value });
    log.ok('Boleto PAGO', { id: payment.id, valor: payment.value });
  },
  PAYMENT_OVERDUE(payload) {
    const { payment } = payload;
    db.updateBoleto(payment.externalReference, { status: 'OVERDUE', vencidoEm: new Date().toISOString() });
    log.warn('Boleto VENCIDO', { id: payment.id });
  },
  PAYMENT_CREATED(payload) {
    const { payment } = payload;
    log.info('Boleto CRIADO no Asaas', { id: payment.id, valor: payment.value });
  },
  PAYMENT_DELETED(payload) {
    const { payment } = payload;
    db.updateBoleto(payment.externalReference, { status: 'CANCELLED' });
    log.warn('Boleto CANCELADO', { id: payment.id });
  },
  PAYMENT_UPDATED(payload) {
    const { payment } = payload;
    db.updateBoleto(payment.externalReference, { status: payment.status });
    log.info('Boleto ATUALIZADO', { id: payment.id, status: payment.status });
  },
};

// POST /boletos/webhook/asaas
router.post('/', webhookLimiter, validateToken, (req, res) => {
  const payload = req.body;
  const evento = payload.event;

  log.info(`Webhook recebido: ${evento}`);
  db.addEvento({ evento, payload });

  const handler = handlers[evento];
  if (handler) {
    try { handler(payload); } catch (e) { log.error('Erro no handler', { evento, erro: e.message }); }
  } else {
    log.info(`Evento não tratado: ${evento}`);
  }

  res.json({ recebido: true, evento });
});

// GET /boletos/webhook/asaas/health — protegido por token
router.get('/health', validateToken, (req, res) => {
  res.json({ status: 'ok', eventos: db.getEventos().length, timestamp: new Date().toISOString() });
});

module.exports = router;
