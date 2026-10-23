import { supabase } from '../config/supabase';
async function run() {
  const res = await supabase.auth.admin.createUser({
    email: 'test_temp@example.com',
    password: 'Password123!',
  });
  console.log('Result:', res);
}
run();
