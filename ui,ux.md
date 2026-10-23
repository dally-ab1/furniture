# UI_UX.md — Furniture ERP Design System

## 1. Design Objective

Create a modern, minimal, professional furniture ERP that nontechnical employees can use with little training.

The interface should feel organized and calm, inspired by the clarity of Notion and the efficiency of well-designed business software.

Prioritize:

- Fast daily operations.
- Readable information.
- Consistent page layouts.
- Compact but comfortable spacing.
- Clear actions and feedback.
- Desktop-first workflows with responsive tablet and mobile layouts.
- Accessibility and keyboard usability.

Do not prioritize decorative effects over usability.

## 2. Brand Colors

Use this palette consistently:

- Forest Green: `#276749` — primary actions and selected states.
- Warm Off-White: `#F7F7F2` — application background.
- Deep Charcoal: `#202820` — primary text and dark navigation elements when appropriate.
- White: `#FFFFFF` — cards, forms, tables, and modal surfaces.
- Muted Sage: `#E4EDE5` — subtle selected backgrounds and secondary highlights.
- Secondary Text: `#69736B` — supporting information.
- Borders: `#E3E7E1` — dividers, outlines, and table boundaries.

Use semantic colors sparingly:

- Green for success or completed states.
- Amber for warnings or pending actions.
- Red for errors, destructive actions, and critical alerts.
- Blue only when useful for neutral informational states.

Never use color alone to communicate a status; include text or an icon as well.

Do not introduce new brand colors without a clear reason and a documented decision.

## 3. Layout

Use a consistent application shell:

- Sidebar for primary navigation.
- Header for page title, relevant context, and account actions.
- Main content area for the current workflow.
- Breadcrumbs where they improve orientation.
- Consistent content width and alignment.
- Responsive navigation for smaller screens.

Recommended main navigation:

1. Dashboard
2. Sales & POS
3. Products & Inventory
4. Purchases
5. Manufacturing
6. Customers
7. Suppliers
8. Finance & Reports
9. User Management — Super Admin only
10. Settings — according to permission

Do not show every navigation item to every employee. Render navigation according to the user's authorized permissions, but always enforce the same permissions on the backend.

## 4. Typography and Spacing

- Use a clean, readable sans-serif font.
- Establish a consistent hierarchy for page titles, section headings, field labels, body text, and helper text.
- Use comfortable line heights and sufficient contrast.
- Use consistent spacing tokens rather than arbitrary margins.
- Keep tables information-dense without making text difficult to read.
- Avoid excessively large headings, oversized padding, and unnecessary empty space.

## 5. Components

Create reusable components for:

- Buttons and icon buttons.
- Form fields and validation messages.
- Search inputs and filters.
- Tables and pagination.
- Status labels.
- Summary metrics.
- Dialogs and confirmation dialogs.
- Dropdowns and date selection.
- Empty states and loading states.
- Toasts or inline feedback.
- Permission-aware actions.
- Currency and quantity formatting.

Reuse existing components before creating new ones. Do not duplicate an existing component just to make a small visual change.

## 6. Forms and Data Entry

- Use clear labels; never depend on placeholders alone.
- Mark required fields.
- Validate input and explain errors in plain language.
- Preserve entered values when a recoverable request fails.
- Set sensible defaults where safe.
- Use appropriate numeric input for quantities and prices.
- Format currency as ETB consistently.
- Ask for confirmation before irreversible or high-impact actions.
- Prevent accidental double submission while a request is processing.
- Show a clear success or failure message after saving.
- Do not clear a form before a save operation has succeeded.

## 7. Tables and Inventory Screens

Inventory and financial screens must support practical daily work.

Where appropriate, provide:

- Search.
- Filters.
- Sorting.
- Pagination or an appropriate large-list strategy.
- Useful column headings.
- Clearly formatted quantities and monetary amounts.
- Stock status and transaction status.
- Row actions based on permissions.
- A clear empty state.
- Loading and error states.

Keep frequently needed information visible. Avoid forcing users to open multiple pages to find basic product details.

Do not display fake statistics, placeholder records, or hardcoded success messages as if they were real business data.

## 8. POS and Transaction Workflows

The sales interface should optimize speed and accuracy.

- Make product search easy to find.
- Show product names, prices, and stock availability clearly.
- Make cart quantities and line totals easy to edit.
- Show subtotal, authorized discounts, final total, amount paid, and remaining balance separately.
- Support the payment methods enabled by the business.
- Clearly distinguish paid, partially paid, and credit sales.
- Require appropriate permission for discounts, cancellations, and refunds.
- Show a review step for important transactions.
- Prevent duplicate checkout submissions.
- Provide a printable, readable invoice or receipt after a successful transaction.

Never indicate that a sale or payment succeeded before the server confirms it.

## 9. Manufacturing and Stock States

Make production progress understandable using explicit labels such as:

- Draft
- Planned
- In Progress
- Completed
- Cancelled

Only use states that exist in the implemented business workflow.

Display required materials, available quantities, expected output, recorded consumption, and completion status clearly. Warn users when materials are insufficient. Do not silently allow invalid stock consumption.

## 10. Feedback and Accessibility

Every data-driven screen must handle:

- Loading.
- Empty data.
- Validation errors.
- API errors.
- Successful actions.
- Permission-denied responses.
- Offline or network failure where applicable.

Use visible keyboard focus, semantic controls, readable contrast, and labels for interactive elements. Do not rely on hover alone to expose critical actions.

## 11. Visual Restrictions

Avoid:

- Excessive gradients.
- Glassmorphism-heavy layouts.
- Large decorative illustrations on operational screens.
- Excessive rounded cards.
- Unnecessary animation.
- Inconsistent icons.
- Random colors.
- Dense forms with unclear grouping.
- Unrelated page redesigns.
- Fake charts or invented metrics.

Use subtle borders, restrained shadows, consistent corner radii, and modest transitions.

## 12. Responsive Behavior

Desktop is the primary environment for shop and warehouse operations, but screens must remain usable on tablets and mobile devices.

- Avoid horizontal overflow except where a data table reasonably requires it.
- Use a responsive sidebar or compact navigation on small screens.
- Keep important actions reachable.
- Stack form fields when needed.
- Do not hide essential transaction information on small screens.

## 13. UI Acceptance Checklist

Before marking a UI task verified, check:

- The page matches the existing design system.
- The layout works at relevant screen sizes.
- Loading, empty, error, and success states are handled.
- Forms have clear validation.
- Interactive controls work.
- Permission-restricted actions are handled correctly.
- Real backend data is used where required.
- No unrelated screens were changed.
- Relevant automated tests and available build checks pass.
