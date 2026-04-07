const express = require('express');
const router = express.Router();
const db = require('../db/database');
const log = require('../middleware/logger');

// Validação do token Asaas
function validateToken(req, res, next) {
  const token = req.headers['asaas-access-token'] || req.query.token;
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expected && token !== expected) {
    log.warn('Webhook: token inválido', { ip: req.ip });
    return res.status(401).json({ erro: 'Token inválido' });
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
router.post('/', validateToken, (req, res) => {
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

// GET /boletos/webhook/asaas/health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', eventos: db.getEventos().length, timestamp: new Date().toISOString() });
});

// POST /boletos/webhook/asaas/test  — simula evento para testes
router.post('/test', (req, res) => {
  const { tipo = 'PAYMENT_RECEIVED' } = req.body;
  const fakePayload = {
    event: tipo,
    payment: {
      id: `fake_${Date.now()}`,
      externalReference: req.body.boletoId || null,
      value: 150.00,
      paymentDate: new Date().toISOString().split('T')[0],
      status: 'RECEIVED',
    },
  };
  const handler = handlers[tipo];
  if (handler) { try { handler(fakePayload); } catch (e) { /* ignora */ } }
  db.addEvento({ evento: tipo, payload: fakePayload, teste: true });
  log.info(`Evento de teste simulado: ${tipo}`);
  res.json({ simulado: true, tipo, payload: fakePayload });
});

module.exports = router;
