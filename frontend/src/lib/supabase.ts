import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jbatiogfgozpktnraezn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiYXRpb2dmZ296cGt0bnJhZXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMjc5MTYsImV4cCI6MjEwNzYwMzkxNn0.WttIGAB2pRp9_BP07URUDiGb6kPeZpZ6eRheYha3m0Y';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
