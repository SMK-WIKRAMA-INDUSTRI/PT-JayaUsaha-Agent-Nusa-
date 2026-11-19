'use client';

import { useState } from 'react';

const TABS = [
  {
    id: 'transfer',
    title: 'Cek status transfer',
    desc: 'Tanya status transfer BI-FAST, SKN, atau QRIS dan dapat jawaban dari riwayat transaksi Anda, lengkap dengan jam dan statusnya.',
    user: 'Transfer ke Rina belum masuk, tolong dicek.',
    bot: 'Transfer BI-FAST Rp 500.000 ke Rina Wijaya gagal karena gangguan di bank tujuan. Dana sudah kembali ke rekening Anda pukul 13:05.',
    label: 'Transfer ke Rina Wijaya · 17 Nov 2026',
    value: 'Rp 500.000',
    badge: 'Gagal · dana kembali',
    pose: 'think'
  },
  {
    id: 'kartu',
    title: 'Blokir kartu darurat',
    desc: 'Kartu hilang? Agent Nusa langsung menyiapkan blokir sementara dan menghubungkan Anda ke agen untuk kartu pengganti.',
    user: 'Kartu debit saya hilang, tolong diblokir sekarang.',
    bot: 'Saya bantu blokir sementara kartu berakhiran 4821. Verifikasi OTP dilakukan di halaman resmi Agent Nusa, bukan di chat ini.',
    label: 'Kartu debit Agent Nusa · •••• 4821',
    value: 'Blokir sementara',
    badge: 'Menunggu verifikasi',
    pose: 'announce'
  },
  {
    id: 'tagihan',
    title: 'Tagihan kartu kredit',
    desc: 'Lihat total tagihan, pembayaran minimum, dan tanggal jatuh tempo tanpa membuka banyak menu.',
    user: 'Berapa tagihan kartu kredit saya bulan ini?',
    bot: 'Tagihan bulan ini Rp 2.750.000. Pembayaran minimum Rp 275.000, jatuh tempo 25 Nov 2026.',
    label: 'Total tagihan · Kartu Kredit Agent Nusa',
    value: 'Rp 2.750.000',
    badge: 'Jatuh tempo 25 Nov',
    pose: 'phone'
  }
];

export default function FeatureTabs() {
  const [active, setActive] = useState(0);
  const t = TABS[active];

  return (
    <div className="lp-tabs">
      <div className="lp-tablist" role="group" aria-label="Contoh percakapan">
        {TABS.map((x, i) => (
          <button key={x.id} type="button" className="lp-tabbtn" aria-pressed={i === active} onClick={() => setActive(i)}>
            <span className="lp-tabno">{i + 1}</span>
            <span>
              <b>{x.title}</b>
              <small>{x.desc}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="lp-demo" key={t.id}>
        <div className="lp-demo-head">
          <span className="lp-demo-ava"><img src={`/assets/${t.pose}.png`} alt="" /></span>
          <span>
            <b>Agent Nusa</b>
            <small><i />Online</small>
          </span>
        </div>
        <div className="lp-demo-body">
          <div className="lp-d-user">{t.user}</div>
          <div className="lp-d-bot">
            {t.bot}
            <div className="lp-d-card">
              <span><small>{t.label}</small><b>{t.value}</b></span>
              <em>{t.badge}</em>
            </div>
          </div>
        </div>
        <div className="lp-demo-foot">Contoh percakapan. Data hanya demo.</div>
      </div>
    </div>
  );
}
