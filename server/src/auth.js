import jwt from 'jsonwebtoken';

export function makeRequireAuth(secret) {
  return function requireAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    try {
      const decoded = jwt.verify(token, secret);
      req.user = { email: decoded.sub, name: decoded.name, provider: decoded.provider };
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
