const express      = require('express');
const router       = express.Router();
const auditoriaDb  = require('../db/auditoria');

// GET /api/auditoria?limit=100
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  res.json(auditoriaDb.list(limit));
});

module.exports = router;
