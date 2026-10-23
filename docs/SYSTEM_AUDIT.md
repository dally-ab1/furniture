# SYSTEM_AUDIT.md — FurniERP Complete System Logic & Feature Connection Audit

**Date of Audit:** October 15, 2026  
**Auditor:** Senior ERP Software Architect & Database Auditor  
**Scope:** Dual-directory ERP codebase (`backend/` Express.js API, `frontend/` React/Vite application, Supabase PostgreSQL 17 database `jbatiogfgozpktnraezn`).  
**Rules Complied:** Zero code modification, zero destructive tests, honest verification based strictly on code evidence.

---

## 1. Executive Summary

FurniERP is built as a single-company ERP specifically for one furniture manufacturing and retail business in Ethiopia, operating in Ethiopian Birr (ETB). The system has a robust relational schema in Supabase PostgreSQL (23 tables) and critical business operations (POS Checkout, Goods Receipts, Material Consumption, Production Completion, Customer/Supplier Debt Settlement) are backed by atomic database RPCs with `FOR UPDATE` row locking.

However, the audit reveals several critical architectural gaps:
1. **API Endpoints are Unprotected at Route Level (P0 Security Risk):** Although `backend/src/middleware/auth.ts` defines `authenticateToken`, `requireSuperAdmin`, and `requirePermission`, **not a single route** in `backend/src/routes/*.ts` uses these middlewares. Any HTTP client can call the endpoints directly without a token.
2. **Dashboard Is Largely Mocked (P1 Integrity Risk):** The backend dashboard router (`backend/src/routes/dashboard.routes.ts`) returns hardcoded arrays for `/sales-overview`, `/low-stock`, `/production-orders`, and `/recent-activity`. For `/summary`, if daily sales or outstanding debts are 0, it falls back to hardcoded demo metrics (`48750.00`, `32400.00`, `27600.00`) instead of reporting real zeroes.
3. **Frontend Bypasses Auth Header on Most Pages (P2 Inconsistency):** While `frontend/src/services/api.ts` provides an `authFetch` utility that injects the Supabase JWT session, only `Dashboard.tsx` uses it. Every other page (`Sales.tsx`, `Inventory.tsx`, `Purchases.tsx`, `Manufacturing.tsx`, etc.) calls native browser `fetch()` directly without an `Authorization` header.
4. **User Creation via UI Is Blocked (P1 Operational Defect):** `POST /api/settings/users` calls `supabase.auth.admin.createUser`, but `backend/.env` has an empty `SUPABASE_SERVICE_ROLE_KEY`. GoTrue rejects the call with 403 `User not allowed (code: 'not_admin')`.
5. **Purchase Order Creation Lacks Atomic Transaction (P2 Data Integrity):** While Goods Receipt is an atomic RPC (`confirm_goods_receipt`), the initial creation of a Purchase Order inserts the header and line items via separate client queries, and attempts a non-atomic supplier balance update.

---

## 2. Feature Connection Matrix

| Feature | UI / Page | API Endpoint / Service | Database Tables | Connected Modules | Actual Status | Evidence |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Super Admin Bootstrap** | `BootstrapPage.tsx` | `POST /api/auth/bootstrap` | `auth.users`, `auth.identities`, `user_profiles` | Auth, Navigation | **VERIFIED** | `supabase.rpc('create_initial_super_admin')` tested live; pre-confirms user, eliminates SMTP rate limits. |
| **Authentication & Login** | `LoginPage.tsx` | Supabase Auth JS / `POST /api/auth/login` | `auth.users`, `user_profiles` | All Modules | **VERIFIED** | Verified with `abdallah@frnierp.com`; returns valid JWT session and profile. |
| **Route Protection** | `App.tsx` | `backend/src/middleware/auth.ts` | `user_profiles`, `employee_permissions` | Security Layer | **BROKEN / MISSING** | `authenticateToken` exists in middleware, but is **never attached** to any route in `server.ts` or `routes/*.ts`. |
| **Employee Provisioning** | `Users.tsx` | `POST /api/settings/users` | `auth.users`, `user_profiles` | Settings, Auth | **BROKEN** | Fails with 403 `User not allowed` because `SUPABASE_SERVICE_ROLE_KEY` is empty in `backend/.env`. |
| **POS Catalog & Stock Check** | `Sales.tsx` | `GET /api/products?type=FINISHED_GOOD` | `products`, `stock_levels`, `categories` | Inventory, Sales | **VERIFIED** | Live API returns 10 products with multi-location stock levels. |
| **POS Checkout & Deduction** | `Sales.tsx` | `POST /api/sales/checkout` | `sales`, `sale_items`, `stock_levels`, `inventory_movements`, `payments`, `customers` | Inventory, Finance, Customers | **VERIFIED** | Atomic RPC `execute_sale_checkout` with row locking; tests prove single deduction and credit balance generation. |
| **Next Invoice Number** | `Sales.tsx` | `GET /api/sales/next-invoice-number` | `sales` | Sales | **VERIFIED** | Live query computes sequential invoice number (`INV-XXXXX`). |
| **Customer Directory** | `Customers.tsx` | `GET /api/customers`, `POST /api/customers` | `customers` | Sales, Finance | **VERIFIED** | Supports real-time ILIKE search, balance tracking, and registration. |
| **Customer Debt Payment** | `Customers.tsx` | `POST /api/customers/:id/payments` | `customers`, `payments`, `sales`, `audit_logs` | Sales, Finance | **VERIFIED** | Atomic RPC `record_customer_payment` locks customer, decrements balance, updates linked sale, logs payment. |
| **Supplier Directory** | `Suppliers.tsx` | `GET /api/purchases/suppliers`, `POST /api/purchases/suppliers` | `suppliers` | Purchases, Finance | **VERIFIED** | Directory persists name, contact, phone, address, and outstanding balance. |
| **Supplier Debt Payment** | `Suppliers.tsx` | `POST /api/purchases/suppliers/:id/payments` | `suppliers`, `payments`, `purchases`, `audit_logs` | Purchases, Finance | **VERIFIED** | Atomic RPC `record_supplier_payment` locks supplier, decrements balance, updates purchase. |
| **Purchase Order Creation** | `Purchases.tsx` | `POST /api/purchases` | `purchases`, `purchase_items`, `suppliers` | Inventory, Suppliers | **PARTIAL** | Creates PO and items, but is split across multiple non-transactional HTTP statements. Does not increase stock (correct). |
| **Goods Receipt Intake** | `Purchases.tsx` | `POST /api/purchases/receive` | `goods_receipts`, `goods_receipt_items`, `purchase_items`, `stock_levels`, `inventory_movements`, `purchases` | Purchases, Inventory | **VERIFIED** | Atomic RPC `confirm_goods_receipt` upserts `stock_levels`, increments stock, logs positive movement, marks PO received. |
| **Bill of Materials (BOM)** | `Manufacturing.tsx` | `GET /api/manufacturing/boms`, `POST /api/manufacturing/boms` | `boms`, `bom_items`, `products` | Manufacturing, Products | **VERIFIED** | Supports multi-item raw material recipes, versions, and waste tolerances. |
| **Production Order Lifecycle** | `Manufacturing.tsx` | `GET /orders`, `POST /orders` | `production_orders`, `products`, `boms` | Manufacturing, Inventory | **VERIFIED** | Order creation does NOT deduct raw materials or add finished goods until executed. |
| **Raw Material Issue** | `Manufacturing.tsx` | `POST /orders/:id/issue-materials` | `production_material_issues`, `stock_levels`, `inventory_movements`, `production_orders` | Inventory, Manufacturing | **VERIFIED** | Atomic RPC `issue_production_materials` verifies raw stock, deducts raw inventory, logs negative movement, adds cost. |
| **Production Completion** | `Manufacturing.tsx` | `POST /orders/:id/complete` | `production_orders`, `stock_levels`, `inventory_movements`, `products` | Manufacturing, Inventory | **VERIFIED** | Atomic RPC `complete_production_order` takes finished furniture into stock, logs intake movement, computes unit cost. |
| **Inventory Movement Audit** | `Inventory.tsx` | `GET /api/products/movements` | `inventory_movements`, `products`, `locations` | Inventory, Audit | **VERIFIED** | Fully immutable audit ledger recording exact deltas from sales, receipts, production, and adjustments. |
| **Manual Stock Adjustment** | `Inventory.tsx` | `POST /api/products/adjust-stock` | `stock_levels`, `inventory_movements` | Inventory | **VERIFIED** | Atomic RPC `record_stock_adjustment` enforces non-negative limits, calculates delta, logs audit movement. |
| **Finance P&L and Balance Sheet** | `Reports.tsx` | `GET /api/finance/summary` | `sales`, `sale_items`, `expenses`, `customers`, `suppliers`, `stock_levels`, `products` | Finance, All Modules | **VERIFIED** | Authoritative calculations for Revenue, COGS, Gross Profit, Operating Expenses, Net Profit, Debt Aging, and Inventory Valuation. |
| **Operating Expenses** | `Reports.tsx` | `GET /api/finance/expenses`, `POST /api/finance/expenses` | `expenses`, `audit_logs` | Finance | **VERIFIED** | Persists category, payment method, date, description, and logs audit record. |
| **Company Settings** | `Settings.tsx` | `GET /api/settings`, `PUT /api/settings` | `company_settings`, `locations` | System | **VERIFIED** | Single-record company profile (TIN, Brand, Currency ETB, Address). |
| **Dashboard Top KPIs** | `Dashboard.tsx` | `GET /api/dashboard/summary` | `sales`, `sale_items`, `payments`, `customers`, `suppliers` | Dashboard | **PARTIAL / MOCKED FALLBACK** | Queries real tables, but falls back to hardcoded numbers (`48750.00`, etc.) if database sum is zero. |
| **Dashboard Charts & Lists** | `Dashboard.tsx` | `/sales-overview`, `/low-stock`, `/production-orders`, `/recent-activity` | None (hardcoded arrays) | Dashboard | **MOCKED** | Backend routes return static arrays from memory. Live tables are not queried. |

---

## 3. Module-by-Module Technical Inspection

### 3.1 Authentication & Permissions
- **Files:** `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/BootstrapPage.tsx`, `backend/src/routes/auth.routes.ts`, `backend/src/middleware/auth.ts`, `supabase/migrations/20261015000005_fix_bootstrap_and_rls.sql`.
- **Database Tables:** `auth.users`, `auth.identities`, `public.user_profiles`, `public.employee_permissions`.
- **Findings:**
  - Initial Super Admin bootstrap is atomic via `public.create_initial_super_admin()`. It sets `email_confirmed_at = now()`, eliminating GoTrue SMTP rate limit errors.
  - Profile queries avoid RLS infinite loops using `public.is_super_admin()` (`SECURITY DEFINER`).
  - **Defect:** `backend/src/middleware/auth.ts` is never referenced in `server.ts` or `routes/*.ts`. Every API route is accessible anonymously over HTTP.
  - **Defect:** `POST /api/settings/users` cannot provision new employees because `SUPABASE_SERVICE_ROLE_KEY` is not set in `backend/.env`.

### 3.2 Sales & POS
- **Files:** `frontend/src/pages/Sales.tsx`, `backend/src/routes/sales.routes.ts`, `supabase/migrations/20261015000002_business_logic_rpcs.sql`.
- **Database Tables:** `sales`, `sale_items`, `stock_levels`, `inventory_movements`, `payments`, `customers`.
- **Findings:**
  - Real database backed.
  - Checkout is 100% atomic via PostgreSQL RPC `execute_sale_checkout`.
  - Stock is locked with `FOR UPDATE` and deducted exactly once.
  - Immutable inventory movements are recorded with `movement_type = 'SALE_DEDUCTION'` and negative quantities.
  - Partial and credit sales correctly increment `customers.outstanding_balance` and set `sales.balance_due`.
  - Cash, Telebirr, CBE Birr, and Bank Transfer payments are saved into `payments`.

### 3.3 Products & Inventory
- **Files:** `frontend/src/pages/Inventory.tsx`, `backend/src/routes/products.routes.ts`, `supabase/migrations/20261015000002_business_logic_rpcs.sql`.
- **Database Tables:** `products`, `categories`, `locations`, `stock_levels`, `inventory_movements`.
- **Findings:**
  - Tracks Finished Furniture and Raw Materials distinctly via `type` column (`'FINISHED_GOOD' | 'RAW_MATERIAL'`).
  - Stock levels are maintained per physical location (Main Shop vs Central Warehouse).
  - Manual adjustments require an explicit reason and run through atomic RPC `record_stock_adjustment`, creating an immutable audit trail.

### 3.4 Purchasing & Goods Receipts
- **Files:** `frontend/src/pages/Purchases.tsx`, `backend/src/routes/purchases.routes.ts`, `supabase/migrations/20261015000002_business_logic_rpcs.sql`.
- **Database Tables:** `purchases`, `purchase_items`, `goods_receipts`, `goods_receipt_items`, `stock_levels`, `inventory_movements`, `suppliers`.
- **Findings:**
  - Creating a Purchase Order does **NOT** increase inventory (correct business rule).
  - Stock increases **ONLY** when goods receipt is confirmed via atomic RPC `confirm_goods_receipt`.
  - Increments stock at the specified receiving location and creates positive `PURCHASE_RECEIPT` movements.
  - Handles partial deliveries by setting status to `'PARTIALLY_RECEIVED'`.

### 3.5 Manufacturing & Production
- **Files:** `frontend/src/pages/Manufacturing.tsx`, `backend/src/routes/manufacturing.routes.ts`, `supabase/migrations/20261015000003_manufacturing_and_payments.sql`.
- **Database Tables:** `boms`, `bom_items`, `production_orders`, `production_material_issues`, `stock_levels`, `inventory_movements`, `products`.
- **Findings:**
  - Creating a production order does not affect stock.
  - Issuing raw materials invokes atomic RPC `issue_production_materials`, which locks raw material stock rows, deducts inventory, records negative `MFG_CONSUMPTION` movements, and accumulates `total_material_cost`.
  - Completing the order invokes atomic RPC `complete_production_order`, which takes finished furniture into stock, records positive `MFG_OUTPUT` movements, adds labor cost, and computes unit standard cost.

### 3.6 Customers & Suppliers
- **Files:** `frontend/src/pages/Customers.tsx`, `frontend/src/pages/Suppliers.tsx`, `backend/src/routes/customers.routes.ts`, `backend/src/routes/purchases.routes.ts`.
- **Database Tables:** `customers`, `suppliers`, `payments`, `sales`, `purchases`, `audit_logs`.
- **Findings:**
  - Customer and supplier debt settlement operations are atomic via `record_customer_payment` and `record_supplier_payment`.
  - Outstanding balances are verified and locked `FOR UPDATE`.
  - Linked invoices and purchase orders are updated to `PAID` or `PARTIAL`.

### 3.7 Finance & Reports
- **Files:** `frontend/src/pages/Reports.tsx`, `backend/src/routes/finance.routes.ts`.
- **Database Tables:** `sales`, `sale_items`, `expenses`, `customers`, `suppliers`, `stock_levels`, `products`.
- **Findings:**
  - Real database computation. No mock data.
  - Revenue is calculated from `sales.total_amount`.
  - COGS is calculated from `sale_items (quantity * cost_price)`.
  - Gross Profit = Revenue - COGS.
  - Net Profit = Gross Profit - Operating Expenses.
  - Inventory Valuation is calculated by querying all `stock_levels` joined with `products.cost_price`, broken down into Finished Goods vs Raw Materials.
  - Outstanding Receivables and Payables are pulled from live `customers` and `suppliers`.

### 3.8 Dashboard
- **Files:** `frontend/src/pages/Dashboard.tsx`, `backend/src/routes/dashboard.routes.ts`.
- **Findings:**
  - **Highest concentration of mocked data in the system.**
  - `GET /api/dashboard/sales-overview`: Returns hardcoded array of dates and amounts.
  - `GET /api/dashboard/low-stock`: Returns hardcoded array of 5 items.
  - `GET /api/dashboard/production-orders`: Returns hardcoded array of 4 orders.
  - `GET /api/dashboard/recent-activity`: Returns hardcoded array of 5 activities.
  - `GET /api/dashboard/summary`: Executes real queries, but replaces real 0 results with hardcoded numbers (`todaySales: todaySales || 48750.00`).
