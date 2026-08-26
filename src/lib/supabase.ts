import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://egfziuejerovmnlahjgn.supabase.co'
export const supabaseKey = 'sb_publishable_T102yh_CtOxOY31WhCjz4w_hREpsCMJ'

export const supabase = createClient(supabaseUrl, supabaseKey);
