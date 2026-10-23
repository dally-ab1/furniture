import { supabase } from '../config/supabase';

const API_BASE = 'http://localhost:5000/api';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function verifyFinanceIntegrity() {
  console.log('🏛️ Starting Comprehensive FurniERP Finance Verification Suite...\n');

  // --- TEST 1: Database Ground Truth Verification ---
  console.log('--- 1. Testing Database Ground Truth Against Formulas ---');

  // Query raw database records
  const { data: rawSales } = await supabase.from('sales').select('*').neq('status', 'CANCELLED');
  const { data: rawSaleItems } = await supabase.from('sale_items').select('quantity, cost_price, sale:sales!inner(status)').neq('sale.status', 'CANCELLED');
  const { data: rawExpenses } = await supabase.from('expenses').select('*');
  const { data: rawPaymentsIn } = await supabase.from('payments').select('*').in('reference_type', ['SALE', 'CUSTOMER_DEBT']);
  const { data: rawCustomers } = await supabase.from('customers').select('*').gt('outstanding_balance', 0);
  const { data: rawSuppliers } = await supabase.from('suppliers').select('*').gt('outstanding_balance', 0);
  const { data: rawStock } = await supabase.from('stock_levels').select('quantity, product:products(cost_price, type)');

  const expectedRevenue = rawSales?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;
  const expectedCogs = rawSaleItems?.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.cost_price || 0)), 0) || 0;
  const expectedGrossProfit = expectedRevenue - expectedCogs;
  const expectedExpenses = rawExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const expectedNetProfit = expectedGrossProfit - expectedExpenses;
  const expectedCashCollected = rawPaymentsIn?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const expectedAR = rawCustomers?.reduce((sum, c) => sum + Number(c.outstanding_balance), 0) || 0;
  const expectedAP = rawSuppliers?.reduce((sum, s) => sum + Number(s.outstanding_balance), 0) || 0;
  const expectedStockVal = rawStock?.reduce((sum, sl: any) => sum + (Number(sl.quantity) * Number(sl.product?.cost_price || 0)), 0) || 0;

  console.log(`Ground truth computed:`);
  console.log(`   - Revenue: ETB ${expectedRevenue}`);
  console.log(`   - COGS: ETB ${expectedCogs}`);
  console.log(`   - Gross Profit: ETB ${expectedGrossProfit}`);
  console.log(`   - Expenses: ETB ${expectedExpenses}`);
  console.log(`   - Net Profit: ETB ${expectedNetProfit}`);
  console.log(`   - Cash Collected: ETB ${expectedCashCollected}`);
  console.log(`   - Accounts Receivable: ETB ${expectedAR}`);
  console.log(`   - Accounts Payable: ETB ${expectedAP}`);
  console.log(`   - Inventory Valuation: ETB ${expectedStockVal}`);

  // Fetch from Finance Summary API
  const sumRes = await fetch(`${API_BASE}/finance/summary`);
  assert(sumRes.status === 200, 'GET /api/finance/summary returns 200 OK');
  const sumJson = await sumRes.json();
  const apiData = sumJson.data;

  assert(apiData.currency === 'ETB', 'Summary currency is strictly ETB');
  assert(apiData.pnl.totalRevenue === expectedRevenue, `Revenue matches ground truth (${expectedRevenue} ETB)`);
  assert(apiData.pnl.totalCogs === expectedCogs, `COGS matches ground truth (${expectedCogs} ETB)`);
  assert(apiData.pnl.grossProfit === expectedGrossProfit, `Gross profit matches formula (${expectedGrossProfit} ETB)`);
  assert(apiData.pnl.totalExpenses === expectedExpenses, `Operating expenses match ground truth (${expectedExpenses} ETB)`);
  assert(apiData.pnl.netProfit === expectedNetProfit, `Net profit matches formula (${expectedNetProfit} ETB)`);
  assert(apiData.workingCapital.totalCashCollected === expectedCashCollected, `Cash collected matches payments ledger (${expectedCashCollected} ETB)`);
  assert(apiData.workingCapital.totalAccountsReceivable === expectedAR, `Accounts receivable matches customers ledger (${expectedAR} ETB)`);
  assert(apiData.workingCapital.totalAccountsPayable === expectedAP, `Accounts payable matches suppliers ledger (${expectedAP} ETB)`);
  assert(apiData.inventoryValuation.totalInventoryValue === expectedStockVal, `Inventory valuation matches standard costs (${expectedStockVal} ETB)`);

  // --- TEST 2: Date Filtering & Genuine Zeros ---
  console.log('\n--- 2. Testing Date Range Filtering & Genuine Zeros ---');

  // Query future date range with no transactions
  const futureRes = await fetch(`${API_BASE}/finance/summary?startDate=2030-01-01&endDate=2030-01-31`);
  const futureJson = await futureRes.json();
  const futureData = futureJson.data;

  assert(futureData.pnl.totalRevenue === 0, 'Genuine zero remains 0 for future period revenue');
  assert(futureData.pnl.totalCogs === 0, 'Genuine zero remains 0 for future period COGS');
  assert(futureData.pnl.grossProfit === 0, 'Genuine zero remains 0 for future period gross profit');
  assert(futureData.pnl.totalExpenses === 0, 'Genuine zero remains 0 for future period expenses');
  assert(futureData.pnl.netProfit === 0, 'Genuine zero remains 0 for future period net profit');
  assert(futureData.workingCapital.totalCashCollected === 0, 'Genuine zero remains 0 for future cash collected');

  // --- TEST 3: Cross-Module Alignment with Dashboard ---
  console.log('\n--- 3. Testing Finance and Dashboard Cross-Module Alignment ---');

  const dashRes = await fetch(`${API_BASE}/dashboard/summary`);
  assert(dashRes.status === 200, 'GET /api/dashboard/summary returns 200 OK');
  const dashJson = await dashRes.json();
  const dashData = dashJson.data;

  assert(dashData.customerOutstanding === apiData.workingCapital.totalAccountsReceivable, 
    `Dashboard debtor balance (${dashData.customerOutstanding}) agrees with Finance AR (${apiData.workingCapital.totalAccountsReceivable})`);
  assert(dashData.supplierOutstanding === apiData.workingCapital.totalAccountsPayable, 
    `Dashboard creditor balance (${dashData.supplierOutstanding}) agrees with Finance AP (${apiData.workingCapital.totalAccountsPayable})`);
  assert(typeof dashData.todaySales === 'number', 'Dashboard today sales is a real number (no fake string)');
  assert(typeof dashData.paymentsReceived === 'number', 'Dashboard payments received is a real number');

  // --- TEST 4: Transaction Drilldown Endpoints ---
  console.log('\n--- 4. Testing Transaction Traceability (Drilldowns) ---');

  const drilldownTypes = [
    { type: 'revenue', expectedKey: 'invoice_number' },
    { type: 'cogs', expectedKey: 'invoiceNumber' },
    { type: 'cash_collected', expectedKey: 'payment_method' },
    { type: 'receivables', expectedKey: 'outstanding_balance' },
    { type: 'payables', expectedKey: 'outstanding_balance' },
    { type: 'inventory', expectedKey: 'totalValuation' },
    { type: 'expenses', expectedKey: 'category' },
    { type: 'production', expectedKey: 'orderNumber' },
  ];

  for (const item of drilldownTypes) {
    const dRes = await fetch(`${API_BASE}/finance/drilldown?type=${item.type}`);
    assert(dRes.status === 200, `Drilldown for "${item.type}" returns 200 OK`);
    const dJson = await dRes.json();
    assert(dJson.success === true, `Drilldown "${item.type}" response success is true`);
    assert(Array.isArray(dJson.data), `Drilldown "${item.type}" data is an array`);
    if (dJson.data.length > 0) {
      assert(dJson.data[0][item.expectedKey] !== undefined, `Drilldown "${item.type}" item contains field "${item.expectedKey}"`);
    }
  }

  // --- TEST 5: Automated Reconciliation Engine ---
  console.log('\n--- 5. Testing Cross-Module Reconciliation Engine ---');

  const reconRes = await fetch(`${API_BASE}/finance/reconciliation`);
  assert(reconRes.status === 200, 'GET /api/finance/reconciliation returns 200 OK');
  const reconJson = await reconRes.json();
  assert(reconJson.status === 'RECONCILED', `Reconciliation status is RECONCILED (${reconJson.status})`);
  assert(reconJson.checks.length >= 4, `Reconciliation performed ${reconJson.checks.length} comprehensive checks`);

  reconJson.checks.forEach((c: any) => {
    assert(c.status === 'RECONCILED', `Check "${c.title}" passed reconciliation with status RECONCILED`);
  });

  console.log('\n🎉 ALL FINANCE VERIFICATION TESTS PASSED WITH 100% ACCURACY!\n');
}

verifyFinanceIntegrity().catch(err => {
  console.error('\n💥 Finance verification suite failed:', err);
  process.exit(1);
});
