'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';
import { pengeluaranBulananOtomatis } from '../../lib/keuangan';
import { rp } from '../../lib/format';
import '../auth.css';

const LANGKAH = ['Profil', 'Pengeluaran Bulanan', 'Profil Risiko', 'Goal pertama'];
const angka = (v) => Number(String(v).replace(/\D/g, ''));

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [profil, setProfil] = useState({ nama_panggilan: '', pekerjaan: '', tanggal_gajian: '25' });
  const [otomatis, setOtomatis] = useState(null);
  const [pengeluaran, setPengeluaran] = useState('');
  const [goal, setGoal] = useState({ nama: '', target: '', tenggat: '' });

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [{ data: p }, { data: tx }] = await Promise.all([
        supabase.from('profiles').select('nama_panggilan, pekerjaan, tanggal_gajian, pengeluaran_bulanan_koreksi').maybeSingle(),
        supabase.from('transactions').select('waktu, arah, nominal, status')
      ]);
      const auto = pengeluaranBulananOtomatis(tx || [], new Date());
      setOtomatis(auto);
      if (p) setProfil({ nama_panggilan: p.nama_panggilan || '', pekerjaan: p.pekerjaan || '', tanggal_gajian: String(p.tanggal_gajian || 25) });
      setPengeluaran(String(p && p.pengeluaran_bulanan_koreksi !== null ? p.pengeluaran_bulanan_koreksi : auto));
    })();
  }, []);

  // Menjalankan fn(supabase, userId). Error Supabase dilempar lewat cek().
  const simpan = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi login berakhir. Silakan masuk lagi.');
      await fn(supabase, user.id);
      return true;
    } catch (e) {
      setErr((e && e.message) || 'Gagal menyimpan.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const cek = ({ error }) => {
    if (error) throw new Error(error.message);
  };

  const lanjutProfil = async (e) => {
    e.preventDefault();
    const nama = profil.nama_panggilan.trim();
    const tgl = Number(profil.tanggal_gajian);
    if (!nama) return setErr('Nama panggilan wajib diisi.');
    if (!Number.isInteger(tgl) || tgl < 1 || tgl > 31) return setErr('Tanggal gajian harus angka 1 sampai 31.');
    const ok = await simpan(async (s, uid) =>
      cek(await s.from('profiles').update({ nama_panggilan: nama, pekerjaan: profil.pekerjaan.trim() || null, tanggal_gajian: tgl }).eq('user_id', uid))
    );
    if (ok) setStep(1);
  };

  const lanjutPengeluaran = async (e) => {
    e.preventDefault();
    if (!String(pengeluaran).trim()) return setErr('Isi Pengeluaran Bulanan dengan angka rupiah.');
    const n = angka(pengeluaran);
    const koreksi = n === otomatis ? null : n; // sama dengan hitungan otomatis: jangan disimpan sebagai koreksi
    const ok = await simpan(async (s, uid) => cek(await s.from('profiles').update({ pengeluaran_bulanan_koreksi: koreksi }).eq('user_id', uid)));
    if (ok) setStep(2);
  };

  const selesai = async (denganGoal) => {
    const nama = goal.nama.trim();
    const target = angka(goal.target);
    if (denganGoal && (!nama || !target)) return setErr('Isi nama dan target Goal, atau pilih Lewati.');
    const ok = await simpan(async (s, uid) => {
      if (denganGoal) cek(await s.from('goals').insert({ user_id: uid, nama, target, tenggat: goal.tenggat || null }));
      cek(await s.from('profiles').update({ onboarding_selesai_at: new Date().toISOString() }).eq('user_id', uid));
    });
    if (ok) window.location.href = '/chat';
  };

  return (
    <div className="app auth-page">
      <div className="bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div>
      <main className="glass auth-card">
        <ol className="auth-steps" aria-label={`Langkah ${step + 1} dari ${LANGKAH.length}: ${LANGKAH[step]}`}>
          {LANGKAH.map((l, i) => <li key={l} className={i <= step ? 'on' : ''} />)}
        </ol>

        {step === 0 && (
          <form onSubmit={lanjutProfil} noValidate>
            <h1>Kenalan dulu</h1>
            <p className="lead">Agent memakai data ini untuk menyapa Anda dan mengenali jadwal gajian.</p>
            <div className="field">
              <label htmlFor="nama"><span>Nama panggilan</span></label>
              <input id="nama" value={profil.nama_panggilan} onChange={(e) => setProfil({ ...profil, nama_panggilan: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="kerja"><span>Pekerjaan (opsional)</span></label>
              <input id="kerja" value={profil.pekerjaan} onChange={(e) => setProfil({ ...profil, pekerjaan: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="tgl"><span>Tanggal gajian</span></label>
              <input id="tgl" type="number" min="1" max="31" value={profil.tanggal_gajian} onChange={(e) => setProfil({ ...profil, tanggal_gajian: e.target.value })} />
            </div>
            <p className="auth-err" role="alert">{err}</p>
            <button type="submit" className="btn primary" disabled={busy}>Lanjut</button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={lanjutPengeluaran} noValidate>
            <h1>Pengeluaran Bulanan</h1>
            <p className="lead">
              {otomatis === null
                ? 'Menghitung dari transaksi Anda…'
                : `Dari transaksi 3 bulan terakhir, rata-rata pengeluaran Anda ${rp(otomatis)} per bulan. Ubah jika kurang tepat.`}
            </p>
            <div className="field">
              <label htmlFor="keluar"><span>Pengeluaran per bulan (rupiah)</span></label>
              <input id="keluar" inputMode="numeric" value={pengeluaran} onChange={(e) => setPengeluaran(e.target.value)} />
            </div>
            <p className="auth-err" role="alert">{err}</p>
            <button type="submit" className="btn primary" disabled={busy || otomatis === null}>Lanjut</button>
          </form>
        )}

        {step === 2 && (
          <div>
            <h1>Profil Risiko</h1>
            <p className="lead">Kuesioner profil risiko akan tersedia segera. Untuk sekarang, langkah ini dilewati.</p>
            <button type="button" className="btn primary" onClick={() => setStep(3)}>Lanjut</button>
          </div>
        )}

        {step === 3 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              selesai(true);
            }}
            noValidate
          >
            <h1>Goal pertama</h1>
            <p className="lead">Misalnya liburan, laptop baru, atau DP rumah. Dana Darurat sudah dibuatkan otomatis.</p>
            <div className="field">
              <label htmlFor="gnama"><span>Nama Goal</span></label>
              <input id="gnama" value={goal.nama} onChange={(e) => setGoal({ ...goal, nama: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="gtarget"><span>Target (rupiah)</span></label>
              <input id="gtarget" inputMode="numeric" value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="gtenggat"><span>Tenggat (opsional)</span></label>
              <input id="gtenggat" type="date" value={goal.tenggat} onChange={(e) => setGoal({ ...goal, tenggat: e.target.value })} />
            </div>
            <p className="auth-err" role="alert">{err}</p>
            <div className="auth-row">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => selesai(false)}>Lewati</button>
              <button type="submit" className="btn primary" disabled={busy}>Simpan &amp; mulai</button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
