import { supabase } from '../config/supabase';

async function checkDetails() {
  const { data: payments } = await supabase.from('payments').select('*');
  console.log('--- ALL PAYMENTS ---');
  console.table(payments);

  const { data: sales } = await supabase.from('sales').select('id, invoice_number, total_amount, paid_amount, balance_due, status, created_at');
  console.log('--- ALL SALES ---');
  console.table(sales);

  const { data: customers } = await supabase.from('customers').select('id, name, outstanding_balance');
  console.log('--- ALL CUSTOMERS ---');
  console.table(customers);

  const { data: suppliers } = await supabase.from('suppliers').select('id, name, outstanding_balance');
  console.log('--- ALL SUPPLIERS ---');
  console.table(suppliers);

  const { data: purchases } = await supabase.from('purchases').select('id, purchase_number, total_amount, paid_amount, balance_due, status');
  console.log('--- ALL PURCHASES ---');
  console.table(purchases);
}

checkDetails().catch(console.error);
