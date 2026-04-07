const express = require('express');
const router = express.Router();
const db = require('../db/database');
const log = require('../middleware/logger');

// GET /boletos/api/boletos
router.get('/', (req, res) => {
  const { status, cliente } = req.query;
  let boletos = db.getBoletos();
  if (status)  boletos = boletos.filter(b => b.status === status.toUpperCase());
  if (cliente) boletos = boletos.filter(b => b.cliente?.toLowerCase().includes(cliente.toLowerCase()));
  res.json({ total: boletos.length, boletos });
});

// GET /boletos/api/boletos/:id
router.get('/:id', (req, res) => {
  const boleto = db.getBoleto(req.params.id);
  if (!boleto) return res.status(404).json({ erro: 'Boleto não encontrado' });
  res.json(boleto);
});

// POST /boletos/api/boletos
router.post('/', (req, res) => {
  const { cliente, valor, dataVencimento } = req.body;
  if (!cliente || !valor || !dataVencimento) {
    return res.status(400).json({ erro: 'Campos obrigatórios: cliente, valor, dataVencimento' });
  }
  const boleto = db.createBoleto({ cliente, valor: Number(valor), dataVencimento });
  log.ok('Boleto criado', { id: boleto.id, cliente });
  res.status(201).json(boleto);
});

// PUT /boletos/api/boletos/:id
router.put('/:id', (req, res) => {
  const boleto = db.updateBoleto(req.params.id, req.body);
  if (!boleto) return res.status(404).json({ erro: 'Boleto não encontrado' });
  res.json(boleto);
});

// DELETE /boletos/api/boletos/:id
router.delete('/:id', (req, res) => {
  const ok = db.deleteBoleto(req.params.id);
  if (!ok) return res.status(404).json({ erro: 'Boleto não encontrado' });
  res.json({ deletado: true });
});

// GET /boletos/api/stats
router.get('/stats/resumo', (req, res) => {
  res.json(db.getStats());
});

module.exports = router;
