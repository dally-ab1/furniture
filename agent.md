# AGENTS.md — Furniture ERP Development Rules

## 1. Project Identity

Project: Furniture ERP

Purpose: Build a reliable, secure, easy-to-use ERP system for one furniture company in Ethiopia. The company sells finished furniture and manufactures furniture using raw materials.

Business context:

- One company only.
- Initially one shop and one warehouse.
- Currency: Ethiopian Birr (ETB).
- Users include nontechnical business staff.
- The system must support finished-product sales, raw-material inventory, purchasing, manufacturing, payments, customer debts, supplier debts, expenses, and reporting.

## 2. Approved Technology Stack

- Frontend: React, TypeScript, and a compatible Vite setup.
- Backend: Node.js, Express.js, and TypeScript.
- Database: Supabase PostgreSQL.
- Authentication: Supabase Auth.
- File storage: Supabase Storage only when required.
- API communication: typed API client with centralized error handling.
- Validation: shared, explicit schemas where appropriate.
- Testing: use suitable automated tests for the project's chosen tools.

ERN means Express.js, React, and Node.js in this project.

Do not introduce another database, ORM, state-management library, UI framework, or major architectural dependency without inspecting the current project and explaining why the change is necessary. Prefer compatible, well-maintained dependencies and minimal complexity.

## 3. Single-Company Business Model

This application serves one furniture company. It is not a SaaS platform.

Never introduce:

- Multi-tenancy.
- Tenant registration or tenant switching.
- Subscription billing for other companies.
- A platform-owner role.
- A company selector.

A shop and a warehouse are business locations, not tenants.

## 4. User Roles and Authorization

Initially, support exactly these two roles:

### SUPER_ADMIN

The owner of this single furniture company. Has full authorized business access, including user management, permissions, settings, financial reports, inventory controls, and business operations.

### EMPLOYEE

A staff account with explicitly assigned permissions.

Employees must not automatically receive access to:

- Sensitive financial or profit reports.
- User management and security settings.
- Restricted stock adjustments.
- Unauthorized discounts, refunds, cancellations, or transaction reversals.
- Other restricted actions.

Implement authorization on the server. Hiding buttons in the UI is not security.

Use Supabase Auth for authentication and securely link user profiles to the authenticated user ID. Never hardcode default passwords, expose service-role keys in frontend code, or trust role values submitted by clients.

## 5. Mandatory Agent Workflow

Before starting any task:

1. Read this file.
2. Read relevant files in `docs/`, especially `PROJECT_STATE.md`, `FEATURES.md`, `DECISIONS.md`, `UI_UX.md`, and `DB.md`.
3. Inspect the actual repository, relevant source files, package scripts, database migrations, routes, components, and tests.
4. Identify existing behavior and dependencies before changing anything.
5. Write a short implementation plan for work that affects multiple files, business logic, database structure, security, or workflows.
6. Implement the smallest complete change that solves the requested problem.
7. Run the relevant checks and tests.
8. Update project memory and feature status when necessary.
9. Report exactly what changed, what was tested, the results, and what remains unverified.

Do not assume a feature exists because a document describes it. Verify it in the actual code.

Do not claim that something is implemented, secure, functional, or tested unless there is evidence.

## 6. Architecture Rules

- Keep frontend presentation separate from backend business logic.
- Keep API routes, validation, authorization, business services, and database access organized consistently.
- Avoid duplicating business rules across frontend components and API endpoints.
- Use TypeScript types intentionally; avoid `any` unless justified and isolated.
- Centralize API error handling and consistent response formats.
- Keep secrets and server-only logic out of the frontend.
- Avoid oversized components, unnecessary abstractions, and duplicate implementations.
- Follow the existing architecture unless a documented issue requires a change.
- Do not rewrite working parts of the application to solve an unrelated problem.

## 7. Business Integrity Rules

- Every sale, purchase, payment, stock movement, and manufacturing operation must have a traceable record.
- A credit sale is not the same as cash received.
- Partial payments must leave the correct outstanding balance.
- Purchases must not increase available stock until goods are received.
- A sale must deduct inventory exactly once.
- Manufacturing must consume raw materials and add finished goods only when the applicable production completion is confirmed.
- Prevent duplicate submissions and duplicate financial or inventory effects.
- Use database transactions or equivalent atomic operations for workflows that change multiple related records.
- Preserve completed transaction history. Correct mistakes through authorized returns, reversals, or adjustments instead of silently deleting completed transactions.
- Use decimal database types for monetary amounts.
- Define costing and profit formulas explicitly. Do not double-count costs.
- Record who performed important actions and when they occurred.

## 8. Database and Security Rules

- Follow `docs/DB.md` for database conventions.
- Use reviewed, version-controlled database migrations.
- Add appropriate foreign keys, constraints, indexes, and uniqueness rules.
- Validate inputs on the server.
- Enforce authentication and authorization for every protected API operation.
- Apply appropriate Supabase Row Level Security policies wherever applicable.
- Never rely on frontend validation or hidden controls as the sole protection.
- Never commit `.env` files, credentials, tokens, or private keys.
- Do not run destructive migrations or delete business data without explicit approval and a recovery plan.

## 9. UI and UX Rules

Follow `docs/UI_UX.md`.

Build for real furniture-shop employees, not developers. Prefer clear labels, fast workflows, useful defaults, visible validation, readable tables, and practical empty states.

Do not redesign unrelated pages when implementing a feature. Maintain consistent navigation, components, colors, spacing, forms, tables, dialogs, and feedback.

## 10. Change Management

For bug fixes:

- Reproduce or locate the actual cause before editing.
- Fix the underlying problem rather than hiding the symptom.
- Add a regression test when practical.
- Check for unintended effects on related workflows.

For new features:

- Confirm the business workflow, permissions, data model, and acceptance criteria.
- Identify dependencies before implementation.
- Build in small, testable milestones.

For database changes:

- Inspect current schema and existing data assumptions first.
- Create a migration instead of making undocumented manual changes.
- Consider backward compatibility and data preservation.
- Explain any required migration or setup steps.

For unclear or risky requirements:

- Ask a focused question when a missing decision could materially affect correctness, security, money, or data integrity.
- Otherwise, choose a simple reversible default and document it.

## 11. Project Memory

Maintain these documents as the project evolves:

- `docs/PROJECT_STATE.md`: actual architecture, implemented behavior, known bugs, setup status, current milestone, and next task.
- `docs/FEATURES.md`: feature list, acceptance criteria, dependencies, and verification status.
- `docs/DECISIONS.md`: confirmed technical and business decisions, reasons, and dates.
- `docs/DB.md`: actual schema conventions, relationships, migrations, and data integrity rules.
- `docs/UI_UX.md`: design system and interaction rules.
- `docs/PROJECT_RULES.md`: business workflows and development safeguards.

Do not replace verified facts with assumptions. Update existing documents rather than creating conflicting copies.

Use these feature status values:

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `IMPLEMENTED`
- `VERIFIED`

`IMPLEMENTED` means code has been written. `VERIFIED` means the relevant checks have actually passed. Never mark a feature `VERIFIED` based on inspection alone when testing is required.

## 12. Completion Report

At the end of every development task, report:

1. What was changed.
2. Files created or modified.
3. Database migrations or configuration changes required.
4. Tests and commands actually run, with results.
5. Known limitations or unverified behavior.
6. The next recommended task, if applicable.

Be accurate, concise, and evidence-based. Never fabricate test output or claim deployment success without verification.
