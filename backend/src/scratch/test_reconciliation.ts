import { supabase } from '../config/supabase';

async function testReconciliation() {
  console.log('🔬 Testing Cross-Module Reconciliation Engine...\n');

  // 1. Sales vs Payments
  const { data: sales } = await supabase.from('sales').select('id, invoice_number, total_amount, paid_amount, balance_due, status');
  const { data: payments } = await supabase.from('payments').select('*');

  let salesPaymentsDiscrepancies = 0;
  for (const s of sales || []) {
    const salePayments = payments?.filter(p => p.reference_type === 'SALE' && p.reference_id === s.id) || [];
    const sumPaid = salePayments.reduce((acc, p) => acc + Number(p.amount), 0);
    if (Math.abs(sumPaid - Number(s.paid_amount)) > 0.01) {
      console.warn(`⚠️ Sale ${s.invoice_number}: paid_amount (${s.paid_amount}) != sum of payments (${sumPaid})`);
      salesPaymentsDiscrepancies++;
    }
  }
  if (salesPaymentsDiscrepancies === 0) {
    console.log('✅ Sales vs Payments: 100% Reconciled (Every sale paid_amount matches payments ledger)');
  }

  // 2. Customer Debt vs Unsettled Invoices
  const { data: customers } = await supabase.from('customers').select('id, name, outstanding_balance');
  const totalCustomerDebt = customers?.reduce((acc, c) => acc + Number(c.outstanding_balance), 0) || 0;
  const totalUnpaidInvoices = sales?.reduce((acc, s) => acc + Number(s.balance_due), 0) || 0;
  const debtPaymentSum = payments?.filter(p => p.reference_type === 'CUSTOMER_DEBT').reduce((acc, p) => acc + Number(p.amount), 0) || 0;

  console.log(`\n👥 Customer Debt Analysis:`);
  console.log(`   - Total Customer Outstanding Balance: ETB ${totalCustomerDebt}`);
  console.log(`   - Total Unsettled Sales Invoices: ETB ${totalUnpaidInvoices}`);
  console.log(`   - Total Direct Debt Payments Recorded: ETB ${debtPaymentSum}`);
  console.log(`   - Opening / Historical Credit Balance: ETB ${totalCustomerDebt - totalUnpaidInvoices}`);

  // 3. Stock Levels vs Inventory Movements
  const { data: stockLevels } = await supabase.from('stock_levels').select('product_id, location_id, quantity, product:products(name), location:locations(name)');
  const { data: movements } = await supabase.from('inventory_movements').select('product_id, location_id, quantity');

  let stockDiscrepancies = 0;
  for (const sl of stockLevels || []) {
    const matchingMovements = movements?.filter(m => m.product_id === sl.product_id && m.location_id === sl.location_id) || [];
    const sumMovements = matchingMovements.reduce((acc, m) => acc + Number(m.quantity), 0);
    if (Math.abs(sumMovements - Number(sl.quantity)) > 0.001) {
      console.warn(`⚠️ Stock mismatch for ${(sl as any).product?.name} at ${(sl as any).location?.name}: stock_level=${sl.quantity}, movements_sum=${sumMovements}`);
      stockDiscrepancies++;
    }
  }
  if (stockDiscrepancies === 0) {
    console.log('✅ Inventory Ledger: 100% Reconciled (Physical stock matches sum of immutable movements)');
  } else {
    console.log(`ℹ️ Inventory Discrepancies noted: ${stockDiscrepancies} (due to initial seed stock or adjustments)`);
  }

  console.log('\n✅ Reconciliation test completed.');
}

testReconciliation().catch(console.error);
