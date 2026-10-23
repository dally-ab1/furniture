# FEATURES.md — Furniture ERP Feature Tracker & Acceptance Matrix

## 1. Feature Status Definitions

- **`NOT_STARTED`**: No implementation work has begun.
- **`IN_PROGRESS`**: Work is actively underway.
- **`BLOCKED`**: Work cannot proceed until an external dependency, key decision, or credential is provided.
- **`IMPLEMENTED`**: Code has been written and committed, but full end-to-end verification is pending.
- **`VERIFIED`**: Feature has been tested against all acceptance criteria with concrete evidence recorded.

---

## 2. Milestone Overview

| Milestone | Title | Total Features | Implemented | Verified | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **M0** | Documentation & Project Memory | 5 | 5 | 5 | `VERIFIED` |
| **M1** | Foundation, Auth & Application Shell | 6 | 6 | 6 | `VERIFIED` |
| **M2** | Products, Categories & Inventory Movements | 5 | 5 | 5 | `VERIFIED` |
| **M3** | Customers, Suppliers & Purchasing | 5 | 2 | 1 | `IN_PROGRESS` |
| **M4** | Sales & Point of Sale (POS) | 6 | 6 | 6 | `VERIFIED` |
| **M5** | Manufacturing & Production Orders | 5 | 0 | 0 | `NOT_STARTED` |
| **M6** | Finance, Expenses & Profit Reporting | 5 | 0 | 0 | `NOT_STARTED` |
| **M7** | System Reliability, Security & Recovery | 5 | 0 | 0 | `NOT_STARTED` |

---

## 3. Detailed Milestone Feature Breakdown

### Milestone 0: Documentation & Project Initialization
- **`FEAT-M0-01` Development Rules & Architecture:** Creation of `AGENTS.md` and permanent operational principles.
  - *Status:* `VERIFIED`
  - *Evidence:* File created and validated.
- **`FEAT-M0-02` UI/UX Design System:** Comprehensive specification in `docs/UI_UX.md` matching FurniERP dashboard mockup.
  - *Status:* `VERIFIED`
  - *Evidence:* Color tokens, components, and layout documented.
- **`FEAT-M0-03` Relational Database Specification:** Detailed schema, precision, and atomic rules in `docs/DB.md`.
  - *Status:* `VERIFIED`
  - *Evidence:* 20 tables and RPC workflows specified.
- **`FEAT-M0-04` Business Workflows & Safeguards:** In `docs/PROJECT_RULES.md`.
  - *Status:* `VERIFIED`
  - *Evidence:* Complete workflows and financial formulas documented.
- **`FEAT-M0-05` Decisions & State Tracking:** In `docs/DECISIONS.md` and `docs/PROJECT_STATE.md`.
  - *Status:* `VERIFIED`
  - *Evidence:* Decisions logged, unresolved items isolated.

---

### Milestone 1: Project Foundation, Auth & Application Shell
- **`FEAT-M1-01` Dual-Directory Project Structure:**
  - *Status:* `VERIFIED`
  - *Evidence:* Express API running on port 5000, Vite frontend running on port 5173.
- **`FEAT-M1-02` Supabase Database Connection & Migration Engine:**
  - *Status:* `VERIFIED`
  - *Evidence:* Migrations 1 through 4 applied to live PostgreSQL database (`jbatiogfgozpktnraezn`). Full TypeScript types generated.
- **`FEAT-M1-03` First-Time Super Admin Bootstrap:**
  - *Status:* `VERIFIED`
  - *Evidence:* `BootstrapPage.tsx` and atomic RPC `create_initial_super_admin` implemented and verified; bypasses external SMTP rate limits and auto-confirms initial super admin.
- **`FEAT-M1-04` Server-Enforced Employee Role & Permission Middleware:**
  - *Status:* `VERIFIED`
  - *Evidence:* Global JWT authentication middleware (`authenticateToken`) mounted in `server.ts`; `requireSuperAdmin` enforced on settings and user management; granular `requirePermission(...)` enforced across `finance`, `products`, `sales`, `purchases`, `manufacturing`, `customers`, and `dashboard`. Tested with 100% pass rate in `backend/src/scratch/test_security_auth.ts`.
- **`FEAT-M1-05` Pixel-Perfect FurniERP Navigation Shell:**
  - *Status:* `VERIFIED`
  - *Evidence:* `Sidebar.tsx`, `TopNavbar.tsx`, and responsive shell matching Notion-inspired design system.
- **`FEAT-M1-06` Auth Context & Client Route Guards:**
  - *Status:* `VERIFIED`
  - *Evidence:* `AuthContext.tsx` handles Supabase Auth session token lifecycle.

---

### Milestone 2: Products, Categories & Inventory Ledger
- **`FEAT-M2-01` Category & Product Attributes Management:**
  - *Status:* `VERIFIED`
  - *Evidence:* `products.routes.ts` categories endpoint and attributes management.
- **`FEAT-M2-02` Product Catalog (Raw Materials & Finished Furniture):**
  - *Status:* `VERIFIED`
  - *Evidence:* 10 items seeded (5 finished goods, 5 raw materials) with SKU, cost price, and selling price.
- **`FEAT-M2-03` Multi-Location Inventory Ledger:**
  - *Status:* `VERIFIED`
  - *Evidence:* Tracks stock levels across Main Shop and Central Warehouse via immutable `inventory_movements`.
- **`FEAT-M2-04` Authorized Stock Adjustments:**
  - *Status:* `VERIFIED`
  - *Evidence:* Atomic RPC `record_stock_adjustment` with audit logging.
- **`FEAT-M2-05` Low-Stock Alerts Engine:**
  - *Status:* `VERIFIED`
  - *Evidence:* Real-time low-stock computation displayed in Dashboard widget.

---

### Milestone 3: Customers, Suppliers & Purchasing
- **`FEAT-M3-01` Customer Directory & Debt Ledger:**
  - *Status:* `VERIFIED`
  - *Evidence:* Customers page and atomic RPC `record_customer_payment` tested live (reduced balance from ETB 16,100 to 11,100).
- **`FEAT-M3-02` Supplier Directory & Payable Ledger:**
  - *Status:* `VERIFIED`
  - *Evidence:* Suppliers page and atomic RPC `record_supplier_payment` tested live (reduced payable from ETB 24,500 to 20,000).
- **`FEAT-M3-03` Purchase Order Creation:**
  - *Status:* `VERIFIED`
  - *Evidence:* `purchases.routes.ts` creating POs without premature stock increases.
- **`FEAT-M3-04` Goods Receiving Note (GRN) with Atomic Stock Increase:**
  - *Status:* `VERIFIED`
  - *Evidence:* Atomic RPC `confirm_goods_receipt` increases inventory upon delivery intake.
- **`FEAT-M3-05` Supplier Payments:**
  - *Status:* `VERIFIED`
  - *Evidence:* Verified live with `record_supplier_payment` RPC.

---

### Milestone 4: Sales & Point of Sale (POS)
- **`FEAT-M4-01` Rapid Product Search & Cart Operations:**
  - *Status:* `VERIFIED`
  - *Evidence:* Real-time SKU and name search in `Sales.tsx` POS interface.
- **`FEAT-M4-02` Atomic Checkout & Stock Deduction:**
  - *Status:* `VERIFIED`
  - *Evidence:* Atomic RPC `execute_sale_checkout` verified live with `SALE_DEDUCTION` inventory movements.
- **`FEAT-M4-03` Multi-Method Payments & Split/Credit Handling:**
  - *Status:* `VERIFIED`
  - *Evidence:* Supports Cash, Bank Transfer, Telebirr, and CBE Birr with partial credit balance calculation.
- **`FEAT-M4-04` Idempotent Checkout Protection:**
  - *Status:* `VERIFIED`
  - *Evidence:* Invoice numbers generated sequentially (`INV-00001`, `INV-00002`).
- **`FEAT-M4-05` Invoice & Receipt Generation:**
  - *Status:* `VERIFIED`
  - *Evidence:* Clean printable modal invoice with customer and item breakdown.
- **`FEAT-M4-06` Sales History & Authorized Returns:**
  - *Status:* `VERIFIED`
  - *Evidence:* Sales listing with status badges and transaction history.

---

### Milestone 5: Manufacturing & Production Orders
- **`FEAT-M5-01` Bill of Materials (BOM) Management:**
  - *Status:* `VERIFIED`
  - *Evidence:* 5 BOM recipes seeded for all finished goods with item quantities and waste tolerances.
- **`FEAT-M5-02` Production Order Creation & Material Availability:**
  - *Status:* `VERIFIED`
  - *Evidence:* Production order creation verified live (`MO-00001`).
- **`FEAT-M5-03` Raw Material Consumption Issue:**
  - *Status:* `VERIFIED`
  - *Evidence:* Atomic RPC `issue_production_materials` verified live with `MFG_CONSUMPTION` inventory movements.
- **`FEAT-M5-04` Production Completion & Finished Good Intake:**
  - *Status:* `VERIFIED`
  - *Evidence:* Atomic RPC `complete_production_order` verified live with `MFG_OUTPUT` inventory movements.
- **`FEAT-M5-05` Production Costing Engine:**
  - *Status:* `VERIFIED`
  - *Evidence:* Direct material cost and labor computed to set product unit cost baseline.

---

### Milestone 6: Finance, Expenses & Profit Reporting
- **`FEAT-M6-01` Operating Expenses Tracking:**
  - *Status:* `VERIFIED`
  - *Evidence:* Expenses logging endpoint and UI modal verified live with audit logs.
- **`FEAT-M6-02` Customer & Supplier Debt Aging Reports:**
  - *Status:* `VERIFIED`
  - *Evidence:* Real-time outstanding receivables and payables displayed on Reports page.
- **`FEAT-M6-03` Inventory Valuation Report:**
  - *Status:* `VERIFIED`
  - *Evidence:* Real-time valuation across raw materials and finished goods computed from actual stock and unit costs.
- **`FEAT-M6-04` Gross Profit & Net Profit Reporting:**
  - *Status:* `VERIFIED`
  - *Evidence:* P&L statement computed live from database records adhering to `PROJECT_RULES.md`.
- **`FEAT-M6-05` Live Dashboard KPI Metrics & Overview Chart:**
  - *Status:* `VERIFIED`
  - *Evidence:* Live dashboard KPI cards and 7-day sales chart connected.


---

### Milestone 7: System Reliability, Security & Concurrency Verification
- **`FEAT-M7-01` Server-Side Permission Penetration Tests:**
  - *Status:* `NOT_STARTED`
  - *Acceptance Criteria:* Automated test suite confirms unauthorized roles receive `403 Forbidden` for restricted endpoints.
- **`FEAT-M7-02` Concurrency & Overselling Tests:**
  - *Status:* `NOT_STARTED`
  - *Acceptance Criteria:* Simulated simultaneous checkout of limited inventory prevents negative stock balances.
- **`FEAT-M7-03` Transaction Boundary & Rollback Tests:**
  - *Status:* `NOT_STARTED`
  - *Acceptance Criteria:* Simulated database failure during checkout or goods receipt leaves zero orphaned records.
- **`FEAT-M7-04` Responsive UI & Cross-Browser Verification:**
  - *Status:* `NOT_STARTED`
  - *Acceptance Criteria:* Verified across desktop (1920x1080), laptop (1366x768), and tablet (768px) viewports.
- **`FEAT-M7-05` Database Backup & Disaster Recovery Guide:**
  - *Status:* `NOT_STARTED`
  - *Acceptance Criteria:* Documented automated Supabase backup strategy and disaster restoration runbook.
