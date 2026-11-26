'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const DURATION = 5200;

const SCENES = [
  {
    point: 'Mengingatkan agar PIN, password, dan OTP tidak dibagikan',
    from: 'Nomor tidak dikenal',
    meta: '+62 812-•••• · baru saja',
    msg: 'Halo, saya petugas Bank Nusa. Tolong sebutkan kode OTP yang baru masuk ya, untuk verifikasi.',
    flag: 'Modus minta OTP',
    reply: 'Jangan bagikan OTP ke siapa pun. Bank tidak pernah memintanya lewat chat atau telepon.',
    tone: 'red'
  },
  {
    point: 'Menyamarkan nomor kartu dan rekening di layar',
    from: 'Anda',
    meta: 'Chat dengan Agent Nusa',
    msg: 'Tolong cek kartu saya 4821 7730 1956 4821',
    masked: 'Tolong cek kartu saya •••• •••• •••• 4821',
    flag: 'Data sensitif disamarkan',
    reply: 'Nomor kartu sudah disamarkan. Cukup 4 digit terakhir untuk saya bantu cek.',
    tone: 'amber'
  },
  {
    point: 'Meneruskan transaksi mencurigakan ke tim anti-fraud',
    from: 'Notifikasi transaksi',
    meta: 'Pukul 02.14 WIB',
    msg: 'Transfer Rp9.800.000 ke rekening baru 7781•••• dari perangkat tidak dikenal.',
    flag: 'Transaksi mencurigakan',
    reply: 'Sudah diteruskan ke tim anti-fraud. Transaksi ditahan sampai Anda konfirmasi.',
    tone: 'red'
  }
];

const Check = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const Warn = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v4M12 17.5v.5" /></svg>
);

export default function FraudAlert() {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || paused) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % SCENES.length), DURATION);
    return () => clearTimeout(t);
  }, [idx, inView, paused]);

  const s = SCENES[idx];

  return (
    <section className={'lp-fr' + (inView ? ' in' : '')} ref={ref} aria-labelledby="fr-title">
      <div className="lp-fr-orb o1" aria-hidden="true" />
      <div className="lp-fr-orb o2" aria-hidden="true" />
      <div className="lp-fr-orb o3" aria-hidden="true" />
      <div className="lp-fr-grid-bg" aria-hidden="true" />

      <div className="lp-wrap lp-fr-in">
        <div className="lp-fr-text">
          <span className="lp-fr-tag"><i />Perlindungan aktif 24 jam</span>
          <h2 id="fr-title" className="lp-fr-title">
            Peringatan penipuan <span className="hl">sebelum terlambat</span>
          </h2>
          <p className="lp-fr-lead">Modus meminta OTP, link palsu, dan telepon mengaku petugas bank terus berganti. Agent Nusa mengingatkan Anda di saat yang tepat.</p>

          <ul className="lp-fr-points" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            {SCENES.map((sc, i) => (
              <li key={sc.point} style={{ '--i': i }}>
                <button type="button" className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} aria-pressed={i === idx}>
                  <span className="ic"><Check /></span>
                  <span className="tx">{sc.point}</span>
                  {i === idx && <span className={'bar' + (paused ? ' hold' : '')} key={idx} style={{ '--dur': DURATION + 'ms' }} />}
                </button>
              </li>
            ))}
          </ul>

          <Link href="/chat" className="lp-fr-link">
            Coba tanya Agent Nusa
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>

        <div className="lp-fr-stage" aria-hidden="true">
          <div className="lp-fr-radar"><span /><span /><span /></div>

          <div className="lp-fr-panel">
            <div className="lp-fr-panel-top">
              <span className="dots"><i /><i /><i /></span>
              <span className="live"><b />Pemindaian langsung</span>
            </div>

            <div className="lp-fr-scene" key={idx}>
              <div className={'lp-fr-msg ' + s.tone}>
                <div className="who">
                  <span className="av">{s.from === 'Anda' ? 'A' : '?'}</span>
                  <div><b>{s.from}</b><small>{s.meta}</small></div>
                </div>
                <p className="body">
                  <span className="raw">{s.msg}</span>
                  {s.masked && <span className="mask">{s.masked}</span>}
                </p>
                <span className="scan" />
              </div>

              <div className={'lp-fr-flag ' + s.tone}><Warn />{s.flag}</div>

              <div className="lp-fr-reply">
                <img src="/assets/announce.png" alt="" />
                <div className="bubble">
                  <span className="typing"><i /><i /><i /></span>
                  <span className="txt">{s.reply}</span>
                </div>
              </div>
            </div>

            <div className="lp-fr-steps">
              {SCENES.map((_, i) => <span key={i} className={i === idx ? 'on' : i < idx ? 'done' : ''} />)}
            </div>
          </div>

          <div className="lp-fr-chip c1"><span className="k">OTP</span>••••••</div>
          <div className="lp-fr-chip c2"><span className="ok"><Check /></span>Anti-fraud aktif</div>
          <div className="lp-fr-chip c3"><span className="k">Kartu</span>•••• 4821</div>
          <img className="lp-fr-mascot" src="/assets/announce.png" alt="" />
        </div>
      </div>
    </section>
  );
}
