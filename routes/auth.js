const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const validUser = username === process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD_HASH
    ? await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH)
    : false;

  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign({ sub: username, role: 'admin' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });

  res.cookie('rp_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.FORCE_SECURE_COOKIE === 'true',
    maxAge: 12 * 60 * 60 * 1000,
  });

  return res.json({ ok: true, username });
});

router.post('/logout', (req, res) => {
  res.clearCookie('rp_token');
  return res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies && req.cookies.rp_token;
  if (!token) return res.status(401).json({ authenticated: false });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ authenticated: true, username: payload.sub });
  } catch (e) {
    return res.status(401).json({ authenticated: false });
  }
});

module.exports = router;
