const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const cfgDb   = require('../db/config');
const log     = require('../middleware/logger');

const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    // Sempre salva como logo.ext (sobrescreve versão anterior)
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter(req, file, cb) {
    if (/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens PNG, JPG, WEBP ou SVG são aceitas'));
  },
});

// GET /api/config
router.get('/', (req, res) => {
  res.json(cfgDb.get());
});

// PUT /api/config — atualiza configurações gerais
router.put('/', (req, res) => {
  const { nomePortal, modeloAssunto, modelosAssunto } = req.body || {};
  if (nomePortal !== undefined && !String(nomePortal).trim()) {
    return res.status(400).json({ erro: 'Nome não pode ser vazio' });
  }
  const patch = {};
  if (nomePortal    !== undefined) patch.nomePortal    = String(nomePortal).trim();
  if (modeloAssunto !== undefined) patch.modeloAssunto = String(modeloAssunto).trim();
  if (modelosAssunto !== undefined) {
    if (!Array.isArray(modelosAssunto)) return res.status(400).json({ erro: 'modelosAssunto deve ser um array' });
    patch.modelosAssunto = modelosAssunto
      .map(m => String(m).trim())
      .filter(m => m.length > 0)
      .slice(0, 20); // máximo 20 modelos
  }
  const updated = cfgDb.update(patch);
  log.ok('Config atualizada', { nomePortal: updated.nomePortal });
  res.json(updated);
});

// POST /api/config/logo — faz upload da logo
router.post('/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  const logoPath = `uploads/${req.file.filename}`;
  const updated  = cfgDb.update({ logoPath });
  log.ok('Logo atualizada', { arquivo: req.file.filename });
  res.json({ ...updated, logoUrl: `/${logoPath}?t=${Date.now()}` });
});

// DELETE /api/config/logo — remove logo (volta ao ícone padrão)
router.delete('/logo', (req, res) => {
  const cfg = cfgDb.get();
  if (cfg.logoPath) {
    const full = path.join(__dirname, '../../public', cfg.logoPath);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  const updated = cfgDb.update({ logoPath: null });
  res.json(updated);
});

// Erro do multer (tamanho / tipo)
router.use((err, req, res, next) => {
  res.status(400).json({ erro: err.message });
});

module.exports = router;
