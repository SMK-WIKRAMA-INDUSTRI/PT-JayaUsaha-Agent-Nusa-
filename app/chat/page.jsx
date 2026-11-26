'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CHIPS, DEFAULTS, TXS, demoContext, normalizeSettings, rp } from '../../lib/data';
import { callChat } from '../../lib/api';

const LS_SETTINGS = 'nusa.settings.v1';
const LS_CHAT = 'nusa.chat.v1';
const POSES = { ask: 'ask', think: 'think', work: 'laptop', ok: 'ok', err: 'bow', alert: 'announce' };

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
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
const readImageDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Gambar tidak dapat dibaca.'));
    reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
    reader.readAsDataURL(file);
  });

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
const AttachIcon = () => <Svg><path d="m8 12.5 6.8-6.8a3.5 3.5 0 0 1 5 5l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.4-8.4" /></Svg>;
const MicIcon = () => <Svg><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" /></Svg>;
const StopIcon = () => <Svg><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>;
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
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pose, setPose] = useState('alert');
  const [statusErr, setStatusErr] = useState(false);
  const [txFilter, setTxFilter] = useState('all');
  const [apiStatus, setApiStatus] = useState('checking');
  const [test, setTest] = useState({ text: '', ok: null, running: false });
  const [toastMsg, setToastMsg] = useState('');

  const chatRef = useRef([]);
  const settingsRef = useRef(DEFAULTS);
  const abortRef = useRef(null);
  const poseTimer = useRef(null);
  const toastTimer = useRef(null);
  const errTimer = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesRef = useRef(null);
  const attachmentsRef = useRef([]);
  const recorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const sendLockRef = useRef(false);

  chatRef.current = chat;
  settingsRef.current = settings;
  attachmentsRef.current = attachments;

  /* ---------- muat & simpan ---------- */
  useEffect(() => {
    const stored = readLS(LS_SETTINGS, {});
    const safeSettings = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};
    delete safeSettings.apiKey;
    localStorage.removeItem(LS_SETTINGS);
    const s = { ...DEFAULTS, ...safeSettings };
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
    setView('chat');
    setReady(true);
    return () => {
      clearTimeout(poseTimer.current);
      clearTimeout(toastTimer.current);
      clearTimeout(errTimer.current);
      clearTimeout(recordTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      if (recordingStreamRef.current) recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/chat', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('Status konfigurasi tidak dapat diperiksa.');
        return res.json();
      })
      .then((data) => {
        if (active && typeof data.configured === 'boolean') {
          setApiStatus(data.configured ? 'configured' : 'missing');
        } else if (active) {
          setApiStatus('error');
        }
      })
      .catch(() => {
        if (active) setApiStatus('error');
      });
    return () => {
      active = false;
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
    setPose(apiStatus === 'configured' ? 'ask' : 'alert');
  }, [apiStatus]);

  useEffect(() => {
    const el = messagesRef.current;
    if (view === 'chat' && el) el.scrollTop = el.scrollHeight;
  }, [chat, view]);

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
      poseTimer.current = setTimeout(() => setPose(apiStatus === 'configured' ? 'ask' : 'alert'), back);
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
  const send = async (raw, selectedAttachments = attachments) => {
    const typedText = (raw || '').trim();
    if ((!typedText && selectedAttachments.length === 0) || busy || sendLockRef.current) return;
    const s = settingsRef.current;
    if (apiStatus !== 'configured') {
      toast(apiStatus === 'missing' ? 'API belum dikonfigurasi di server.' : 'Status konfigurasi API belum tersedia.');
      go('settings');
      return;
    }
    go('chat');
    sendLockRef.current = true;
    setBusy(true);
    showPose('work');

    const text = typedText || 'Tolong jelaskan gambar yang saya lampirkan.';
    let imageBlocks = [];
    try {
      imageBlocks = await Promise.all(
        selectedAttachments.map(async ({ file }) => ({
          type: 'image_url',
          image_url: { url: await readImageDataUrl(file) }
        }))
      );
    } catch (e) {
      toast((e && e.message) || 'Gambar tidak dapat dibaca.');
      sendLockRef.current = false;
      setBusy(false);
      showPose('ask');
      return;
    }

    const displayText = [text, ...selectedAttachments.map(({ file }) => `[Gambar: ${file.name}]`)].join('\n');
    const uid = newId();
    const aid = newId();
    const history = chatRef.current.filter(sendable)
      .slice(-19)
      .map(({ role, content }) => ({ role, content }));
    const currentContent = imageBlocks.length
      ? [{ type: 'text', text }, ...imageBlocks]
      : text;
    const messages = [
      { role: 'system', content: s.systemPrompt + '\n\n' + demoContext() },
      ...history,
      { role: 'user', content: currentContent }
    ];

    setChat((c) => [...c, { id: uid, role: 'user', content: displayText }, { id: aid, role: 'assistant', content: '', pending: true }]);
    setInput('');
    selectedAttachments.forEach(({ preview }) => URL.revokeObjectURL(preview));
    setAttachments([]);
    setAttachmentError('');

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
      sendLockRef.current = false;
      setBusy(false);
    }
  };

  const handleFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    setAttachmentError('');

    const accepted = [];
    for (const file of selected) {
      if (!IMAGE_TYPES.has(file.type)) {
        setAttachmentError('Gunakan gambar PNG, JPG, atau WebP.');
      } else if (file.size > MAX_IMAGE_BYTES) {
        setAttachmentError('Ukuran maksimal tiap gambar adalah 5 MB.');
      } else if (attachments.length + accepted.length >= MAX_IMAGES) {
        setAttachmentError('Maksimal 3 gambar dalam satu pesan.');
      } else {
        accepted.push({ id: newId(), file, preview: URL.createObjectURL(file) });
      }
    }

    if (accepted.length) setAttachments((current) => [...current, ...accepted]);
  };

  const removeAttachment = (id) => {
    const item = attachments.find((attachment) => attachment.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const releaseRecording = () => {
    clearTimeout(recordTimerRef.current);
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
    recorderRef.current = null;
  };

  const transcribeAudio = async (blob) => {
    setTranscribing(true);
    setVoiceError('');
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Transkripsi gagal.');
      if (typeof result.transcript !== 'string' || !result.transcript.trim()) {
        throw new Error('Tidak ada ucapan yang terdeteksi. Coba rekam lebih dekat ke mikrofon.');
      }
      setInput((current) => `${current.trimEnd()}${current.trim() ? ' ' : ''}${result.transcript.trim()}`);
      inputRef.current?.focus({ preventScroll: true });
    } catch (e) {
      setVoiceError((e && e.message) || 'Transkripsi gagal. Coba lagi.');
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    setVoiceError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('Perekaman suara tidak didukung browser ini. Gunakan browser modern melalui HTTPS.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => setVoiceError('Perekaman gagal. Periksa izin mikrofon lalu coba lagi.');
      recorder.onstop = () => {
        const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        releaseRecording();
        setRecording(false);
        if (audio.size) void transcribeAudio(audio);
        else setVoiceError('Audio kosong. Coba rekam lagi.');
      };
      recorder.start();
      setRecording(true);
      recordTimerRef.current = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 60000);
    } catch {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setVoiceError('Tidak dapat mengakses mikrofon. Izinkan akses mikrofon lalu coba lagi.');
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const clearAttachments = () => {
    attachments.forEach(({ preview }) => URL.revokeObjectURL(preview));
    setAttachments([]);
    setAttachmentError('');
  };

  const newChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setChat([]);
    clearAttachments();
    showPose(apiStatus === 'configured' ? 'ask' : 'alert');
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

  const resetDefaults = () => {
    const s = { ...DEFAULTS };
    setSettings(s);
    setDraft(s);
    setTest({ text: 'Pengaturan dikembalikan ke default.', ok: null, running: false });
  };

  /* ---------- turunan ---------- */
  const connected = ready && apiStatus === 'configured';
  const poseFile = POSES[pose] || 'ask';
  const txs = TXS.filter((t) => txFilter === 'all' || t.dir === txFilter);
  const statusText = !ready
    ? 'Memuat…'
    : apiStatus === 'configured'
    ? 'Online · Asisten virtual Agent Nusa'
    : apiStatus === 'missing'
    ? 'API belum dikonfigurasi di server'
    : apiStatus === 'error'
    ? 'Status API tidak dapat diperiksa'
    : 'Memeriksa konfigurasi API…';

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
            <img src="/assets/hero.png" alt="Maskot Agent Nusa melambaikan tangan" className="mascot-hero" />
            <div className="mascot-title">Ada yang bisa kami bantu?</div>
            <div className="mascot-sub">Agent Nusa siaga 24 jam untuk transaksi dan kartu Anda.</div>
          </div>
        </aside>

        {/* CHAT */}
        <main className="glass chat" aria-label="Chat bantuan">
          <header className="chat-head">
            <div className="avatar">
              <img key={poseFile} src={`/assets/${poseFile}.png`} alt="" className={'p-' + poseFile} />
            </div>
            <div className="chat-title">
              <div className="chat-name">Agent Nusa</div>
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
              Halo, Dimas! Saya Agent Nusa. Pilih topik di bawah atau ketik pertanyaan Anda.
              <span className="small">Demi keamanan, jangan pernah membagikan PIN, password, atau kode OTP kepada siapa pun, termasuk kami.</span>
            </div>
            {ready && apiStatus !== 'configured' && (
              <div className="msg bot">
                {apiStatus === 'missing'
                  ? 'Agent Nusa belum aktif. Admin perlu mengatur NETRA_API_KEY di environment server dan menjalankan ulang aplikasi.'
                  : apiStatus === 'error'
                  ? 'Status konfigurasi Agent Nusa belum dapat diperiksa. Coba muat ulang halaman atau periksa koneksi server.'
                  : 'Agent Nusa sedang memeriksa konfigurasi server.'}
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => go('settings')}>Lihat status konfigurasi</button>
                </div>
              </div>
            )}
            {chat.map((m) => (
              <div key={m.id} className={'msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.err ? ' err' : '')}>
                {m.pending ? (
                  <span className="typing" role="img" aria-label="Agent Nusa sedang mengetik"><i /><i /><i /></span>
                ) : (
                  m.content
                )}
              </div>
            ))}
          </div>

          <div className="composer-wrap">
            <input
              ref={fileInputRef}
              className="sr"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleFiles}
              tabIndex={-1}
              aria-hidden="true"
            />
            <div className="composer-tools">
              <button
                type="button"
                className="tool-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || recording || transcribing || attachments.length >= MAX_IMAGES}
              >
                <AttachIcon />
                <span>Gambar ({attachments.length}/{MAX_IMAGES})</span>
              </button>
              {recording ? (
                <button type="button" className="tool-button recording" onClick={stopRecording}>
                  <StopIcon />
                  <span>Hentikan rekaman</span>
                </button>
              ) : (
                <button type="button" className="tool-button" onClick={startRecording} disabled={busy || transcribing}>
                  <MicIcon />
                  <span>{transcribing ? 'Mentranskripsi…' : 'Voice to text'}</span>
                </button>
              )}
              {recording && <span className="tool-status" role="status">Merekam · maksimal 60 detik</span>}
            </div>
            {attachments.length > 0 && (
              <div className="attachment-list" aria-label="Gambar terlampir">
                {attachments.map(({ id, file, preview }) => (
                  <div className="attachment-item" key={id}>
                    <img src={preview} alt="" />
                    <span title={file.name}>{file.name}</span>
                    <button type="button" aria-label={`Hapus ${file.name}`} onClick={() => removeAttachment(id)}>×</button>
                  </div>
                ))}
              </div>
            )}
            {(attachmentError || voiceError) && (
              <p className="tool-error" role="status">{attachmentError || voiceError}</p>
            )}
            <p className="tool-disclosure">Gambar dikirim ke Netra untuk menjawab. Audio dikirim ke Deepgram hanya untuk transkripsi.</p>
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
                send(input, attachments);
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
                    send(input, attachments);
                  }
                }}
              />
              {busy && (
                <button type="button" className="icon-btn" aria-label="Hentikan jawaban" onClick={() => abortRef.current && abortRef.current.abort()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
                </button>
              )}
              <button
                type="submit"
                className="send"
                aria-label="Kirim pesan"
                disabled={busy || recording || transcribing || (!input.trim() && attachments.length === 0)}
              >
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
            <span className="tx-note">Ketuk untuk tanya Agent Nusa</span>
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
                aria-label={`${t.name}, ${t.dir === 'in' ? 'masuk' : 'keluar'} ${rp(t.amt)}, ${t.status}. Tanyakan ke Agent Nusa`}
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
                <p>API key dikelola di environment server, tidak dikirim atau disimpan di browser. Preferensi model dan percakapan disimpan lokal.</p>
              </div>
            </header>

            <form onSubmit={saveSettings} autoComplete="off" noValidate>
              <fieldset className="group">
                <legend>Koneksi</legend>

                <div className="field">
                  <span>Status koneksi</span>
                  <strong>{apiStatus === 'configured' ? 'Terhubung' : apiStatus === 'missing' ? 'Belum dikonfigurasi' : apiStatus === 'error' ? 'Tidak dapat diperiksa' : 'Memeriksa…'}</strong>
                  <small>
                    {apiStatus === 'missing'
                      ? 'Tambahkan NETRA_API_KEY ke file .env.local untuk pengembangan, atau ke pengaturan environment deployment. Restart server setelah mengubahnya.'
                      : 'Kredensial disimpan hanya di server sebagai NETRA_API_KEY. Browser hanya menerima status konfigurasi, bukan nilai key.'}
                  </small>
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
