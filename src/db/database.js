const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE  = path.join(DATA_DIR, 'boletos.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE))  fs.writeFileSync(DB_FILE, JSON.stringify({ boletos: [], eventos: [], historico_emails: [] }, null, 2));

function load() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
function save(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

module.exports = {
  // ── Boletos locais ────────────────────────────────────────────────────────
  getBoletos:   () => load().boletos,
  getBoleto:    (id) => load().boletos.find(b => b.id === id),

  createBoleto(data) {
    const db = load();
    const boleto = { id: `BAW-${Date.now()}`, criadoEm: new Date().toISOString(), status: 'PENDING', ...data };
    db.boletos.push(boleto);
    save(db);
    return boleto;
  },

  updateBoleto(id, data) {
    const db = load();
    const idx = db.boletos.findIndex(b => b.id === id);
    if (idx === -1) return null;
    db.boletos[idx] = { ...db.boletos[idx], ...data, atualizadoEm: new Date().toISOString() };
    save(db);
    return db.boletos[idx];
  },

  deleteBoleto(id) {
    const db = load();
    const idx = db.boletos.findIndex(b => b.id === id);
    if (idx === -1) return false;
    db.boletos.splice(idx, 1);
    save(db);
    return true;
  },

  // ── Eventos webhook ───────────────────────────────────────────────────────
  addEvento(evento) {
    const db = load();
    if (!db.eventos) db.eventos = [];
    db.eventos.push({ id: `EVT-${Date.now()}`, recebidoEm: new Date().toISOString(), ...evento });
    save(db);
  },
  getEventos: () => load().eventos || [],

  // ── Histórico de emails ───────────────────────────────────────────────────
  addHistoricoEmail(entry) {
    const db = load();
    if (!db.historico_emails) db.historico_emails = [];
    db.historico_emails.unshift({ id: `EML-${Date.now()}`, enviadoEm: new Date().toISOString(), ...entry });
    // Manter apenas os últimos 500
    if (db.historico_emails.length > 500) db.historico_emails = db.historico_emails.slice(0, 500);
    save(db);
  },
  getHistoricoEmails: () => (load().historico_emails || []),
};
