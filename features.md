# FEATURES.md — Feature Tracker

## Status Definitions

- `NOT_STARTED`: No implementation work has begun.
- `IN_PROGRESS`: Work is underway.
- `BLOCKED`: Work cannot continue without resolving a dependency or decision.
- `IMPLEMENTED`: Code exists, but verification is incomplete.
- `VERIFIED`: Relevant acceptance criteria and tests have passed.

## Milestones

### M1 — Foundation

- [ ] Project structure and development setup
- [ ] Supabase configuration and initial migrations
- [ ] Secure Super Admin bootstrap
- [ ] Employee accounts and permissions
- [ ] Shared UI design system
- [ ] Authentication and protected routes

### M2 — Products and Inventory

- [ ] Product categories and product types
- [ ] SKU and product attributes
- [ ] Shop and warehouse locations
- [ ] Inventory movement history
- [ ] Opening stock and authorized adjustments
- [ ] Stock availability and low-stock alerts

### M3 — Customers, Suppliers and Purchases

- [ ] Customer records
- [ ] Supplier records
- [ ] Purchase documents and line items
- [ ] Goods receiving
- [ ] Supplier payments and balances

### M4 — Sales and POS

- [ ] Product search and cart
- [ ] Checkout and stock deduction
- [ ] Cash, bank, and mobile payment methods as confirmed by the business
- [ ] Partial and credit payments
- [ ] Invoices and receipts
- [ ] Sales history
- [ ] Returns and cancellations

### M5 — Manufacturing

- [ ] Bills of materials
- [ ] Production orders
- [ ] Material availability checks
- [ ] Material consumption
- [ ] Production completion and finished-goods receipt
- [ ] Waste and scrap tracking
- [ ] Production costing

### M6 — Finance and Reports

- [ ] Expense management
- [ ] Sales and purchase reports
- [ ] Customer and supplier balances
- [ ] Inventory valuation
- [ ] Production cost reports
- [ ] Gross profit and net profit with documented formulas

### M7 — Reliability and Release

- [ ] Role and permission testing
- [ ] Transaction integrity tests
- [ ] Duplicate-submission and concurrency tests
- [ ] Database migration verification
- [ ] Responsive UI checks
- [ ] Backup and recovery procedure
- [ ] Production deployment checklist

## Feature Record Template

For every feature, record:

- Name
- Status
- Business purpose
- Acceptance criteria
- Dependencies
- Files or migrations involved
- Tests executed and results
- Known limitations

Do not mark a feature VERIFIED without recorded evidence that its relevant acceptance criteria passed.
