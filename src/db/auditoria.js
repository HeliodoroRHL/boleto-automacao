const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE     = path.join(DATA_DIR, 'auditoria.json');
const MAX      = 500;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE))     fs.writeFileSync(FILE, JSON.stringify({ eventos: [] }, null, 2));

function load() { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }

module.exports = {
  list(limit = 200) { return load().eventos.slice(0, limit); },

  registrar({ tipo, usuario, ip, detalhe = '' }) {
    try {
      const db = load();
      db.eventos.unshift({
        id:       `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tipo,
        usuario:  usuario || '—',
        ip:       ip      || '—',
        detalhe,
        criadoEm: new Date().toISOString(),
      });
      if (db.eventos.length > MAX) db.eventos = db.eventos.slice(0, MAX);
      save(db);
    } catch { /* nunca quebra o fluxo principal */ }
  },
};
