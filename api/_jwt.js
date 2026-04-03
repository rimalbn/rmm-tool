const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'rmm_dev_secret_change_in_prod';

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function verify(token) {
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

function fromReq(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return verify(token);
}

module.exports = { sign, verify, fromReq };
