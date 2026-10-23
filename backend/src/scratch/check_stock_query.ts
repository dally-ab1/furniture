import { supabase } from '../config/supabase';

async function checkStockQuery() {
  const { data, error } = await supabase
    .from('stock_levels')
    .select(`
      product_id, location_id, quantity, updated_at,
      locations (id, name, type),
      products (id, name, sku, type, unit_of_measure, cost_price, selling_price)
    `);

  console.log('Error:', error);
  console.log('Sample row:', data?.[0]);
}

checkStockQuery().catch(console.error);
