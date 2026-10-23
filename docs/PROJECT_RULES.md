# PROJECT_RULES.md — Business Workflows, Safeguards & Financial Rules

## 1. Business Scope & Context

This ERP is built exclusively for **one furniture company in Ethiopia**.

The business:
- Sells finished furniture directly to retail and wholesale customers.
- Purchases raw materials (timber, screws, foam, fabric, varnish, hardware) and finished items from suppliers.
- Manufactures furniture in-house using raw materials based on Bills of Materials (BOM).
- Operates initially with two primary locations: **Main Shop** (retail showroom) and **Central Warehouse / Factory**.
- Uses **Ethiopian Birr (ETB)** exclusively as its operational and accounting currency.
- Employs nontechnical shop clerks, workshop foremen, and cashiers who require an intuitive, fail-safe interface.

---

## 2. Core Business Workflows

### A. Product Setup & Cataloging
1. Products must have a distinct, human-readable SKU (e.g. `PRD-CHAIR-001`, `RAW-OAK-PLANK`).
2. Type must be strictly categorized:
   - `RAW_MATERIAL`: Consumed in manufacturing (wood, nails, varnish, foam).
   - `FINISHED_GOOD`: Produced or purchased for direct sale to customers.
   - `SEMI_FINISHED`: Intermediate manufactured components (e.g., assembled chair frames).
3. Explicit unit of measurement must be set (`pcs`, `m²`, `kg`, `L`, `m`).
4. Selling prices are set for finished goods. Standard cost prices are maintained for all items.
5. **Zero Silent Balance Creation:** Opening inventory must be introduced via an authorized `STOCK_ADJUSTMENT` movement with notes and authorization, never by arbitrary column editing.

### B. Purchasing & Goods Receiving
1. **Purchase Orders (PO):** Drafting or finalizing a purchase order commits an agreement with the supplier, but **DOES NOT alter inventory balances**.
2. **Goods Receipt Note (GRN):** When physical goods arrive at the warehouse or shop:
   - Receiving clerk enters actual accepted quantities.
   - System updates `stock_levels` atomically and records an `inventory_movements` record of type `PURCHASE_RECEIPT`.
   - Partial receipts are supported: remaining ordered quantities remain open.
3. **Supplier Payables:**
   - Payables are tracked based on received goods value.
   - Payments made to suppliers are recorded in the `payments` table and decrement `suppliers.outstanding_balance`.

### C. Sales & Point of Sale (POS)
1. **Search & Cart:** Cashier rapidly searches items by SKU, name, or category.
2. **Stock Verification:** The system verifies real-time stock availability for the active location before checkout.
3. **Discounts:** Standard discounts are permitted; discounts exceeding configured thresholds require Super Admin authorization.
4. **Checkout & Payment Execution:**
   - **Cash Sale:** Full payment received upfront (`status = 'PAID'`).
   - **Partial Payment:** Upfront deposit received; remaining amount recorded as `balance_due` (`status = 'PARTIAL'`), increasing `customer.outstanding_balance`.
   - **Credit Sale:** Zero cash upfront; total amount recorded as `balance_due` (`status = 'CREDIT'`), creating an immediate account receivable.
5. **Inventory Effect:** Stock is decremented **exactly once** at checkout completion inside an atomic transaction.
6. **Receipt / Invoice:** Generate a clean, printable receipt with invoice number (`INV-XXXXX`), payment breakdown, and company details.

### D. Manufacturing & Production
1. **Bill of Materials (BOM):** Defines the recipe of raw materials needed to produce 1 unit of a finished furniture item, including standard waste percentages.
2. **Production Order (PRD):** Initiates a work order for a target quantity with a scheduled due date.
3. **Material Issue / Consumption:**
   - Foremen record raw materials issued to production.
   - Deducts raw materials from inventory with movement type `MFG_CONSUMPTION`.
   - Accumulates actual material costs into the production order.
4. **Production Completion:**
   - Foreman records completed accepted units and scrap/waste quantities.
   - System atomically increases finished goods stock (`inventory_movements` type `MFG_OUTPUT`).
   - Order transitions to `COMPLETED`.
   - Production cost is finalized (materials + allocated labor) and updates the product's calculated cost basis.

### E. Debt Management & Payments
1. Every payment must reference its source document (`sale_id`, `purchase_id`, or general customer/supplier debt clearance).
2. Supported Ethiopian payment methods:
   - `CASH`
   - `BANK_TRANSFER` (CBE, Awash, Dashen, etc.)
   - `TELEBIRR`
   - `CBE_BIRR`
3. A partial payment reduces the debt without erasing the invoice's history.
4. An unpaid or credit invoice must NEVER be reported as cash flow.

### F. Returns, Adjustments & Cancellations
1. **No Silent Deletions:** Finalized transactions are never deleted from the database.
2. **Sales Returns:** Handled through an authorized return record specifying:
   - Restocked to inventory (if undamaged), or written off to scrap.
   - Refund method (cash payout or reduction of customer credit balance).
3. **Inventory Adjustments:** Periodic physical audits require Super Admin approval, recording the reason (breakage, shrinkage, cycle count) and generating an adjustment movement.

---

## 3. Employee Permissions Matrix

| Permission Key | Description | Super Admin | Default Employee |
| :--- | :--- | :---: | :---: |
| `dashboard.view` | View main operational dashboard | Yes | Yes |
| `pos.create_sale` | Process checkout and issue invoices | Yes | Optional |
| `pos.apply_discount` | Apply discounts above standard limit | Yes | Restricted |
| `sales.view_all` | View full company sales history | Yes | Restricted |
| `sales.cancel` | Void or cancel a finalized sale | Yes | Restricted |
| `inventory.view` | View stock levels and locations | Yes | Yes |
| `inventory.adjust` | Perform manual stock adjustments | Yes | Restricted |
| `purchases.create` | Create purchase orders | Yes | Optional |
| `purchases.receive` | Confirm goods receipt & accept stock | Yes | Optional |
| `manufacturing.view` | View production orders & BOMs | Yes | Optional |
| `manufacturing.manage`| Issue materials & complete production | Yes | Optional |
| `customers.manage` | Add and update customer details | Yes | Yes |
| `suppliers.manage` | Add and update supplier details | Yes | Optional |
| `expenses.record` | Record operating expenses | Yes | Optional |
| `reports.view_financial`| View profit, revenue & expense reports | Yes | **Forbidden** |
| `users.manage` | Create employees & assign permissions | Yes | **Forbidden** |
| `settings.manage` | Manage company & business settings | Yes | **Forbidden** |

---

## 4. Financial Calculations & Formulas

Authoritative financial reports must strictly use these definitions:

1. **Total Sales Revenue:**
   $$\text{Revenue} = \sum (\text{Sale Subtotal} - \text{Discount})$$
   *(Recognized when the sale invoice is issued, regardless of payment terms).*

2. **Cash Collected:**
   $$\text{Cash Inflow} = \sum (\text{Payments Received within Date Range})$$
   *(Cash, Telebirr, CBE Birr, or Bank Transfers physically collected).*

3. **Accounts Receivable (Customer Debt):**
   $$\text{Customer Outstanding} = \sum (\text{Invoice Balance Due}) - \sum (\text{Unallocated Debt Payments})$$

4. **Accounts Payable (Supplier Debt):**
   $$\text{Supplier Outstanding} = \sum (\text{Received Goods Value}) - \sum (\text{Supplier Payments Made})$$

5. **Cost of Goods Sold (COGS):**
   $$\text{COGS} = \sum_{\text{sold items}} (\text{Quantity Sold} \times \text{Snapshot Cost Price})$$

6. **Estimated Gross Profit:**
   $$\text{Gross Profit} = \text{Total Sales Revenue} - \text{COGS}$$

7. **Operating Expenses (OPEX):**
   $$\text{OPEX} = \sum (\text{Recorded Expenses in Period})$$

8. **Estimated Net Profit:**
   $$\text{Net Profit} = \text{Gross Profit} - \text{OPEX}$$

> **Important Accounting Safeguard:** Never label total cash collected as "revenue", and never confuse sales revenue with profit. Never double-count raw material purchase costs if they are already accounted for in the finished good COGS.

---

## 5. Concurrency & Idempotency Safeguards

- **Checkout Double-Click Prevention:** Checkout requests accept an idempotency token generated by the client (`checkout_token`). If duplicate requests arrive, the server returns the existing transaction result without re-deducting stock or recording another sale.
- **Stock Row Locking:** When checking out or issuing production materials, the backend acquires a `FOR UPDATE` lock on the relevant `stock_levels` rows to prevent race-condition overselling.
- **Transaction Atomicity:** Every operation affecting more than one table executes inside a database transaction block (`BEGIN ... COMMIT`) or a stored procedure.
