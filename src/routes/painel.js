const express   = require('express');
const router    = express.Router();
const asaas     = require('../services/asaasService');
const email     = require('../services/emailService');
const db        = require('../db/database');
const contasDb  = require('../db/contas');
const log       = require('../middleware/logger');

// Resolve a API key de uma conta pelo ID (ou usa padrão do .env)
function resolverConta(contaId) {
  if (!contaId) return { apiKey: undefined, emailFromOverride: undefined, nomeConta: 'Padrão' };
  const conta = contasDb.get(contaId);
  if (!conta) throw Object.assign(new Error('Conta não encontrada'), { status: 404 });
  let emailFromOverride;
  if (conta.emailFrom) {
    emailFromOverride = conta.emailNome ? `${conta.emailNome} <${conta.emailFrom}>` : conta.emailFrom;
  }
  return { apiKey: conta.asaasApiKey, emailFromOverride, nomeConta: conta.nome };
}

// ── Boletos ───────────────────────────────────────────────────────────────────

router.get('/boletos', async (req, res) => {
  try {
    const { contaId, status, offset, limit } = req.query;
    const { apiKey } = resolverConta(contaId);
    const data = await asaas.listarBoletos({ status, offset: +offset || 0, limit: +limit || 50, apiKey });

    // Garante que customerName seja preenchido — às vezes o Asaas retorna nulo
    if (data.data) {
      await Promise.all(data.data.map(async b => {
        if (!b.customerName && b.customer) {
          const cli = await asaas.getCliente(b.customer, apiKey);
          if (cli?.name) b.customerName = cli.name;
        }
      }));
    }

    res.json(data);
  } catch (e) {
    log.error('Erro ao listar boletos', { erro: e.message });
    res.status(e.status || 502).json({ erro: e.message });
  }
});

router.get('/boletos/:id', async (req, res) => {
  try {
    const { contaId } = req.query;
    const { apiKey } = resolverConta(contaId);
    const boleto  = await asaas.getBoleto(req.params.id, apiKey);
    const cliente = boleto.customer ? await asaas.getCliente(boleto.customer, apiKey) : null;
    res.json({ ...boleto, clienteDados: cliente });
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.message });
  }
});

router.get('/boletos/:id/cliente', async (req, res) => {
  try {
    const { contaId } = req.query;
    const { apiKey } = resolverConta(contaId);
    const boleto  = await asaas.getBoleto(req.params.id, apiKey);
    if (!boleto.customer) return res.json({ email: null, nome: null });
    const cliente = await asaas.getCliente(boleto.customer, apiKey);
    res.json({ email: cliente?.email || null, nome: cliente?.name || null });
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.message });
  }
});

// ── Clientes ──────────────────────────────────────────────────────────────────

router.get('/clientes', async (req, res) => {
  try {
    const { contaId, limit = 100, offset = 0 } = req.query;
    const { apiKey } = resolverConta(contaId);
    const data = await asaas.listarClientes({ limit: +limit, offset: +offset, apiKey });
    res.json(data);
  } catch (e) {
    log.error('Erro ao listar clientes', { erro: e.message });
    res.status(e.status || 502).json({ erro: e.message });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const { contaId } = req.query;
    const { apiKey } = resolverConta(contaId);
    const stats = await asaas.getStats(apiKey);
    res.json(stats);
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.message });
  }
});

// ── Email ─────────────────────────────────────────────────────────────────────

router.post('/email/enviar', async (req, res) => {
  try {
    const { to, cc, subject, body, boletoId, attachPdf, contaId } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ erro: 'to, subject e body são obrigatórios' });

    const { apiKey, emailFromOverride } = resolverConta(contaId);

    let pdfBuffer   = null;
    let clienteNome = null;

    if (boletoId) {
      const boleto = await asaas.getBoleto(boletoId, apiKey);
      if (boleto.customer) {
        const c = await asaas.getCliente(boleto.customer, apiKey);
        clienteNome = c?.name;
      }
      if (attachPdf && boleto.bankSlipUrl) {
        pdfBuffer = await asaas.downloadPdf(boleto.bankSlipUrl);
        if (!pdfBuffer) log.warn('PDF não disponível, enviando sem anexo');
      }
    }

    await email.enviar({ to, cc, subject, body, pdfBuffer, boletoId, clienteNome, emailFromOverride });
    log.ok('Email enviado', { to, contaId, comPdf: !!pdfBuffer });
    res.json({ enviado: true, comPdf: !!pdfBuffer });
  } catch (e) {
    log.error('Erro ao enviar email', { erro: e.message });
    res.status(e.status || 500).json({ erro: e.message });
  }
});

router.get('/email/historico', (req, res) => res.json(db.getHistoricoEmails()));

// Resumo de emails para o dashboard
router.get('/email/resumo', (req, res) => {
  const todos   = db.getHistoricoEmails();
  const agora   = new Date();
  const mes     = agora.getMonth();
  const ano     = agora.getFullYear();
  const hoje    = agora.toISOString().split('T')[0];
  const semana  = new Date(agora - 7 * 86400000).toISOString();

  const doMes   = todos.filter(e => { const d = new Date(e.enviadoEm); return d.getMonth()===mes && d.getFullYear()===ano; });
  const deHoje  = todos.filter(e => e.enviadoEm?.startsWith(hoje));
  const semana7 = todos.filter(e => e.enviadoEm > semana);

  // Últimos 5 envios
  const recentes = todos.slice(0, 5).map(e => ({
    id:         e.id,
    to:         e.to,
    cliente:    e.clienteNome,
    assunto:    e.subject,
    enviadoEm:  e.enviadoEm,
    comPdf:     e.comPdf,
    status:     e.status || 'enviado',
  }));

  res.json({
    totalMes:    doMes.length,
    totalHoje:   deHoje.length,
    totalSemana: semana7.length,
    totalGeral:  todos.length,
    recentes,
  });
});

router.post('/email/testar', async (req, res) => {
  try {
    await email.testarConexao();
    res.json({ ok: true, mensagem: 'Conexão SMTP funcionando' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

module.exports = router;
