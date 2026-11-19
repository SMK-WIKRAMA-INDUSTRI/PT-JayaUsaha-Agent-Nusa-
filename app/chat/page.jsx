'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CHIPS, DEFAULTS, TXS, demoContext, normalizeSettings, rp } from '../../lib/data';
import { callChat } from '../../lib/api';

const LS_SETTINGS = 'nusa.settings.v1';
const LS_CHAT = 'nusa.chat.v1';
const POSES = { ask: 'ask', think: 'think', work: 'laptop', ok: 'ok', err: 'bow', alert: 'announce' };

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const readLS = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
};
const writeLS = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* penyimpanan penuh atau diblokir */
  }
};
const sendable = (m) => !m.err && !m.skip && !m.pending && m.content;

function Svg({ size = 20, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}
const ChatIcon = () => <Svg><path d="M20 12a8 8 0 0 1-11.7 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" /></Svg>;
const ListIcon = () => <Svg><path d="M4 7h16M4 12h16M4 17h10" /></Svg>;
const GearIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
const HeadsetIcon = () => <Svg size={18}><path d="M5 12a7 7 0 0 1 14 0v4a2 2 0 0 1-2 2h-1v-6h3M5 12v4a2 2 0 0 0 2 2h1v-6H5" /></Svg>;
const HomeIcon = () => <Svg><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></Svg>;
const SendIcon = () => <Svg strokeWidth="2"><path d="M4 12 20 4l-4 16-4-6.5z" /></Svg>;
const BankIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9.5 12 4l9 5.5" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" />
  </svg>
);

export default function Page() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('chat');
  const [settings, setSettings] = useState(DEFAULTS);
  const [draft, setDraft] = useState(DEFAULTS);
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pose, setPose] = useState('alert');
  const [statusErr, setStatusErr] = useState(false);
  const [txFilter, setTxFilter] = useState('all');
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState({ text: '', ok: null, running: false });
  const [toastMsg, setToastMsg] = useState('');

  const chatRef = useRef([]);
  const settingsRef = useRef(DEFAULTS);
  const abortRef = useRef(null);
  const poseTimer = useRef(null);
  const toastTimer = useRef(null);
  const errTimer = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);

  chatRef.current = chat;
  settingsRef.current = settings;

  /* ---------- muat & simpan ---------- */
  useEffect(() => {
    const s = { ...DEFAULTS, ...readLS(LS_SETTINGS, {}) };
    const saved = readLS(LS_CHAT, []);
    setSettings(s);
    setDraft(s);
    setChat(
      Array.isArray(saved)
        ? saved
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map((m) => ({ id: newId(), role: m.role, content: m.content }))
        : []
    );
    setView(s.apiKey ? 'chat' : 'settings');
    setReady(true);
    return () => {
      clearTimeout(poseTimer.current);
      clearTimeout(toastTimer.current);
      clearTimeout(errTimer.current);
    };
  }, []);

  useEffect(() => {
    if (ready) writeLS(LS_SETTINGS, settings);
  }, [ready, settings]);

  useEffect(() => {
    if (ready && !busy) writeLS(LS_CHAT, chat.filter(sendable).map(({ role, content }) => ({ role, content })));
  }, [ready, busy, chat]);

  useEffect(() => {
    clearTimeout(poseTimer.current);
    setPose(settings.apiKey ? 'ask' : 'alert');
  }, [settings.apiKey]);

  useEffect(() => {
    const el = messagesRef.current;
    if (view === 'chat' && el) el.scrollTop = el.scrollHeight;
  }, [chat, view, settings.apiKey]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = el.scrollHeight;
    el.style.height = h ? Math.min(h, 140) + 'px' : '';
  }, [input, view]);

  /* ---------- util tampilan ---------- */
  const showPose = (p, back = 0) => {
    clearTimeout(poseTimer.current);
    setPose(p);
    if (back) {
      poseTimer.current = setTimeout(() => setPose(settingsRef.current.apiKey ? 'ask' : 'alert'), back);
    }
  };
  const toast = (msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 3200);
  };
  const go = (v) => {
    setView(v);
    if (v === 'chat') setTimeout(() => inputRef.current && inputRef.current.focus({ preventScroll: true }), 0);
  };

  /* ---------- kirim pesan ---------- */
  const send = async (raw) => {
    const text = (raw || '').trim();
    if (!text || busy) return;
    const s = settingsRef.current;
    if (!s.apiKey) {
      toast('Isi API key dulu di Pengaturan AI.');
      go('settings');
      return;
    }
    go('chat');

    const uid = newId();
    const aid = newId();
    const history = [...chatRef.current.filter(sendable), { role: 'user', content: text }]
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));
    const messages = [{ role: 'system', content: s.systemPrompt + '\n\n' + demoContext() }, ...history];

    setChat((c) => [...c, { id: uid, role: 'user', content: text }, { id: aid, role: 'assistant', content: '', pending: true }]);
    setInput('');
    setBusy(true);
    showPose('work');

    const ac = new AbortController();
    abortRef.current = ac;
    let got = '';
    const dropReply = (extra) =>
      setChat((c) => {
        const next = c.filter((m) => m.id !== aid).map((m) => (m.id === uid ? { ...m, skip: true } : m));
        return extra ? [...next, extra] : next;
      });

    try {
      await callChat(
        s,
        messages,
        { maxTokens: Number(s.maxTokens) || 600, stream: !!s.stream, signal: ac.signal },
        (d) => {
          if (!got) showPose('think');
          got += d;
          setChat((c) => c.map((m) => (m.id === aid ? { ...m, content: got, pending: false } : m)));
        }
      );
      if (!got.trim()) throw new Error('Model mengembalikan jawaban kosong. Coba naikkan Max tokens atau matikan Reasoning.');
      showPose('ok', 2800);
    } catch (e) {
      if (e && e.name === 'AbortError') {
        if (!got.trim()) dropReply();
        showPose('ask');
      } else {
        dropReply({ id: newId(), role: 'assistant', content: (e && e.message) || 'Terjadi kesalahan.', err: true });
        showPose('err', 4000);
        setStatusErr(true);
        clearTimeout(errTimer.current);
        errTimer.current = setTimeout(() => setStatusErr(false), 4000);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const newChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setChat([]);
    showPose(settings.apiKey ? 'ask' : 'alert');
    toast('Percakapan baru dimulai.');
  };

  const callAgent = () => {
    setChat((c) => [
      ...c,
      {
        id: newId(),
        role: 'assistant',
        content:
          'Permintaan Anda sudah diteruskan ke agen beserta ringkasan percakapan. Mohon tunggu, agen akan segera melanjutkan. (Mode demo: belum terhubung ke contact center sungguhan.)'
      }
    ]);
    showPose('alert', 3500);
  };

  /* ---------- pengaturan ---------- */
  const upd = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const saveSettings = (e) => {
    e.preventDefault();
    const s = normalizeSettings(draft);
    setSettings(s);
    setDraft(s);
    setTest({ text: 'Tersimpan.', ok: true, running: false });
    toast('Pengaturan tersimpan.');
  };

  const runTest = async () => {
    const s = normalizeSettings(draft);
    setTest({ text: 'Menguji koneksi…', ok: null, running: true });
    try {
      const t0 = performance.now();
      let got = '';
      await callChat(s, [{ role: 'user', content: 'Balas dengan satu kata saja: siap' }], { maxTokens: 32, stream: false }, (d) => {
        got += d;
      });
      const ms = Math.round(performance.now() - t0);
      setTest({
        text: `Berhasil (${ms} ms). Jawaban model: "${got.trim().slice(0, 80) || '(kosong)'}". Jangan lupa klik Simpan pengaturan.`,
        ok: true,
        running: false
      });
    } catch (e) {
      setTest({ text: (e && e.message) || 'Gagal menguji koneksi.', ok: false, running: false });
    }
  };

  const clearKey = () => {
    setSettings((s) => ({ ...s, apiKey: '' }));
    setDraft((d) => ({ ...d, apiKey: '' }));
    setTest({ text: 'API key dihapus dari browser ini.', ok: null, running: false });
  };

  const resetDefaults = () => {
    const s = { ...DEFAULTS, apiKey: settings.apiKey };
    setSettings(s);
    setDraft(s);
    setTest({ text: 'Pengaturan dikembalikan ke default (API key dipertahankan).', ok: null, running: false });
  };

  /* ---------- turunan ---------- */
  const connected = ready && !!settings.apiKey;
  const poseFile = POSES[pose] || 'ask';
  const txs = TXS.filter((t) => txFilter === 'all' || t.dir === txFilter);
  const statusText = !ready
    ? 'Memuat…'
    : connected
    ? 'Online · Asisten virtual Agent Nusa'
    : 'Belum terhubung · atur API key di Pengaturan AI';

  const askAbout = (t) => {
    setInput(`Tolong jelaskan transaksi "${t.name}" ${rp(t.amt)} tanggal ${t.date}.`);
    go('chat');
  };

  const navItems = [
    ['chat', 'Chat Bantuan', <ChatIcon key="c" />],
    ['history', 'Riwayat Transaksi', <ListIcon key="h" />],
    ['settings', 'Pengaturan AI', <GearIcon key="s" />]
  ];

  return (
    <div className="app" data-view={view}>
      <div className="bg" aria-hidden="true">
        <span className="orb o1" />
        <span className="orb o2" />
        <span className="orb o3" />
      </div>

      <div className="shell">
        {/* SIDEBAR */}
        <aside className="glass side" aria-label="Menu utama">
          <div className="brand">
            <div className="brand-mark"><BankIcon /></div>
            <span>Agent Nusa</span>
          </div>
          <nav className="nav" aria-label="Navigasi">
            <Link href="/" className="nav-item">
              <HomeIcon />
              Beranda
            </Link>
            {navItems.map(([k, label, icon]) => (
              <button key={k} type="button" className="nav-item" aria-current={view === k ? 'page' : undefined} onClick={() => go(k)}>
                {icon}
                {label}
              </button>
            ))}
          </nav>
          <div className="side-spacer" />
          <div className="mascot-card">
            <img src="/assets/hero.png" alt="Maskot Bantu melambaikan tangan" className="mascot-hero" />
            <div className="mascot-title">Ada yang bisa kami bantu?</div>
            <div className="mascot-sub">Bantu siaga 24 jam untuk transaksi dan kartu Anda.</div>
          </div>
        </aside>

        {/* CHAT */}
        <main className="glass chat" aria-label="Chat bantuan">
          <header className="chat-head">
            <div className="avatar">
              <img key={poseFile} src={`/assets/${poseFile}.png`} alt="" className={'p-' + poseFile} />
            </div>
            <div className="chat-title">
              <div className="chat-name">Bantu</div>
              <div className="chat-status">
                <span className={'dot' + (statusErr ? ' err' : connected ? ' on' : '')} />
                <span>{statusText}</span>
              </div>
            </div>
            <button type="button" className="btn ghost" onClick={newChat}>Chat baru</button>
            <button type="button" className="btn ghost" onClick={callAgent}>
              <HeadsetIcon />
              <span className="hide-sm">Hubungi agen</span>
            </button>
          </header>

          <div className="messages" ref={messagesRef} role="log" aria-live="polite" aria-label="Percakapan">
            <div className="stamp">Hari ini, 14:12</div>
            <div className="msg bot">
              Halo, Dimas! Saya Bantu, asisten virtual Agent Nusa. Pilih topik di bawah atau ketik pertanyaan Anda.
              <span className="small">Demi keamanan, jangan pernah membagikan PIN, password, atau kode OTP kepada siapa pun, termasuk kami.</span>
            </div>
            {ready && !settings.apiKey && (
              <div className="msg bot">
                Bantu belum bisa menjawab karena API key belum diisi.
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => go('settings')}>Atur API key</button>
                </div>
              </div>
            )}
            {chat.map((m) => (
              <div key={m.id} className={'msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.err ? ' err' : '')}>
                {m.pending ? (
                  <span className="typing" role="img" aria-label="Bantu sedang mengetik"><i /><i /><i /></span>
                ) : (
                  m.content
                )}
              </div>
            ))}
          </div>

          <div className="composer-wrap">
            <div className="chips">
              {CHIPS.map(([label, text]) => (
                <button key={label} type="button" className="chip" disabled={busy} onClick={() => send(text)}>
                  {label}
                </button>
              ))}
            </div>
            <form
              className="composer"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <label htmlFor="input" className="sr">Tulis pesan</label>
              <textarea
                id="input"
                ref={inputRef}
                rows={1}
                maxLength={2000}
                placeholder="Tulis pertanyaan Anda di sini"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              {busy && (
                <button type="button" className="icon-btn" aria-label="Hentikan jawaban" onClick={() => abortRef.current && abortRef.current.abort()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
                </button>
              )}
              <button type="submit" className="send" aria-label="Kirim pesan" disabled={busy}>
                <SendIcon />
              </button>
            </form>
          </div>
        </main>

        {/* TRANSAKSI */}
        <section className="glass tx" aria-label="Riwayat transaksi">
          <div className="balance">
            <div className="balance-sm">Tabungan Agent Nusa · •••• 4821</div>
            <div className="balance-big">Rp 24.380.500</div>
            <div className="balance-sm">Data demo · saldo per 17 Nov 2026, 14:12</div>
          </div>
          <div className="tx-head">
            <h2>Riwayat Transaksi</h2>
            <span className="tx-note">Ketuk untuk tanya Bantu</span>
          </div>
          <div className="tabs" role="group" aria-label="Filter transaksi">
            {[['all', 'Semua'], ['in', 'Masuk'], ['out', 'Keluar']].map(([k, l]) => (
              <button key={k} type="button" className="tab" aria-pressed={txFilter === k} onClick={() => setTxFilter(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="tx-list">
            {txs.map((t) => (
              <button
                key={t.name + t.date + t.time}
                type="button"
                className="tx-row"
                aria-label={`${t.name}, ${t.dir === 'in' ? 'masuk' : 'keluar'} ${rp(t.amt)}, ${t.status}. Tanyakan ke Bantu`}
                onClick={() => askAbout(t)}
              >
                <span className="tx-ava" aria-hidden="true">{t.ini}</span>
                <span className="tx-main">
                  <span className="tx-name">{t.name}</span>
                  <span className="tx-meta">{`${t.date} · ${t.time} · ${t.channel}`}</span>
                </span>
                <span className="tx-right">
                  <span className={'tx-amt' + (t.dir === 'in' ? ' in' : '')}>{(t.dir === 'in' ? '+ ' : '- ') + rp(t.amt)}</span>
                  <span className={'tx-st ' + t.st}>{t.status}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* PENGATURAN */}
        <section className="glass settings" aria-label="Pengaturan AI">
          <div className="settings-inner">
            <header className="settings-head">
              <div className="avatar"><img src="/assets/laptop.png" alt="" /></div>
              <div>
                <h1>Pengaturan AI</h1>
                <p>Masukkan API key Netra Runtime agar Bantu bisa menjawab. Pengaturan disimpan di browser ini saja.</p>
              </div>
            </header>

            <form onSubmit={saveSettings} autoComplete="off" noValidate>
              <fieldset className="group">
                <legend>Koneksi</legend>

                <div className="field">
                  <label htmlFor="apiKey"><span>API key</span></label>
                  <div className="with-btn">
                    <input
                      id="apiKey"
                      type={showKey ? 'text' : 'password'}
                      placeholder="Tempel API key Netra di sini"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      value={draft.apiKey}
                      onChange={upd('apiKey')}
                    />
                    <button type="button" className="btn ghost" aria-pressed={showKey} onClick={() => setShowKey((v) => !v)}>
                      {showKey ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>
                  <small>Key tersimpan di browser Anda dan dikirim lewat server aplikasi ini ke API Netra. Jangan bagikan layar ini saat key terlihat.</small>
                </div>

                <div className="field">
                  <label htmlFor="model"><span>Model ID</span></label>
                  <input id="model" type="text" placeholder="deepseek/deepseek-v4.1-flash" spellCheck={false} value={draft.model} onChange={upd('model')} />
                  <small>Harus sama persis dengan katalog akun Netra Anda. Endpoint: <code>POST https://api.netraruntime.com/v1/chat/completions</code>.</small>
                </div>
              </fieldset>

              <fieldset className="group">
                <legend>Perilaku AI</legend>

                <div className="field">
                  <label htmlFor="systemPrompt"><span>System prompt</span></label>
                  <textarea id="systemPrompt" rows={7} value={draft.systemPrompt} onChange={upd('systemPrompt')} />
                  <small>Data demo nasabah (saldo dan riwayat transaksi) otomatis ditambahkan di belakang prompt ini.</small>
                </div>

                <div className="grid3">
                  <div className="field">
                    <label htmlFor="maxTokens"><span>Max tokens</span></label>
                    <input id="maxTokens" type="number" min="16" max="8192" step="16" value={draft.maxTokens} onChange={upd('maxTokens')} />
                  </div>
                  <div className="field">
                    <label htmlFor="temperature"><span>Temperature</span></label>
                    <input id="temperature" type="number" min="0" max="2" step="0.1" value={draft.temperature} onChange={upd('temperature')} />
                  </div>
                  <div className="field">
                    <label htmlFor="reasoning"><span>Reasoning</span></label>
                    <select id="reasoning" value={draft.reasoning} onChange={upd('reasoning')}>
                      <option value="off">Matikan (cepat)</option>
                      <option value="low">Low</option>
                      <option value="high">High</option>
                      <option value="max">Max</option>
                      <option value="omit">Tidak dikirim</option>
                    </select>
                  </div>
                </div>

                <label className="check" htmlFor="stream">
                  <input id="stream" type="checkbox" checked={!!draft.stream} onChange={upd('stream')} />
                  <span>Tampilkan jawaban bertahap (streaming)</span>
                </label>
              </fieldset>

              <div className="actions">
                <button type="submit" className="btn primary">Simpan pengaturan</button>
                <button type="button" className="btn ghost" disabled={test.running} onClick={runTest}>Uji koneksi</button>
                <button type="button" className="btn ghost danger" onClick={clearKey}>Hapus API key</button>
                <button type="button" className="btn ghost" onClick={resetDefaults}>Kembalikan default</button>
              </div>
              <div className={'test-result' + (test.ok === true ? ' ok' : test.ok === false ? ' bad' : '')} role="status" aria-live="polite">
                {test.text}
              </div>
            </form>
          </div>
        </section>
      </div>

      <nav className="glass bottom-nav" aria-label="Navigasi bawah">
        <Link href="/" className="nav-item">Beranda</Link>
        {[['chat', 'Chat'], ['history', 'Riwayat'], ['settings', 'Pengaturan']].map(([k, l]) => (
          <button key={k} type="button" className="nav-item" aria-current={view === k ? 'page' : undefined} onClick={() => go(k)}>
            {l}
          </button>
        ))}
      </nav>

      <div className={'toast' + (toastMsg ? ' show' : '')} role="status" aria-live="polite">{toastMsg}</div>
    </div>
  );
}
