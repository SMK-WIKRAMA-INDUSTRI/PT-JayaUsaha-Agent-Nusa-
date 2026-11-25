import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Me-refresh token login di setiap permintaan (wajib untuk @supabase/ssr) dan
// mengarahkan halaman yang butuh login ke /login.
export async function middleware(request) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Redirect yang tetap membawa cookie sesi yang baru di-refresh.
  const redirectTo = (url) => {
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!user && (path.startsWith('/chat') || path.startsWith('/onboarding'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path)}`;
    return redirectTo(url);
  }
  if (user && (path === '/login' || path === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/chat';
    url.search = '';
    return redirectTo(url);
  }
  return response;
}

export const config = {
  matcher: ['/chat/:path*', '/onboarding/:path*', '/login', '/register', '/api/:path*']
};
