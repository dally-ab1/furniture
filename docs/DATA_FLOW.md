# DATA_FLOW.md — FurniERP UI to API to Database Data Flows

This document details the exact path taken by data from user actions in the React frontend, through the Express API routes, to the PostgreSQL database tables.

---

## 1. Sales & POS Data Flow

```
[Sales.tsx Cart & Checkout UI]
       │
       │ HTTP POST /api/sales/checkout (JSON payload)
       ▼
[sales.routes.ts]
       │
       │ Zod validation (checkoutSchema)
       │ RPC invocation: supabase.rpc('execute_sale_checkout', payload)
       ▼
[PostgreSQL Database Function: execute_sale_checkout]
       ├── 1. Lock stock_levels row FOR UPDATE
       ├── 2. Verify: current_stock >= requested_quantity
       ├── 3. INSERT INTO public.sales RETURNING id
       ├── 4. INSERT INTO public.sale_items (with cost_price snapshot)
       ├── 5. UPDATE public.stock_levels (decrement physical quantity)
       ├── 6. INSERT INTO public.inventory_movements (SALE_DEDUCTION, -qty)
       ├── 7. (Optional) INSERT INTO public.payments (if paid_amount > 0)
       └── 8. (Optional) UPDATE public.customers (outstanding_balance += balance_due)
       │
       ▼
[HTTP 200 Response: { success: true, data: { sale_id, invoice_number, status } }]
       │
       ▼
[Sales.tsx: Clear cart, trigger thermal receipt modal, refresh sales history]
```

---

## 2. Purchasing & Goods Receipt Data Flow

```
[Purchases.tsx Receive Goods Modal]
       │
       │ HTTP POST /api/purchases/receive (JSON: purchaseId, receiptNumber, items)
       ▼
[purchases.routes.ts]
       │
       │ Zod validation (receiveGoodsSchema)
       │ RPC invocation: supabase.rpc('confirm_goods_receipt', payload)
       ▼
[PostgreSQL Database Function: confirm_goods_receipt]
       ├── 1. Lock purchases row FOR UPDATE
       ├── 2. INSERT INTO public.goods_receipts RETURNING id
       ├── 3. INSERT INTO public.goods_receipt_items (received quantities)
       ├── 4. UPDATE public.purchase_items (received_quantity += qty)
       ├── 5. UPSERT public.stock_levels (increment physical quantity)
       ├── 6. INSERT INTO public.inventory_movements (PURCHASE_RECEIPT, +qty)
       └── 7. UPDATE public.purchases (status: 'RECEIVED' or 'PARTIALLY_RECEIVED')
       │
       ▼
[HTTP 200 Response: { success: true, data: { receipt_id, receipt_number } }]
       │
       ▼
[Purchases.tsx: Refresh purchase details, update stock badges, display receipt record]
```

---

## 3. Manufacturing Lifecycle Data Flow

```
1. Order Planning:
[Manufacturing.tsx] ──POST /api/manufacturing/orders──> [INSERT INTO production_orders (status='PLANNED')]

2. Material Issue:
[Manufacturing.tsx] ──POST /orders/:id/issue-materials──> [RPC issue_production_materials]
       ├── Lock and deduct raw materials from stock_levels
       ├── INSERT INTO inventory_movements (MFG_CONSUMPTION, -qty)
       ├── INSERT INTO production_material_issues
       └── UPDATE production_orders (status='IN_PROGRESS', total_material_cost += cost)

3. Production Completion:
[Manufacturing.tsx] ──POST /orders/:id/complete──> [RPC complete_production_order]
       ├── Compute total cost (materials + labor) & unit standard cost
       ├── UPSERT finished good into stock_levels (increment quantity)
       ├── INSERT INTO inventory_movements (MFG_OUTPUT, +qty)
       ├── UPDATE products (cost_price = computed unit standard cost)
       └── UPDATE production_orders (status='COMPLETED', completed_quantity, completed_at)
```

---

## 4. Financial Calculations Data Flow

```
[Reports.tsx Load]
       │
       ├── HTTP GET /api/finance/summary
       └── HTTP GET /api/finance/expenses
              │
              ▼
[finance.routes.ts]
       ├── 1. SELECT total_amount, paid_amount, balance_due FROM sales
       │      ──> Revenue = sum(total_amount)
       │      ──> Cash Collected = sum(paid_amount)
       │      ──> Receivables = sum(balance_due)
       │
       ├── 2. SELECT quantity, cost_price FROM sale_items
       │      ──> COGS = sum(quantity * cost_price)
       │      ──> Gross Profit = Revenue - COGS
       │
       ├── 3. SELECT category, amount FROM expenses
       │      ──> Operating Expenses = sum(amount)
       │      ──> Net Profit = Gross Profit - Operating Expenses
       │
       ├── 4. SELECT outstanding_balance FROM suppliers WHERE outstanding_balance > 0
       │      ──> Accounts Payable = sum(outstanding_balance)
       │
       └── 5. SELECT stock_levels.quantity, products.cost_price, products.type
              ──> Inventory Valuation = sum(quantity * cost_price)
              ──> Finished Goods Valuation vs Raw Materials Valuation
              │
              ▼
[HTTP 200 Response: Full P&L, Aging & Inventory Metrics in ETB]
       │
       ▼
[Reports.tsx: Render P&L cards, margin percentages, aging tables, expense ledger]
```
