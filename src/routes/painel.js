const express    = require('express');
const rateLimit  = require('express-rate-limit');
const router     = express.Router();
const asaas      = require('../services/asaasService');
const email      = require('../services/emailService');
const db         = require('../db/database');
const contasDb   = require('../db/contas');
const log        = require('../middleware/logger');

// Rate limit: máx 30 e-mails manuais por minuto por IP
const emailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { erro: 'Muitos envios. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit: criação de cobranças/assinaturas/links — máx 20 por minuto por IP
const criacaoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { erro: 'Muitas requisições. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Resolve a API key de uma conta pelo ID (ou usa padrão do .env)
function resolverConta(contaId) {
  if (!contaId) return { apiKey: undefined, emailFromOverride: undefined, nomeConta: 'Padrão' };
  const conta = contasDb.get(contaId);
  if (!conta) throw Object.assign(new Error('Recurso não encontrado'), { status: 404 });
  let emailFromOverride;
  if (conta.emailFrom) {
    emailFromOverride = conta.emailNome ? `${conta.emailNome} <${conta.emailFrom}>` : conta.emailFrom;
  }
  return { apiKey: conta.asaasApiKey, emailFromOverride, nomeConta: conta.nome };
}

// ── Boletos ───────────────────────────────────────────────────────────────────

router.get('/boletos', async (req, res) => {
  try {
    const { contaId, status, offset, limit, dueDateGe, dueDateLe } = req.query;
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const VALID_STATUS = ['PENDING', 'RECEIVED', 'OVERDUE', 'CANCELLED', 'REFUNDED'];
    const statusSafe    = VALID_STATUS.includes(status) ? status : undefined;
    const dueDateGeSafe = DATE_RE.test(dueDateGe) ? dueDateGe : undefined;
    const dueDateLeSafe = DATE_RE.test(dueDateLe) ? dueDateLe : undefined;
    const { apiKey } = resolverConta(contaId);
    const data = await asaas.listarBoletos({ status: statusSafe, offset: +offset || 0, limit: +limit || 50, dueDateGe: dueDateGeSafe, dueDateLe: dueDateLeSafe, apiKey });

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

router.put('/boletos/:id', async (req, res) => {
  try {
    const { contaId } = req.query;
    const { value, dueDate, description } = req.body || {};
    const { apiKey } = resolverConta(contaId);
    const atualizado = await asaas.atualizarPagamento({
      id: req.params.id,
      value:       value       !== undefined ? Number(value) : undefined,
      dueDate:     dueDate     || undefined,
      description: description || undefined,
      apiKey,
    });
    log.ok('Cobrança atualizada', { id: req.params.id });
    res.json(atualizado);
  } catch (e) {
    log.error('Erro ao atualizar cobrança', { erro: e.message });
    res.status(e.status || 502).json({ erro: e.response?.data?.errors?.[0]?.description || e.message });
  }
});

router.get('/boletos/:id/pix', async (req, res) => {
  try {
    const { contaId } = req.query;
    const { apiKey } = resolverConta(contaId);
    const pix = await asaas.getPixQrCode(req.params.id, apiKey);
    res.json({ payload: pix?.payload || null, expirationDate: pix?.expirationDate || null });
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

// ── Cobranças (criar) ─────────────────────────────────────────────────────────

// POST /api/painel/cobrancas — cria uma nova cobrança no Asaas
router.post('/cobrancas', criacaoLimiter, async (req, res) => {
  try {
    const { contaId, customer, customerName, customerCpfCnpj, customerEmail,
            billingType, value, dueDate, description } = req.body || {};

    if (!billingType || !value || !dueDate) {
      return res.status(400).json({ erro: 'billingType, value e dueDate são obrigatórios' });
    }

    const { apiKey } = resolverConta(contaId);
    let customerId = customer;

    // Se não veio um ID de cliente, cria um novo no Asaas
    if (!customerId) {
      if (!customerName) return res.status(400).json({ erro: 'Informe o cliente ou o nome para criar um novo' });
      const novo = await asaas.criarCliente({
        name:     customerName,
        cpfCnpj:  customerCpfCnpj || undefined,
        email:    customerEmail   || undefined,
        apiKey,
      });
      customerId = novo.id;
    }

    const pagamento = await asaas.criarPagamento({
      customer:    customerId,
      billingType,
      value:       Number(value),
      dueDate,
      description: description || undefined,
      apiKey,
    });

    log.ok('Cobrança criada', { id: pagamento.id, value, billingType, contaId });
    res.json(pagamento);
  } catch (e) {
    log.error('Erro ao criar cobrança', { erro: e.message });
    res.status(e.status || 502).json({ erro: e.response?.data?.errors?.[0]?.description || e.message });
  }
});

// POST /api/painel/assinaturas — cria cobrança recorrente no Asaas
router.post('/assinaturas', criacaoLimiter, async (req, res) => {
  try {
    const { contaId, customer, customerName, customerCpfCnpj, customerEmail,
            billingType, value, nextDueDate, cycle, description, endDate, maxPayments } = req.body || {};

    if (!billingType || !value || !nextDueDate || !cycle) {
      return res.status(400).json({ erro: 'billingType, value, nextDueDate e cycle são obrigatórios' });
    }

    const { apiKey } = resolverConta(contaId);
    let customerId = customer;

    if (!customerId) {
      if (!customerName) return res.status(400).json({ erro: 'Informe o cliente ou o nome para criar um novo' });
      const novo = await asaas.criarCliente({
        name: customerName, cpfCnpj: customerCpfCnpj || undefined,
        email: customerEmail || undefined, apiKey,
      });
      customerId = novo.id;
    }

    const assinatura = await asaas.criarAssinatura({
      customer: customerId, billingType, value: Number(value),
      nextDueDate, cycle, description: description || undefined,
      endDate: endDate || undefined,
      maxPayments: maxPayments ? Number(maxPayments) : undefined,
      apiKey,
    });

    log.ok('Assinatura criada', { id: assinatura.id, cycle, value, contaId });
    res.json(assinatura);
  } catch (e) {
    log.error('Erro ao criar assinatura', { erro: e.message });
    res.status(e.status || 502).json({ erro: e.response?.data?.errors?.[0]?.description || e.message });
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

router.post('/email/enviar', emailLimiter, async (req, res) => {
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

// ── Saldo + Estatísticas ──────────────────────────────────────────────────────
router.get('/saldo', async (req, res) => {
  try {
    const { contaId } = req.query;
    const { apiKey } = resolverConta(contaId);
    const [saldo, stats] = await Promise.all([
      asaas.getSaldo(apiKey),
      asaas.getEstatisticasPagamentos(apiKey),
    ]);
    res.json({ balance: saldo.balance, ...stats });
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.message });
  }
});

// ── Notas Fiscais ─────────────────────────────────────────────────────────────
router.get('/notas-fiscais', async (req, res) => {
  try {
    const { contaId, status, offset, limit } = req.query;
    const { apiKey } = resolverConta(contaId);
    const data = await asaas.listarNotasFiscais({ status, offset: +offset || 0, limit: +limit || 50, apiKey });
    // Enriquece com nome do cliente
    if (data.data) {
      await Promise.all(data.data.map(async nf => {
        if (!nf.customerName && nf.customer) {
          const cli = await asaas.getCliente(nf.customer, apiKey);
          if (cli?.name) nf.customerName = cli.name;
        }
      }));
    }
    res.json(data);
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.message });
  }
});

// ── Links de Pagamento ────────────────────────────────────────────────────────
router.get('/links-pagamento', async (req, res) => {
  try {
    const { contaId, offset, limit } = req.query;
    const { apiKey } = resolverConta(contaId);
    const data = await asaas.listarLinksPagamento({ offset: +offset || 0, limit: +limit || 50, apiKey });
    res.json(data);
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.message });
  }
});

router.post('/links-pagamento', criacaoLimiter, async (req, res) => {
  try {
    const { contaId, name, billingType, chargeType, value, description, endDate, maxInstallmentCount, subscriptionCycle } = req.body || {};
    if (!name || !billingType || !chargeType || !value) {
      return res.status(400).json({ erro: 'name, billingType, chargeType e value são obrigatórios' });
    }
    const { apiKey } = resolverConta(contaId);
    const link = await asaas.criarLinkPagamento({ name, billingType, chargeType, value: Number(value), description, endDate, maxInstallmentCount: maxInstallmentCount ? Number(maxInstallmentCount) : undefined, subscriptionCycle, apiKey });
    log.ok('Link de pagamento criado', { id: link.id, name });
    res.json(link);
  } catch (e) {
    log.error('Erro ao criar link de pagamento', { erro: e.message });
    res.status(e.status || 502).json({ erro: e.response?.data?.errors?.[0]?.description || e.message });
  }
});

// ── Parcelamentos ─────────────────────────────────────────────────────────────
router.get('/parcelamentos', async (req, res) => {
  try {
    const { contaId, offset, limit } = req.query;
    const { apiKey } = resolverConta(contaId);
    const data = await asaas.listarParcelamentos({ offset: +offset || 0, limit: +limit || 50, apiKey });
    // Enriquece com nome do cliente via pagamentos do parcelamento
    if (data.data) {
      await Promise.all(data.data.map(async inst => {
        try {
          const pags = await asaas.listarPagamentosParcelamento(inst.id, apiKey);
          const primeiro = pags?.data?.[0];
          if (primeiro?.customer) {
            const cli = await asaas.getCliente(primeiro.customer, apiKey);
            inst.customerName = cli?.name || null;
            inst.customerId   = primeiro.customer;
            inst.dueDate      = primeiro.dueDate;
          }
        } catch {}
      }));
    }
    res.json(data);
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.message });
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
