#!/usr/bin/env node
// Uso: node teste.js [pago|vencido|criado|cancelado]
const http = require('http');

const BASE = 'http://localhost:3003';
const tipo = process.argv[2] || 'pago';

const eventos = {
  pago:     'PAYMENT_RECEIVED',
  vencido:  'PAYMENT_OVERDUE',
  criado:   'PAYMENT_CREATED',
  cancelado:'PAYMENT_DELETED',
};

const evento = eventos[tipo] || 'PAYMENT_RECEIVED';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: 3003, path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });
}

(async () => {
  console.log(`\n=== Teste: evento "${tipo}" (${evento}) ===\n`);

  try {
    const health = await get('/health');
    console.log('✅ Health:', health.status);

    const sim = await post('/webhook/asaas/test', { tipo: evento });
    console.log(`✅ Webhook simulado: ${sim.tipo}`);

    const lista = await get('/api/boletos');
    console.log(`✅ Boletos: ${lista.total}`);

    const stats = await get('/api/boletos/stats/resumo');
    console.log('✅ Stats:', JSON.stringify(stats));
  } catch (e) {
    console.error('❌ Erro:', e.message);
    console.error('   Certifique-se que o servidor está rodando: npm start');
    process.exit(1);
  }
  console.log('\nTeste concluído!\n');
})();
