import { createBrowserClient } from '@supabase/ssr';

// Klien untuk komponen 'use client'. Sesi login disimpan di cookie, jadi server ikut membacanya.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
