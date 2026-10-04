import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqdocqsskqxcehdcvjvq.supabase.co';
const supabaseKey = 'sb_publishable_RltNVRq_Z5M6e00fdAPSLg_SyTD80MD';

export const supabase = createClient(supabaseUrl, supabaseKey);
