'use client';

import { useEffect, useState } from 'react';
import { cancelAction, confirmAction } from '../../lib/api';
import { rp } from '../../lib/format';
import { labelKategori } from '../../lib/kategori';
import { createClient } from '../../lib/supabase/browser';

const KOLOM = 'id, status, data, kedaluwarsa_at';

// Kartu Catatan Pengeluaran (Aksi Tertunda, ADR 0007). Status dibaca langsung dari tabel (RLS).
// tick berubah setiap kali giliran chat mengubah data, sehingga status hasil jawaban "ya" ikut tampil.
export default function PengeluaranCard({ actionId, tick, disabled, onChanged }) {
  const [aksi, setAksi] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const muat = () =>
    createClient()
      .from('pending_actions')
      .select(KOLOM)
      .eq('id', actionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) throw new Error('Catatan Pengeluaran gagal dimuat.');
        return data;
      });

  useEffect(() => {
    let cancelled = false;
    muat()
      .then((d) => !cancelled && setAksi(d))
      .catch((e) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [actionId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!aksi) return <div className="msg bot plan-card">{err || 'Memuat Catatan Pengeluaran…'}</div>;

  const kedaluwarsa = aksi.status === 'menunggu' && new Date(aksi.kedaluwarsa_at) <= new Date();
  const terbuka = aksi.status === 'menunggu' && !kedaluwarsa;
  const statusText = kedaluwarsa ? 'Kedaluwarsa' : aksi.status === 'dijalankan' ? 'Sudah dicatat' : aksi.status === 'batal' ? 'Dibatalkan' : '';

  const act = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await fn(aksi.id);
      if (onChanged) onChanged();
    } catch (e) {
      setErr((e && e.message) || 'Gagal memproses catatan.');
    } finally {
      try {
        setAksi(await muat());
      } catch {
        /* status lama tetap tampil */
      }
      setBusy(false);
    }
  };

  return (
    <div className="msg bot plan-card" role="group" aria-label="Kartu Catatan Pengeluaran">
      <div className="plan-title">Catatan Pengeluaran</div>
      <ul className="plan-list">
        <li className="plan-row">
          <span className="plan-label">
            {aksi.data.barang}
            <small>{labelKategori(aksi.data.kategori)}</small>
          </span>
          <span className="plan-amt">{rp(aksi.data.nominal)}</span>
        </li>
      </ul>
      {err && <p className="plan-err" role="alert">{err}</p>}
      {terbuka ? (
        <>
          <p className="small card-hint">Belum tercatat. Tekan Catat atau jawab "ya".</p>
          <div className="row">
            <button type="button" className="btn primary" disabled={busy || disabled} onClick={() => act(confirmAction)}>
              Catat
            </button>
            <button type="button" className="btn ghost" disabled={busy || disabled} onClick={() => act(cancelAction)}>
              Batal
            </button>
          </div>
        </>
      ) : (
        <span className="small">{statusText}</span>
      )}
    </div>
  );
}
