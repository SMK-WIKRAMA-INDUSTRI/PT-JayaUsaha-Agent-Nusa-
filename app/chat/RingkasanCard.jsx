'use client';

import { fmtWaktu, rp } from '../../lib/format';
import { labelStatus } from '../../lib/ringkasan';

// Kartu Ringkasan Bulanan. Datanya dibekukan saat kartu dibuat (card.data), sama dengan teks yang dibaca agent.
export default function RingkasanCard({ data: r }) {
  const lebar = Math.min(100, r.persen);
  return (
    <div className="msg bot plan-card" role="group" aria-label="Kartu Ringkasan Bulanan">
      <div className="ring-head">
        <span className="plan-title">{`Ringkasan Belanja ${r.bulan}`}</span>
        <span className={`ring-status ${r.status}`}>{labelStatus(r.status)}</span>
      </div>
      <p className="ring-total">
        {`${rp(r.total)} dari batas ${rp(r.batas_prorata)} sampai hari ini`}
        <small>{`Hari ke-${r.hari_berjalan} dari ${r.jumlah_hari}. Batas Belanja bulan ini ${rp(r.batas)}.`}</small>
      </p>
      <div
        className={`ring-bar ${r.status}`}
        role="progressbar"
        aria-label="Pemakaian Batas Belanja sampai hari ini"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={lebar}
        aria-valuetext={`${r.persen}%`}
      >
        <span style={{ width: lebar + '%' }} />
      </div>
      <ul className="plan-list">
        {r.per_kategori.length ? (
          r.per_kategori.map((k) => (
            <li key={k.kategori} className="plan-row">
              <span className="plan-label">
                {k.label}
                <small>{k.kelompok === 'kebutuhan' ? 'Kebutuhan' : 'Keinginan'}</small>
              </span>
              <span className="plan-amt">{rp(k.total)}</span>
            </li>
          ))
        ) : (
          <li className="plan-row">
            <span className="plan-label">Belum ada belanja bulan ini</span>
          </li>
        )}
      </ul>
      <p className="small card-hint">
        {`Sisa Batas Belanja ${rp(r.sisa_batas)} untuk ${r.sisa_hari} hari lagi, sekitar ${rp(r.sisa_per_hari)} per hari. Dibuat ${fmtWaktu(r.dibuat_pada)}.`}
      </p>
    </div>
  );
}
