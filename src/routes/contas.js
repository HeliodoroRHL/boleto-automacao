const express = require('express');
const router  = express.Router();
const contasDb = require('../db/contas');
const asaas    = require('../services/asaasService');
const log      = require('../middleware/logger');

// GET /api/contas
router.get('/', (req, res) => {
  res.json(contasDb.list());
});

// POST /api/contas — cria nova conta
router.post('/', async (req, res) => {
  const { nome, cnpj, asaasApiKey, emailFrom, emailNome } = req.body;
  if (!nome || !asaasApiKey) return res.status(400).json({ erro: 'nome e asaasApiKey são obrigatórios' });

  // Valida a chave antes de salvar
  try {
    await asaas.testarChave(asaasApiKey);
  } catch (e) {
    return res.status(400).json({ erro: 'Chave API inválida ou sem acesso: ' + e.message });
  }

  try {
    const conta = contasDb.create({ nome, cnpj, asaasApiKey, emailFrom, emailNome });
    log.ok('Conta Asaas criada', { nome, cnpj });
    res.status(201).json(conta);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// PUT /api/contas/:id — edita
router.put('/:id', async (req, res) => {
  const { nome, cnpj, asaasApiKey, emailFrom, emailNome, ativa } = req.body;

  // Se enviou nova chave (não mascarada), valida
  if (asaasApiKey && !asaasApiKey.startsWith('****')) {
    try { await asaas.testarChave(asaasApiKey); }
    catch (e) { return res.status(400).json({ erro: 'Chave API inválida: ' + e.message }); }
  }

  const conta = contasDb.update(req.params.id, { nome, cnpj, asaasApiKey, emailFrom, emailNome, ativa });
  if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });
  res.json(conta);
});

// DELETE /api/contas/:id
router.delete('/:id', (req, res) => {
  const ok = contasDb.delete(req.params.id);
  if (!ok) return res.status(404).json({ erro: 'Conta não encontrada' });
  res.json({ deletado: true });
});

// POST /api/contas/:id/testar — testa conexão da conta
router.post('/:id/testar', async (req, res) => {
  const conta = contasDb.get(req.params.id);
  if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });
  try {
    const info = await asaas.testarChave(conta.asaasApiKey);
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(400).json({ ok: false, erro: e.message });
  }
});

module.exports = router;
