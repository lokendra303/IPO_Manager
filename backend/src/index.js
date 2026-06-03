import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { authMiddleware, tenantScope } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import membersRoutes from './routes/members.js';
import fundProvidersRoutes from './routes/fundProviders.js';
import walletRoutes from './routes/wallet.js';
import bankAccountsRoutes from './routes/bankAccounts.js';
import iposRoutes from './routes/ipos.js';
import applicationsRoutes from './routes/applications.js';
import summaryRoutes from './routes/summary.js';
import settingsRoutes from './routes/settings.js';
import profitSharesRoutes from './routes/profitShares.js';

dotenv.config();

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

app.use('/api', authMiddleware, tenantScope);
app.use('/api/members', membersRoutes);
app.use('/api/fund-providers', fundProvidersRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/bank-accounts', bankAccountsRoutes);
app.use('/api/ipos', iposRoutes);
app.use('/api/ipo-applications', applicationsRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/profit-shares', profitSharesRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`IPO Team API running on http://localhost:${PORT}`);
});
