const asaas        = require('./asaasService');
const emailSvc     = require('./emailService');
const contasDb     = require('../db/contas');
const autoDb       = require('../db/automacoes');
const auditoriaDb  = require('../db/auditoria');
const log          = require('../middleware/logger');

// ── Template engine simples ───────────────────────────────────────────────────
function renderTemplate(tpl, vars) {
  let out = tpl;
  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => vars[key] ? inner : '');
  Object.entries(vars).forEach(([k, v]) => {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v ?? '');
  });
  return out;
}

// ── Resolve conta ─────────────────────────────────────────────────────────────
function resolverConta(contaId) {
  if (!contaId) return { apiKey: undefined, emailFromOverride: undefined };
  const conta = contasDb.get(contaId);
  if (!conta) throw new Error(`Conta ${contaId} não encontrada`);
  const emailFromOverride = conta.emailFrom
    ? (conta.emailNome ? `${conta.emailNome} <${conta.emailFrom}>` : conta.emailFrom)
    : undefined;
  return { apiKey: conta.asaasApiKey, emailFromOverride };
}

// ── Data ISO por offset de dias (ex: hoje + 3 = daqui 3 dias) ────────────────
function dataOffset(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ── Retorna o prefixo YYYY-MM do mês atual ────────────────────────────────────
function mesAtualPrefix() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Primeiro e último dia do mês atual (YYYY-MM-DD) ───────────────────────────
function rangesMesAtual() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fim    = `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate().toString().padStart(2, '0')}`;
  return { inicio, fim };
}

// ── Busca pagamentos de acordo com o tipo de gatilho ─────────────────────────
async function buscarPagamentos(auto, apiKey) {
  const tipos   = auto.tiposPagamento || ['BOLETO'];
  const status  = auto.statusFiltro   || 'PENDING';
  const gatilho = auto.tipoGatilho    || 'mensal';

  if (gatilho === 'dia_vencimento') {
    // Vence hoje — já está no mês atual por definição
    return asaas.listarPorData({ data: dataOffset(0), billingTypes: tipos, status, apiKey });
  }
  if (gatilho === 'dias_antes') {
    // Vence em N dias — pode cruzar para o próximo mês, o filtro mensal abaixo garante
    const n = Number(auto.diasAntes) || 3;
    return asaas.listarPorData({ data: dataOffset(n), billingTypes: tipos, status, apiKey });
  }
  // 'mensal': busca somente boletos com vencimento no mês atual
  const { inicio, fim } = rangesMesAtual();
  const axios = require('axios');
  const key   = apiKey || process.env.ASAAS_API_KEY;
  if (!key || key === 'sua_chave_api_asaas') throw new Error('API Key não configurada');
  const cli = axios.create({
    baseURL: process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3',
    headers: { 'access_token': key },
    timeout: 20000,
  });
  const todos = await Promise.all(tipos.map(tipo =>
    cli.get('/payments', { params: { billingType: tipo, status, dueDateGe: inicio, dueDateLe: fim, limit: 100 } })
      .then(r => r.data.data || []).catch(() => [])
  ));
  return todos.flat();
}

// ── Executa uma automação ─────────────────────────────────────────────────────
async function executarAutomacao(auto) {
  log.info('Automação iniciada', { nome: auto.nome, gatilho: auto.tipoGatilho || 'mensal' });

  const { apiKey, emailFromOverride } = resolverConta(auto.contaId);
  let pagamentos = await buscarPagamentos(auto, apiKey);

  // Garante que apenas boletos do mês atual sejam enviados (regra inviolável)
  const prefixoMes = mesAtualPrefix();
  pagamentos = pagamentos.filter(p => p.dueDate && p.dueDate.startsWith(prefixoMes));

  // Filtro por clientes específicos (se configurado)
  if (auto.clientesFiltro?.length) {
    pagamentos = pagamentos.filter(p => auto.clientesFiltro.includes(p.customer));
  }

  if (!pagamentos.length) {
    log.info('Automação: nenhum pagamento encontrado', { nome: auto.nome });
    const resultado = { enviados: 0, erros: 0, semEmail: 0, total: 0, detalhes: [] };
    autoDb.registrarExecucao(auto.id, resultado);
    return resultado;
  }

  const agora    = new Date();
  const mes      = String(agora.getMonth() + 1).padStart(2, '0');
  const ano      = String(agora.getFullYear());
  const detalhes = [];
  let enviados = 0, erros = 0, semEmail = 0;

  for (const pag of pagamentos) {
    try {
      const cliente     = pag.customer ? await asaas.getCliente(pag.customer, apiKey) : null;
      const emailDest   = cliente?.email;
      if (!emailDest) { semEmail++; detalhes.push({ id: pag.id, status: 'sem_email', cliente: cliente?.name }); continue; }

      const nomeCliente = cliente?.name || 'Cliente';
      const valor       = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pag.value || 0);
      const [y, m, d]   = (pag.dueDate || '').split('-');
      const vencimento  = pag.dueDate ? `${d}/${m}/${y}` : '—';
      const linkBoleto  = pag.bankSlipUrl || pag.invoiceUrl || '';
      const tipoPag     = pag.billingType === 'PIX' ? 'PIX' : 'boleto';

      const vars    = { nome: nomeCliente, valor, vencimento, mes, ano, linkBoleto, tipoPagamento: tipoPag };
      const assunto = renderTemplate(auto.assunto || '', vars);
      const corpo   = renderTemplate(auto.corpo   || '', vars);

      let pdfBuffer = null;
      if (auto.anexarPdf && pag.billingType === 'BOLETO' && pag.bankSlipUrl) {
        pdfBuffer = await asaas.downloadPdf(pag.bankSlipUrl).catch(() => null);
      }

      await emailSvc.enviar({ to: emailDest, subject: assunto, body: corpo, pdfBuffer, boletoId: pag.id, clienteNome: nomeCliente, emailFromOverride });
      enviados++;
      detalhes.push({ id: pag.id, email: emailDest, cliente: nomeCliente, status: 'enviado' });
      log.ok('Email enviado (automação)', { email: emailDest, id: pag.id });
    } catch (err) {
      erros++;
      detalhes.push({ id: pag.id, status: 'erro', erro: err.message });
      log.error('Erro ao enviar (automação)', { id: pag.id, erro: err.message });
    }
  }

  const resultado = { enviados, erros, semEmail, total: pagamentos.length, detalhes };
  autoDb.registrarExecucao(auto.id, resultado);
  auditoriaDb.registrar({
    tipo:    'automacao_executada',
    usuario: 'sistema',
    detalhe: `"${auto.nome}": ${enviados} env, ${erros} err, ${semEmail} sem e-mail`,
  });
  log.ok('Automação concluída', { nome: auto.nome, enviados, erros });

  // Notificação ao admin
  if (auto.notificarAdmin && auto.emailNotificacao) {
    try {
      const assunto = `[BoletoHub] Automação "${auto.nome}" — ${enviados} enviado(s)`;
      const corpo   = [
        `Automação executada: ${auto.nome}`,
        `Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        '',
        'Resultado:',
        `  Total encontrado : ${pagamentos.length}`,
        `  Enviados         : ${enviados}`,
        `  Sem e-mail       : ${semEmail}`,
        `  Erros            : ${erros}`,
      ].join('\n');
      await emailSvc.enviar({ to: auto.emailNotificacao, subject: assunto, body: corpo, emailFromOverride });
    } catch (e) { log.warn('Notificação admin falhou', { erro: e.message }); }
  }

  return resultado;
}

// ── Cron: verifica automações agendadas para agora ───────────────────────────
async function executarAgendadas() {
  const agora      = new Date();
  const hoje       = agora.getDate();
  const horaAtual  = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;

  const candidatas = autoDb.list().filter(a => {
    if (!a.ativa) return false;
    const hora = a.hora || '08:00';
    if (hora !== horaAtual) return false;
    const gatilho = a.tipoGatilho || 'mensal';
    if (gatilho === 'mensal') return Number(a.diaDoMes) === hoje;
    // dias_antes e dia_vencimento: rodam todo dia na hora configurada
    return true;
  });

  for (const auto of candidatas) {
    try { await executarAutomacao(auto); }
    catch (err) {
      autoDb.registrarExecucao(auto.id, { erro: err.message });
      log.error('Erro na automação agendada', { nome: auto.nome, erro: err.message });
    }
  }
}

// ── Simulação: mostra o que seria enviado sem mandar nenhum e-mail ────────────
async function simularAutomacao(auto) {
  const { apiKey } = resolverConta(auto.contaId);
  let pagamentos = await buscarPagamentos(auto, apiKey);

  // Mesma regra inviolável do mês atual
  const prefixoMes = mesAtualPrefix();
  pagamentos = pagamentos.filter(p => p.dueDate && p.dueDate.startsWith(prefixoMes));

  if (auto.clientesFiltro?.length) {
    pagamentos = pagamentos.filter(p => auto.clientesFiltro.includes(p.customer));
  }

  const agora = new Date();
  const mesLabel = agora.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const alvos = [];

  for (const pag of pagamentos) {
    const cliente = pag.customer ? await asaas.getCliente(pag.customer, apiKey) : null;
    const [y, m, d] = (pag.dueDate || '').split('-');
    alvos.push({
      id:         pag.id,
      cliente:    cliente?.name || '—',
      email:      cliente?.email || null,
      valor:      pag.value || 0,
      vencimento: pag.dueDate ? `${d}/${m}/${y}` : '—',
      tipo:       pag.billingType === 'PIX' ? 'PIX' : 'Boleto',
      temEmail:   !!cliente?.email,
    });
  }

  const semEmail = alvos.filter(a => !a.temEmail).length;
  return {
    mesReferencia: mesLabel,
    prefixoMes,
    total:    alvos.length,
    comEmail: alvos.length - semEmail,
    semEmail,
    alvos,
  };
}

module.exports = { executarAutomacao, executarAgendadas, simularAutomacao };
