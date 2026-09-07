# VaultCore 🚀
> Production-style financial payment and double-entry ledger simulation engine built for deep backend & system design mastery.

## 📌 About the Project
**VaultCore** is an educational, production-grade backend system designed to simulate real-world financial, banking, and payment infrastructure. Unlike typical CRUD applications, VaultCore focuses heavily on data integrity, concurrency control, ACID transactions, and architectural patterns critical for FinTech systems.

---

## 🏛️ Architectural Principles
- **Modular Monolith:** Clean bounded contexts (`users`, `accounts`, `transfers`, `ledger`, `webhooks`) without premature microservice overhead.
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
- **Logging:** Pino (Structured JSON logs)

---

## 🛠️ Core Engineering Features Implemented
1. **ACID Transactions:** All monetary movements execute within strict PostgreSQL transaction blocks (`BEGIN`, `COMMIT`, `ROLLBACK`) to eliminate partial failures.
2. **Double-Entry Ledger Architecture:** Implements the accounting invariant (Sum of Debits = Sum of Credits), preventing silent balance corruptions and providing a complete audit trail.
3. **Concurrency Control & Race Condition Prevention:** Employs row-level locking (`SELECT ... FOR UPDATE`) to prevent lost updates during simultaneous transfers.
4. **Deadlock Prevention:** Uses consistent sorting of account IDs prior to lock acquisition.
5. **Idempotency Keys:** Guarantees protection against double charges and duplicate operations on client network retries.
6. **Transactional Outbox Pattern:** Ensures reliable asynchronous messaging by storing events inside the same database transaction as business data.
7. **Background Polling Workers (`SKIP LOCKED`):** Safely processes outbox events across multiple concurrent worker instances without race conditions or duplicate deliveries.
8. **Webhook Inbox & Deduplication:** Safely ingests asynchronous events from external payment gateways, using database unique constraints to gracefully handle duplicate webhook deliveries.
9. **Database-First Constraints:** Enforces business invariants (`UNIQUE`, `FOREIGN KEY` with `ON DELETE RESTRICT`) directly inside PostgreSQL as the ultimate source of truth.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose

### 1. Clone the Repository
```bash
git clone https://github.com/kuchinsk1y/paycore-payment-system.git
cd paycore-payment-system
```

### 2. Environment Setup
Copy the example environment file:
```bash
cp .env.example .env
```

### 3. Start Infrastructure
Spin up the PostgreSQL container:
```bash
docker-compose up -d
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Run Database Migrations
```bash
npm run db:migrate
```

### 6. Run Tests
Run unit/application tests:
```bash
npm test
```

Run real database integration tests:
```bash
npm run test:integration
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
- [ ] Failure Recovery & Reconciliation
- [ ] Observability (OpenTelemetry & Structured Tracing)
