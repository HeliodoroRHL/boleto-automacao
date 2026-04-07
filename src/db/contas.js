const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE     = path.join(DATA_DIR, 'contas.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE))     fs.writeFileSync(FILE, JSON.stringify({ contas: [] }, null, 2));

function load() { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }

// Mascara a API key — só exibe os últimos 4 chars
function mascarar(c) {
  const key = c.asaasApiKey || '';
  return { ...c, asaasApiKey: key.length > 4 ? '****' + key.slice(-4) : '****' };
}

module.exports = {
  // Listagem pública (API key mascarada)
  list() { return load().contas.map(mascarar); },

  // Busca completa interna (nunca exposta ao frontend)
  get(id) { return load().contas.find(c => c.id === id) || null; },

  create({ nome, cnpj, asaasApiKey, emailFrom, emailNome }) {
    const db = load();
    const conta = {
      id:          `conta_${Date.now()}`,
      nome,
      cnpj:        (cnpj || '').replace(/\D/g, ''),
      asaasApiKey,
      emailFrom:   emailFrom  || '',
      emailNome:   emailNome  || nome,
      ativa:       true,
      criadaEm:    new Date().toISOString(),
    };
    db.contas.push(conta);
    save(db);
    return mascarar(conta);
  },

  update(id, patch) {
    const db  = load();
    const idx = db.contas.findIndex(c => c.id === id);
    if (idx === -1) return null;
    // Não sobrescreve a API key se o frontend enviar valor mascarado
    if (!patch.asaasApiKey || patch.asaasApiKey.startsWith('****')) delete patch.asaasApiKey;
    if (patch.cnpj) patch.cnpj = patch.cnpj.replace(/\D/g, '');
    db.contas[idx] = { ...db.contas[idx], ...patch, atualizadaEm: new Date().toISOString() };
    save(db);
    return mascarar(db.contas[idx]);
  },

  delete(id) {
    const db  = load();
    const idx = db.contas.findIndex(c => c.id === id);
    if (idx === -1) return false;
    db.contas.splice(idx, 1);
    save(db);
    return true;
  },
};
