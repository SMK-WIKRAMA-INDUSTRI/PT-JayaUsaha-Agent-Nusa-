'use client';

import { useEffect, useState } from 'react';
import { sesuaikanRincian } from '../../lib/alokasi';
import { applyPlan, ignorePlan } from '../../lib/api';
import { rp } from '../../lib/format';
import { createClient } from '../../lib/supabase/browser';

const fmtNum = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Kartu Rencana Alokasi. Status dan rincian dibaca langsung dari tabel (RLS), angka dihitung lib/alokasi.js.
export default function RencanaCard({ planId, disabled, onChanged }) {
  const [plan, setPlan] = useState(null);
  const [ubah, setUbah] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from('allocation_plans')
      .select('id, status, rincian, kedaluwarsa_at')
      .eq('id', planId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setErr('Rencana Alokasi gagal dimuat.');
        else setPlan(data);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (!plan) return <div className="msg bot plan-card">{err || 'Memuat Rencana Alokasi…'}</div>;

  const kedaluwarsa = plan.status === 'diusulkan' && new Date(plan.kedaluwarsa_at) <= new Date();
  const terbuka = plan.status === 'diusulkan' && !kedaluwarsa;
  let preview = null;
  let previewErr = '';
  try {
    preview = sesuaikanRincian(plan.rincian, ubah);
  } catch (e) {
    previewErr = e.message;
  }
  const nilai = (p) => (Object.hasOwn(ubah, p.kunci) ? ubah[p.kunci] : p.nominal);
  const keinginan = preview ? preview.pos.find((p) => p.kunci === 'keinginan').nominal : null;

  const setNominal = (kunci, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 13);
    setUbah((u) => ({ ...u, [kunci]: digits === '' ? 0 : Number(digits) }));
  };
  const act = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      const res = await fn();
      setPlan((p) => ({ ...p, ...res.plan }));
      setUbah({});
      if (onChanged) onChanged();
    } catch (e) {
      setErr((e && e.message) || 'Gagal memproses rencana.');
      // Rencana mungkin sudah diputuskan di tab lain: muat ulang statusnya supaya tombol tidak menipu.
      const { data } = await createClient().from('allocation_plans').select('id, status, rincian, kedaluwarsa_at').eq('id', plan.id).maybeSingle();
      if (data) setPlan(data);
    } finally {
      setBusy(false);
    }
  };

  const statusText = kedaluwarsa ? 'Kedaluwarsa' : plan.status === 'diterapkan' ? 'Sudah diterapkan' : plan.status === 'diabaikan' ? 'Diabaikan' : '';

  return (
    <div className="msg bot plan-card" role="group" aria-label="Kartu Rencana Alokasi">
      <div className="plan-title">{`Rencana Alokasi Gaji ${rp(plan.rincian.gaji)}`}</div>
      <ul className="plan-list">
        {plan.rincian.pos.map((p) => (
          <li key={p.kunci} className="plan-row">
            <span className="plan-label">
              {p.label}
              <small>{p.jenis === 'kantong' ? 'disimpan ke Kantong' : 'batas belanja'}</small>
            </span>
            {terbuka && p.kunci !== 'keinginan' ? (
              <input
                className="plan-input"
                inputMode="numeric"
                aria-label={`Nominal ${p.label} dalam rupiah`}
                value={fmtNum(nilai(p))}
                disabled={busy || disabled}
                onChange={(e) => setNominal(p.kunci, e.target.value)}
              />
            ) : (
              <span className="plan-amt">{p.kunci === 'keinginan' && terbuka ? (keinginan === null ? '—' : rp(keinginan)) : rp(p.nominal)}</span>
            )}
          </li>
        ))}
      </ul>
      {previewErr && <p className="plan-err" role="alert">{previewErr}</p>}
      {err && <p className="plan-err" role="alert">{err}</p>}
      {terbuka ? (
        <div className="row">
          <button type="button" className="btn primary" disabled={busy || disabled || !!previewErr} onClick={() => act(() => applyPlan(plan.id, ubah))}>
            Terapkan
          </button>
          <button type="button" className="btn ghost" disabled={busy || disabled} onClick={() => act(() => ignorePlan(plan.id))}>
            Abaikan
          </button>
        </div>
      ) : (
        <span className="small">{statusText}</span>
      )}
    </div>
  );
}
