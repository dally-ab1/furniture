# DECISIONS.md — Architecture & Business Decisions Log

## 1. Confirmed Architecture & Technical Decisions

### `DEC-001`: Single-Company Model (No Multi-Tenancy)
- **Decision:** Build an ERP exclusively for ONE furniture company. Do not implement tenant IDs, multi-tenant databases, tenant switching, or subscription management.
- **Rationale:** The application is a dedicated operational tool for a single Ethiopian business. Multi-tenancy adds substantial schema complexity, query overhead, security risks, and operational burdens without providing any business value.
- **Date Confirmed:** October 15, 2026.

---

### `DEC-002`: Technology Stack (ERN + Supabase)
- **Decision:** Use Express.js (Node.js) + React (Vite) + TypeScript + Supabase PostgreSQL + Supabase Auth.
- **Rationale:** 
  - **Node.js + Express.js:** Mature, high-performance API layer providing an authoritative boundary for complex business logic, transactional integrity, and server-side authorization checks.
  - **React + Vite + TypeScript:** Fast, component-driven client architecture with strict type safety matching the backend contracts.
  - **Supabase PostgreSQL:** Rock-solid relational database engine supporting ACID transactions, Row Level Security (RLS), and native JSONB capabilities.
  - **Supabase Auth:** Enterprise-grade security for password hashing, JWT signing, and session management.
- **Date Confirmed:** October 15, 2026.

---

### `DEC-003`: User Account Roles & Permissions
- **Decision:** Initially support exactly TWO roles: `SUPER_ADMIN` and `EMPLOYEE`.
- **Details:**
  - `SUPER_ADMIN`: The company owner with unrestricted operational, administrative, and financial access.
  - `EMPLOYEE`: Staff members whose access is restricted to explicitly assigned functional permissions (e.g. POS sales, inventory viewing, production).
  - All permission checks are enforced authoritatively on the Express backend; frontend UI controls mirror backend permissions for UX only.
- **Date Confirmed:** October 15, 2026.

---

### `DEC-004`: Currency & Monetary Representation
- **Decision:** Use Ethiopian Birr (`ETB`) consistently throughout the application. Store all monetary amounts in PostgreSQL `NUMERIC(14, 2)` and all material quantities in `NUMERIC(12, 4)`.
- **Rationale:** IEEE-754 floating point numbers (`FLOAT`, `DOUBLE`, `REAL`) cause catastrophic precision loss in financial computations and quantity reconciliations.
- **Date Confirmed:** October 15, 2026.

---

### `DEC-005`: Inventory Integrity & Auditable Ledger
- **Decision:** Current stock balances (`stock_levels`) are derived from or strictly synchronized with an append-only `inventory_movements` ledger.
- **Details:**
  - Direct, untracked edits to stock quantities are prohibited.
  - Sales decrement inventory exactly once upon checkout completion.
  - Purchase orders do NOT increment inventory; inventory increases only upon confirmed Goods Receipt.
  - Manufacturing orders consume raw materials upon issue and add finished goods only upon confirmed completion.
- **Date Confirmed:** October 15, 2026.

---

### `DEC-006`: Financial Separation (Revenue, Cash Flow & Profit)
- **Decision:** Maintain strict boundaries between revenue, cash collections, accounts receivable, payables, and profits.
- **Details:**
  - Invoices issued on credit are recorded as revenue and accounts receivable, NOT cash received.
  - Partial payments reduce remaining balances without modifying original invoice line items.
  - Cost of Goods Sold (COGS) is computed from unit cost snapshots at time of sale.
  - Operating expenses are deducted from Gross Profit to arrive at Net Profit.
- **Date Confirmed:** October 15, 2026.

---

### `DEC-007`: Design System & Brand Palette (FurniERP)
- **Decision:** Adopt the verified FurniERP design system matching the provided high-fidelity dashboard:
  - Sidebar: Deep Forest Charcoal (`#162B1E` / `#1A3325`)
  - Primary Brand Accent: Forest Green (`#276749`)
  - Canvas Background: Warm Off-White (`#F7F7F2`)
  - Typography: Deep Charcoal (`#202820`) and Secondary Text (`#69736B`)
  - Surface White: `#FFFFFF` with borders `#E3E7E1`
- **Rationale:** Minimalist, calm, Notion-inspired aesthetic optimized for clarity and long working hours on shop and warehouse displays.
- **Date Confirmed:** October 15, 2026.

---

## 2. Unresolved Decisions & Business Clarifications Required

These items represent business parameters that require company owner input before implementation:

### `DEC-OPEN-01`: Standard Inventory Costing Method
- **Context:** When finished furniture is manufactured or raw materials are purchased at fluctuating prices, how should unit cost be calculated for inventory valuation and COGS?
- **Options:**
  - Option A (Recommended): **Moving Weighted Average Cost (WAC)** — Simple, resilient to price fluctuations.
  - Option B: **First-In, First-Out (FIFO)** — Strict batch tracking.
  - Option C: **Standard Costing** — Pre-set standard costs with periodic variance adjustments.
- **Current Default:** Moving Weighted Average Cost (`WAC`) until specified otherwise.

---

### `DEC-008`: Supabase Project Environment
- **Decision:** Use the confirmed active Supabase project (`Furniture`, Ref: `jbatiogfgozpktnraezn`).
- **Details:**
  - Project URL: `https://jbatiogfgozpktnraezn.supabase.co`
  - PostgreSQL Host: `db.jbatiogfgozpktnraezn.supabase.co` (PostgreSQL 17)
  - Region: `eu-central-1`
- **Date Confirmed:** October 15, 2026.

---

## 2. Unresolved Decisions & Business Clarifications Required

These items represent business parameters that require company owner input before implementation:

### `DEC-OPEN-01`: Standard Inventory Costing Method
- **Context:** When finished furniture is manufactured or raw materials are purchased at fluctuating prices, how should unit cost be calculated for inventory valuation and COGS?
- **Options:**
  - Option A (Recommended): **Moving Weighted Average Cost (WAC)** — Simple, resilient to price fluctuations.
  - Option B: **First-In, First-Out (FIFO)** — Strict batch tracking.
  - Option C: **Standard Costing** — Pre-set standard costs with periodic variance adjustments.
- **Current Default:** Moving Weighted Average Cost (`WAC`) until specified otherwise.

---

### `DEC-OPEN-03`: Company Legal Header for Invoices & Receipts
- **Context:** Sales invoices and goods receipt notes require header metadata.
- **Required Inputs:**
  - Legal Business Name (e.g., "Addis Fine Furniture Plc" or generic "FurniERP Co.")
  - Tax Identification Number (TIN)
  - Physical Shop Address & Phone Number
  - Receipt footer disclaimers or return policy terms.
- **Current Default:** Placeholder metadata configured in company settings table.
