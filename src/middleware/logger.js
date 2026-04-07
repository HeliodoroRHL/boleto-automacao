const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || './logs';
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const COLORS = { info: '\x1b[36m', ok: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m' };

function write(level, msg, data) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  const color = COLORS[level] || '';
  console.log(`${color}${line}${COLORS.reset}`);
  fs.appendFileSync(path.join(LOG_DIR, 'boleto-automacao.log'), line + '\n');
}

module.exports = {
  info:  (msg, data) => write('info', msg, data),
  ok:    (msg, data) => write('ok', msg, data),
  warn:  (msg, data) => write('warn', msg, data),
  error: (msg, data) => write('error', msg, data),
  http(req, res, next) {
    const start = Date.now();
    res.on('finish', () => write('info', `${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`));
    next();
  },
};
