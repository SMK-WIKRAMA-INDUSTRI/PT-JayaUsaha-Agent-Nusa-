'use client';

import { useEffect, useRef, useState } from 'react';

/*
  Animasi "video" di dalam HP. Satu state `step` menggerakkan semua adegan:
   0 notifikasi transfer gagal      6 pesan pengguna
   1 maskot bingung (bubble 1)      7 Agent Nusa mengetik
   2 maskot masih bingung           8 jawaban Agent Nusa + kartu transaksi
   3 maskot lihat tombol chat       9 chip "Coba transfer ulang" diketuk
   4 maskot mengetuk tombol chat   10 pesan pengguna kedua + mengetik
   5 chat terbuka (slide up)       11 berhasil + maskot bersorak
  12 fade out, lalu -1 (reset tanpa animasi) dan ulang dari 0
*/
const STEPS = [1500, 2600, 2400, 1900, 1100, 900, 1300, 1300, 2800, 1300, 1200, 4200, 600];
const LAST = STEPS.length - 1;
const STATIC_STEP = 11; // tampilan akhir untuk pengguna yang mengurangi gerakan

const THOUGHTS = {
  1: 'Lho, kok transfernya gagal?',
  2: 'Telepon pasti antre lama… gimana ya?',
  3: 'Eh, ada tombol chat Agent Nusa!'
};

const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  left: 4 + ((i * 37) % 92),
  delay: ((i * 13) % 10) * 0.12,
  dur: 2 + ((i * 7) % 6) * 0.2,
  color: ['#62C3E8', '#A1E1F0', '#FFD479', '#7DE3B0'][i % 4]
}));

const Chat = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" />
  </svg>
);

export default function PhoneDemo() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) setStep(STATIC_STEP);
      else setStep(0);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const active = playing && inView && !reduced;

  useEffect(() => {
    if (!active) return undefined;
    const wait = step === -1 ? 120 : STEPS[step];
    const t = setTimeout(() => setStep((s) => (s === -1 ? 0 : s >= LAST ? -1 : s + 1)), wait);
    return () => clearTimeout(t);
  }, [step, active]);

  const s = step;
  const chatOpen = s >= 5;
  const showMascot = s >= 1 && s <= 4;
  const pose = s <= 2 ? 'think' : 'phone';
  const screenCls = 'lp-screen' + (s === -1 ? ' is-reset' : '') + (s === 12 || s === -1 ? ' is-fade' : '');

  return (
    <div className="lp-phone-wrap" ref={rootRef}>
      <div
        className="lp-phone"
        role="img"
        aria-label="Animasi di layar HP: maskot Agent Nusa bingung karena transfer gagal, lalu membuka chat, bertanya ke Agent Nusa, dan transfernya berhasil."
      >
        <span className="lp-island" aria-hidden="true" />
        <div className={screenCls} aria-hidden="true">
          <div className={'lp-status' + (chatOpen ? ' light' : '')}>
            <span>14:12</span>
            <span className="lp-status-r">
              <i /><i /><i />
            </span>
          </div>

          {/* ---- layar aplikasi bank ---- */}
          <div className="lp-app">
            <div className="lp-app-top">
              <div>
                <small>Selamat siang,</small>
                <b>Dimas</b>
              </div>
              <span className="lp-app-logo">N</span>
            </div>
            <div className="lp-card">
              <small>Tabungan Agent Nusa · •••• 4821</small>
              <b>Rp 24.380.500</b>
            </div>
            <div className="lp-app-title">Transaksi terbaru</div>
            <div className={'lp-tx fail' + (s <= 3 ? ' pulse' : '')}>
              <span className="lp-tx-ico">RW</span>
              <span className="lp-tx-main"><b>Transfer ke Rina</b><small>17 Nov · BI-FAST</small></span>
              <span className="lp-tx-r"><b>- Rp 500.000</b><small className="bad">Gagal</small></span>
            </div>
            <div className="lp-tx">
              <span className="lp-tx-ico">PL</span>
              <span className="lp-tx-main"><b>Token Listrik PLN</b><small>17 Nov · Pembayaran</small></span>
              <span className="lp-tx-r"><b>- Rp 205.000</b><small className="ok">Berhasil</small></span>
            </div>
            <div className="lp-tx">
              <span className="lp-tx-ico">KS</span>
              <span className="lp-tx-main"><b>Kopi Senja (QRIS)</b><small>16 Nov · QRIS</small></span>
              <span className="lp-tx-r"><b>- Rp 47.500</b><small className="ok">Berhasil</small></span>
            </div>
            <div className="lp-tabbar">
              <span className="on">Beranda</span>
              <span>Transfer</span>
              <span>Kartu</span>
            </div>
          </div>

          {/* notifikasi */}
          <div className={'lp-toast' + (s <= 2 && s >= 0 ? ' on' : '')}>
            <span className="lp-dot-bad" />
            <span><b>Transfer gagal</b><small>Rp 500.000 ke Rina Wijaya</small></span>
          </div>

          {/* tombol chat */}
          <div className={'lp-fab' + (s >= 3 && s <= 4 ? ' glow' : '') + (s === 4 ? ' tap' : '')}>
            <span className="lp-ring" />
            <span className="lp-ripple" />
            <Chat />
          </div>

          {/* maskot bingung */}
          <div className={'lp-mascot' + (showMascot ? ' on' : '') + (s === 4 ? ' to-fab' : '')}>
            {s >= 1 && s <= 3 && (
              <div key={s} className="lp-thought">{THOUGHTS[s]}</div>
            )}
            {s >= 1 && s <= 2 && (
              <>
                <span className="lp-q q1">?</span>
                <span className="lp-q q2">?</span>
                <span className="lp-q q3">?</span>
              </>
            )}
            <img key={pose} className={'lp-mimg ' + pose} src={`/assets/${pose}.png`} alt="" />
            <span className="lp-mshadow" />
          </div>

          {/* ---- sheet chat ---- */}
          <div className={'lp-sheet' + (chatOpen ? ' open' : '')}>
            <div className="lp-sh-head">
              <span className="lp-sh-ava"><img src={s >= 11 ? '/assets/cheer.png' : '/assets/ask.png'} alt="" /></span>
              <span className="lp-sh-name"><b>Agent Nusa</b><small><i />Online · Agent Nusa</small></span>
            </div>
            <div className={'lp-msgs' + (s === 11 ? ' dim' : '')}>
              {s >= 6 && <div className="lp-b user">Transfer ke Rina belum masuk, tolong dicek.</div>}
              {s === 7 && (
                <div className="lp-b bot typing"><i /><i /><i /></div>
              )}
              {s >= 8 && (
                <div className="lp-b bot">
                  Transfer BI-FAST ke Rina gagal karena gangguan di bank tujuan. Dana sudah kembali ke rekening Anda.
                  <div className="lp-b-card">
                    <span><small>17 Nov 2026 · 13:02</small><b>Rp 500.000</b></span>
                    <em>Gagal</em>
                  </div>
                </div>
              )}
              {s === 9 && <div className="lp-chipbtn">Coba transfer ulang</div>}
              {s >= 10 && <div className="lp-b user">Coba transfer ulang</div>}
              {s === 10 && (
                <div className="lp-b bot typing"><i /><i /><i /></div>
              )}
              {s >= 11 && <div className="lp-b bot">Beres! Transfer ke Rina berhasil.</div>}
            </div>
            <div className="lp-comp">
              <span>Tulis pertanyaan Anda</span>
              <span className="lp-send">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12 20 4l-4 16-4-6.5z" /></svg>
              </span>
            </div>
          </div>

          {/* ---- adegan sukses ---- */}
          {s === 11 && (
            <>
              <div className="lp-conf-box">
                {CONFETTI.map((c, i) => (
                  <span key={i} className="lp-conf" style={{ left: c.left + '%', animationDelay: 0.8 + c.delay + 's', animationDuration: c.dur + 's', background: c.color }} />
                ))}
              </div>
              <div className="lp-success">
                <img src="/assets/cheer.png" alt="" />
                <span className="lp-check">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <b>Transfer berhasil</b>
                <small>Rp 500.000 ke Rina Wijaya</small>
              </div>
            </>
          )}

          <span className="lp-home" />
        </div>
      </div>

      {!reduced && (
        <div className="lp-ctrl">
          <button type="button" className="lp-ghost" aria-pressed={!playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Jeda animasi' : 'Putar animasi'}
          </button>
          <button
            type="button"
            className="lp-ghost"
            onClick={() => {
              setStep(0);
              setPlaying(true);
            }}
          >
            Ulangi
          </button>
        </div>
      )}
    </div>
  );
}
