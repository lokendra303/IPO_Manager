# IPO Team Management Web App

Multi-tenant web app for IPO team owners to manage members, fund providers, owner wallet, IPO distributions, allotments, and team summary — replacing Excel-based tracking.

## Stack

- **Frontend:** React (Vite) + Ant Design
- **Backend:** Node.js + Express
- **Database:** MySQL 8

## Prerequisites

- Node.js 18+
- Docker (for MySQL) or a local MySQL instance

## Quick Start

### 1. Start MySQL

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # if .env does not exist
npm install
npm run migrate
npm run dev
```

API runs at `http://localhost:4000`.

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # if .env does not exist
npm install
npm run dev
```

Configure `frontend/.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_PORT` | `5173` | Dev server port |
| `VITE_API_PROXY_TARGET` | `http://localhost:5000` | Backend URL for `/api` proxy in dev |
| `VITE_API_BASE_URL` | `/api` | Axios base URL (`/api` in dev, or full URL for production build) |

App runs at `http://localhost:5173` (or your `VITE_PORT`). API calls use `VITE_API_BASE_URL` and are proxied to `VITE_API_PROXY_TARGET` during `npm run dev`.

## Typical workflow

1. **Register** a team (creates tenant + wallet).
2. **Add members** with PAN and ACTIVE status.
3. **Add fund provider** (e.g. Person A) → **Add receipt** for ₹140,000 (10 × ₹14,000 lot) with “Credit to wallet” enabled.
4. **Create IPO** (lot ₹14,000) → **Distribute** to 10 active members.
5. Update **allotment** and **P&L** on the IPO detail grid.
6. **Mark Receive** when funds return from a member (credits owner wallet).
7. View **Summary** for totals and mismatch highlights (given ≠ received).

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register owner + tenant |
| POST | `/api/auth/login` | Login |
| GET/POST/PATCH | `/api/members` | Member CRUD |
| GET | `/api/members/:id/detail` | Member IPO history, ledger, stats |
| GET/POST | `/api/fund-providers` | Providers |
| POST | `/api/fund-providers/:id/transactions` | Provider ledger + wallet credit |
| GET | `/api/wallet` | Owner balance |
| GET/POST | `/api/ipos` | IPO list/create |
| POST | `/api/ipos/:id/distribute` | Distribute to members |
| POST | `/api/ipos/:id/close` | Close IPO (blocks new distributions) |
| POST | `/api/ipos/:id/reopen` | Reopen IPO |
| GET/PUT | `/api/profit-shares/providers` | Optional templates (quick-fill only) |
| GET | `/api/profit-shares/providers/:id/template` | Copy template into member form |
| GET | `/api/profit-shares/members` | All members with rule list and combined % |
| GET | `/api/profit-shares/members/:id/rules` | Rules for one member |
| POST | `/api/profit-shares/members/:id/rules` | Add a share rule (provider + profit/loss %) |
| PUT | `/api/profit-shares/members/:id/rules/:ruleId` | Update one rule |
| DELETE | `/api/profit-shares/members/:id/rules/:ruleId` | Delete one rule |
| DELETE | `/api/profit-shares/members/:id` | Clear all rules for a member |
| POST | `/api/profit-shares/preview` | Preview multi-rule split (each rule % of full gross P&L) |
| POST | `/api/profit-shares/distribute` | Manual split for pending applications |
| PATCH | `/api/ipo-applications/bulk` | Save allotment/P&L; auto-applies member share rules when eligible |
| GET | `/api/profit-shares/report` | Distribution history |
| GET | `/api/profit-shares/totals` | P&L totals by member, provider, manager |
| PATCH | `/api/ipo-applications/bulk` | Bulk allotment/P&L |
| GET | `/api/summary` | Team summary |
| GET | `/api/settings/account` | Account profile |
| PATCH | `/api/settings/team` | Change team name |
| PATCH | `/api/settings/email` | Change email |
| PATCH | `/api/settings/password` | Change password (requires current password) |

## Environment

See `backend/.env.example` for `JWT_SECRET`, `DB_*` variables.

## Security notes

- Change `JWT_SECRET` in production.
- Use HTTPS in production; PAN data is sensitive PII.
