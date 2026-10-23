# DB.md — Furniture ERP Database Rules

## 1. Database Authority

Supabase PostgreSQL is the authoritative database for business data.

Supabase Auth manages user identity and authentication. Business profiles and permissions belong in appropriately related database tables.

Do not introduce a second database or store authoritative business transactions in browser storage, local JSON files, or frontend state.

Inspect the actual schema and migrations before making database changes. This document defines rules; it does not claim that any tables have already been created.

## 2. General Schema Conventions

- Use descriptive, consistent table and column names.
- Prefer `snake_case` for database identifiers.
- Use UUID primary keys for application entities unless a documented reason requires another strategy.
- Use foreign keys for relationships.
- Add `NOT NULL`, `CHECK`, and `UNIQUE` constraints where appropriate.
- Index foreign keys and frequently queried fields where beneficial.
- Add timestamps such as `created_at` and `updated_at` where appropriate.
- Record the responsible authenticated user for important operations when appropriate.
- Define deletion and retention behavior explicitly.
- Use migrations for schema changes.
- Avoid unexplained duplicate columns or redundant sources of truth.

## 3. Company and Locations

This system is for one company only.

Do not add tenant IDs, tenant tables, tenant switching, or SaaS subscription structures.

Represent the shop and warehouse as locations in the company's inventory model. Design the location structure so additional business locations can be added later without introducing multi-tenancy.

Do not create a company selector.

## 4. Authentication and Authorization Data

Use Supabase Auth as the identity provider.

- Link each application profile to the appropriate Supabase Auth user ID.
- Enforce uniqueness for the Auth identity link.
- Keep role and permission assignments in a controlled database model.
- Validate permissions on the server for every protected operation.
- Protect sensitive profile and permission changes.
- Never accept an arbitrary user ID or role from the client as proof of authorization.
- Never expose the Supabase service-role key to the browser.

Initially, support `SUPER_ADMIN` and `EMPLOYEE`.

Employee permissions must be explicit and checked server-side. Define how permission assignments are stored before implementing user management.

## 5. Core Data Domains

Plan the schema around these domains:

### Products

- Products and SKUs.
- Product categories.
- Product type: raw material or finished furniture.
- Product attributes such as dimensions, color, material, and unit of measure.
- Pricing and costing information.
- Active or inactive status.

Do not assume every product has the same attributes or unit of measure.

### Inventory

- Locations.
- Current stock balances where useful.
- Inventory movements.
- Stock receipts, sales issues, production consumption, production output, returns, and authorized adjustments.
- References to the originating transaction.
- Movement quantity, unit, timestamp, and responsible user.

Use an auditable movement ledger as the basis for inventory history. If stock balances are stored separately for fast reads, define how they remain consistent with movements.

### Customers and Suppliers

- Contact details.
- Active or inactive status.
- Transaction history through relational references.
- Outstanding balances derived from authoritative transactions or a rigorously maintained ledger.

Avoid manually editable balances that can drift from the underlying transactions.

### Purchases

- Purchase documents and line items.
- Supplier references.
- Expected quantities and costs.
- Goods receipts.
- Supplier payments and outstanding amounts.

A purchase record alone must not increase available stock. Stock changes when goods are actually received and recorded.

### Sales and Payments

- Sales documents and line items.
- Customer or walk-in customer references.
- Price, quantity, discount, and totals.
- Payment records, payment method, and payment amount.
- Partial payments and outstanding balances.
- Returns, cancellations, and reversals.
- Invoice or receipt identifiers.

Represent financial transactions accurately. A sale on credit is not cash received. Do not overwrite the original payment history to represent a refund.

### Manufacturing

- Bills of materials (BOMs).
- BOM versions or a documented way to preserve the material requirements used by a production order.
- Production orders and output quantities.
- Material consumption records.
- Finished-goods output receipts.
- Waste or scrap records when applicable.
- Labor and other production costs where required.
- Production status and responsible users.

Preserve the BOM and cost assumptions associated with a production order so historical production costs remain explainable after a BOM changes.

### Finance

- Expense records.
- Payment records and references.
- Customer and supplier receivables/payables.
- Costing data needed for inventory valuation and profit reporting.

Avoid introducing a full accounting ledger unless the business requirements and reporting rules are defined. Document the scope of financial reporting.

## 6. Money, Quantities, and Currency

- Store monetary amounts using PostgreSQL `NUMERIC`/`DECIMAL`, not floating-point types.
- Use ETB as the initial business currency.
- Define precision and rounding rules consistently.
- Use appropriate numeric precision for material quantities and fractional units.
- Store unit of measure explicitly where necessary.
- Validate that quantities, prices, and payment amounts meet business rules.
- Do not calculate financial totals from rounded display strings.
- Document how discounts, taxes if applicable, costs, and rounding affect totals.

## 7. Transaction Integrity

Any operation that changes multiple related records must be atomic.

Examples:

- Finalizing a sale and issuing stock.
- Recording a goods receipt and increasing stock.
- Posting a production material issue.
- Completing production and receiving finished goods.
- Recording a payment and updating the authoritative balance.
- Posting a return and its inventory or financial effects.

Use PostgreSQL transactions and appropriate server-side functions or service logic. Do not implement critical multi-step financial operations as unrelated browser requests that can leave partially updated records.

Prevent duplicate effects from retries and repeated button clicks. Use unique transaction references, idempotency controls, or other appropriate safeguards.

Use row locking or equivalent concurrency controls when simultaneous transactions could oversell stock or consume the same materials twice.

## 8. Stock Rules

- Stock must have a clear location.
- Stock movements must be traceable to their source.
- Sale stock deductions occur exactly once.
- Purchase stock additions occur upon goods receipt.
- Production consumption reduces raw-material stock.
- Confirmed production output increases finished-goods stock.
- Authorized adjustments require a reason and audit information.
- Returns must reference the original transaction where possible.
- Transfers between locations must reduce stock at the source and increase stock at the destination atomically.
- Define whether negative stock is prohibited; default to preventing it unless the owner explicitly approves a documented exception.

Do not permit arbitrary direct edits to stock balances without an auditable adjustment process.

## 9. Payment and Balance Rules

- A sale's total, paid amount, and remaining balance must be distinguishable.
- Partial payments must be supported without changing the original sale total.
- Payment records must identify the transaction, amount, method, and date.
- Reject invalid negative amounts except where a specifically designed reversal model requires them.
- Prevent duplicate payment postings.
- Refunds and reversals must be traceable.
- Define how customer balances and supplier balances are calculated.
- Do not treat a payment promise or credit sale as a completed cash receipt.

## 10. Costing and Profit

Before implementing profit reports, document the chosen costing method and its assumptions.

The method must be appropriate for raw materials and finished furniture. Do not mix purchase cost, production cost, selling price, and cash collected.

Define:

- How raw-material inventory is valued.
- How production costs are allocated to finished goods.
- How waste, returns, and cost adjustments affect inventory.
- How cost of goods sold is calculated.
- How gross profit is calculated.
- Which expenses are included in net profit.
- How historical costs are preserved.

Do not count the same material cost twice when materials are consumed in production and the finished product is later sold.

If required data is incomplete, label a figure as estimated or unavailable rather than inventing precision.

## 11. Data Integrity and Auditability

- Use unique constraints for business identifiers where appropriate.
- Use foreign keys to prevent orphaned records.
- Add checks for valid amounts and quantities.
- Preserve finalized transaction history.
- Use explicit status transitions.
- Record who performed sensitive operations.
- Store cancellation, adjustment, and reversal reasons where applicable.
- Use soft deletion for appropriate master records if history must be preserved.
- Do not soft-delete or hard-delete posted financial and stock transactions as a substitute for reversal.

## 12. Row Level Security and API Access

Design Supabase Row Level Security (RLS) policies deliberately.

- Deny access by default where applicable.
- Allow users only the access their role and permissions require.
- Protect sensitive tables and operations.
- Test policies for both authorized and unauthorized users.
- Do not assume an Express backend automatically makes permissive RLS safe.
- Never use the service-role key in the frontend.
- If the server uses privileged database access, perform explicit server-side authorization and validate the authenticated actor before every operation.

## 13. Migration Rules

For every schema change:

1. Inspect existing tables, constraints, policies, and migrations.
2. Create a new migration file.
3. Make the migration safe for existing data.
4. Include backfill or transformation logic when necessary.
5. Consider rollback and recovery implications.
6. Test against a development database.
7. Update this document if the actual schema conventions change.
8. Report whether the migration was applied or only prepared.

Never claim a migration was applied when it was merely written.

## 14. Database Verification Checklist

Before marking a database-related feature verified, check:

- Relationships and foreign keys.
- Constraints and indexes.
- Correct transaction boundaries.
- Duplicate-submission behavior.
- Concurrent stock and payment behavior where relevant.
- Authorization and RLS policies.
- Migration execution.
- Data preservation.
- Relevant integration tests.
- Correct results for successful and failed operations.
