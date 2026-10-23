const API_BASE = 'http://localhost:5000/api';

async function testFinanceEndpoints() {
  console.log('🚀 Testing Finance & Profit Reports API Endpoints...\n');

  // 1. GET /api/finance/summary
  console.log('--- 1. Testing GET /api/finance/summary ---');
  const sumRes = await fetch(`${API_BASE}/finance/summary`);
  if (!sumRes.ok) {
    throw new Error(`Summary failed: ${sumRes.status} ${await sumRes.text()}`);
  }
  const sumJson = await sumRes.json();
  console.log('✅ Summary Response:', JSON.stringify({
    currency: sumJson.data.currency,
    revenue: sumJson.data.pnl.totalRevenue,
    cogs: sumJson.data.pnl.totalCogs,
    grossProfit: sumJson.data.pnl.grossProfit,
    grossMarginPct: sumJson.data.pnl.grossMarginPct,
    expenses: sumJson.data.pnl.totalExpenses,
    netProfit: sumJson.data.pnl.netProfit,
    cashCollected: sumJson.data.workingCapital.totalCashCollected,
    cashCollectedByMethod: sumJson.data.workingCapital.cashCollectedByMethod,
    accountsReceivable: sumJson.data.workingCapital.totalAccountsReceivable,
    accountsPayable: sumJson.data.workingCapital.totalAccountsPayable,
    inventoryValuation: sumJson.data.inventoryValuation.totalInventoryValue,
  }, null, 2));

  // 2. GET /api/finance/drilldown?type=revenue
  console.log('\n--- 2. Testing Drilldowns ---');
  for (const type of ['revenue', 'cogs', 'cash_collected', 'receivables', 'payables', 'inventory', 'expenses']) {
    const dRes = await fetch(`${API_BASE}/finance/drilldown?type=${type}`);
    if (!dRes.ok) {
      throw new Error(`Drilldown ${type} failed: ${dRes.status}`);
    }
    const dJson = await dRes.json();
    console.log(`✅ Drilldown "${type}": returned ${dJson.count} records`);
  }

  // 3. GET /api/finance/reconciliation
  console.log('\n--- 3. Testing GET /api/finance/reconciliation ---');
  const rRes = await fetch(`${API_BASE}/finance/reconciliation`);
  if (!rRes.ok) {
    throw new Error(`Reconciliation failed: ${rRes.status}`);
  }
  const rJson = await rRes.json();
  console.log(`✅ Reconciliation Status: ${rJson.status}`);
  rJson.checks.forEach((c: any) => {
    console.log(`   - [${c.status}] ${c.title}: ${c.details}`);
  });

  // 4. GET /api/dashboard/summary
  console.log('\n--- 4. Testing GET /api/dashboard/summary ---');
  const dashRes = await fetch(`${API_BASE}/dashboard/summary`);
  if (!dashRes.ok) {
    throw new Error(`Dashboard summary failed: ${dashRes.status}`);
  }
  const dashJson = await dashRes.json();
  console.log('✅ Dashboard Data:', dashJson.data);

  console.log('\n🎉 ALL FINANCE API TESTS PASSED SUCCESSFULLY!');
}

testFinanceEndpoints().catch(console.error);

export {};
