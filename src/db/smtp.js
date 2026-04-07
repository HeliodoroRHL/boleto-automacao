const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE     = path.join(DATA_DIR, 'smtp.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE))     fs.writeFileSync(FILE, JSON.stringify({ smtp: null }, null, 2));

function load() { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
function save(d) { fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }

// Retorna config SMTP sem a senha (para o frontend)
function mascarar(cfg) {
  if (!cfg) return null;
  const { password, ...resto } = cfg;
  return { ...resto, password: password ? '••••••••' : '' };
}

module.exports = {
  get()        { return load().smtp || null; },
  getMasked()  { return mascarar(load().smtp); },
  save(cfg)    { save({ smtp: { ...cfg, updatedAt: new Date().toISOString() } }); return mascarar(cfg); },
  hasPassword(){ const c = load().smtp; return !!(c && c.password); },
};
