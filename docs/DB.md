# DB.md — Furniture ERP Database Architecture & Schema Conventions

## 1. Database Authority & Principles

Supabase PostgreSQL is the authoritative system of record for all business data.

- **Supabase Auth (`auth.users`)** manages identity and authentication credentials.
- Application user profiles, roles, and granular employee permissions are stored in dedicated PostgreSQL tables linked by foreign key to `auth.users.id`.
- **Zero Browser Authority:** Authoritative calculations, balances, stock movements, and authorization checks are executed on the server and in the database.
- **Single-Company Isolation:** There are no tenant IDs (`tenant_id`), tenant tables, or multi-tenant switches. The schema represents ONE company.
- **Location Structure:** `locations` table initially supports `Main Shop` and `Central Warehouse`. Additional storage or showroom locations can be added without architectural disruption.

---

## 2. Data Types & Precision Standards

| Purpose | PostgreSQL Type | Rules & Examples |
| :--- | :--- | :--- |
| **Primary Keys** | `UUID` | Default: `gen_random_uuid()` |
| **Monetary Amounts** | `NUMERIC(14, 2)` | Used for all prices, costs, totals, payments, and balances in ETB. Floating point (`FLOAT`/`REAL`) is strictly forbidden. |
| **Material & Product Quantities** | `NUMERIC(12, 4)` | Supports discrete counts (`pcs`) and continuous fractional measurements (`m²`, `kg`, `liters`, `m`). |
| **Percentages / Rates** | `NUMERIC(5, 2)` | Discounts, scrap percentages (e.g. `15.50` for 15.5%). |
| **Timestamps** | `TIMESTAMPTZ` | All timestamps stored in UTC with timezone (`now()`). |
| **JSON Data** | `JSONB` | Used only for flexible attributes (e.g., product specs) and audit diffs. Critical relational data must be in dedicated columns. |

---

## 3. Core Relational Domains & Proposed Tables

```
                    +--------------------+
                    |     auth.users     |
                    +---------+----------+
                              | 1:1
                    +---------v----------+
                    |    user_profiles   |
                    +---------+----------+
                              | 1:M
                    +---------v----------+
                    |employee_permissions|
                    +--------------------+

  +------------------+       +-------------------+       +--------------------+
  |    categories    +------>|     products      +------>|      locations     |
  +------------------+       +---------+---------+       +---------+----------+
                                       |                           |
                +----------------------+---------------------------+
                |                      |                           |
       +--------v---------+   +--------v---------+       +---------v----------+
       |   inventory_     |   |       boms       |       |  inventory_items   |
       |    movements     |   +--------+---------+       |  (current balances)|
       +------------------+            |                 +--------------------+
                                       |
                              +--------v---------+
                              |production_orders |
                              +------------------+
                                       |
                      +----------------+----------------+
                      |                                 |
             +--------v--------+               +--------v---------+
             |material_issues  |               |production_outputs|
             +-----------------+               +------------------+

  +------------------+        +-------------------+       +--------------------+
  |    customers     |        |     suppliers     |       |      expenses      |
  +--------+---------+        +---------+---------+       +--------------------+
           |                            |
  +--------v---------+        +---------v---------+
  |      sales       |        |     purchases     |
  +--------+---------+        +---------+---------+
           |                            |
  +--------+---------+        +---------+---------+
  |                  |        |                   |
+-v--------+  +------v---+  +-v--------+   +------v---+
|sale_items|  | payments |  |purch_item|   |goods_rcpt|
+----------+  +----------+  +----------+   +----------+
```

### Domain A: Users & Security
1. **`user_profiles`**
   - `id`: `UUID` (PK, references `auth.users(id)` ON DELETE CASCADE).
   - `full_name`: `TEXT NOT NULL`.
   - `role`: `TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'EMPLOYEE'))`.
   - `phone`: `TEXT`.
   - `is_active`: `BOOLEAN NOT NULL DEFAULT true`.
   - `created_at`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

2. **`employee_permissions`**
   - `id`: `UUID` (PK).
   - `user_id`: `UUID` (FK `user_profiles(id)` ON DELETE CASCADE).
   - `permission_key`: `TEXT NOT NULL` (e.g., `pos.create_sale`, `inventory.adjust`, `manufacturing.manage`, `reports.view`).
   - `granted_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
   - `granted_by`: `UUID` (FK `user_profiles(id)`).
   - UNIQUE constraint on `(user_id, permission_key)`.

### Domain B: Master Inventory & Locations
3. **`locations`**
   - `id`: `UUID` (PK).
   - `name`: `TEXT NOT NULL UNIQUE` (e.g., `'Main Shop'`, `'Central Warehouse'`).
   - `type`: `TEXT NOT NULL CHECK (type IN ('SHOP', 'WAREHOUSE', 'FACTORY'))`.
   - `is_active`: `BOOLEAN NOT NULL DEFAULT true`.

4. **`categories`**
   - `id`: `UUID` (PK).
   - `name`: `TEXT NOT NULL UNIQUE`.
   - `description`: `TEXT`.

5. **`products`**
   - `id`: `UUID` (PK).
   - `sku`: `TEXT NOT NULL UNIQUE`.
   - `name`: `TEXT NOT NULL`.
   - `category_id`: `UUID` (FK `categories(id)`).
   - `type`: `TEXT NOT NULL CHECK (type IN ('RAW_MATERIAL', 'FINISHED_GOOD', 'SEMI_FINISHED'))`.
   - `unit_of_measure`: `TEXT NOT NULL` (e.g., `'pcs'`, `'m²'`, `'kg'`, `'L'`, `'m'`).
   - `selling_price`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (selling_price >= 0)`.
   - `cost_price`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0)`.
   - `min_stock_level`: `NUMERIC(12, 4) NOT NULL DEFAULT 0.00`.
   - `attributes`: `JSONB DEFAULT '{}'::jsonb` (color, dimensions, wood type, finish).
   - `image_url`: `TEXT`.
   - `is_active`: `BOOLEAN NOT NULL DEFAULT true`.
   - `created_at`, `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

6. **`inventory_movements` (Immutable Ledger)**
   - `id`: `UUID` (PK).
   - `product_id`: `UUID` (FK `products(id)`).
   - `location_id`: `UUID` (FK `locations(id)`).
   - `movement_type`: `TEXT NOT NULL CHECK (movement_type IN ('PURCHASE_RECEIPT', 'SALE_DEDUCTION', 'MFG_CONSUMPTION', 'MFG_OUTPUT', 'STOCK_ADJUSTMENT', 'LOCATION_TRANSFER'))`.
   - `quantity`: `NUMERIC(12, 4) NOT NULL` (positive for intake, negative for deduction).
   - `reference_id`: `UUID` (links to `sale_id`, `goods_receipt_id`, `production_order_id`, etc.).
   - `notes`: `TEXT`.
   - `created_by`: `UUID` (FK `user_profiles(id)`).
   - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

7. **`stock_levels` (Denormalized current balance cache)**
   - `product_id`: `UUID` (FK `products(id)`).
   - `location_id`: `UUID` (FK `locations(id)`).
   - `quantity`: `NUMERIC(12, 4) NOT NULL DEFAULT 0.00 CHECK (quantity >= 0)`.
   - `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.
   - Primary key on `(product_id, location_id)`.

### Domain C: Customers, Suppliers & Debts
8. **`customers`**
   - `id`: `UUID` (PK).
   - `name`: `TEXT NOT NULL`.
   - `phone`: `TEXT`.
   - `email`: `TEXT`.
   - `address`: `TEXT`.
   - `outstanding_balance`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`.
   - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

9. **`suppliers`**
   - `id`: `UUID` (PK).
   - `name`: `TEXT NOT NULL`.
   - `contact_person`: `TEXT`.
   - `phone`: `TEXT NOT NULL`.
   - `address`: `TEXT`.
   - `outstanding_balance`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`.
   - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

### Domain D: Sales & POS
10. **`sales`**
    - `id`: `UUID` (PK).
    - `invoice_number`: `TEXT NOT NULL UNIQUE` (e.g. `'INV-00124'`).
    - `customer_id`: `UUID` (FK `customers(id)` NULL for walk-in).
    - `location_id`: `UUID` (FK `locations(id)`).
    - `subtotal`: `NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0)`.
    - `discount_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0)`.
    - `total_amount`: `NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0)`.
    - `paid_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0)`.
    - `balance_due`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0)`.
    - `status`: `TEXT NOT NULL CHECK (status IN ('PAID', 'PARTIAL', 'CREDIT', 'CANCELLED'))`.
    - `created_by`: `UUID` (FK `user_profiles(id)`).
    - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

11. **`sale_items`**
    - `id`: `UUID` (PK).
    - `sale_id`: `UUID` (FK `sales(id)` ON DELETE RESTRICT).
    - `product_id`: `UUID` (FK `products(id)`).
    - `quantity`: `NUMERIC(12, 4) NOT NULL CHECK (quantity > 0)`.
    - `unit_price`: `NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0)`.
    - `cost_price`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00` (snapshot of cost for accurate profit calculation).
    - `total_price`: `NUMERIC(14, 2) NOT NULL CHECK (total_price >= 0)`.

12. **`payments`**
    - `id`: `UUID` (PK).
    - `reference_type`: `TEXT NOT NULL CHECK (reference_type IN ('SALE', 'PURCHASE', 'CUSTOMER_DEBT', 'SUPPLIER_DEBT'))`.
    - `reference_id`: `UUID NOT NULL`.
    - `amount`: `NUMERIC(14, 2) NOT NULL CHECK (amount > 0)`.
    - `payment_method`: `TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'TELEBIRR', 'CBE_BIRR'))`.
    - `transaction_reference`: `TEXT`.
    - `notes`: `TEXT`.
    - `received_by`: `UUID` (FK `user_profiles(id)`).
    - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

### Domain E: Purchases & Goods Receipts
13. **`purchases`**
    - `id`: `UUID` (PK).
    - `purchase_number`: `TEXT NOT NULL UNIQUE` (e.g. `'PO-00045'`).
    - `supplier_id`: `UUID` (FK `suppliers(id)`).
    - `status`: `TEXT NOT NULL CHECK (status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'))`.
    - `total_cost`: `NUMERIC(14, 2) NOT NULL CHECK (total_cost >= 0)`.
    - `paid_amount`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`.
    - `balance_due`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`.
    - `created_by`: `UUID` (FK `user_profiles(id)`).
    - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

14. **`purchase_items`**
    - `id`: `UUID` (PK).
    - `purchase_id`: `UUID` (FK `purchases(id)`).
    - `product_id`: `UUID` (FK `products(id)`).
    - `ordered_quantity`: `NUMERIC(12, 4) NOT NULL CHECK (ordered_quantity > 0)`.
    - `received_quantity`: `NUMERIC(12, 4) NOT NULL DEFAULT 0.00`.
    - `unit_cost`: `NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0)`.
    - `total_cost`: `NUMERIC(14, 2) NOT NULL CHECK (total_cost >= 0)`.

15. **`goods_receipts`**
    - `id`: `UUID` (PK).
    - `receipt_number`: `TEXT NOT NULL UNIQUE` (e.g. `'GRN-00018'`).
    - `purchase_id`: `UUID` (FK `purchases(id)`).
    - `location_id`: `UUID` (FK `locations(id)`).
    - `received_by`: `UUID` (FK `user_profiles(id)`).
    - `received_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

### Domain F: Manufacturing (BOM & Production)
16. **`boms` (Bills of Materials)**
    - `id`: `UUID` (PK).
    - `product_id`: `UUID` (FK `products(id)` — finished furniture).
    - `name`: `TEXT NOT NULL`.
    - `version`: `INTEGER NOT NULL DEFAULT 1`.
    - `is_active`: `BOOLEAN NOT NULL DEFAULT true`.
    - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

17. **`bom_items`**
    - `id`: `UUID` (PK).
    - `bom_id`: `UUID` (FK `boms(id)` ON DELETE CASCADE).
    - `raw_material_id`: `UUID` (FK `products(id)`).
    - `quantity`: `NUMERIC(12, 4) NOT NULL CHECK (quantity > 0)`.
    - `waste_tolerance_pct`: `NUMERIC(5, 2) NOT NULL DEFAULT 0.00`.

18. **`production_orders`**
    - `id`: `UUID` (PK).
    - `order_number`: `TEXT NOT NULL UNIQUE` (e.g. `'PRD-0008'`).
    - `product_id`: `UUID` (FK `products(id)`).
    - `bom_id`: `UUID` (FK `boms(id)`).
    - `location_id`: `UUID` (FK `locations(id)`).
    - `target_quantity`: `NUMERIC(12, 4) NOT NULL CHECK (target_quantity > 0)`.
    - `completed_quantity`: `NUMERIC(12, 4) NOT NULL DEFAULT 0.00`.
    - `waste_quantity`: `NUMERIC(12, 4) NOT NULL DEFAULT 0.00`.
    - `status`: `TEXT NOT NULL CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))`.
    - `progress_pct`: `NUMERIC(5, 2) NOT NULL DEFAULT 0.00`.
    - `due_date`: `DATE`.
    - `total_material_cost`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`.
    - `labor_cost`: `NUMERIC(14, 2) NOT NULL DEFAULT 0.00`.
    - `created_by`: `UUID` (FK `user_profiles(id)`).
    - `created_at`, `completed_at`: `TIMESTAMPTZ`.

### Domain G: Expenses & Audit
19. **`expenses`**
    - `id`: `UUID` (PK).
    - `category`: `TEXT NOT NULL` (e.g., `'Rent'`, `'Utilities'`, `'Workshop Supplies'`, `'Transport'`).
    - `amount`: `NUMERIC(14, 2) NOT NULL CHECK (amount > 0)`.
    - `payment_method`: `TEXT NOT NULL`.
    - `expense_date`: `DATE NOT NULL DEFAULT CURRENT_DATE`.
    - `description`: `TEXT`.
    - `receipt_url`: `TEXT`.
    - `recorded_by`: `UUID` (FK `user_profiles(id)`).
    - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

20. **`audit_logs`**
    - `id`: `UUID` (PK).
    - `user_id`: `UUID` (FK `user_profiles(id)`).
    - `action`: `TEXT NOT NULL` (e.g., `'SALE_VOID'`, `'STOCK_OVERRIDE'`, `'USER_ROLE_CHANGE'`).
    - `entity`: `TEXT NOT NULL`.
    - `entity_id`: `UUID NOT NULL`.
    - `payload`: `JSONB`.
    - `ip_address`: `TEXT`.
    - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`.

---

## 4. Transaction Boundaries & Atomic Operations

Multi-table workflows MUST be executed inside PostgreSQL transactions or database RPC functions to guarantee ACID integrity:

1. **`execute_sale_checkout(p_sale_json)`**:
   - Inserts `sales` header.
   - Inserts `sale_items`.
   - Locks `stock_levels` rows (`FOR UPDATE`).
   - Verifies sufficient stock; rejects if inventory would drop below 0.
   - Decrements `stock_levels`.
   - Inserts `inventory_movements` (negative quantity).
   - If paid amount > 0, inserts `payments`.
   - If balance_due > 0, increments `customers.outstanding_balance`.

2. **`confirm_goods_receipt(p_receipt_json)`**:
   - Inserts `goods_receipts` header.
   - Inserts receipt line items.
   - Increments `stock_levels`.
   - Inserts `inventory_movements` (positive quantity).
   - Updates `purchases` received quantities and status.
   - Adjusts `suppliers.outstanding_balance` if payables are recognized upon receipt.

3. **`complete_production_order(p_order_id, p_completed_qty, p_waste_qty)`**:
   - Validates order state (`IN_PROGRESS`).
   - Increments finished goods `stock_levels`.
   - Inserts `inventory_movements` for finished goods.
   - Marks order status as `COMPLETED`.
   - Updates product cost price based on final accumulated production costs.

---

## 5. Security & Row Level Security (RLS)

- Enable RLS on every table in the public schema:
  ```sql
  ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
  -- and all other business tables
  ```
- **Service Role Key:** Strictly used by the Express backend API. Frontend client NEVER receives the service role key.
- **Express Authorization Middleware:** The authoritative guardian verifying authenticated JWTs, user active status, and explicit permissions before dispatching queries.

---

## 6. Applied Migration History

| Version | Migration Name | Applied At | Status | Summary |
| :--- | :--- | :--- | :---: | :--- |
| `20261015062941` | `initial_schema` | 2026-10-15 | **APPLIED & VERIFIED** | 23 core business tables, foreign keys, indexes, checks, and initial seed data (locations, company settings). |
| `20261015063052` | `business_logic_rpcs` | 2026-10-15 | **APPLIED & VERIFIED** | RLS policies and stored procedures (`execute_sale_checkout`, `confirm_goods_receipt`, `record_stock_adjustment`). |

All migrations are tracked locally in `supabase/migrations/` and TypeScript type definitions are synced in `supabase/types/database.types.ts`.
