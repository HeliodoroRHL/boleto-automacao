const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../data/config.json');

const DEFAULTS = {
  nomePortal:      'BoletoHub',
  logoPath:        null,
  modeloAssunto:   'Honorário - {{mes}}/{{ano}} ({{nome}})',
  modelosAssunto:  [
    'Honorário - {{mes}}/{{ano}} ({{nome}})',
    'Honorário de Serviço de TI - {{mes}}/{{ano}} ({{nome}})',
    'Honorário de TI e Backup em Nuvem - {{mes}}/{{ano}} ({{nome}})',
  ],
  rodapeEmail:        '',  // texto livre (fallback)
  rodapeTelefone:     '',  // Ex: (65) 99615-2089  → ícone WhatsApp
  rodapeEmailContato: '',  // Ex: financeiro@rhl.com.br → ícone email
  rodapeInstagram:    '',  // Ex: rhlsolucoestecnologicas → ícone Instagram
  rodapeSite:         '',  // Ex: rhlsolucoestecnologicas.com.br → ícone globo
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
