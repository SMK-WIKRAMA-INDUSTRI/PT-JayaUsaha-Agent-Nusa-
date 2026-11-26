'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/browser';
import '../auth.css';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    if (password.length < 8) {
      setErr('Password minimal 8 karakter.');
      return;
    }
    setBusy(true);
    const { data, error } = await createClient().auth.signUp({ email: email.trim(), password });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    if (!data.session) {
      // Konfirmasi email masih aktif di project Supabase.
      setInfo('Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.');
      setBusy(false);
      return;
    }
    window.location.href = '/onboarding';
  };

  return (
    <div className="app auth-page">
      <div className="bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div>
      <main className="glass auth-card">
        <h1>Daftar</h1>
        <p className="lead">Akun baru langsung mendapat rekening demo berisi saldo dan riwayat 3 bulan. Semua data fiktif.</p>
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email"><span>Email</span></label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password"><span>Password</span></label>
            <input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <small>Minimal 8 karakter.</small>
          </div>
          <p className="auth-err" role="alert">{err}</p>
          {info && <p className="lead" role="status">{info}</p>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Memproses…' : 'Daftar'}</button>
        </form>
        <p className="auth-alt">Sudah punya akun? <Link href="/login">Masuk</Link></p>
      </main>
    </div>
  );
}
