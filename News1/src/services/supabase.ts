/**
 * supabase.ts — Supabase client for News1
 * Same credentials as the rest of FIN·OS so the session is shared.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://oeapcyucnduhwpgxfknb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
