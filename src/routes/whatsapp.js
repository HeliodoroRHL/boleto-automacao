const express = require('express');
const router  = express.Router();
const QRCode  = require('qrcode');
const waSvc   = require('../services/whatsappService');
const log     = require('../middleware/logger');

// GET /api/whatsapp/status — retorna status da conexão e QR code (se disponível)
router.get('/status', (req, res) => {
  res.json(waSvc.getStatus());
});

// POST /api/whatsapp/conectar — inicia conexão / exibe QR
router.post('/conectar', async (req, res) => {
  try {
    await waSvc.connect();
    res.json({ ok: true, ...waSvc.getStatus() });
  } catch (e) {
    log.error('WhatsApp conectar', { erro: e.message });
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/whatsapp/qr.png — retorna QR code como imagem PNG
router.get('/qr.png', async (req, res) => {
  const { qrCode } = waSvc.getStatus();
  if (!qrCode) return res.status(404).json({ erro: 'QR não disponível' });
  try {
    const buf = await QRCode.toBuffer(qrCode, { width: 240, margin: 2 });
    res.set('Content-Type', 'image/png').send(buf);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/whatsapp/desconectar — faz logout
router.post('/desconectar', async (req, res) => {
  try {
    await waSvc.desconectar();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/whatsapp/testar — envia mensagem de teste
router.post('/testar', async (req, res) => {
  try {
    const { numero } = req.body;
    if (!numero) return res.status(400).json({ erro: 'numero obrigatório' });
    await waSvc.enviar(numero, '✅ Teste do BoletoHub: WhatsApp conectado com sucesso!');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
