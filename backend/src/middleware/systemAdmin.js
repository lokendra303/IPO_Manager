import jwt from 'jsonwebtoken';

export function systemAdminMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-secret');
    if (payload.role !== 'system_admin' || !payload.adminId) {
      return res.status(403).json({ error: 'System admin access required' });
    }
    req.admin = { adminId: payload.adminId, email: payload.email, role: 'system_admin' };
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or expired token';
    return res.status(401).json({ error: msg });
  }
}
