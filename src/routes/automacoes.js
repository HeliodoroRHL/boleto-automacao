const express  = require('express');
const router   = express.Router();
const autoDb   = require('../db/automacoes');
const autoSvc  = require('../services/automacaoService');
const log      = require('../middleware/logger');

// GET /api/automacoes
router.get('/', (req, res) => res.json(autoDb.list()));

// GET /api/automacoes/:id
router.get('/:id', (req, res) => {
  const auto = autoDb.get(req.params.id);
  auto ? res.json(auto) : res.status(404).json({ erro: 'Não encontrada' });
});

// POST /api/automacoes — criar nova
router.post('/', (req, res) => {
  const { nome, contaId, ativa, tipoGatilho, diaDoMes, diasAntes, hora,
          tiposPagamento, statusFiltro, clientesFiltro,
          assunto, corpo, anexarPdf, notificarAdmin, emailNotificacao,
          enviarEmail, enviarWhatsApp, mensagemWhatsApp } = req.body || {};
  if (!nome?.trim()) return res.status(400).json({ erro: 'Informe um nome para a automação' });
  if (!tiposPagamento?.length) return res.status(400).json({ erro: 'Selecione ao menos um tipo de pagamento' });
  const nova = autoDb.create({
    nome: nome.trim(), contaId, ativa, tipoGatilho, diaDoMes, diasAntes, hora,
    tiposPagamento, statusFiltro, clientesFiltro,
    assunto, corpo, anexarPdf, notificarAdmin, emailNotificacao,
    enviarEmail, enviarWhatsApp, mensagemWhatsApp,
  });
  log.ok('Automação criada', { nome: nova.nome });
  res.status(201).json(nova);
});

// PUT /api/automacoes/:id — atualizar
router.put('/:id', (req, res) => {
  const { nome, contaId, ativa, tipoGatilho, diaDoMes, diasAntes, hora,
          tiposPagamento, statusFiltro, clientesFiltro,
          assunto, corpo, anexarPdf, notificarAdmin, emailNotificacao,
          enviarEmail, enviarWhatsApp, mensagemWhatsApp } = req.body || {};
  if (nome !== undefined && !nome?.trim()) return res.status(400).json({ erro: 'Nome não pode ser vazio' });
  if (tiposPagamento !== undefined && !tiposPagamento?.length) return res.status(400).json({ erro: 'Selecione ao menos um tipo de pagamento' });
  const atualizada = autoDb.update(req.params.id, {
    nome: nome?.trim(), contaId, ativa, tipoGatilho, diaDoMes, diasAntes, hora,
    tiposPagamento, statusFiltro, clientesFiltro,
    assunto, corpo, anexarPdf, notificarAdmin, emailNotificacao,
    enviarEmail, enviarWhatsApp, mensagemWhatsApp,
  });
  atualizada ? res.json(atualizada) : res.status(404).json({ erro: 'Não encontrada' });
});

// POST /api/automacoes/:id/executar — execução manual
router.post('/:id/executar', async (req, res) => {
  const auto = autoDb.get(req.params.id);
  if (!auto) return res.status(404).json({ erro: 'Automação não encontrada' });
  try {
    const resultado = await autoSvc.executarAutomacao(auto);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    log.error('Erro na execução manual', { erro: err.message });
    res.status(502).json({ erro: err.message });
  }
});

// POST /api/automacoes/:id/simular — pré-visualiza sem enviar e-mails
router.post('/:id/simular', async (req, res) => {
  const auto = autoDb.get(req.params.id);
  if (!auto) return res.status(404).json({ erro: 'Automação não encontrada' });
  try {
    const resultado = await autoSvc.simularAutomacao(auto);
    res.json(resultado);
  } catch (err) {
    log.error('Erro na simulação', { erro: err.message });
    res.status(502).json({ erro: err.message });
  }
});

// DELETE /api/automacoes/:id
router.delete('/:id', (req, res) => {
  autoDb.delete(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ erro: 'Não encontrada' });
});

module.exports = router;
