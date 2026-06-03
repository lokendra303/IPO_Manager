import { recordAuditFromRequest } from '../services/auditLogService.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function auditMiddleware(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  if (req.originalUrl.split('?')[0].startsWith('/api/audit-logs')) return next();

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    recordAuditFromRequest(req).catch((err) => {
      console.error('Audit log failed:', err.message);
    });
  });

  next();
}
