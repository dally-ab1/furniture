import { supabase } from '../config/supabase';
async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'mohamed@furnierp.com',
    password: 'Employee123!',
  });
  console.log('LOGIN RESULT:');
  console.log('Error:', error);
  console.log('User ID:', data.user?.id);
  console.log('Email:', data.user?.email);
  console.log('Session exists:', !!data.session);

  if (data.session) {
    // Test fetching profile
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', data.user.id).single();
    console.log('PROFILE:', profile);

    // Test fetching permissions
    const { data: perms } = await supabase.from('employee_permissions').select('*').eq('user_id', data.user.id);
    console.log('PERMS:', perms);
  }
}
run();
