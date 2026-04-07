const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE     = path.join(DATA_DIR, 'automacoes.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE))     fs.writeFileSync(FILE, JSON.stringify({ automacoes: [] }, null, 2));

function load() { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }

module.exports = {
  list() { return load().automacoes; },

  get(id) { return load().automacoes.find(a => a.id === id) || null; },

  create(data) {
    const db = load();
    const nova = {
      id:             `auto_${Date.now()}`,
      nome:           data.nome || 'Nova automação',
      contaId:        data.contaId || '',
      ativa:            data.ativa            ?? false,
      tipoGatilho:      data.tipoGatilho      || 'mensal',
      diaDoMes:         data.diaDoMes         || 1,
      diasAntes:        data.diasAntes        || 3,
      hora:             data.hora             || '08:00',
      tiposPagamento:   data.tiposPagamento   || ['BOLETO'],
      statusFiltro:     data.statusFiltro     || 'PENDING',
      clientesFiltro:   data.clientesFiltro   || [],
      assunto:          data.assunto          || 'Seu boleto de {{mes}}/{{ano}} está disponível',
      corpo:            data.corpo            || 'Olá, {{nome}}!\n\nSegue o boleto referente ao mês de {{mes}}/{{ano}}.\n\nValor: {{valor}}\nVencimento: {{vencimento}}\n\n{{#linkBoleto}}Acesse seu boleto: {{linkBoleto}}\n\n{{/linkBoleto}}Qualquer dúvida, entre em contato.\n\nAtenciosamente.',
      anexarPdf:        data.anexarPdf        ?? false,
      notificarAdmin:    data.notificarAdmin    ?? false,
      emailNotificacao:  data.emailNotificacao  || '',
      enviarEmail:       data.enviarEmail       ?? true,
      enviarWhatsApp:    data.enviarWhatsApp    ?? false,
      mensagemWhatsApp:  data.mensagemWhatsApp  || 'Olá, {{nome}}! Seu boleto de {{valor}} vence em {{vencimento}}. {{#linkBoleto}}Acesse: {{linkBoleto}}{{/linkBoleto}}',
      criadaEm:       new Date().toISOString(),
    };
    db.automacoes.push(nova);
    save(db);
    return nova;
  },

  update(id, patch) {
    const db  = load();
    const idx = db.automacoes.findIndex(a => a.id === id);
    if (idx === -1) return null;
    db.automacoes[idx] = { ...db.automacoes[idx], ...patch, atualizadaEm: new Date().toISOString() };
    save(db);
    return db.automacoes[idx];
  },

  registrarExecucao(id, resultado) {
    const db  = load();
    const idx = db.automacoes.findIndex(a => a.id === id);
    if (idx === -1) return;
    db.automacoes[idx].ultimaExecucao  = new Date().toISOString();
    db.automacoes[idx].ultimoResultado = resultado;
    save(db);
  },

  delete(id) {
    const db  = load();
    const idx = db.automacoes.findIndex(a => a.id === id);
    if (idx === -1) return false;
    db.automacoes.splice(idx, 1);
    save(db);
    return true;
  },
};
