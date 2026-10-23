import { supabase } from '../config/supabase';

async function checkSaleItems() {
  const { data: items } = await supabase.from('sale_items').select(`
    id, sale_id, product_id, quantity, unit_price, cost_price, total_price,
    product:products(name, sku, cost_price, selling_price),
    sale:sales(invoice_number, status, created_at)
  `);
  console.log('--- ALL SALE ITEMS ---');
  console.table(items?.map(i => ({
    invoice: (i as any).sale?.invoice_number,
    status: (i as any).sale?.status,
    product: (i as any).product?.name,
    qty: i.quantity,
    unitPrice: i.unit_price,
    costPrice: i.cost_price,
    lineRevenue: Number(i.quantity) * Number(i.unit_price),
    lineCogs: Number(i.quantity) * Number(i.cost_price),
  })));

  const totalRev = items?.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unit_price)), 0);
  const totalCogs = items?.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.cost_price)), 0);
  console.log(`Total Sale Items Revenue: ETB ${totalRev}`);
  console.log(`Total Sale Items COGS: ETB ${totalCogs}`);
}

checkSaleItems().catch(console.error);
