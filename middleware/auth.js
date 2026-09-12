const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.rp_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!process.env.API_KEY || key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  return next();
}

// Accept either a valid admin session cookie OR a valid API key
function requireAuthOrApiKey(req, res, next) {
  const token = req.cookies && req.cookies.rp_token;
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key && process.env.API_KEY && key === process.env.API_KEY) return next();
  if (token) {
    try {
      req.admin = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch (e) {
      /* fallthrough */
    }
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { requireAuth, requireApiKey, requireAuthOrApiKey };
