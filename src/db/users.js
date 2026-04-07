const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '../../data');
const FILE      = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE))     fs.writeFileSync(FILE, JSON.stringify({ users: [] }, null, 2));

function load() { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }

module.exports = {
  count:       ()      => load().users.length,
  findByEmail: (email) => load().users.find(u => u.email === email.toLowerCase().trim()),

  update(emailAtual, patch) {
    const db = load();
    const idx = db.users.findIndex(u => u.email === emailAtual.toLowerCase().trim());
    if (idx === -1) return null;
    db.users[idx] = { ...db.users[idx], ...patch };
    save(db);
    return db.users[idx];
  },

  create({ email, nome, passwordHash }) {
    const db = load();
    if (db.users.find(u => u.email === email.toLowerCase().trim())) throw new Error('E-mail já cadastrado');
    db.users.push({ email: email.toLowerCase().trim(), nome, passwordHash, criadoEm: new Date().toISOString() });
    save(db);
  },
};
