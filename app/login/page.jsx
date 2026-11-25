'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/browser';
import '../auth.css';

// Hanya path internal yang boleh dipakai sebagai tujuan setelah login.
// Hanya path di situs ini yang boleh dipakai sebagai tujuan setelah login.
const safeNext = (v) => {
  if (!v) return '/chat';
  try {
    const u = new URL(v, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : '/chat';
  } catch {
    return '/chat';
  }
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setErr(error.message === 'Invalid login credentials' ? 'Email atau password salah.' : error.message);
      setBusy(false);
      return;
    }
    window.location.href = safeNext(new URLSearchParams(window.location.search).get('next'));
  };

  return (
    <div className="app auth-page">
      <div className="bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div>
      <main className="glass auth-card">
        <h1>Masuk</h1>
        <p className="lead">Masuk ke Agent Nusa untuk melihat rekening demo dan ngobrol dengan agent.</p>
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email"><span>Email</span></label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password"><span>Password</span></label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <p className="auth-err" role="alert">{err}</p>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
        </form>
        <p className="auth-alt">Belum punya akun? <Link href="/register">Daftar</Link></p>
      </main>
    </div>
  );
}
