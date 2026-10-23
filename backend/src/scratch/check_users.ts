import { supabase } from '../config/supabase';
async function run() {
  const { data: profiles, error: pErr } = await supabase.from('user_profiles').select('*');
  console.log('PROFILES:', JSON.stringify(profiles, null, 2));
  const { data: perms } = await supabase.from('employee_permissions').select('*');
  console.log('PERMS COUNT:', perms?.length);
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  console.log('AUTH USERS:', JSON.stringify(authUsers?.users?.map(u => ({ id: u.id, email: u.email })), null, 2));
}
run().catch(console.error);
