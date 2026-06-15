import './env.js';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { authMiddleware, tenantScope, requireMember, managerOnly } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import membersRoutes from './routes/members.js';
import fundProvidersRoutes from './routes/fundProviders.js';
import walletRoutes from './routes/wallet.js';
import bankAccountsRoutes from './routes/bankAccounts.js';
import iposRoutes from './routes/ipos.js';
import ipoAllotmentRoutes from './routes/ipoAllotment.js';
import applicationsRoutes from './routes/applications.js';
import summaryRoutes from './routes/summary.js';
import settingsRoutes from './routes/settings.js';
import profitSharesRoutes from './routes/profitShares.js';
import memberPortalRoutes from './routes/memberPortal.js';
import memberIssuesRoutes from './routes/memberIssues.js';
import memberGroupsRoutes from './routes/memberGroups.js';
import auditLogsRoutes from './routes/auditLogs.js';
import { warmPool } from './db/pool.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, try again later' },
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', authLimiter, adminRoutes);

app.use('/api', authMiddleware, tenantScope);
app.use('/api', auditMiddleware);
app.use('/api/member-portal', requireMember, memberPortalRoutes);
app.use('/api', managerOnly);
app.use('/api/members', membersRoutes);
app.use('/api/fund-providers', fundProvidersRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/bank-accounts', bankAccountsRoutes);
app.use('/api/ipos', ipoAllotmentRoutes);
app.use('/api/ipos', iposRoutes);
app.use('/api/ipo-applications', applicationsRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/profit-shares', profitSharesRoutes);
app.use('/api/member-issues', memberIssuesRoutes);
app.use('/api/member-groups', memberGroupsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

const isVercel = process.env.VERCEL === '1';

function resolveFrontendDist() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '../frontend/dist'),
    path.join(here, '../../frontend/dist'),
    path.join(process.cwd(), 'frontend/dist'),
    path.join(process.cwd(), 'dist'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
}

if (isVercel) {
  const distPath = resolveFrontendDist();
  const indexHtml = distPath ? path.join(distPath, 'index.html') : null;

  if (indexHtml) {
    app.use(
      express.static(distPath, {
        setHeaders(res, filePath) {
          const normalized = filePath.replace(/\\/g, '/');
          if (normalized.endsWith('/index.html') || normalized.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          } else if (normalized.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(indexHtml);
    });
  } else {
    console.error('Frontend dist not found. Checked:', [
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist'),
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist'),
    ]);
  }
}

app.use(errorHandler);

if (isVercel) {
  warmPool().catch((err) => {
    console.error('Failed to warm database pool:', err.message);
  });
} else {
  warmPool()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`IPO Team API running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to connect to database:', err.message);
      console.error('Start MySQL and run: npm run migrate');
      process.exit(1);
    });
}

export default app;
