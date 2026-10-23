import { supabase } from '../config/supabase';

async function auditData() {
  console.log('🔍 Auditing FurniERP Database for Finance Integrity...\n');

  // 1. Sales & Payments
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('id, invoice_number, total_amount, paid_amount, balance_due, status, created_at');
  if (sErr) console.error('Sales query error:', sErr);

  console.log(`📊 Total Sales count: ${sales?.length || 0}`);
  const totalSalesRevenue = sales?.reduce((s, x) => s + Number(x.total_amount || 0), 0) || 0;
  const totalSalesPaid = sales?.reduce((s, x) => s + Number(x.paid_amount || 0), 0) || 0;
  const totalSalesBalance = sales?.reduce((s, x) => s + Number(x.balance_due || 0), 0) || 0;
  console.log(`   - Total Revenue: ETB ${totalSalesRevenue}`);
  console.log(`   - Sum of paid_amount in sales: ETB ${totalSalesPaid}`);
  console.log(`   - Sum of balance_due in sales: ETB ${totalSalesBalance}`);

  // 2. Payments table
  const { data: payments, error: pErr } = await supabase
    .from('payments')
    .select('id, reference_type, reference_id, amount, payment_method, created_at');
  if (pErr) console.error('Payments query error:', pErr);

  const totalPaymentsTable = payments?.reduce((s, x) => s + Number(x.amount || 0), 0) || 0;
  console.log(`\n💳 Total Payments count: ${payments?.length || 0}`);
  console.log(`   - Sum of payments table: ETB ${totalPaymentsTable}`);
  console.log(`   - Discrepancy (Payments Table - Sales.paid_amount): ETB ${totalPaymentsTable - totalSalesPaid}`);

  // 3. Customers vs Sales Balance Due
  const { data: customers } = await supabase.from('customers').select('id, name, outstanding_balance');
  const totalCustomerBalance = customers?.reduce((s, c) => s + Number(c.outstanding_balance || 0), 0) || 0;
  console.log(`\n👥 Customers count: ${customers?.length || 0}`);
  console.log(`   - Sum of customer outstanding_balance: ETB ${totalCustomerBalance}`);
  console.log(`   - Discrepancy (Customer Balance - Sales.balance_due): ETB ${totalCustomerBalance - totalSalesBalance}`);

  // 4. Suppliers vs Purchases Balance Due
  const { data: suppliers } = await supabase.from('suppliers').select('id, name, outstanding_balance');
  const totalSupplierBalance = suppliers?.reduce((s, x) => s + Number(x.outstanding_balance || 0), 0) || 0;
  const { data: purchases } = await supabase.from('purchases').select('id, purchase_number, total_amount, paid_amount, balance_due, status');
  const totalPurchasesBalance = purchases?.reduce((s, x) => s + Number(x.balance_due || 0), 0) || 0;
  console.log(`\n🚚 Suppliers count: ${suppliers?.length || 0}`);
  console.log(`   - Sum of supplier outstanding_balance: ETB ${totalSupplierBalance}`);
  console.log(`   - Sum of purchases balance_due: ETB ${totalPurchasesBalance}`);

  // 5. Inventory Valuation vs Movements
  const { data: stockLevels } = await supabase.from('stock_levels').select('quantity, product_id, location_id, product:products(name, type, cost_price)');
  const totalStockValuation = stockLevels?.reduce((sum, sl: any) => sum + (Number(sl.quantity) * Number(sl.product?.cost_price || 0)), 0) || 0;
  console.log(`\n📦 Stock Levels count: ${stockLevels?.length || 0}`);
  console.log(`   - Total Stock Valuation: ETB ${totalStockValuation}`);

  // 6. Expenses
  const { data: expenses } = await supabase.from('expenses').select('id, category, amount, payment_method, expense_date');
  const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
  console.log(`\n🧾 Expenses count: ${expenses?.length || 0}`);
  console.log(`   - Total Expenses: ETB ${totalExpenses}`);

  // 7. Manufacturing & Costs
  const { data: mfgOrders } = await supabase.from('production_orders').select('id, order_number, status, total_material_cost, labor_cost, completed_quantity');
  console.log(`\n🏭 Production Orders count: ${mfgOrders?.length || 0}`);
  mfgOrders?.forEach(o => {
    console.log(`   - ${o.order_number} (${o.status}): Materials ETB ${o.total_material_cost}, Labor ETB ${o.labor_cost}, Completed: ${o.completed_quantity}`);
  });

  console.log('\n✅ Audit completed.');
}

auditData().catch(console.error);
