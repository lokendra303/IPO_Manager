import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = {
      userId: payload.userId,
      memberId: payload.memberId,
      tenantId: payload.tenantId,
      role: payload.role,
    };
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or expired token';
    return res.status(401).json({ error: msg });
  }
}

export function tenantScope(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }
  req.tenantId = req.user.tenantId;
  next();
}

export function requireMember(req, res, next) {
  if (req.user?.role !== 'member' || !req.user?.memberId) {
    return res.status(403).json({ error: 'Member access only' });
  }
  next();
}

export function managerOnly(req, res, next) {
  if (req.user?.role === 'member') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
