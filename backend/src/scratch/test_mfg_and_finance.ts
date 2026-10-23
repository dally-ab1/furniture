import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jbatiogfgozpktnraezn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Starting Milestone 5 & 6 Integration Tests...');

  // 1. Fetch locations, finished good, and BOM
  const [bomsRes, locsRes] = await Promise.all([
    fetch(`${API_BASE}/manufacturing/boms`),
    fetch(`${API_BASE}/products/locations`),
  ]);

  const bomsJson = await bomsRes.json();
  const locsJson = await locsRes.json();

  if (!bomsJson.success || bomsJson.data.length === 0) {
    throw new Error('No BOM recipes found');
  }

  const bom = bomsJson.data[0];
  const factoryLocation = locsJson.data.find((l: any) => l.type === 'WAREHOUSE') || locsJson.data[0];

  console.log(`✅ Using BOM: "${bom.name}" for "${bom.product.name}" at location "${factoryLocation.name}"`);

  // 2. Create Production Order
  const nextNumRes = await fetch(`${API_BASE}/manufacturing/orders/next-number`);
  const { orderNumber } = await nextNumRes.json();

  console.log(`📦 Creating Production Order: ${orderNumber}...`);
  const createOrderRes = await fetch(`${API_BASE}/manufacturing/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNumber,
      productId: bom.product.id,
      bomId: bom.id,
      locationId: factoryLocation.id,
      targetQuantity: 2,
      notes: 'Automated integration test batch',
    }),
  });

  const createOrderJson = await createOrderRes.json();
  if (!createOrderRes.ok || !createOrderJson.success) {
    throw new Error(`Failed to create order: ${JSON.stringify(createOrderJson)}`);
  }

  const order = createOrderJson.data;
  console.log(`✅ Order created successfully: ID=${order.id}, Status=${order.status}`);

  // 3. Issue Materials
  console.log(`🔨 Issuing raw materials for order ${order.order_number}...`);
  const itemsToIssue = bom.items.map((item: any) => ({
    rawMaterialId: item.raw_material.id,
    quantity: Number(item.quantity) * 2, // 2 units
    unitCost: Number(item.raw_material.cost_price || 0),
  }));

  const issueRes = await fetch(`${API_BASE}/manufacturing/orders/${order.id}/issue-materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locationId: factoryLocation.id,
      items: itemsToIssue,
    }),
  });

  const issueJson = await issueRes.json();
  if (!issueRes.ok || !issueJson.success) {
    throw new Error(`Failed to issue materials: ${JSON.stringify(issueJson)}`);
  }
  console.log(`✅ Materials issued successfully. Added Material Cost: ETB ${issueJson.data.added_material_cost}`);

  // 4. Complete Production Order
  console.log(`🏁 Completing production order ${order.order_number}...`);
  const completeRes = await fetch(`${API_BASE}/manufacturing/orders/${order.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      completedQuantity: 2,
      wasteQuantity: 0,
      laborCost: 1500.00,
      notes: 'Completed in automated test run with full QA pass',
    }),
  });

  const completeJson = await completeRes.json();
  if (!completeRes.ok || !completeJson.success) {
    throw new Error(`Failed to complete order: ${JSON.stringify(completeJson)}`);
  }
  console.log(`✅ Production intake confirmed! Completed Units: ${completeJson.data.completed_quantity}, Computed Unit Cost: ETB ${completeJson.data.unit_cost}`);

  // 5. Test Expense Recording
  console.log(`💸 Recording test operating expense...`);
  const expenseRes = await fetch(`${API_BASE}/finance/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'Workshop Consumables & Maintenance',
      amount: 1200.00,
      paymentMethod: 'CASH',
      expenseDate: new Date().toISOString().split('T')[0],
      description: 'Wood glue & sandpaper replenishment for workshop',
    }),
  });

  const expenseJson = await expenseRes.json();
  if (!expenseRes.ok || !expenseJson.success) {
    throw new Error(`Failed to record expense: ${JSON.stringify(expenseJson)}`);
  }
  console.log(`✅ Expense recorded: ID=${expenseJson.data.id}, Amount=ETB ${expenseJson.data.amount}`);

  // 6. Test Finance Summary
  const summaryRes = await fetch(`${API_BASE}/finance/summary`);
  const summaryJson = await summaryRes.json();
  console.log(`📊 Finance Summary P&L Snapshot:`);
  console.log(`   - Revenue: ETB ${summaryJson.data.pnl.totalRevenue}`);
  console.log(`   - COGS: ETB ${summaryJson.data.pnl.totalCogs}`);
  console.log(`   - Gross Profit: ETB ${summaryJson.data.pnl.grossProfit} (${summaryJson.data.pnl.grossMarginPct}%)`);
  console.log(`   - Expenses: ETB ${summaryJson.data.pnl.totalExpenses}`);
  console.log(`   - Net Profit: ETB ${summaryJson.data.pnl.netProfit} (${summaryJson.data.pnl.netMarginPct}%)`);
  console.log(`   - Inventory Valuation: ETB ${summaryJson.data.inventoryValuation.totalInventoryValue}`);

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED PERFECTLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
