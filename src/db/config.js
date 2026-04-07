const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../data/config.json');

const DEFAULTS = {
  nomePortal: 'BoletoHub',
  logoPath:   null,   // caminho relativo a /public, ex: 'uploads/logo.png'
};

function load() {
  if (!fs.existsSync(FILE)) return { ...DEFAULTS };
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf-8')) }; }
  catch { return { ...DEFAULTS }; }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  get()        { return load(); },
  update(patch) {
    const atual = load();
    const novo  = { ...atual, ...patch };
    save(novo);
    return novo;
  },
};
