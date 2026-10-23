# PROJECT_STATE.md — Current Architecture and Project Status

## 1. Project Overview

- **Project Name:** FurniERP (Furniture Business ERP)
- **Business:** Single furniture company in Ethiopia (manufacturing & retail)
- **Currency:** Ethiopian Birr (ETB)
- **Initial Locations:** Main Shop (Retail) and Central Warehouse/Factory
- **Current Phase:** Phase 2 — Security Hardening & Authorization
- **Last Updated:** October 16, 2026

---

## 2. Approved Architecture vs. Implemented State

| Component | Approved Architecture | Implemented Status | Verification Status |
| :--- | :--- | :--- | :--- |
| **Backend API** | Node.js + Express.js + TypeScript | Routes, controllers, RPCs, auth, error handler | `VERIFIED` (Port 5000) |
| **Frontend Web App**| React + Vite + TypeScript + Tailwind CSS | Dashboard, Inventory, Auth context, Login/Bootstrap | `VERIFIED` (Port 5173, build passes) |
| **Database** | Supabase PostgreSQL 17 | 23 tables, RLS policies, 4 atomic RPCs | `VERIFIED` (Live Supabase `jbatiogfgozpktnraezn`) |
| **Authentication** | Supabase Auth + JWT middleware | AuthProvider, protected routes, bootstrap RPC | `VERIFIED` |
| **File Storage** | Supabase Storage (product images, receipts) | Architecture defined | `NOT_STARTED` |
| **Project Memory** | `AGENTS.md` + 6 `docs/*.md` files | Fully established and actively updated | `VERIFIED` |

---

## 3. Current Project Directory Structure

```
c:\Users\engab\Music\Furniture\
├── AGENTS.md                  # Permanent agent operational and business rules
├── docs/                      # Project memory and permanent documentation
├── backend/                   # Authoritative Express API engine
│   ├── src/
│   │   ├── config/            # Supabase server client
│   │   ├── middleware/        # JWT auth and central error handling
│   │   ├── routes/            # Modular route controllers (auth, dashboard, products, sales, customers)
│   │   └── server.ts          # Express application entry
├── frontend/                  # React + Vite application
│   ├── src/
│   │   ├── components/        # Layout & dashboard UI widgets
│   │   ├── contexts/          # React AuthContext (Supabase Auth lifecycle)
│   │   ├── lib/               # Frontend Supabase client
│   │   ├── pages/             # Main modules (Dashboard, Inventory, LoginPage, BootstrapPage)
│   │   ├── services/          # Authoritative API client
│   │   ├── App.tsx            # Application routing shell
│   │   └── main.tsx           # Entry point
└── supabase/
    ├── migrations/            # Version-controlled SQL migrations
    └── types/                 # Database TypeScript definitions
```

---

## 4. Features & Milestones Status

| Milestone | Scope | Status | Notes |
| :--- | :--- | :---: | :--- |
| **M0: Initialization** | Project memory, architecture, rules, design system | `VERIFIED` | All documentation in place |
| **M1: Foundation** | Express + React setup, Supabase link, Auth, Super Admin, UI layout | `VERIFIED` | Both servers running, auth flow operational |
| **M2: Products & Inv** | Products, categories, units, locations, stock ledger, adjustments | `VERIFIED` | 10 seeded items, atomic RPC, audit ledger |
| **M3: Cust/Supp/Purch** | Customers, suppliers, purchase orders, goods receipts, debt payments | `VERIFIED` | Directories, atomic GRN receipts, and debt settlements verified |
| **M4: Sales & POS** | Fast search, cart, checkout, payments, invoices, credit debt | `VERIFIED` | Full POS UI, atomic RPC, cash & credit sales verified live |
| **M5: Manufacturing** | BOMs, production orders, material consumption, finished receipts | `VERIFIED` | Seeded BOMs, atomic material issue & intake RPCs verified live |
| **M6: Finance/Reports** | Expenses, receivables/payables, profit calculations, inventory value | `VERIFIED` | Authoritative P&L, real-time KPI metrics, expense logging |
| **M7: Reliability** | Full integration tests, concurrency tests, backup procedures | `IN_PROGRESS` | Automated integration tests passing |

---

## 5. Database and Authentication Status

- **Supabase Project:** Connected & verified live (`Furniture`, ID: `jbatiogfgozpktnraezn`, Status: `ACTIVE_HEALTHY`).
- **Project URL:** `https://jbatiogfgozpktnraezn.supabase.co`
- **Database Engine:** PostgreSQL 17 (Host: `db.jbatiogfgozpktnraezn.supabase.co`)
- **Tables Applied:** 23 tables in `public` schema with Row Level Security enabled.
- **Migrations Applied:**
  1. `20261015000001_initial_schema.sql`: Core relational tables and indexes.
  2. `20261015000002_business_logic_rpcs.sql`: RLS policies and atomic procedures (`execute_sale_checkout`, `confirm_goods_receipt`, `record_stock_adjustment`, `bootstrap_super_admin`).
  3. `20261015000003_manufacturing_and_payments.sql`: Schema alignment, seeded BOMs, atomic procedures (`record_customer_payment`, `record_supplier_payment`, `issue_production_materials`, `complete_production_order`).
  4. `20261015000004_operational_rls_policies.sql`: Operational write policies for purchases, production, expenses, and settings.
  5. `20261015000005_fix_bootstrap_and_rls.sql`: Resolved user_profiles RLS recursion and implemented atomic create_initial_super_admin procedure bypassing external SMTP rate limits.
- **RPCs Verified Live:** `execute_sale_checkout`, `confirm_goods_receipt`, `record_stock_adjustment`, `record_customer_payment`, `record_supplier_payment`, `issue_production_materials`, `complete_production_order`, `create_initial_super_admin`.
- **TypeScript Types:** Generated and stored in `supabase/types/database.types.ts`.

---

## 6. Known Limitations & Unresolved Issues

- Documented in detail in `docs/KNOWN_ISSUES.md`:
  - `ISSUE-P0-01`: **RESOLVED & VERIFIED** — Express API routes now enforced with global `authenticateToken`, `requireSuperAdmin`, and granular `requirePermission(...)` middleware.
  - `ISSUE-P2-01`: **RESOLVED & VERIFIED** — All frontend pages migrated to standard `authFetch` with automatic Bearer token injection and typed `ApiError` handling.
  - `ISSUE-P1-01`: Dashboard metrics and widgets currently return static/mocked data.
  - `ISSUE-P1-02`: Creating employees via UI is blocked due to empty `SUPABASE_SERVICE_ROLE_KEY`.
  - `ISSUE-P2-02`: Purchase Order creation is not wrapped in a single database transaction.

---

## 7. Last Completed Task
- **FurniERP Security & Authorization Milestone:**
  1. Frontend API Standardization: Rewrote `frontend/src/services/api.ts` with typed `ApiError` class and robust `authFetch` attaching Supabase session JWT tokens.
  2. Migrated all 10 operational pages (`Sales`, `Inventory`, `Purchases`, `Manufacturing`, `Customers`, `Suppliers`, `Users`, `Settings`, `Reports`, `Dashboard`) from raw `fetch()` to `authFetch`.
  3. Backend Route Protection: Mounted `authenticateToken` globally in `server.ts` protecting all business routes.
  4. Backend Role & Permission Enforcement: Enforced `requireSuperAdmin` on `/api/settings` and user management; enforced granular `requirePermission(...)` across `finance`, `products`, `sales`, `purchases`, `manufacturing`, `customers`, and `dashboard`.
  5. Tested & Verified: Created automated verification suite `backend/src/scratch/test_security_auth.ts` verifying 401 unauthenticated, 403 forbidden role/permission checks, and live HTTP token validation.
  6. Verified zero build errors across both backend (`npm run build`) and frontend (`npm run build`).

## 8. Next Recommended Task
- **Milestone P1 Remediation**:
  1. Address `ISSUE-P1-01`: Replace static mock datasets in `dashboard.routes.ts` with live database aggregation queries on `sales`, `stock_levels`, `production_orders`, and `inventory_movements`.
  2. Address `ISSUE-P1-02`: Implement a secure PostgreSQL RPC or provide `SUPABASE_SERVICE_ROLE_KEY` to allow employee account provisioning.



## 9. Workflow Connection Fixes (October 23, 2026)
- **Status:** VERIFIED
- **Stack:** ERN (Express, React, Node.js, TypeScript) + Supabase (PostgreSQL)
- **Changes:**
  1. Atomic Custom Order & Manufacturing Linkage (create_custom_customer_order RPC).
  2. Atomic Delivery & Stock Deduction (ulfill_custom_order_delivery RPC with final payment handling).
  3. Atomic Safe Cancellation (cancel_sale_order & cancel_production_order RPCs with material reversal).
  4. Accurate Revenue Recognition in Finance reports (unfulfilled custom orders excluded from revenue/COGS until fulfilled).
  5. Frontend UI Action Connections in Sales.tsx, Customers.tsx, and Manufacturing.tsx.
  6. Both ackend and rontend builds pass with 0 errors.
