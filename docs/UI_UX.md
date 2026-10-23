# UI_UX.md — FurniERP Design System & Pixel-Perfect UI Specifications

## 1. Design Objective

Create a modern, minimal, professional furniture ERP for a furniture business in Ethiopia that nontechnical employees can use comfortably with minimal training.

The interface is inspired by the structured clarity of **Notion** and the operational efficiency of enterprise ERPs, featuring a distinctive **Forest Green & Warm Off-White** palette.

### Key UX Principles:
- **Fast Daily Operations:** High keyboard accessibility, shortcut support (`Ctrl + K` global search), fast item barcode/SKU scanning, and swift POS checkout.
- **Clear Information Density:** Compact, readable tables without unnecessary padding or nested scrollbars.
- **Honest Data Presentation:** Zero fake metrics, zero placeholder statistics. If transactions do not exist, show clean, purposeful empty states.
- **Desktop-First, Tablet & Mobile Ready:** Designed for desktop POS terminals and warehouse workstations, gracefully adapting to tablets for shop-floor audits.
- **Accessibility:** High-contrast text, clear focus rings, and explicit text labels alongside all status icons and colors.

---

## 2. Brand Identity & Color Palette

### Core Color Palette:
| Token Name | Hex Code | Purpose |
| :--- | :--- | :--- |
| **Sidebar Deep Charcoal/Pine** | `#162B1E` / `#1A3325` | Main navigation sidebar background |
| **Forest Green (Primary Brand)** | `#276749` | Primary action buttons, active navigation item, primary highlights |
| **Warm Off-White (Canvas)** | `#F7F7F2` | Application main workspace background |
| **Deep Charcoal (Primary Text)** | `#202820` | Headings, card titles, primary body text, values |
| **Surface White** | `#FFFFFF` | Card backgrounds, top navbar, modals, form inputs, table surfaces |
| **Muted Sage** | `#E4EDE5` | Secondary action buttons, light active tabs, subtle backgrounds |
| **Secondary Text** | `#69736B` | Labels, timestamps, table headers, breadcrumbs, helper text |
| **Border & Divider** | `#E3E7E1` | Card outlines, table borders, input field borders, separators |

### Semantic & Status Colors:
| State | Background Tint | Text / Icon Color | Usage |
| :--- | :--- | :--- | :--- |
| **Paid / Completed** | `#EAF3EC` | `#276749` | Fully settled invoices, completed production orders |
| **Partial Payment** | `#FEF3C7` | `#92400E` | Invoices with partial payments made |
| **Credit / Outstanding** | `#EFF6FF` | `#1D4ED8` | Credit sales with full balance pending |
| **In Progress** | `#E0F2FE` | `#0369A1` | Active manufacturing orders, ongoing operations |
| **Planned** | `#F3F4F6` | `#4B5563` | Scheduled production orders not yet started |
| **Low Stock / Alert** | `#FEE2E2` | `#DC2626` | Quantities at or below minimum threshold, errors |
| **Warning / Attention** | `#FFF7ED` | `#C2410C` | Approaching deadlines, supplier balance due |

### KPI Card Accent Tokens:
- **Today's Sales:** Icon background `#EAF3EC`, icon color `#276749`
- **Payments Received:** Icon background `#EBF2FA`, icon color `#2563EB`
- **Estimated Gross Profit:** Icon background `#F3E8FF`, icon color `#9333EA`
- **Customer Outstanding:** Icon background `#FFF4ED`, icon color `#EA580C`
- **Supplier Outstanding:** Icon background `#FEE2E2`, icon color `#DC2626`

---

## 3. Pixel-Perfect Mockup Layout Specifications

The dashboard layout corresponds strictly to the verified FurniERP production interface:

```
+-----------------------------------------------------------------------------------------------------+
| [Logo FurniERP]  | [Q Search products, customers... Ctrl+K]                 (Bell) (SA Super Admin v)|
+------------------+----------------------------------------------------------------------------------+
| (H) Dashboard    | Good morning,                                        [Apr 27, 2025] [Main Shop v]|
| ($) Sales & POS  | Welcome back, Super Admin!                           (Today)       (Shop & Wh)   |
| [] Products/Inv  | Here's what's happening with your business today.                                |
| (F) Purchases    +----------------------------------------------------------------------------------+
| {*} Manufacturing| [Sales]        [Payments]     [Gross Profit]  [Cust. Debt]    [Supp. Debt]       |
| (U) Customers    | ETB 48,750.00  ETB 32,400.00  ETB 18,320.00   ETB 27,600.00   ETB 42,300.00      |
| (T) Suppliers    | +12% vs yest   +18% vs yest   +10% vs yest    +5% vs l.wk     +8% vs l.wk        |
| (L) Finance      +----------------------------------------------------------------------------------+
| (O) Users        | [Sales Overview]            | [Recent Sales]            | [Low Stock Alerts]     |
| (S) Settings     | Last 7 days Bar Chart       | INV-00124 Walk-in Paid    | Oak Wood Plank 5 m2    |
|                  | Apr 21 - Apr 27             | INV-00123 Abebe   Paid    | Chair Leg      8 pcs   |
|                  | Forest Green Bars           | INV-00122 Mekdes  Partial | Screw 4x50     12 pcs  |
|                  +-----------------------------+---------------------------+------------------------+
|                  | [Production Orders]         | [Quick Actions Grid]      | [Recent Activity]      |
|                  | PRD-0008 Dining Table [===] | [Sale]   [Product]        | Sale completed         |
|                  | PRD-0007 Office Chair [== ] | [Purch]  [Production]     | Stock adjustment       |
| "Build better    | PRD-0006 Wardrobe     [   ] | [Expense][Reports]        | Purchase received      |
|  furniture..."   | PRD-0005 Bookshelf    [====]|                           | Production completed   |
+------------------+----------------------------------------------------------------------------------+
```

### Component Breakdown:

### A. Sidebar Navigation (`#162B1E` / `#1A3325` background)
- **Width:** 260px desktop, collapsed icon rail on tablet, flyout drawer on mobile.
- **Header:**
  - FurniERP Logo mark: Rounded square container with custom chair/shield outline.
  - Title: **FurniERP** (18px, bold, white).
  - Subtitle: **Furniture Business ERP** (11px, text `#A3B899`).
- **Menu Items:**
  1. `Dashboard` (Home icon) — Active item highlighted with rounded pill `#234A34` and white text.
  2. `Sales & POS` (Shopping cart icon)
  3. `Products & Inventory` (3D box package icon)
  4. `Purchases` (Document invoice icon)
  5. `Manufacturing` (Gear/cogs icon)
  6. `Customers` (User outline icon)
  7. `Suppliers` (Truck delivery icon)
  8. `Finance & Reports` (Analytics trending chart icon)
  9. `User Management` (Users group icon — Super Admin only)
  10. `Settings` (Settings slider icon)
- **Footer Tagline:**
  - Subtle leaf/seedling icon with *"Build better furniture for a brighter future."* (11px, `#6F8B77`).

### B. Top Navbar (`#FFFFFF` background, `#E3E7E1` bottom border)
- **Height:** 64px.
- **Global Search Bar:**
  - Input with magnifying glass icon and placeholder: `"Search products, customers, suppliers..."`.
  - Right-aligned keyboard shortcut pill: `Ctrl + K` (border `#E3E7E1`, bg `#F7F7F2`, font-mono 11px).
  - Responsive max-width: 440px.
- **Right Action Items:**
  - Notification Bell button with subtle unread red dot at top right.
  - Super Admin Avatar: Circle (`#202820` bg) with white initials `"SA"`.
  - User Details: Two lines: `"Super Admin"` (14px, weight 600) and `"Owner"` (11px, weight 400, `#69736B`).
  - Dropdown chevron icon.

### C. Workspace Header
- **Greeting:** `"Good morning,"` (14px, `#69736B`).
- **Main Heading:** `"Welcome back, Super Admin!"` (24px, weight 700, `#202820`).
- **Subtext:** `"Here's what's happening with your business today."` (14px, `#69736B`).
- **Header Badges (Top-Right):**
  - **Date Selector:** Calendar icon, `"Apr 27, 2025"`, subtext `"(Today)"`, subtle border, white bg.
  - **Location Selector:** Map pin icon, `"Main Shop"`, subtext `"Shop & Warehouse"`, chevron down.

### D. KPI Summary Cards (5-Column Row)
- Cards are styled with `#FFFFFF` background, border `#E3E7E1`, border-radius 12px, padding 18px.
1. **Today's Sales:** `ETB 48,750.00` | Trend: `+12% vs. yesterday` (Green trending up).
2. **Payments Received:** `ETB 32,400.00` | Trend: `+18% vs. yesterday` (Green trending up).
3. **Estimated Gross Profit:** `ETB 18,320.00` | Trend: `+10% vs. yesterday` (Green trending up).
4. **Customer Outstanding:** `ETB 27,600.00` | Trend: `+5% vs. last week` (Red indicator for growing debt).
5. **Supplier Outstanding:** `ETB 42,300.00` | Trend: `+8% vs. last week` (Red indicator for growing payable).

### E. Middle Row Cards
1. **Sales Overview (Bar Chart Panel, ~38% width):**
   - Header with chart icon, title `"Sales Overview"`, and period filter dropdown (`"Last 7 days"`).
   - Clean bar chart: Days Apr 21 through Apr 27.
   - Y-Axis increments: 0, 20K, 40K, 60K, 80K.
   - Bar styling: Forest Green (`#276749`) with rounded top caps.
2. **Recent Sales (Data Table Panel, ~36% width):**
   - Header with shopping cart icon, title `"Recent Sales"`, and blue `"View all"` action link.
   - Columns: `Invoice #`, `Customer`, `Amount`, `Status`, `Time`.
   - Badges: `Paid` (green), `Partial` (amber), `Credit` (blue/neutral).
   - Real formatted currency: `ETB 5,250.00`, `ETB 12,800.00`, etc.
3. **Low Stock Alerts (Alert Table Panel, ~26% width):**
   - Header with warning triangle icon, title `"Low Stock Alerts"`, and `"View all"` link.
   - Columns: `Product`, `Current Stock`, `Min. Stock`.
   - Stock entries display category thumbnails and urgent red quantities (e.g., `5 m²`, `8 pcs`, `12 pcs`).

### F. Bottom Row Cards
1. **Production Orders (Manufacturing Panel, ~45% width):**
   - Header with gear icon, title `"Production Orders"`, and `"View all"` link.
   - Columns: `Order #`, `Product`, `Progress`, `Status`, `Due Date`.
   - Progress bar: Thin horizontal bar with Forest Green fill (`#276749`).
   - Statuses: `In Progress` (blue badge), `Planned` (gray badge), `Completed` (green badge).
2. **Quick Actions (Action Grid Panel, ~25% width):**
   - Header with lightning bolt icon, title `"Quick Actions"`.
   - 2x3 Grid of square action cards with centered icons and clean text:
     - `New Sale` (Shopping cart icon)
     - `Add Product` (Cube / box icon)
     - `Create Purchase` (Document invoice icon)
     - `New Production` (Gear icon)
     - `Add Expense` (Wallet icon)
     - `View Reports` (Analytics chart icon)
3. **Recent Activity (Timeline Stream Panel, ~30% width):**
   - Header with clock icon, title `"Recent Activity"`, and `"View all"` link.
   - Timeline items with colored circle icons:
     - Green Cart: `"New sale completed"` — `INV-00124 • ETB 5,250.00` (10:42 AM)
     - Orange Clipboard: `"Stock adjustment"` — `Raw Material - Timber • -10 pcs` (09:30 AM)
     - Blue Truck: `"Purchase received"` — `SUP-0005 • ETB 18,000.00` (Yesterday)
     - Purple Cog: `"Production completed"` — `PRD-0007 • 20 pcs` (Yesterday)
     - Green Card: `"Payment received"` — `Customer: Mekdes Tadesse • ETB 8,600.00` (Yesterday)

---

## 4. Typography Standards

- **Primary Font Family:** Inter, Outfit, or system-ui sans-serif (`font-sans`).
- **Numerical / Monetary Display:** Tabular numbers (`font-variant-numeric: tabular-nums`) so figures align precisely in tables.
- **Hierarchy:**
  - Page Title: 24px - 26px / font-bold / `#202820`
  - Section / Card Title: 16px - 18px / font-semibold / `#202820`
  - Body Text: 14px / font-normal / `#202820`
  - Secondary / Meta Text: 12px - 13px / font-normal / `#69736B`
  - Badges & Micro-copy: 11px - 12px / font-medium

---

## 5. Currency & Number Formatting Rules

- All monetary figures must be displayed with the currency code: `ETB 1,250.00`.
- Quantities must include the explicit unit of measure (e.g., `5 m²`, `8 pcs`, `12 kg`, `3 L`).
- Zero numbers in empty states should display as `ETB 0.00`, never blank or `undefined`.
