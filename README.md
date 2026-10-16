# VaultCore 🚀
[![CI](https://github.com/kuchinsk1y/paycore-payment-system/actions/workflows/ci.yml/badge.svg)](https://github.com/kuchinsk1y/paycore-payment-system/actions/workflows/ci.yml)
> Production-style financial payment and double-entry ledger simulation engine built for deep backend & system design mastery.

## 📌 About the Project
**VaultCore** is an educational, production-grade backend system designed to simulate real-world financial, banking, and payment infrastructure. Unlike typical CRUD applications, VaultCore focuses heavily on data integrity, concurrency control, ACID transactions, and architectural patterns critical for FinTech systems.

---

## 🏛️ Architectural Principles
- **Modular Monolith:** Clean bounded contexts (`users`, `accounts`, `transfers`, `ledger`, `webhooks`, `reconciliation`) without premature microservice overhead.
- **Strict Separation of Concerns:** Database infrastructure is strictly decoupled from Fastify HTTP handlers and domain logic.
- **No Magic ORMs:** Uses **Kysely** (type-safe SQL query builder) to ensure full transparency and control over raw SQL queries, row locks, and execution plans.
- **Double-Entry Bookkeeping (Ledger):** The database state relies on an immutable `append-only` ledger (`debits` and `credits`), where account balances are dynamically derived rather than blindly overwritten.

---

## ⚙️ Tech Stack
- **Runtime:** Node.js & TypeScript
- **API Framework:** Fastify
- **Database:** PostgreSQL (with Docker Compose)
- **Query Builder:** Kysely
- **Validation:** Zod
- **Testing:** Vitest (Unit & Real Integration Tests)
- **Logging & Observability:** Pino (Structured JSON logs with automated `X-Request-Id` correlation propagation)

---

## 🛠️ Core Engineering Features Implemented
1. **ACID Transactions:** All monetary movements execute within strict PostgreSQL transaction blocks (`BEGIN`, `COMMIT`, `ROLLBACK`) to eliminate partial failures.
2. **Double-Entry Ledger Architecture:** Implements the accounting invariant (Sum of Debits = Sum of Credits), preventing silent balance corruptions and providing a complete audit trail.
3. **Concurrency Control & Race Condition Prevention:** Employs row-level locking (`SELECT ... FOR UPDATE`) to prevent lost updates during simultaneous transfers.
4. **Deadlock Prevention:** Uses consistent sorting of account IDs prior to lock acquisition.
5. **Idempotency Keys:** Guarantees protection against double charges and duplicate operations on client network retries.
6. **Transactional Outbox Pattern:** Ensures reliable asynchronous messaging by storing events inside the same database transaction as business data.
7. **Background Polling Workers (`SKIP LOCKED`):** Safely processes outbox events and webhook queues across multiple concurrent worker instances without race conditions or duplicate deliveries.
8. **Webhook Inbox & Deduplication:** Safely ingests asynchronous events from external payment gateways, using database unique constraints and idempotent processors to update balances reliably.
9. **Internal Reconciliation Service:** Automatically detects stale or stuck asynchronous events, flagging anomalies to guarantee system self-healing and consistency.
10. **Observability & Request Tracing:** Enforces end-to-end `X-Request-Id` correlation tracking across all HTTP requests, structured logs, and database operations alongside live health/metrics endpoints.
11. **Database-First Constraints:** Enforces business invariants (`UNIQUE`, `FOREIGN KEY` with `ON DELETE RESTRICT`) directly inside PostgreSQL as the ultimate source of truth.

---

## 🗂️ Repository Layout
This is an npm-workspaces monorepo:

```
apps/
  api/                 Fastify + Kysely backend (@paycore/api)
    src/
      app.ts           Fastify instance: plugins (cookie, helmet, CORS) and route registration
      server.ts        Entry point: starts background workers and listens
      config/          Environment loading (reads the root .env)
      infrastructure/  Database, Redis, middleware
      modules/         Bounded contexts: routes -> service -> database
    migrations/        Plain SQL migrations (applied by scripts/migrate.ts)
    scripts/           migrate.ts and one-off dev scripts (scripts/dev)
    tests/             unit/ (no I/O) and integration/ (real Postgres + Redis)
  web/                 Next.js dashboard (App Router, next-intl, Zustand)
load-tests/            k6 scenarios
```

Modules keep HTTP concerns in `*.routes.ts`, business logic in `*.service.ts`, and pure rules/calculations
in separate files (e.g. `transfer.rules.ts`, `analytics.calculations.ts`) so they can be unit-tested without a database.

---

## 🧭 What you can do in the app
- **Dashboard:** accounts with balances, total balance with a real 30-day change, income/expenses for the month, balance history, spending by category, recent activity, and a getting-started checklist for new users. Every section loads (and fails) independently, with a retry.
- **Transactions:** full history across accounts with search, filters (account, type, direction, dates), exact keyset pagination and CSV export (formula-injection safe).
- **Top up / open account:** demo top-ups (a balanced double-entry movement from the platform's clearing account, with per-request and rolling 24h limits; disabled in production by default) and opening an account in any supported currency.
- **Exchange:** convert between your own accounts at the platform rate, with a live preview that matches what the API credits.
- **Transfers, cards, settings (security, language, theme):** see below.

The UI is available in English, Russian, German and Polish; a test keeps every locale in sync.

---

## 🔐 Account Security
- **Sessions:** a 15-minute access token and a rotating refresh token, both in httpOnly, SameSite=Strict cookies. Refresh tokens are stored only as hashes; replaying an already-rotated token revokes the whole session.
- **Active sessions:** list devices, sign one out, or sign out everywhere (also done automatically on password reset/change).
- **Brute-force protection:** accounts lock for 15 minutes after 5 failed sign-ins (wrong password or wrong 2FA code), plus per-IP rate limits.
- **Two-factor authentication:** TOTP (RFC 6238) for any authenticator app. Secrets are encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`); codes cannot be replayed.
- **Email verification and password reset:** single-use, expiring links. Transfers require a verified email.
- **Large transfers:** at or above `LARGE_TRANSFER_THRESHOLD` the API answers `202 CONFIRMATION_REQUIRED`; the client repeats the request with `confirmation_id` + `confirmation_code` (emailed OTP, or the authenticator code if 2FA is on). The code is bound to the exact transfer and is single-use.
- **Audit log:** an append-only trail (enforced by a database trigger) of sign-ins, security changes, transfers, cards, etc. — `GET /auth/audit-log`.

In development emails are not sent: verification links and one-time codes are printed in the API log. Plug a real provider in with `setMailer()` (`modules/security/mailer.ts`).

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+)
- Docker & Docker Compose

### 1. Environment Setup
```bash
cp .env.example .env
```
Set `JWT_SECRET` and `API_KEY` (the API key protects `/metrics`). The session token is stored in an httpOnly cookie.

### 2. Start Infrastructure
```bash
docker-compose up -d
```

### 3. Install Dependencies (all workspaces)
```bash
npm install
```

### 4. Run Database Migrations
```bash
npm run db:migrate
```

### 5. Run the apps
```bash
npm run dev       # API on http://localhost:3001 (PORT in .env)
npm run dev:web   # Web on http://localhost:3000 (proxies /api to the API)
```

### 6. Quality checks
Integration tests wipe tables, so they run against a separate database named `paycore_test` (override with `TEST_DATABASE_URL`; the name must end with `_test`). It is created automatically on the first run (or manually):
```bash
docker exec paycore-db-1 psql -U paycore -d postgres -c "CREATE DATABASE paycore_test;"
```

```bash
npm run lint
npm run typecheck
npm test                    # unit tests (API + web)
npm run test:integration    # real Postgres + Redis integration tests
npm run format:check
```

### 7. Run Load Tests (k6)
Ensure your API and database are running, then install `k6` and execute:
```bash
k6 run load-tests/transfers-load.js
```

---

## 📈 Roadmap & Future Stages
- [x] Project Bootstrap & PostgreSQL integration
- [x] Users & Accounts modules with strict constraints
- [x] Transactional Transfers with Row-Level Locking
- [x] Double-Entry Ledger (ledger_transactions & ledger_entries)
- [x] Idempotency Keys (Preventing double charges on client retries)
- [x] Asynchronous Processing (Outbox pattern + Queues & Workers with SKIP LOCKED)
- [x] Payment Gateway Simulator & Webhook Ingestion (Handling duplicates & idempotency)
- [x] Failure Recovery & Reconciliation (Stale event detection and self-healing)
- [x] Observability & Structured Tracing (Request-ID correlation & system metrics)
- [x] Security (API Key Auth & Redis Rate Limiting)
- [x] Load Testing & Concurrency Storms
