# KNOWN_ISSUES.md — FurniERP Confirmed Defects, Gaps & Risk Registry

**Date:** October 15, 2026  
**Status:** Audit Completed; Ready for Prioritized Remediation

---

## 1. P0 — Critical (Security Vulnerabilities & Access Control)

### ISSUE-P0-01: Express API Endpoints Completely Lack Route-Level Authentication
- **Status:** `RESOLVED / VERIFIED` (October 16, 2026)
- **Problem:** Middleware functions `authenticateToken`, `requireSuperAdmin`, and `requirePermission` existed in `backend/src/middleware/auth.ts`, but were not applied to any route in `backend/src/server.ts` or `backend/src/routes/*.ts`.
- **Resolution:**
  1. Applied `authenticateToken` globally in `server.ts` after health and auth routes.
  2. Applied `requireSuperAdmin` on all settings and user management routes (`/api/settings/*`).
  3. Applied granular `requirePermission(...)` middleware across all routes (`finance`, `products`, `sales`, `purchases`, `manufacturing`, `customers`, `dashboard`).
  4. Added automated verification test suite (`backend/src/scratch/test_security_auth.ts`) validating 401 on missing/invalid JWT and 403 on insufficient roles/permissions.

---

## 2. P1 — High (Operational Defects & Misleading Data)

### ISSUE-P1-01: Dashboard Data Is Largely Mocked or Falls Back to Static Numbers
- **Problem:**
  1. `backend/src/routes/dashboard.routes.ts` returns static in-memory arrays for `/sales-overview`, `/low-stock`, `/production-orders`, and `/recent-activity`.
  2. In `GET /api/dashboard/summary`, line 60 uses JavaScript `||` fallbacks (`todaySales || 48750.00`, `customerOutstanding || 27600.00`). If real database metrics are zero, the dashboard reports fake numbers.
- **Evidence:** `backend/src/routes/dashboard.routes.ts` lines 59-71 and lines 77-193.
- **Business Impact:** The business owner sees simulated sales, low stock alerts, and production progress that do not reflect actual factory or shop status.
- **Affected Modules:** Dashboard, Management Reporting.
- **Recommended Minimal Fix:** Replace mock handlers in `dashboard.routes.ts` with real SQL queries on `sales`, `stock_levels` (where `quantity <= min_stock_level`), `production_orders`, and `inventory_movements`. Remove hardcoded number fallbacks.
- **Required Tests:** Query verification showing dashboard figures match counts and sums in underlying tables.

### ISSUE-P1-02: Employee Account Provisioning Fails with 403 Forbidden
- **Problem:** Creating an employee via `Users.tsx` (`POST /api/settings/users`) invokes `supabase.auth.admin.createUser()`. Because `SUPABASE_SERVICE_ROLE_KEY` is empty in `backend/.env`, the client falls back to the anon key, and Supabase GoTrue rejects the call with `AuthApiError: User not allowed (status: 403, code: 'not_admin')`.
- **Evidence:** Live test in `node` confirmed error code `'not_admin'`.
- **Business Impact:** Super Admin cannot invite or create staff/employee accounts from the user interface.
- **Affected Modules:** User Management, Settings, Security.
- **Recommended Minimal Fix:** Either provide the legitimate Supabase Service Role Key in `backend/.env` or implement a `SECURITY DEFINER` PostgreSQL RPC (e.g., `create_employee_account`) that safely provisions staff accounts directly in PostgreSQL.
- **Required Tests:** Submit create user form in `Users.tsx` and verify user appears in `user_profiles` with `role = 'EMPLOYEE'`.

---

## 3. P2 — Medium (Workflow Inconsistencies & Data Gaps)

### ISSUE-P2-01: Frontend Pages Bypass Authenticated API Client
- **Status:** `RESOLVED / VERIFIED` (October 16, 2026)
- **Problem:** `frontend/src/services/api.ts` provides `authFetch`, which attaches the Supabase JWT token. However, only `Dashboard.tsx` imported it. All other pages (`Sales.tsx`, `Inventory.tsx`, `Purchases.tsx`, `Manufacturing.tsx`, `Customers.tsx`, `Suppliers.tsx`, `Reports.tsx`, `Settings.tsx`, `Users.tsx`) called `fetch()` directly without an `Authorization` header.
- **Resolution:**
  1. Standardized `frontend/src/services/api.ts` with `ApiError` class (categorizing auth, forbidden, validation, network, server errors) and robust `authFetch` attaching Supabase session JWT tokens.
  2. Migrated all operational pages (`Sales`, `Inventory`, `Purchases`, `Manufacturing`, `Customers`, `Suppliers`, `Users`, `Settings`, `Reports`, `Dashboard`) to use `authFetch`.
  3. Verified via `grep_search` that only public endpoints (`/auth/bootstrap` in `BootstrapPage.tsx` and `/auth/status` in `App.tsx`) use raw fetch.
  4. Verified full TypeScript build (`tsc -b && vite build`) passing with zero errors.

### ISSUE-P2-02: Purchase Order Creation Is Not Inside a Database Transaction
- **Problem:** `POST /api/purchases` inserts the purchase header, inserts line items, and updates the supplier balance in three separate client-side queries without a PostgreSQL transaction or RPC.
- **Evidence:** `backend/src/routes/purchases.routes.ts` lines 180-235.
- **Business Impact:** If line items fail to insert or the server crashes mid-flight, an orphaned purchase header remains and supplier balances become inconsistent.
- **Affected Modules:** Purchases, Suppliers, Accounts Payable.
- **Recommended Minimal Fix:** Wrap PO creation into a PostgreSQL RPC (`create_purchase_order`) or transaction.
- **Required Tests:** Test PO creation with invalid line item to verify complete rollback.

### ISSUE-P2-03: POS Credit Sale Permitted for Anonymous Walk-in Customer
- **Problem:** `POST /api/sales/checkout` allows `customerId` to be `null` even when `paidAmount < totalAmount` (`status = 'CREDIT'`). The sale is recorded, but no debtor is linked.
- **Evidence:** `backend/src/routes/sales.routes.ts` line 9 (`customerId: z.string().uuid().nullable().optional()`) and `execute_sale_checkout` RPC lines 203-208.
- **Business Impact:** The company records a receivable, but has no customer to collect it from, distorting debtor aging reports.
- **Affected Modules:** Sales & POS, Customers, Finance.
- **Recommended Minimal Fix:** In `sales.routes.ts` and `execute_sale_checkout`, enforce that if `balance_due > 0`, `p_customer_id` is mandatory and cannot be null or the anonymous Walk-in ID.
- **Required Tests:** Attempt credit checkout with no customer selected; verify rejection with 400 Bad Request.

---

## 4. P3 — Low (Minor UI & Usability Refinements)

### ISSUE-P3-01: Thermal Print Receipt Lacks Ethiopian Fiscal Details
- **Problem:** The receipt modal in `Sales.tsx` prints standard line items, but does not render the company's TIN number or registered business address stored in `company_settings`.
- **Evidence:** `frontend/src/pages/Sales.tsx` receipt print preview section.
- **Business Impact:** Receipts printed for customers lack required Ethiopian commercial information.
- **Affected Modules:** Sales & POS, Settings.
- **Recommended Minimal Fix:** Fetch `company_settings` on mount in `Sales.tsx` and render TIN, Brand Name, and Address in receipt header.
- **Required Tests:** Verify receipt print preview displays company TIN.
