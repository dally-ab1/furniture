# PROJECT_RULES.md — Business Workflows and Development Safeguards

## 1. Business Scope

This ERP serves one furniture company in Ethiopia.

The company:

- Sells ready-made furniture.
- Purchases raw materials and finished products.
- Manufactures furniture using raw materials.
- Stores goods in a shop and a warehouse.
- Manages customers, suppliers, payments, credit, and expenses.

Currency: ETB.

The system must remain practical for employees who are not technically trained.

## 2. Core Business Workflows

### A. Product Setup

1. Create a product with a unique SKU or business identifier.
2. Select the product type: raw material or finished furniture.
3. Define its unit of measure and relevant attributes.
4. Set the appropriate selling price and costing information.
5. Record opening stock through an authorized opening-stock process, not by silently editing balances.

### B. Purchasing and Receiving

1. Create a purchase record with supplier and line items.
2. Record expected quantities and agreed costs.
3. Record the actual goods received.
4. Increase inventory only for quantities accepted as received.
5. Record supplier payments separately.
6. Track unpaid supplier balances.

Support partial receipts if required by the workflow. Do not assume an entire purchase arrived at once.

### C. Sales and POS

1. Select products and quantities.
2. Validate product availability and permitted prices.
3. Calculate line totals, discounts, and the final amount.
4. Confirm the transaction on the server.
5. Deduct stock exactly once.
6. Record the payment received.
7. Calculate the outstanding balance.
8. Issue an invoice or receipt.
9. Preserve the transaction history.

A credit sale must not be treated as money already collected. A partially paid sale must retain its correct unpaid balance.

### D. Manufacturing

1. Define a bill of materials (BOM) for the furniture product.
2. Create a production order with the required output quantity.
3. Check raw-material availability.
4. Reserve materials if reservation is part of the implemented workflow.
5. Record actual material consumption.
6. Record waste or scrap where applicable.
7. Record labor and other production costs where supported.
8. Confirm actual finished output.
9. Receive completed finished goods into inventory.
10. Calculate and preserve the production cost using the documented costing method.

Do not add finished-goods stock before production completion is confirmed. Do not consume the same raw materials twice.

### E. Payments and Debts

1. Link every payment to the relevant sale, purchase, or other authorized transaction.
2. Support partial payments.
3. Display the original amount, amount paid, and remaining balance.
4. Record payment method and date.
5. Keep refunds and reversals traceable.
6. Do not erase payment history to correct an error.

### F. Returns and Cancellations

1. Check the user's permission.
2. Reference the original transaction.
3. Require a reason.
4. Determine the correct inventory and financial effects.
5. Apply changes atomically.
6. Prevent duplicate returns or reversals.
7. Preserve the original transaction and audit history.

Do not assume every return should automatically restore stock; the actual condition and disposition of returned goods must determine the inventory treatment.

## 3. Employee Permissions

Employees receive only the permissions assigned to them.

Permission checks are required for both frontend actions and backend endpoints. The backend is authoritative.

Sensitive operations include:

- Changing prices or applying restricted discounts.
- Issuing refunds.
- Cancelling finalized transactions.
- Adjusting inventory.
- Viewing confidential profit reports.
- Managing users and permissions.
- Changing security or business settings.

The Super Admin must be able to manage employee access. Never grant all permissions automatically to every employee.

## 4. Financial Accuracy

Keep these concepts separate:

- Sales revenue.
- Cash or other payments received.
- Outstanding customer balances.
- Purchase costs.
- Supplier payments and balances.
- Raw-material inventory cost.
- Finished-goods inventory cost.
- Cost of goods sold.
- Operating expenses.
- Gross profit and net profit.

Reports must use documented formulas and authoritative records. A sale does not automatically mean its full value was collected. A purchase does not automatically mean its full amount was paid.

## 5. Error Handling

When an operation fails:

- Do not show a false success message.
- Do not leave partially updated stock or payment records.
- Display a clear, actionable error.
- Preserve entered data where safe.
- Log technical details on the server without exposing secrets or sensitive internals to users.
- Provide a safe retry path when appropriate.

## 6. Development Safeguards

Before building a feature, establish:

- The business problem it solves.
- The authorized users.
- The expected workflow.
- Required database entities and relationships.
- Failure cases.
- Acceptance criteria.
- Tests needed to verify it.

Do not implement new business rules based on assumptions when they could affect inventory, money, access control, or historical data.

## 7. Required Acceptance Criteria

A feature is not complete merely because its screen exists.

Depending on the feature, verification must demonstrate:

- The workflow works end to end.
- Correct users can perform the action.
- Unauthorized users are rejected by the backend.
- Database changes are correct.
- Failure does not leave inconsistent records.
- Repeated requests do not duplicate financial or inventory effects.
- Relevant tests pass.
- The UI provides correct feedback.
- Documentation reflects the actual implementation.
