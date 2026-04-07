const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  const token = req.cookies?.bhtoken;
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('bhtoken', { httpOnly: true, sameSite: 'strict' });
    res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
};
