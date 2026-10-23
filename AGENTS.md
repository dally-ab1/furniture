# AGENTS.md — Furniture ERP Development Rules

## 1. Project Identity

Project: **Furniture ERP** (FurniERP)

Purpose: Build a reliable, secure, easy-to-use ERP system for one furniture company in Ethiopia. The company sells finished furniture and manufactures furniture using raw materials.

Business context:
- **Single-Company ERP:** Built strictly for ONE furniture company.
- **No Multi-Tenancy:** There is no tenant registration, tenant switching, tenant subscriptions, or company selector. All authorized users work with the same company's data in one Supabase PostgreSQL database.
- **Business Locations:** Initially operates one shop and one warehouse. These are business locations within the inventory model, NOT separate tenants.
- **Currency:** Ethiopian Birr (ETB) used exclusively and consistently.
- **Target Audience:** Practical, intuitive interface that nontechnical business employees can master quickly.
- **Core Operations:** Finished-product sales, raw-material inventory, purchasing, manufacturing (BOM & production orders), payments, customer debts (credit sales), supplier debts, operating expenses, and financial reporting.

---

## 2. Approved Technology Stack

Use the **ERN** stack:
- **E — Express.js:** Authoritative backend API, business logic, validation, and server-side authorization.
- **R — React:** Frontend application with Vite and TypeScript.
- **N — Node.js:** Backend runtime with TypeScript.
- **Database:** Supabase PostgreSQL for persistent relational data and transactional integrity.
- **Authentication:** Supabase Auth for identity management, session tokens, and secure password handling.
- **File Storage:** Supabase Storage only when required for product images and receipt/attachment uploads.
- **Styling:** Vanilla CSS / Tailwind CSS matching the approved Notion-inspired FurniERP design system.
- **Routing:** React Router (v6+).
- **Server-State Management:** TanStack Query (React Query).
- **Form Handling & Validation:** React Hook Form and Zod for type-safe validation on both frontend and backend.
- **Database Migrations:** Version-controlled SQL migration scripts.

Do not introduce another database, ORM, state-management library, UI framework, or major architectural dependency without explicit inspection and written approval.

---

## 3. Single-Company Business Model

This application serves one furniture company. It is NOT a SaaS platform.

Never introduce:
- Multi-tenancy or tenant IDs (`tenant_id`, `company_id` partition keys).
- Tenant registration or tenant switching.
- Subscription billing or plan tiers for outside companies.
- A platform-owner / super-tenant role.
- A company selector in the navigation or header.

The shop and warehouse are physical inventory locations, not separate companies or tenants.

---

## 4. User Roles and Authorization

The application initially supports exactly **TWO** roles:

### 1. `SUPER_ADMIN`
The owner of this single furniture company.
- Has full authorized access across all modules: Dashboard, Sales & POS, Products & Inventory, Purchases, Manufacturing, Customers, Suppliers, Finance & Reports, User Management, and Company Settings.
- Full authority to configure employee accounts, grant granular module permissions, approve stock adjustments, authorize discounts and transaction cancellations, and review profit reports.
- Sensitive administrative operations still require server-side validation and audit logging.

### 2. `EMPLOYEE`
Staff accounts created or invited by the Super Admin.
- Share the company's database but can access only the specific modules and actions granted to their individual profile.
- Employees must NOT automatically receive permissions to:
  - View sensitive profit, margin, or operating expense reports.
  - Manage user accounts, roles, or security settings.
  - Modify restricted baseline prices or production standard costs.
  - Adjust stock without explicit adjustment permission.
  - Approve restricted discounts or credit limits.
  - Cancel or reverse finalized sales, purchases, or payments.
  - Perform other restricted financial or administrative actions.

### Authentication & Account Security Requirements:
- Use Supabase Auth for secure identity and session handling.
- Link internal user profiles to the authenticated Supabase user ID (`auth.users.id`).
- Never hardcode default passwords or commit credentials.
- Never trust a role, user ID, or permission list supplied by the browser client without server-side verification.
- Enforce permissions in Express middleware and reinforce with database Row Level Security (RLS) policies.
- Never expose the Supabase service-role key to frontend client code.
- Provide a secure first-time bootstrap process for the initial Super Admin.
- Prevent employees from elevating their own permissions or modifying Super Admin accounts.
- Record sensitive administrative and financial operations in an auditable ledger.

---

## 5. Mandatory Agent Workflow

Every development task must follow this exact sequence:

1. **Read `AGENTS.md`** to maintain architectural and operational compliance.
2. **Read project memory** in `docs/`: `PROJECT_STATE.md`, `FEATURES.md`, `DECISIONS.md`, `UI_UX.md`, `DB.md`, and `PROJECT_RULES.md`.
3. **Inspect the actual repository:** source files, package configurations, database migrations, routes, components, and tests.
4. **Identify existing behavior and dependencies** before making any edits.
5. **Formulate a minimal implementation plan** for any work touching multiple files, business workflows, database schema, or security.
6. **Implement the smallest complete change** that solves the requested problem without bloat.
7. **Change only the requested scope.** Preserve all unrelated working functionality.
8. **Run relevant checks and tests** (linting, type-checks, automated tests, browser verification).
9. **Update project memory** (`PROJECT_STATE.md`, `FEATURES.md`, `DECISIONS.md`, `DB.md`) when implementation state evolves.
10. **Report changed files, test results, and any unverified behavior** honestly with evidence.

Never guess about existing code, database fields, API endpoints, permissions, or business rules.
Never claim that a feature or test works without verifiable evidence.

---

## 6. Architecture Rules

- **Separation of Concerns:** Keep frontend presentation separate from backend business logic. Express is the authoritative business engine.
- **Structured Backend:** Organize backend code cleanly into controllers, routes, validation schemas, business services, and database repositories.
- **Typed API Communication:** Use typed API request and response contracts with centralized error handling.
- **Type Safety:** Use TypeScript types intentionally; avoid `any` unless strictly justified and isolated.
- **Server Authority:** Validation and business rules must live on the server. Frontend validation is for user guidance only.
- **Secrets Management:** Keep secrets (`SUPABASE_SERVICE_ROLE_KEY`, DB credentials) strictly in server environment variables.
- **Reusable Frontend:** Keep UI components modular, accessible, and adhering to the Notion-inspired design tokens.
- **Atomic Operations:** Critical multi-record operations (sales checkout, goods receipts, material consumption, finished good output) must run inside PostgreSQL transactions or database RPCs.

---

## 7. Business Integrity Rules

- **Traceable Movements:** Every sale, purchase receipt, stock adjustment, material issue, and finished output must generate an immutable inventory movement record.
- **Zero Silent Edits:** Current stock balances cannot be manually overwritten without an authorized, auditable adjustment record.
- **Credit Sales & Receivables:** A credit sale is not cash received. It creates an outstanding receivable (`customer_balance`) and records payment status as `CREDIT` or `PARTIAL`.
- **Payment Verification:** Partial payments reduce the customer or supplier debt without marking the invoice as settled.
- **Purchasing vs. Inventory:** Creating a purchase order does NOT increase stock. Stock increases ONLY when an authorized goods receipt is confirmed.
- **Sales vs. Stock:** A finalized sale deducts inventory exactly once.
- **Manufacturing Integrity:** Creating a production order does NOT add finished furniture to stock. Raw materials are consumed when issued, and finished goods are added only upon confirmed production completion.
- **No Silent Deletions:** Completed sales, purchases, payments, receipts, or production orders must never be hard-deleted. Use authorized returns, reversals, or adjustments.
- **Monetary Precision:** Store all monetary values as `DECIMAL(12, 2)` or `NUMERIC(14, 2)`. Never use binary floating-point (`FLOAT`/`REAL`) for currency.
- **Concurrency & Idempotency:** Protect critical endpoints against duplicate requests and race conditions using unique idempotency keys or database-level row locking.

---

## 8. Database and Security Rules

- Follow `docs/DB.md` for schema conventions, indexing, and migration standards.
- All schema changes must be recorded in version-controlled SQL migrations.
- Primary keys must use `UUID` (`gen_random_uuid()`).
- Foreign keys must enforce referential integrity (`ON DELETE RESTRICT` for financial and inventory ledgers).
- Supabase Row Level Security (RLS) must be enabled on all business tables.
- Server uses verified session tokens to identify users and enforces role-based and permission-based checks.
- Never commit `.env` files or production keys to version control.

---

## 9. UI & UX Rules

- Follow `docs/UI_UX.md`.
- Implement the approved **FurniERP** pixel-perfect design matching the dashboard mockup:
  - **Forest Green** (`#276749` / `#1A3325` sidebar) as primary brand color.
  - **Warm Off-White** (`#F7F7F2`) page background.
  - **Deep Charcoal** (`#202820`) for text.
  - **White** (`#FFFFFF`) card surfaces with clean borders (`#E3E7E1`).
  - Restrained semantic badges for statuses (`Paid`, `Partial`, `Credit`, `In Progress`, `Planned`, `Completed`).
- Desktop-first layout optimized for fast shop and warehouse keyboard and barcode entry, while responsive for tablets and mobile devices.
- No excessive animations, glassmorphism, or fake placeholder metrics. Financial numbers must be computed from actual database records.

---

## 10. Change Management & Verification

- For bug fixes: locate root causes, add tests, and verify against regressions.
- For new features: clarify acceptance criteria, check dependencies, implement minimally, and verify.
- Feature statuses in `docs/FEATURES.md` must be one of:
  - `NOT_STARTED`
  - `IN_PROGRESS`
  - `BLOCKED`
  - `IMPLEMENTED`
  - `VERIFIED`
- A feature is `VERIFIED` only when its acceptance criteria have actually been tested and confirmed.

---

## 11. Completion Report Standard

At the end of every development turn, report:
1. Exact changes made.
2. Files created, updated, or removed.
3. Database migrations or configuration steps applied.
4. Checks, builds, or tests executed and their output.
5. Known limitations, assumptions, or unverified behaviors.
6. The next recommended milestone or approved task.
