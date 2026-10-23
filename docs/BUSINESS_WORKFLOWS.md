# BUSINESS_WORKFLOWS.md — FurniERP Business Workflow & Architecture Diagrams

This document illustrates the actual end-to-end data flows and component interactions implemented in FurniERP.

---

## 1. Purchase and Goods Receipt Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Purchaser as Warehouse Staff
    participant UI as Purchases.tsx
    participant API as purchases.routes.ts
    participant DB as PostgreSQL (Supabase)
    participant RPC as confirm_goods_receipt()

    Note over Purchaser,DB: Stage 1: Purchase Order Creation (No Stock Change)
    Purchaser->>UI: Select Supplier, Location, Line Items
    UI->>API: POST /api/purchases
    API->>DB: INSERT INTO purchases (status = 'ORDERED')
    API->>DB: INSERT INTO purchase_items
    API->>DB: UPDATE suppliers (outstanding_balance += total_amount)
    API-->>UI: Return Created Purchase Order

    Note over Purchaser,DB: Stage 2: Physical Intake (Atomic Stock Increment)
    Purchaser->>UI: Enter Received Quantities
    UI->>API: POST /api/purchases/receive
    API->>RPC: CALL confirm_goods_receipt(p_purchase_id, p_items)
    RPC->>DB: Lock purchases FOR UPDATE
    RPC->>DB: INSERT INTO goods_receipts & goods_receipt_items
    RPC->>DB: UPDATE purchase_items (received_quantity += qty)
    RPC->>DB: UPSERT stock_levels (quantity += qty)
    RPC->>DB: INSERT INTO inventory_movements (type = 'PURCHASE_RECEIPT', +qty)
    RPC->>DB: UPDATE purchases (status = 'RECEIVED' or 'PARTIALLY_RECEIVED')
    RPC-->>API: Return Receipt Confirmation
    API-->>UI: 200 OK (Inventory Updated Live)
```

---

## 2. POS Sale and Payment Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Cashier as Cashier / Sales Staff
    participant UI as Sales.tsx (POS)
    participant API as sales.routes.ts
    participant RPC as execute_sale_checkout()
    participant DB as PostgreSQL (Supabase)

    Cashier->>UI: Select Location & Add Products to Cart
    UI->>UI: Check Local Stock Availability
    Cashier->>UI: Choose Customer & Enter Paid Amount (Cash/Telebirr)
    Cashier->>UI: Click Complete Sale
    UI->>API: POST /api/sales/checkout
    API->>RPC: CALL execute_sale_checkout(...)
    RPC->>DB: Lock stock_levels FOR UPDATE
    alt Insufficient Stock
        RPC-->>API: RAISE EXCEPTION (Rollback Transaction)
        API-->>UI: 400 Bad Request (Stock Error)
    else Stock Available
        RPC->>DB: INSERT INTO sales (status = PAID / PARTIAL / CREDIT)
        RPC->>DB: INSERT INTO sale_items (with unit_price & cost_price)
        RPC->>DB: UPDATE stock_levels (quantity -= item_qty)
        RPC->>DB: INSERT INTO inventory_movements (type = 'SALE_DEDUCTION', -qty)
        opt Paid Amount > 0
            RPC->>DB: INSERT INTO payments (amount, payment_method)
        end
        opt Balance Due > 0
            RPC->>DB: UPDATE customers (outstanding_balance += balance_due)
        end
        RPC-->>API: Return Sale ID & Invoice Number
        API-->>UI: 200 OK (Checkout Complete)
        UI->>UI: Open Printable Thermal Receipt Modal
    end
```

---

## 3. Inventory Movement and Stock Balances

```mermaid
graph TD
    subgraph Transactions["Business Operations"]
        PO_RCV["Goods Receipt (confirm_goods_receipt)"]
        POS["POS Sale (execute_sale_checkout)"]
        MFG_IN["Material Issue (issue_production_materials)"]
        MFG_OUT["Finished Goods (complete_production_order)"]
        MAN_ADJ["Stock Adjustment (record_stock_adjustment)"]
    end

    subgraph Ledger["Immutable Movement Ledger"]
        MOV[("inventory_movements\n(type, delta_qty, reference_id)")]
    end

    subgraph Balances["Physical Stock State"]
        STOCK[("stock_levels\n(product_id, location_id, quantity)")]
    end

    PO_RCV -->|"+ Delta Quantity"| MOV
    PO_RCV -->|"+ Increment Stock"| STOCK

    POS -->|"- Delta Quantity"| MOV
    POS -->|"- Decrement Stock"| STOCK

    MFG_IN -->|"- Raw Material Delta"| MOV
    MFG_IN -->|"- Decrement Raw Stock"| STOCK

    MFG_OUT -->|"+ Finished Good Delta"| MOV
    MFG_OUT -->|"+ Increment Finished Stock"| STOCK

    MAN_ADJ -->|"+/- Adjustment Delta"| MOV
    MAN_ADJ -->|"Set Absolute Balance"| STOCK
```

---

## 4. Manufacturing and Production Costing Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Manager as Production Manager
    participant UI as Manufacturing.tsx
    participant API as manufacturing.routes.ts
    participant DB as PostgreSQL (Supabase)

    Manager->>UI: Create Production Order (BOM, Target Qty, Location)
    UI->>API: POST /api/manufacturing/orders
    API->>DB: INSERT INTO production_orders (status = 'PLANNED')
    Note over Manager,DB: No stock changes at order creation

    Manager->>UI: Issue Raw Materials from Warehouse
    UI->>API: POST /orders/:id/issue-materials
    API->>DB: CALL issue_production_materials()
    DB->>DB: Deduct Raw Materials from stock_levels
    DB->>DB: INSERT INTO inventory_movements (type = 'MFG_CONSUMPTION', -qty)
    DB->>DB: Accumulate total_material_cost on production_orders
    DB->>DB: UPDATE production_orders (status = 'IN_PROGRESS')

    Manager->>UI: Complete Production (Enter Output Qty, Waste, Labor Cost)
    UI->>API: POST /orders/:id/complete
    API->>DB: CALL complete_production_order()
    DB->>DB: Compute Total Cost = Material Cost + Labor Cost
    DB->>DB: Compute Unit Cost = Total Cost / Output Quantity
    DB->>DB: Add Finished Furniture to stock_levels
    DB->>DB: INSERT INTO inventory_movements (type = 'MFG_OUTPUT', +qty)
    DB->>DB: UPDATE products (cost_price = computed unit_cost)
    DB->>DB: UPDATE production_orders (status = 'COMPLETED')
    API-->>UI: 200 OK (Finished Furniture Ready for Sale)
```

---

## 5. Customer and Supplier Debt Settlement Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Cashier as Cashier / Accountant
    participant UI as Customers.tsx / Suppliers.tsx
    participant API as customers.routes.ts / purchases.routes.ts
    participant DB as PostgreSQL (Supabase)

    Note over Cashier,DB: Customer Debt Collection
    Cashier->>UI: Enter Payment Amount & Method (Telebirr/Cash)
    UI->>API: POST /api/customers/:id/payments
    API->>DB: CALL record_customer_payment()
    DB->>DB: Lock customer row FOR UPDATE
    DB->>DB: UPDATE customers (outstanding_balance -= amount)
    opt Linked to Specific Sale
        DB->>DB: UPDATE sales (paid_amount += amount, balance_due -= amount)
    end
    DB->>DB: INSERT INTO payments (reference_type = 'CUSTOMER_DEBT', amount)
    DB->>DB: INSERT INTO audit_logs (action = 'CUSTOMER_PAYMENT')
    API-->>UI: 200 OK (Updated Customer Balance)

    Note over Cashier,DB: Supplier Debt Settlement
    Cashier->>UI: Enter Supplier Payment Details
    UI->>API: POST /api/purchases/suppliers/:id/payments
    API->>DB: CALL record_supplier_payment()
    DB->>DB: Lock supplier row FOR UPDATE
    DB->>DB: UPDATE suppliers (outstanding_balance -= amount)
    opt Linked to Specific Purchase
        DB->>DB: UPDATE purchases (paid_amount += amount, balance_due -= amount)
    end
    DB->>DB: INSERT INTO payments (reference_type = 'SUPPLIER_DEBT', amount)
    DB->>DB: INSERT INTO audit_logs (action = 'SUPPLIER_PAYMENT')
    API-->>UI: 200 OK (Updated Supplier Balance)
```

---

## 6. Dashboard vs Financial Reports Data Source Reality

```mermaid
graph TD
    subgraph LiveTables["Authoritative PostgreSQL Tables"]
        SALES[sales]
        SALE_ITEMS[sale_items]
        EXPENSES[expenses]
        STOCK[stock_levels]
        PRODS[products]
        CUST[customers]
        SUPP[suppliers]
    end

    subgraph FinanceReport["Reports.tsx & finance.routes.ts (100% REAL DATA)"]
        REV["Total Revenue: sum(sales.total_amount)"]
        COGS["COGS: sum(sale_items.qty * cost_price)"]
        GP["Gross Profit: Revenue - COGS"]
        EXP["Operating Expenses: sum(expenses.amount)"]
        NP["Net Profit: Gross Profit - Expenses"]
        VAL["Inventory Valuation: sum(stock.qty * prods.cost_price)"]
        AR["Receivables: sum(customers.outstanding_balance)"]
        AP["Payables: sum(suppliers.outstanding_balance)"]
    end

    subgraph Dashboard["Dashboard.tsx & dashboard.routes.ts (MOCKED / FALLBACK)"]
        D_SUM["KPI Cards: Real query BUT falls back to demo numbers if 0"]
        D_CHART["Sales Trend Chart: 100% HARDCODED MOCK ARRAY"]
        D_LOW["Low Stock Alerts: 100% HARDCODED MOCK ARRAY"]
        D_MFG["Production Widget: 100% HARDCODED MOCK ARRAY"]
        D_ACT["Recent Activity: 100% HARDCODED MOCK ARRAY"]
    end

    SALES --> REV
    SALE_ITEMS --> COGS
    REV & COGS --> GP
    EXPENSES --> EXP
    GP & EXP --> NP
    STOCK & PRODS --> VAL
    CUST --> AR
    SUPP --> AP

    SALES -.->|Fallback to 48,750 ETB| D_SUM
    CUST -.->|Fallback to 27,600 ETB| D_SUM
    SUPP -.->|Fallback to 42,300 ETB| D_SUM
```

---

## 7. Authentication & Authorization Enforcement Reality

```mermaid
graph TD
    subgraph Client["Frontend Client (Port 5173)"]
        LOGIN["LoginPage.tsx (Supabase Auth signIn)"]
        DASH_FETCH["Dashboard.tsx (uses authFetch with Bearer token)"]
        OTHER_PAGES["Sales.tsx, Inventory.tsx, Purchases.tsx, etc. (uses raw fetch NO Bearer token)"]
    end

    subgraph ServerAuth["Express Backend (Port 5000)"]
        MIDDLEWARE["backend/src/middleware/auth.ts (authenticateToken, requireSuperAdmin)"]
        ROUTES["backend/src/routes/*.ts (dashboard, sales, products, finance, etc.)"]
    end

    subgraph Database["Supabase PostgreSQL 17"]
        AUTH_USERS["auth.users (Password, Tokens)"]
        PROFILES["public.user_profiles (Role: SUPER_ADMIN / EMPLOYEE)"]
        RLS["Row Level Security Policies"]
    end

    LOGIN -->|Credentials| AUTH_USERS
    AUTH_USERS -->|JWT Session| LOGIN

    DASH_FETCH -->|Headers: Bearer JWT| ROUTES
    OTHER_PAGES -->|Headers: NONE| ROUTES

    MIDDLEWARE -.->|DEFINED BUT NEVER MOUNTED| ROUTES

    ROUTES -->|Direct Service Query / Anon Key| Database
```
