'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/* Hitung naik saat section terlihat */
function useCount(target, active, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return value;
}

const rupiah = (n) => 'Rp' + n.toLocaleString('id-ID');

const IconData = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const IconAgent = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 14v-2a8 8 0 0116 0v2" />
    <rect x="2" y="14" width="5" height="6" rx="2" />
    <rect x="17" y="14" width="5" height="6" rx="2" />
  </svg>
);

const BARS = [38, 62, 45, 80, 54, 92, 70];
const TX = [
  { name: 'Transfer ke Sinta', amt: '-Rp250.000', tone: 'out' },
  { name: 'Gaji masuk', amt: '+Rp8.500.000', tone: 'in' },
  { name: 'Token listrik', amt: '-Rp100.000', tone: 'out' }
];

export default function SafetyFeatures() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setInView(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); io.disconnect(); } },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const balance = useCount(12345670, inView);
  const summary = useCount(1251, inView, 1800);

  return (
    <section className={'lp-sec lp-sf' + (inView ? ' in' : '')} ref={ref} aria-labelledby="sf-title">
      <div className="lp-sf-blob a" aria-hidden="true" />
      <div className="lp-sf-blob b" aria-hidden="true" />
      <div className="lp-wrap">
        <div className="lp-sf-head">
          <span className="lp-sf-pill"><i />Mudah. Cerdas. Terlindungi.</span>
          <h2 className="lp-sf-title" id="sf-title">
            <span>Cepat digunakan,</span> <span className="grad">tetap aman</span>
          </h2>
          <p className="lp-sf-lead">Tiga hal yang selalu dijaga Agent Nusa selama membantu Anda.</p>
        </div>

        <div className="lp-sf-grid">
          {/* 1. Data */}
          <article className="lp-sf-card" style={{ '--d': '0s' }}>
            <span className="lp-sf-icon"><IconData /></span>
            <h3>Jawaban berdasarkan data Anda</h3>
            <p>Memakai informasi rekening dan transaksi yang tersedia, lalu menjelaskan statusnya dengan jelas.</p>
            <div className="lp-sf-art phones" aria-hidden="true">
              <div className="lp-sf-phone back">
                <div className="lp-sf-notch" />
                <small>Halo, Nasabah</small>
                <div className="lp-sf-balance dark">
                  <small>Total saldo</small>
                  <b>{rupiah(balance)}</b>
                  <div className="lp-sf-btns"><span>Kirim</span><span className="hi">Tagihan</span></div>
                </div>
                <small className="muted">Transaksi hari ini</small>
                <div className="lp-sf-minis">
                  <span><em>Masuk</em>Rp8,5jt</span>
                  <span><em>Keluar</em>Rp350rb</span>
                </div>
              </div>
              <div className="lp-sf-phone front">
                <div className="lp-sf-notch" />
                <small>Analisis</small>
                <div className="lp-sf-bars">
                  {BARS.map((h, i) => (
                    <span key={i} style={{ '--h': h + '%', '--i': i }} className={i === 5 ? 'hi' : ''} />
                  ))}
                </div>
                <ul className="lp-sf-tx">
                  {TX.map((t, i) => (
                    <li key={t.name} style={{ '--i': i }}>
                      <i className={t.tone} />
                      <span>{t.name}</span>
                      <b className={t.tone}>{t.amt}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          {/* 2. Keamanan */}
          <article className="lp-sf-card" style={{ '--d': '.12s' }}>
            <span className="lp-sf-icon"><IconShield /></span>
            <h3>Minta aman melalui kanal resmi</h3>
            <p>PIN, password, dan OTP tidak diproses dalam chat. Verifikasi dilakukan hanya di aplikasi atau situs resmi.</p>
            <div className="lp-sf-art tilt" aria-hidden="true">
              <div className="lp-sf-phone t1">
                <div className="lp-sf-notch" />
                <div className="lp-sf-wave">
                  {Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ '--i': i }} />)}
                </div>
                <small className="muted">Aktivitas login</small>
              </div>
              <div className="lp-sf-phone t2">
                <div className="lp-sf-notch" />
                <div className="lp-sf-bubble me">Kode OTP saya 48••••</div>
                <div className="lp-sf-bubble bot">
                  <span className="lp-sf-lock">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                  </span>
                  OTP disamarkan. Jangan bagikan ke siapa pun.
                </div>
                <div className="lp-sf-otp">
                  {['•', '•', '•', '•', '•', '•'].map((c, i) => <span key={i} style={{ '--i': i }}>{c}</span>)}
                </div>
                <div className="lp-sf-shield">
                  <IconShield />
                  <span className="ring" />
                  <span className="ring r2" />
                </div>
              </div>
            </div>
          </article>

          {/* 3. Agen */}
          <article className="lp-sf-card" style={{ '--d': '.24s' }}>
            <span className="lp-sf-icon"><IconAgent /></span>
            <h3>Lanjut ke agen tanpa mengulang</h3>
            <p>Saat bantuan lebih lanjut diperlukan, ringkasan percakapan langsung diteruskan ke agen.</p>
            <div className="lp-sf-art stack" aria-hidden="true">
              <div className="lp-sf-paper p2" />
              <div className="lp-sf-paper p1" />
              <div className="lp-sf-bank">
                <span className="shine" />
                <div className="lp-sf-bank-top">
                  <span className="chip" />
                  <span className="wifi"><i /><i /><i /></span>
                </div>
                <div className="lp-sf-bank-num">•••• •••• •••• 4821</div>
                <div className="lp-sf-bank-foot">
                  <div>
                    <small>Tiket ringkasan</small>
                    <b>#{summary.toString().padStart(4, '0')}</b>
                  </div>
                  <strong>NUSA</strong>
                </div>
              </div>
              <div className="lp-sf-toast">
                <span className="dot" />
                Diteruskan ke agen
                <span className="typing"><i /><i /><i /></span>
              </div>
            </div>
          </article>
        </div>

        <div className="lp-sf-cta">
          <Link href="/chat" className="lp-sf-btn">
            Coba Agent Nusa sekarang
            <span className="arr">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
