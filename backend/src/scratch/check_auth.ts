import { supabase } from '../config/supabase';
async function run() {
  const { data, error } = await supabase.rpc('get_auth_users_debug', {}).catch(() => ({ data: null, error: 'no rpc' }));
  console.log('RPC test:', data, error);
}
run();
