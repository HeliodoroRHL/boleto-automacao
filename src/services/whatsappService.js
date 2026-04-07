const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path  = require('path');
const log   = require('../middleware/logger');

const AUTH_DIR = path.join(__dirname, '../../data/whatsapp-auth');

let sock   = null;
let qrCode = null;   // string base64 do QR atual
let status = 'desconectado'; // 'desconectado' | 'qr' | 'conectado'
const qrCallbacks = [];

function getStatus() { return { status, qrCode }; }

function onQR(cb) { qrCallbacks.push(cb); }

async function connect() {
  if (sock) return;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: { level: 'silent', trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){}, child(){ return this; } },
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCode = qr;
      status = 'qr';
      log.info('WhatsApp: novo QR disponível');
      qrCallbacks.forEach(cb => cb(qr));
    }
    if (connection === 'open') {
      status = 'conectado';
      qrCode  = null;
      log.ok('WhatsApp: conectado');
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;
      log.warn(`WhatsApp: desconectado (reconectar=${shouldReconnect})`);
      sock   = null;
      status = shouldReconnect ? 'desconectado' : 'desconectado';
      qrCode = null;
      if (shouldReconnect) setTimeout(connect, 5000);
    }
  });
}

// Envia mensagem de texto para um número
// numero: somente dígitos, ex: "5511999990000"
async function enviar(numero, mensagem) {
  if (status !== 'conectado' || !sock) {
    throw new Error('WhatsApp não está conectado. Escaneie o QR no painel de configurações.');
  }

  // Normaliza o número — garante @s.whatsapp.net
  const jid = numero.replace(/\D/g, '') + '@s.whatsapp.net';
  await sock.sendMessage(jid, { text: mensagem });
  log.ok('WhatsApp enviado', { para: numero });
}

// Desconecta e remove autenticação (logout)
async function desconectar() {
  if (sock) {
    await sock.logout().catch(() => {});
    sock = null;
  }
  status = 'desconectado';
  qrCode = null;
}

module.exports = { connect, enviar, getStatus, desconectar };
