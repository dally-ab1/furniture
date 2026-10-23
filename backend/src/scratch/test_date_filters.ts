const API_BASE = 'http://localhost:5000/api';

async function testDateFilters() {
  console.log('Testing date filters on /finance/summary...');

  // Query for 2026-10-15 (yesterday when sales happened)
  const yestRes = await fetch(`${API_BASE}/finance/summary?startDate=2026-10-15&endDate=2026-10-15`);
  const yestJson = await yestRes.json();
  console.log('Yesterday Revenue:', yestJson.data.pnl.totalRevenue);
  console.log('Yesterday Cash Collected:', yestJson.data.workingCapital.totalCashCollected);
  console.log('Yesterday Expenses:', yestJson.data.pnl.totalExpenses);

  // Query for 2026-10-16 (today when no sales happened)
  const todayRes = await fetch(`${API_BASE}/finance/summary?startDate=2026-10-16&endDate=2026-10-16`);
  const todayJson = await todayRes.json();
  console.log('Today Revenue:', todayJson.data.pnl.totalRevenue);
  console.log('Today Cash Collected:', todayJson.data.workingCapital.totalCashCollected);
  console.log('Today Expenses:', todayJson.data.pnl.totalExpenses);
}

testDateFilters().catch(console.error);

export {};
