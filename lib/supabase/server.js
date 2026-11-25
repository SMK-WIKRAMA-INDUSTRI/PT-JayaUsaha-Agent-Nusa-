import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Klien server yang bertindak sebagai Nasabah yang sedang login (RLS berlaku).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Dipanggil dari Server Component: cookie tidak bisa ditulis di sini. middleware.js yang me-refresh sesi.
        }
      }
    }
  });
}

// Mengembalikan { supabase, user }. user null bila belum login.
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return { supabase, user };
}
