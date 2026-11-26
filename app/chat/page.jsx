'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CHIPS, DEFAULTS, MAX_CONTEXT, normalizeSettings, rp } from '../../lib/data';
import { addAttachment, callChat, createSession, demoBelanja, demoBoros, demoGaji, demoReset, getSessionMessages, listSessions, openNotification } from '../../lib/api';
import RencanaCard from './RencanaCard';
import PengeluaranCard from './PengeluaranCard';
import RingkasanCard from './RingkasanCard';
import NotifBell from './NotifBell';
import DemoPanel from './DemoPanel';
import { fmtWaktu } from '../../lib/format';
import { labelKategori } from '../../lib/kategori';
import { createClient } from '../../lib/supabase/browser';
import { extractPdfText } from '../../lib/pdf';
import { MAX_RECORDING_SECONDS, collectTranscript, getMicrophone, openDeepgramSocket, pickRecorderMime } from '../../lib/voice';
import {
  CHECKING_DELAY_MS,
  CHECKING_LINES,
  STILL_CHECKING_DELAY_MS,
  STILL_CHECKING_LINE,
  THANKS_FOR_WAITING_LINES,
  buildGreeting,
  createAgentAudio,
  getLineAudio,
  needsChecking,
  pickRandom,
  playAudio,
  requestSpeech,
  settlesWithin
} from '../../lib/speech';

const LS_SETTINGS = 'nusa.settings.v2'; // hanya key Deepgram; key Netra sekarang di server
const LS_OLD = ['nusa.settings.v1', 'nusa.chat.v1', 'nusa.docs.v1']; // data versi lama, dihapus saat halaman dibuka
const LS_SESSION = 'nusa.session.v1'; // id Sesi Percakapan terakhir yang dibuka
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const fmtNum = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
const fmtClock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
// Teks bot yang sedang dibacakan: hanya bagian yang sudah diucapkan yang tampil.
const visibleText = (m) => (typeof m.shown === 'number' ? m.content.slice(0, m.shown) : m.content);
// Pesan dari database -> isi chat. Lampiran tidak ditampilkan. Kartu (Rencana, dan kartu hasil tool) menjadi komponen,
// pembaruan menjadi catatan kecil. Baris assistant tanpa teks (hanya panggilan tool) tidak tampil.
const toChat = (rows) =>
  rows.flatMap((m) => {
    if (m.role === 'user' || (m.role === 'assistant' && m.content)) return [{ id: 'db' + m.id, role: m.role, content: m.content }];
    if (m.role === 'kartu' && m.card && m.card.jenis === 'rencana') return [{ id: 'db' + m.id, role: 'card', card: m.card }];
    if (m.role === 'pembaruan') return [{ id: 'db' + m.id, role: 'note', content: m.content.split('\n')[0] }];
    if (m.role === 'tool' && m.card) return [{ id: 'db' + m.id, role: 'card', card: m.card }];
    return [];
  });
// Nama file dari isi lampiran "[Dokumen: nama]\n...".
const lampiranName = (content) => content.split('\n')[0].replace(/^\[Dokumen: /, '').replace(/\]$/, '');
// Transaksi dari database -> baris panel riwayat.
const toTxRow = (t) => ({
  id: t.id,
  ini: t.pihak.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
  name: t.pihak,
  waktu: fmtWaktu(t.waktu),
  channel: t.kanal + (t.kategori_belanja ? ' · ' + labelKategori(t.kategori_belanja) : ''),
  amt: Number(t.nominal),
  dir: t.arah === 'masuk' ? 'in' : 'out',
  st: t.status === 'berhasil' ? 'ok' : t.status === 'gagal' ? 'fail' : 'wait',
  status: t.status === 'berhasil' ? 'Berhasil' : t.status === 'gagal' ? 'Gagal' : 'Diproses'
});

// Melepas semua benda yang hidup selama merekam: timer, perekam, mikrofon, dan WebSocket.
function teardownDictation(d) {
  clearTimeout(d.timer);
  try {
    if (d.recorder && d.recorder.state !== 'inactive') d.recorder.stop();
  } catch {
    /* perekam sudah berhenti */
  }
  if (d.stream) d.stream.getTracks().forEach((track) => track.stop()); // mematikan mikrofon
  if (d.socket && (d.socket.readyState === WebSocket.OPEN || d.socket.readyState === WebSocket.CONNECTING)) d.socket.close();
}

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
const MicIcon = () => <Svg strokeWidth="2.2"><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V22M8 22h8" /></Svg>;
const PhoneIcon = () => (
  <Svg size={18}>
    <path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" />
  </Svg>
);
const StopIcon = () => <Svg fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2.5" /></Svg>;
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
  const [showDgKey, setShowDgKey] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('idle'); // 'idle' | 'connecting' | 'recording' | 'transcribing'
  const [callStatus, setCallStatusState] = useState('off'); // 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking'
  const [callTranscript, setCallTranscript] = useState('');
  const [callSeconds, setCallSeconds] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]); // { id, created_at, updated_at, dimulai_oleh }
  const [account, setAccount] = useState(null); // { nomor_akhir, saldo_total, nama }
  const [txRows, setTxRows] = useState([]);
  const [kantong, setKantong] = useState([]); // [{ pocket_id, nama, jenis, saldo }]
  const [notifications, setNotifications] = useState([]); // [{ id, isi, dibaca_at, created_at }]
  const [demoBusy, setDemoBusy] = useState(false);
  const [cardTick, setCardTick] = useState(0); // naik setiap kali data berubah, kartu memuat ulang statusnya
  const [toastMsg, setToastMsg] = useState('');
  const [documents, setDocuments] = useState([]); // lampiran sesi ini: { id, name, chars }
  const [pdfStatus, setPdfStatus] = useState({ text: '', ok: null, reading: false });

  const chatRef = useRef([]);
  const settingsRef = useRef(DEFAULTS);
  const sessionRef = useRef(null);
  const abortRef = useRef(null);
  const poseTimer = useRef(null);
  const toastTimer = useRef(null);
  const errTimer = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);
  const micRef = useRef(null);
  const dictationRef = useRef(null); // sesi rekaman yang sedang berjalan, null bila tidak merekam
  const sendRef = useRef(null);
  // Benda yang hidup selama panggilan (WebSocket, mikrofon, perekam, timer, suara agent). null bila tidak menelepon.
  const callRef = useRef(null);
  const endCallRef = useRef(null);

  chatRef.current = chat;
  settingsRef.current = settings;
  sessionRef.current = sessionId;

  /* ---------- muat & simpan ---------- */
  useEffect(() => {
    const old = readLS('nusa.settings.v1', {});
    const s = { ...DEFAULTS, ...(old.deepgramKey ? { deepgramKey: old.deepgramKey } : {}), ...readLS(LS_SETTINGS, {}) };
    LS_OLD.forEach((k) => {
      try {
        localStorage.removeItem(k); // termasuk key Netra lama yang dulu disimpan di browser
      } catch {
        /* penyimpanan diblokir */
      }
    });
    setSettings(s);
    setDraft(s);
    // StrictMode memasang efek dua kali: pemasangan pertama yang sudah dibongkar tidak boleh membuat sesi.
    let cancelled = false;
    loadFinance().catch(() => toast('Data rekening gagal dimuat.'));
    loadNotifications().catch(() => {});
    // Notifikasi Gajian baru dikirim Supabase Realtime (spec 5.2). RLS memastikan hanya notifikasi milik sendiri.
    const supabase = createClient();
    let channel = null;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data || !data.user) return;
      channel = supabase
        .channel('notifikasi-' + data.user.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${data.user.id}` }, (payload) => {
          const n = payload.new;
          setNotifications((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list]));
          toast(n.isi);
        })
        .subscribe();
    });
    (async () => {
      try {
        const list = await listSessions();
        if (cancelled) return;
        setSessions(list);
        const last = readLS(LS_SESSION, null);
        const pick = list.find((x) => x.id === last) || list[0];
        if (pick) await openSession(pick.id);
        else await startNewSession();
      } catch (e) {
        if (!cancelled) toast((e && e.message) || 'Percakapan gagal dimuat.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      clearTimeout(poseTimer.current);
      clearTimeout(toastTimer.current);
      clearTimeout(errTimer.current);
      // Halaman ditutup saat merekam: matikan mikrofon dan sambungan tanpa mengirim apa pun.
      const d = dictationRef.current;
      if (d) {
        d.cancelled = true;
        dictationRef.current = null;
        teardownDictation(d);
      }
      if (callRef.current) endCallRef.current(callRef.current, '', true);
      if (abortRef.current) abortRef.current.abort(); // menghentikan suara jawaban yang sedang diputar
    };
  }, []);

  useEffect(() => {
    if (ready) writeLS(LS_SETTINGS, settings);
  }, [ready, settings]);

  useEffect(() => {
    clearTimeout(poseTimer.current);
    setPose(sessionId ? 'ask' : 'alert');
  }, [sessionId]);

  useEffect(() => {
    const el = messagesRef.current;
    if (view === 'chat' && el) el.scrollTop = el.scrollHeight;
  }, [chat, view, sessionId]);

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
      poseTimer.current = setTimeout(() => setPose(sessionRef.current ? 'ask' : 'alert'), back);
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

  /* ---------- data dari database ---------- */
  const loadFinance = async () => {
    const supabase = createClient();
    const [{ data: saldo, error: e1 }, { data: tx, error: e2 }, { data: profile, error: e3 }, { data: kt, error: e4 }] = await Promise.all([
      supabase.from('v_saldo_bebas').select('nomor_akhir, saldo_total, saldo_bebas').maybeSingle(),
      supabase.from('transactions').select('id, arah, nominal, pihak, kanal, status, waktu, kategori_belanja').order('waktu', { ascending: false }).limit(30),
      supabase.from('profiles').select('nama_panggilan').maybeSingle(),
      supabase.from('v_saldo_kantong').select('pocket_id, nama, jenis, saldo')
    ]);
    if (e1 || e2 || e3 || e4) throw new Error('Data rekening gagal dimuat.');
    if (saldo) setAccount({ ...saldo, nama: (profile && profile.nama_panggilan) || 'Nasabah' });
    setTxRows((tx || []).map(toTxRow));
    const urut = { dana_darurat: 0, goal: 1, investasi: 2, sosial: 3 };
    setKantong([...(kt || [])].sort((x, y) => (urut[x.jenis] ?? 9) - (urut[y.jenis] ?? 9) || x.nama.localeCompare(y.nama)));
  };

  const loadNotifications = async () => {
    const { data, error } = await createClient()
      .from('notifications')
      .select('id, isi, dibaca_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error('Notifikasi gagal dimuat.');
    setNotifications(data || []);
  };

  const openSession = async (id) => {
    const rows = await getSessionMessages(id);
    setSessionId(id);
    writeLS(LS_SESSION, id);
    setChat(toChat(rows));
    setDocuments(rows.filter((m) => m.role === 'lampiran').map((m) => ({ id: 'db' + m.id, name: lampiranName(m.content), chars: m.content.length })));
  };

  const startNewSession = async () => {
    const created = await createSession();
    setSessions((list) => [created, ...list]);
    setSessionId(created.id);
    writeLS(LS_SESSION, created.id);
    setChat([]);
    setDocuments([]);
  };

  const logout = async () => {
    await createClient().auth.signOut();
    try {
      localStorage.removeItem(LS_SESSION);
    } catch {
      /* penyimpanan diblokir */
    }
    window.location.href = '/login';
  };

  const refreshSession = () => {
    const sid = sessionRef.current;
    // Saat jawaban masih di-stream, memuat ulang riwayat akan menghapus gelembung yang sedang diisi.
    if (!sid || abortRef.current) return;
    openSession(sid).catch(() => {});
  };

  // Giliran atau tombol yang mengubah data: saldo dan status kartu dimuat ulang.
  const segarkanData = () => {
    loadFinance().catch(() => {});
    setCardTick((t) => t + 1);
  };

  const afterCardChange = () => {
    segarkanData();
    refreshSession(); // menampilkan catatan pembaruan dari kartu
  };

  const onDemoGaji = async () => {
    setDemoBusy(true);
    try {
      const res = await demoGaji();
      await Promise.all([loadFinance(), loadNotifications()]);
      toast(res.plan_id ? 'Gaji masuk. Buka lonceng notifikasi untuk mengatur pembagiannya.' : 'Gaji masuk, tetapi Rencana Alokasi gagal dibuat.');
    } catch (e) {
      toast((e && e.message) || 'Simulasi gaji gagal.');
    } finally {
      setDemoBusy(false);
    }
  };

  const onDemoBelanja = async () => {
    setDemoBusy(true);
    try {
      const res = await demoBelanja();
      await loadFinance();
      toast(`Belanja ${res.transaksi.pihak} ${rp(res.transaksi.nominal)} tercatat.`);
    } catch (e) {
      toast((e && e.message) || 'Simulasi belanja gagal.');
    } finally {
      setDemoBusy(false);
    }
  };

  const onDemoBoros = async () => {
    setDemoBusy(true);
    try {
      const res = await demoBoros();
      await loadFinance();
      toast(`Skenario boros: ${res.jumlah} transaksi, total ${rp(res.total)}. Coba tanya "Pengeluaranku bulan ini gimana?"`);
    } catch (e) {
      toast((e && e.message) || 'Skenario boros gagal.');
    } finally {
      setDemoBusy(false);
    }
  };

  const onDemoReset = async () => {
    if (!window.confirm('Reset data demo? Semua transaksi, Kantong, Goal, catatan pengeluaran, notifikasi, dan percakapan akan dihapus lalu dibuat ulang.')) return;
    setDemoBusy(true);
    try {
      await demoReset();
      try {
        localStorage.removeItem(LS_SESSION);
      } catch {
        /* penyimpanan diblokir */
      }
      setSessions([]);
      await startNewSession();
      await Promise.all([loadFinance(), loadNotifications()]);
      toast('Data demo dikembalikan ke kondisi awal.');
    } catch (e) {
      toast((e && e.message) || 'Reset data demo gagal.');
    } finally {
      setDemoBusy(false);
    }
  };

  const onOpenNotification = async (n) => {
    setDemoBusy(true);
    toast('Menyiapkan Rencana Alokasi…');
    try {
      const session = await openNotification(n.id);
      setSessions((list) => (list.some((x) => x.id === session.id) ? list : [session, ...list]));
      await openSession(session.id);
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, dibaca_at: x.dibaca_at || new Date().toISOString() } : x)));
      go('chat');
    } catch (e) {
      toast((e && e.message) || 'Notifikasi gagal dibuka.');
    } finally {
      setDemoBusy(false);
    }
  };

  /* ---------- kirim pesan ---------- */
  // voice: pertanyaan berasal dari mic, jadi jawabannya juga dibacakan dengan suara.
  const send = async (raw, { voice = false } = {}) => {
    const text = (raw || '').trim();
    if (!text || busy || dictationRef.current || callRef.current) return; // saat merekam, teks masih dikumpulkan
    const sid = sessionRef.current;
    if (!sid) {
      toast('Percakapan belum siap, coba lagi sebentar.');
      return;
    }
    go('chat');

    const uid = newId();
    const aid = newId();

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
    // Data disegarkan bila server mengirim baris sisipan, atau bila giliran gagal: server mungkin sudah
    // menjalankan Aksi Tertunda (uang berpindah) sebelum gagal dan membalas dengan error JSON.
    let segar = false;
    // Baris yang disisipkan server di tengah giliran (pembaruan, kartu) tampil sebelum gelembung balasan.
    const onEvent = (ev) => {
      if (!ev.pesan) return;
      segar = true;
      const items = toChat([ev.pesan]);
      setChat((c) => {
        const baru = items.filter((x) => !c.some((m) => m.id === x.id));
        const i = c.findIndex((m) => m.id === aid);
        return i < 0 ? [...c, ...baru] : [...c.slice(0, i), ...baru, ...c.slice(i)];
      });
    };

    try {
      await callChat(
        sid,
        text,
        { mode: 'text', signal: ac.signal },
        (d) => {
          if (!got) showPose('think');
          got += d;
          // Jawaban suara baru ditampilkan saat dibacakan, supaya teks berjalan seiring suara.
          if (!voice) setChat((c) => c.map((m) => (m.id === aid ? { ...m, content: got, pending: false } : m)));
        },
        onEvent
      );
      if (!got.trim()) throw new Error('Model mengembalikan jawaban kosong. Coba kirim ulang pertanyaan Anda.');
      if (voice) await speakReply(aid, got.trim(), ac.signal);
      showPose('ok', 2800);
    } catch (e) {
      segar = true;
      if (e && e.name === 'AbortError') {
        if (!got.trim()) dropReply();
        else if (voice) revealMessage(aid, got.trim()); // dihentikan saat suara diproses: teks tetap ditampilkan lengkap
        showPose('ask');
      } else {
        dropReply({ id: newId(), role: 'assistant', content: (e && e.message) || 'Terjadi kesalahan.', err: true });
        showPose('err', 4000);
        setStatusErr(true);
        clearTimeout(errTimer.current);
        errTimer.current = setTimeout(() => setStatusErr(false), 4000);
      }
    } finally {
      if (segar) segarkanData();
      abortRef.current = null;
      setBusy(false);
    }
  };

  sendRef.current = send;

  /* ---------- suara agent (Deepgram text to speech) ---------- */
  // Menampilkan seluruh teks pesan bot (tanpa animasi).
  const revealMessage = (id, content) =>
    setChat((c) => c.map((m) => (m.id === id ? { ...m, content: content ?? m.content, pending: false, shown: undefined } : m)));
  const setShown = (id, n) => setChat((c) => c.map((m) => (m.id === id ? { ...m, shown: n } : m)));

  // Membacakan jawaban chat. Teks muncul sejalan dengan suara. Kalau suara gagal, teks tetap ditampilkan lengkap.
  const speakReply = async (aid, text, signal) => {
    try {
      const audio = await createAgentAudio(await requestSpeech(settingsRef.current.deepgramKey, text, signal));
      setChat((c) => c.map((m) => (m.id === aid ? { ...m, content: text, pending: false, shown: 0 } : m)));
      await playAudio(audio, text, (n) => setShown(aid, n), signal);
      revealMessage(aid);
    } catch (e) {
      revealMessage(aid, text);
      if (e && e.name === 'AbortError') throw e;
      toast((e && e.message) || 'Suara jawaban gagal diputar.');
    }
  };

  /* ---------- input suara (Deepgram) ---------- */
  const showVoiceError = (msg) => {
    setChat((c) => [...c, { id: newId(), role: 'assistant', content: msg, err: true }]);
    showPose('err', 4000);
    setStatusErr(true);
    clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setStatusErr(false), 4000);
  };

  const cancelRecording = () => {
    const d = dictationRef.current;
    if (!d) return;
    d.cancelled = true;
    dictationRef.current = null;
    teardownDictation(d);
    setVoiceStatus('idle');
  };

  // Pesan Deepgram berjenis Results berisi teks. Teks muncul di kolom pertanyaan selagi pelanggan bicara.
  const handleDictationMessage = (d, event) => {
    if (dictationRef.current !== d || typeof event.data !== 'string') return;
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.type !== 'Results') return;
    setInput(`${d.typedText} ${collectTranscript(d, data)}`.trim().slice(0, 2000));
  };

  // Dipanggil saat koneksi Deepgram tertutup: sesudah CloseStream, atau karena internet putus.
  const finishRecording = (d) => {
    if (dictationRef.current !== d) return;
    dictationRef.current = null;
    teardownDictation(d);
    // Kalau koneksi putus tiba-tiba, teks sementara ikut disimpan supaya tidak hilang.
    const heard = d.stopping ? d.finalText : `${d.finalText} ${d.interimText}`.trim();
    const full = `${d.typedText} ${heard}`.trim().slice(0, 2000);
    setInput(full);
    setVoiceStatus('idle');
    setTimeout(() => micRef.current && micRef.current.focus({ preventScroll: true }), 0); // tombol mic sempat dimatikan

    if (!d.stopping) {
      showVoiceError(
        heard
          ? 'Sambungan ke Deepgram terputus. Teks yang sudah terdengar ada di kolom pertanyaan.'
          : 'Sambungan ke Deepgram terputus. Periksa koneksi internet, lalu coba lagi.'
      );
    } else if (!d.finalText) {
      showVoiceError('Suara tidak terdengar jelas. Dekatkan mikrofon, lalu coba lagi.');
    } else {
      // Hasil rekaman dikirim lewat jalur yang sama dengan pertanyaan yang diketik.
      sendRef.current(full, { voice: true });
    }
  };

  const stopRecording = () => {
    const d = dictationRef.current;
    if (!d || d.stopping || !d.recorder) return;
    clearTimeout(d.timer);
    d.stopping = true;
    if (d.recorder.state !== 'inactive') d.recorder.stop();
    setVoiceStatus('transcribing');
  };

  const startRecording = async () => {
    if (dictationRef.current || callRef.current || busy) return;
    const s = settingsRef.current;
    if (!sessionRef.current) {
      toast('Percakapan belum siap, coba lagi sebentar.');
      return;
    }
    if (!s.deepgramKey) {
      toast('Isi API key Deepgram dulu di Pengaturan.');
      go('settings');
      return;
    }

    // Semua benda yang hidup selama merekam disimpan di satu objek.
    const d = { socket: null, stream: null, recorder: null, timer: null, typedText: input.trim(), finalText: '', interimText: '', stopping: false, cancelled: false };
    dictationRef.current = d;
    setVoiceStatus('connecting');

    try {
      d.stream = await getMicrophone();
      if (d.cancelled) throw new Error('cancelled');
      d.socket = await openDeepgramSocket(s.deepgramKey);
      if (d.cancelled) throw new Error('cancelled');

      const mime = pickRecorderMime();
      const recorder = mime ? new MediaRecorder(d.stream, { mimeType: mime }) : new MediaRecorder(d.stream);
      d.recorder = recorder;
      d.socket.addEventListener('message', (event) => handleDictationMessage(d, event));
      d.socket.addEventListener('close', () => finishRecording(d));
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0 && d.socket.readyState === WebSocket.OPEN) d.socket.send(event.data);
      });
      recorder.addEventListener('stop', () => {
        d.stream.getTracks().forEach((track) => track.stop()); // mematikan mikrofon
        // CloseStream: Deepgram mengirim sisa teks yang belum final, lalu menutup koneksi.
        if (d.socket.readyState === WebSocket.OPEN) d.socket.send(JSON.stringify({ type: 'CloseStream' }));
        setTimeout(() => d.socket.close(), 5000); // cadangan kalau Deepgram tidak menutup sendiri
      });
      recorder.start(250); // potongan audio dikirim ke Deepgram setiap 250 milidetik
      // Rekaman berhenti sendiri setelah batas waktu, supaya mikrofon tidak lupa dimatikan.
      d.timer = setTimeout(stopRecording, MAX_RECORDING_SECONDS * 1000);
      setVoiceStatus('recording');
    } catch (e) {
      teardownDictation(d);
      if (dictationRef.current === d) dictationRef.current = null;
      if (!d.cancelled) {
        setVoiceStatus('idle');
        showVoiceError((e && e.message) || 'Tidak bisa memulai rekaman suara.');
      }
    }
  };

  const onMicClick = () => {
    if (voiceStatus === 'recording') stopRecording();
    else if (voiceStatus === 'idle') startRecording();
  };

  /* ---------- telepon dengan agent (realtime) ---------- */
  const setCallStatus = (call, st) => {
    if (call.ended) return;
    call.status = st;
    setCallStatusState(st);
    if (st === 'listening') showPose('ask');
    else if (st === 'thinking') showPose('work');
    else if (st === 'speaking') showPose('ok');
  };

  // Mematikan semua yang hidup selama panggilan di satu tempat. silent: tanpa pesan (halaman ditutup / chat baru).
  const endCall = (call, errorMsg = '', silent = false) => {
    if (!call || call.ended) return;
    call.ended = true;
    if (callRef.current === call) callRef.current = null;
    call.ac.abort(); // membatalkan permintaan ke Netra dan Deepgram, serta menghentikan suara agent
    clearInterval(call.keepAliveTimer);
    clearInterval(call.clockTimer);
    teardownDictation(call);
    const seconds = call.startedAt ? Math.round((Date.now() - call.startedAt) / 1000) : 0;
    if (silent) return;
    setCallStatusState('off');
    setCallTranscript('');
    // Kalimat yang terpotong karena panggilan diakhiri tetap ditampilkan lengkap.
    setChat((c) => c.map((m) => (typeof m.shown === 'number' ? { ...m, shown: undefined } : m)));
    if (errorMsg) showVoiceError(errorMsg);
    else {
      showPose('ask');
      toast(`Panggilan berakhir (${fmtClock(seconds)}).`);
    }
  };
  endCallRef.current = endCall;

  // Selama agent berpikir atau bicara, rekaman dijeda supaya suara agent tidak terdengar sebagai suara pelanggan.
  const pauseListening = (call) => {
    if (call.recorder && call.recorder.state === 'recording') call.recorder.pause();
  };

  const resumeListening = (call) => {
    if (call.ended) return;
    call.finalText = '';
    call.interimText = '';
    call.turnEnded = false;
    setCallTranscript('');
    if (call.recorder && call.recorder.state === 'paused') call.recorder.resume();
    setCallStatus(call, 'listening');
  };

  // Agent membacakan teks sambil menampilkannya sebagai gelembung chat yang berjalan seiring suara.
  // Kalimat jeda diambil dari cache, jawaban biasa diputar sambil diunduh.
  const speak = async (call, text, fromCache = false) => {
    const key = settingsRef.current.deepgramKey;
    const audio = fromCache
      ? new Audio(URL.createObjectURL(await getLineAudio(key, text)))
      : await createAgentAudio(await requestSpeech(key, text, call.ac.signal));
    if (call.ended) return;
    const id = newId();
    setChat((c) => [...c, { id, role: 'assistant', content: text, shown: 0 }]);
    call.spoken.push(id);
    setCallStatus(call, 'speaking');
    try {
      await playAudio(audio, text, (n) => setShown(id, n), call.ac.signal);
    } finally {
      revealMessage(id);
    }
  };

  const agentSays = async (call, text) => {
    try {
      await speak(call, text);
    } catch (error) {
      if (!call.ended) endCall(call, (error && error.message) || 'Suara agent gagal diputar.');
      return;
    }
    resumeListening(call);
  };

  // Kalimat jeda selagi Netra masih mencari jawaban. Kalau suaranya gagal, panggilan tetap lanjut.
  const sayWhileChecking = async (call, text) => {
    try {
      await speak(call, text, true);
    } catch {
      /* jeda dilewati */
    }
    setCallStatus(call, 'thinking');
  };

  const answerCustomer = async (call, question) => {
    pauseListening(call);
    setCallStatus(call, 'thinking');
    setCallTranscript(question);
    const sid = sessionRef.current;
    const uid = newId();
    call.spoken = [uid]; // pertanyaan dan kalimat jeda giliran ini, dibuang kalau jawabannya gagal
    setChat((c) => [...c, { id: uid, role: 'user', content: question }]);

    let reply = '';
    let segar = false;
    const onEvent = (ev) => {
      if (!ev.pesan) return;
      segar = true;
      const items = toChat([ev.pesan]);
      setChat((c) => [...c, ...items.filter((x) => !c.some((m) => m.id === x.id))]);
    };
    const replyPromise = callChat(
      sid,
      question,
      { mode: 'call', signal: call.ac.signal },
      (d) => {
        reply += d;
      },
      onEvent
    );
    // Ditangani di bawah. Data disegarkan tepat sekali setelah giliran selesai, termasuk bila panggilan sudah
    // diakhiri selagi menunggu jawaban. Giliran yang gagal selalu menyegarkan: server mungkin sudah menjalankan
    // Aksi Tertunda (uang berpindah) sebelum gagal dan membalas dengan error JSON.
    replyPromise.then(
      () => {
        if (segar) segarkanData();
      },
      () => segarkanData()
    );

    // Seperti CS sungguhan: kalau jawabannya belum siap, agent bilang sedang mengecek.
    let waited = false;
    if (needsChecking(question) && !(await settlesWithin(replyPromise, CHECKING_DELAY_MS))) {
      waited = true;
      if (call.ended) return;
      await sayWhileChecking(call, pickRandom(CHECKING_LINES));
      if (!call.ended && !(await settlesWithin(replyPromise, STILL_CHECKING_DELAY_MS))) {
        if (call.ended) return;
        await sayWhileChecking(call, STILL_CHECKING_LINE);
      }
    }

    try {
      await replyPromise;
      reply = reply.trim();
      if (!reply) throw new Error('Model mengembalikan jawaban kosong. Coba telepon lagi.');
    } catch (error) {
      if (call.ended) return;
      const failed = call.spoken;
      setChat((c) => c.map((m) => (failed.includes(m.id) ? { ...m, skip: true } : m))); // tidak ikut riwayat
      endCall(call, (error && error.message) || 'Terjadi kesalahan.');
      return;
    }
    if (call.ended) return;
    if (waited) reply = `${pickRandom(THANKS_FOR_WAITING_LINES)} ${reply}`;
    await agentSays(call, reply);
  };

  const handleCallMessage = (call, event) => {
    // Selama agent berpikir atau bicara, hasil dari Deepgram diabaikan.
    if (callRef.current !== call || call.status !== 'listening' || typeof event.data !== 'string') return;
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.type === 'Results') setCallTranscript(collectTranscript(call, data));
    // UtteranceEnd: pelanggan sudah diam 1 detik setelah kata terakhir.
    if (data.type === 'UtteranceEnd' && (call.finalText || call.interimText)) call.turnEnded = true;
    // UtteranceEnd kadang datang sebelum hasil final kalimat terakhir, jadi tunggu sampai tidak ada teks sementara.
    if (call.turnEnded && !call.interimText && call.finalText) answerCustomer(call, call.finalText);
  };

  const startCall = async () => {
    if (callRef.current || dictationRef.current || busy) return;
    const s = settingsRef.current;
    if (!sessionRef.current) {
      toast('Percakapan belum siap, coba lagi sebentar.');
      return;
    }
    if (!s.deepgramKey) {
      toast('Isi API key Deepgram dulu di Pengaturan.');
      go('settings');
      return;
    }

    const call = {
      status: 'connecting',
      ac: new AbortController(),
      socket: null,
      stream: null,
      recorder: null,
      keepAliveTimer: null,
      clockTimer: null,
      startedAt: 0,
      finalText: '',
      interimText: '',
      turnEnded: false,
      spoken: [],
      ended: false
    };
    callRef.current = call;
    go('chat');
    setCallStatusState('connecting');
    setCallTranscript('');
    setCallSeconds(0);
    showPose('work');

    try {
      call.stream = await getMicrophone();
      if (call.ended) return teardownDictation(call);
      call.socket = await openDeepgramSocket(s.deepgramKey);
      if (call.ended) return teardownDictation(call);

      // Suara kalimat jeda diunduh di awal supaya langsung siap saat dibutuhkan.
      [...CHECKING_LINES, STILL_CHECKING_LINE].forEach((line) => getLineAudio(s.deepgramKey, line).catch(() => {}));

      const mime = pickRecorderMime();
      call.recorder = mime ? new MediaRecorder(call.stream, { mimeType: mime }) : new MediaRecorder(call.stream);
      call.socket.addEventListener('message', (event) => handleCallMessage(call, event));
      call.socket.addEventListener('close', () => endCall(call, 'Sambungan ke Deepgram terputus. Periksa koneksi internet, lalu telepon lagi.'));
      call.recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0 && call.socket.readyState === WebSocket.OPEN) call.socket.send(event.data);
      });
      call.recorder.start(250); // potongan audio dikirim ke Deepgram setiap 250 milidetik
      // Deepgram menutup koneksi yang 10 detik tidak menerima apa pun, misalnya saat rekaman dijeda.
      call.keepAliveTimer = setInterval(() => {
        if (call.socket.readyState === WebSocket.OPEN) call.socket.send(JSON.stringify({ type: 'KeepAlive' }));
      }, 5000);
      call.startedAt = Date.now();
      call.clockTimer = setInterval(() => setCallSeconds(Math.round((Date.now() - call.startedAt) / 1000)), 1000);

      pauseListening(call);
      await agentSays(call, buildGreeting());
    } catch (e) {
      endCall(call, (e && e.message) || 'Panggilan tidak bisa dimulai.');
    }
  };

  const newChat = () => {
    cancelRecording();
    if (callRef.current) endCall(callRef.current, '', true);
    if (abortRef.current) abortRef.current.abort();
    startNewSession()
      .then(() => {
        showPose('ask');
        toast('Percakapan baru dimulai.');
      })
      .catch((e) => toast((e && e.message) || 'Gagal membuat percakapan baru.'));
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

  const saveSettings = async (e) => {
    e.preventDefault();
    const s = normalizeSettings(draft);
    if (s.contextText) {
      const sid = sessionRef.current;
      if (!sid) {
        toast('Percakapan belum siap, coba lagi sebentar.');
        return;
      }
      try {
        await addAttachment(sid, 'Catatan teks', s.contextText);
        // Sesi bisa sudah berganti selama menunggu: jangan tampilkan lampiran di sesi lain.
        if (sessionRef.current === sid) {
          setDocuments((docs) => [...docs, { id: newId(), name: 'Catatan teks', chars: Math.min(s.contextText.length, MAX_CONTEXT) }]);
        }
      } catch (err) {
        toast((err && err.message) || 'Catatan gagal ditempel.');
        return;
      }
    }
    const next = { ...s, contextText: '' };
    setSettings(next);
    setDraft(next);
    toast('Pengaturan tersimpan.');
  };

  /* ---------- dokumen PDF (ditempel ke sesi yang sedang dibuka) ---------- */
  const onPdfChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // supaya file yang sama bisa dipilih lagi
    if (!files.length) return;
    const sid = sessionRef.current;
    if (!sid) {
      setPdfStatus({ text: 'Percakapan belum siap, coba lagi sebentar.', ok: false, reading: false });
      return;
    }

    setPdfStatus({ text: `Membaca ${files.length} PDF…`, ok: null, reading: true });
    const added = [];
    const failed = [];
    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf) {
        failed.push(`${file.name} (bukan PDF)`);
        continue;
      }
      if (file.size > MAX_PDF_BYTES) {
        failed.push(`${file.name} (lebih dari 20 MB)`);
        continue;
      }
      try {
        const { text } = await extractPdfText(file);
        if (!text) {
          failed.push(`${file.name} (tidak ada teks, mungkin hasil scan)`);
          continue;
        }
        await addAttachment(sid, file.name, text);
        added.push({ id: newId(), name: file.name, chars: Math.min(text.length, MAX_CONTEXT) });
      } catch (err) {
        const msg = err && err.name === 'PasswordException' ? 'dilindungi password' : (err && err.message) || 'gagal dibaca';
        failed.push(`${file.name} (${msg})`);
      }
    }

    if (added.length && sessionRef.current === sid) setDocuments((docs) => [...docs, ...added]);
    const parts = [];
    if (added.length) parts.push(`${added.length} PDF ditempel ke percakapan ini.`);
    if (failed.length) parts.push(`Gagal: ${failed.join(', ')}.`);
    if (!added.length && failed.length && failed.length === files.length && !navigator.onLine) {
      parts.push('Periksa koneksi internet, pembaca PDF perlu diunduh saat pertama kali.');
    }
    setPdfStatus({ text: parts.join(' '), ok: failed.length ? (added.length ? null : false) : true, reading: false });
  };

  /* ---------- turunan ---------- */
  const connected = ready && !!sessionId;
  const poseFile = POSES[pose] || 'ask';
  const txs = txRows.filter((t) => txFilter === 'all' || t.dir === txFilter);
  const contextSize = String(draft.contextText || '').length;
  const contextOver = contextSize > MAX_CONTEXT;
  const voiceBusy = voiceStatus !== 'idle';
  const inCall = callStatus !== 'off';
  const CALL_STATUS_TEXT = {
    connecting: 'Menyambungkan panggilan…',
    listening: 'Mendengarkan Anda…',
    thinking: 'Fitri sedang mengecek…',
    speaking: 'Fitri sedang bicara…'
  };
  const VOICE_STATUS_TEXT = {
    connecting: 'Menghubungkan ke Deepgram…',
    recording: 'Mendengarkan… ketuk tombol mic lagi untuk berhenti',
    transcribing: 'Menunggu teks terakhir dari Deepgram…'
  };
  const MIC_LABEL = { idle: 'Rekam suara', connecting: 'Menghubungkan mikrofon', recording: 'Berhenti merekam', transcribing: 'Menunggu teks terakhir' };
  const statusText = inCall
    ? `Dalam panggilan · ${fmtClock(callSeconds)}`
    : voiceBusy
    ? VOICE_STATUS_TEXT[voiceStatus]
    : !ready
    ? 'Memuat…'
    : connected
    ? 'Online · Asisten virtual Agent Nusa'
    : 'Menyiapkan percakapan…';

  const askAbout = (t) => {
    setInput(`Tolong jelaskan transaksi "${t.name}" ${rp(t.amt)} pada ${t.waktu}.`);
    go('chat');
  };

  const navItems = [
    ['chat', 'Chat Bantuan', <ChatIcon key="c" />],
    ['history', 'Riwayat Transaksi', <ListIcon key="h" />],
    ['settings', 'Pengaturan', <GearIcon key="s" />]
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
            <button type="button" className="nav-item" onClick={logout}>
              Keluar
            </button>
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
            <label htmlFor="session-pick" className="sr">Pilih percakapan</label>
            <select
              id="session-pick"
              className="session-pick"
              value={sessionId || ''}
              disabled={busy || inCall || voiceBusy}
              onChange={(e) => openSession(e.target.value).catch((err) => toast((err && err.message) || 'Percakapan gagal dibuka.'))}
            >
              {sessions.map((x) => (
                <option key={x.id} value={x.id}>{(x.dimulai_oleh === 'agent' ? 'Gajian · ' : '') + fmtWaktu(x.created_at)}</option>
              ))}
            </select>
            <NotifBell items={notifications} disabled={busy || inCall || voiceBusy || demoBusy} onOpen={onOpenNotification} />
            <button type="button" className="btn ghost" onClick={newChat}>Chat baru</button>
            <button
              type="button"
              className="btn ghost call-btn"
              aria-label="Telepon Agent Nusa"
              disabled={inCall || busy || voiceBusy}
              onClick={startCall}
            >
              <PhoneIcon />
              <span className="hide-sm">Telepon</span>
            </button>
            <button type="button" className="btn ghost" aria-label="Hubungi agen" onClick={callAgent}>
              <HeadsetIcon />
              <span className="hide-sm">Hubungi agen</span>
            </button>
          </header>

          <div className="messages" ref={messagesRef} role="log" aria-live="polite" aria-label="Percakapan">
            <div className="msg bot">
              {`Halo, ${account ? account.nama : 'Nasabah'}! Saya Agent Nusa. Pilih topik di bawah atau ketik pertanyaan Anda.`}
              <span className="small">Demi keamanan, jangan pernah membagikan PIN, password, atau kode OTP kepada siapa pun, termasuk kami.</span>
            </div>
            {chat.map((m) => {
              if (m.role === 'card') {
                const off = busy || inCall || voiceBusy;
                if (m.card.jenis === 'rencana') return <RencanaCard key={m.id} planId={m.card.plan_id} tick={cardTick} disabled={off} onChanged={afterCardChange} />;
                if (m.card.jenis === 'pengeluaran') return <PengeluaranCard key={m.id} actionId={m.card.action_id} tick={cardTick} disabled={off} onChanged={afterCardChange} />;
                if (m.card.jenis === 'ringkasan') return <RingkasanCard key={m.id} data={m.card.data} />;
                return null;
              }
              if (m.role === 'note') {
                return <div key={m.id} className="msg note" role="note">{m.content}</div>;
              }
              return (
                <div key={m.id} className={'msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.err ? ' err' : '')}>
                  {m.pending ? (
                    <span className="typing" role="img" aria-label="Agent Nusa sedang mengetik"><i /><i /><i /></span>
                  ) : typeof m.shown === 'number' ? (
                    <>
                      {/* Pembaca layar langsung mendapat teks lengkap; tampilan berjalan seiring suara. */}
                      <span className="sr">{m.content}</span>
                      <span aria-hidden="true">{visibleText(m)}</span>
                      <span className="speak-caret" aria-hidden="true" />
                    </>
                  ) : (
                    m.content
                  )}
                </div>
              );
            })}
          </div>

          {inCall ? (
          <div className="composer-wrap">
            <div className={'call-bar ' + callStatus} role="group" aria-label="Panggilan dengan Agent Nusa">
              <span className="call-wave" aria-hidden="true"><i /><i /><i /><i /></span>
              <div className="call-info">
                <div className="call-state" role="status" aria-live="polite">{CALL_STATUS_TEXT[callStatus]}</div>
                <div className="call-heard">{callTranscript || (callStatus === 'listening' ? 'Silakan bicara…' : '\u00a0')}</div>
              </div>
              <span className="call-time">{fmtClock(callSeconds)}</span>
              <button type="button" className="call-end" onClick={() => callRef.current && endCall(callRef.current)}>
                <PhoneIcon />
                <span>Akhiri panggilan</span>
              </button>
            </div>
          </div>
          ) : (
          <div className="composer-wrap">
            <div className="chips">
              {CHIPS.map(([label, text]) => (
                <button key={label} type="button" className="chip" disabled={busy || voiceBusy} onClick={() => send(text)}>
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
                readOnly={voiceBusy}
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
              <button
                ref={micRef}
                type="button"
                id="btn-mic"
                className={'icon-btn mic' + (voiceStatus === 'recording' ? ' rec' : '')}
                aria-label={MIC_LABEL[voiceStatus]}
                disabled={busy || voiceStatus === 'connecting' || voiceStatus === 'transcribing'}
                onClick={onMicClick}
              >
                {voiceStatus === 'recording' ? <StopIcon /> : <MicIcon />}
              </button>
              <button type="submit" className="send" aria-label="Kirim pesan" disabled={busy || voiceBusy}>
                <SendIcon />
              </button>
            </form>
          </div>
          )}
        </main>

        {/* TRANSAKSI */}
        <section className="glass tx" aria-label="Riwayat transaksi">
          <div className="balance">
            <div className="balance-sm">{account ? `Tabungan Agent Nusa · •••• ${account.nomor_akhir}` : 'Memuat rekening…'}</div>
            <div className="balance-big">{account ? rp(account.saldo_total) : '—'}</div>
            <div className="balance-sm">{account ? `Saldo Total · Saldo Bebas ${rp(account.saldo_bebas)}` : 'Saldo Total'}</div>
          </div>
          {kantong.length > 0 && (
            <ul className="kantong-list" aria-label="Kantong">
              {kantong.map((k) => (
                <li key={k.pocket_id}>
                  <span>{k.nama}</span>
                  <b>{rp(k.saldo)}</b>
                </li>
              ))}
            </ul>
          )}
          <DemoPanel disabled={busy || inCall || voiceBusy || demoBusy} onGaji={onDemoGaji} onBelanja={onDemoBelanja} onBoros={onDemoBoros} onReset={onDemoReset} />
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
                key={t.id}
                type="button"
                className="tx-row"
                aria-label={`${t.name}, ${t.dir === 'in' ? 'masuk' : 'keluar'} ${rp(t.amt)}, ${t.status}. Tanyakan ke Agent Nusa`}
                onClick={() => askAbout(t)}
              >
                <span className="tx-ava" aria-hidden="true">{t.ini}</span>
                <span className="tx-main">
                  <span className="tx-name">{t.name}</span>
                  <span className="tx-meta">{`${t.waktu} · ${t.channel}`}</span>
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
        <section className="glass settings" aria-label="Pengaturan">
          <div className="settings-inner">
            <header className="settings-head">
              <div className="avatar"><img src="/assets/laptop.png" alt="" /></div>
              <div>
                <h1>Pengaturan</h1>
                <p>Koneksi AI sekarang diatur di server. Di sini Anda mengatur suara dan menempelkan lampiran ke percakapan yang sedang dibuka.</p>
              </div>
            </header>

            <form onSubmit={saveSettings} autoComplete="off" noValidate>
              <fieldset className="group">
                <legend>Suara</legend>
                <div className="field">
                  <label htmlFor="deepgramKey"><span>API key Deepgram (suara &amp; telepon)</span></label>
                  <div className="with-btn">
                    <input
                      id="deepgramKey"
                      type={showDgKey ? 'text' : 'password'}
                      placeholder="Tempel API key Deepgram di sini"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      value={draft.deepgramKey}
                      onChange={upd('deepgramKey')}
                    />
                    <button type="button" className="btn ghost" aria-pressed={showDgKey} onClick={() => setShowDgKey((v) => !v)}>
                      {showDgKey ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>
                  <small>Dipakai untuk tombol mic, jawaban bersuara, dan tombol Telepon. Key tersimpan di browser ini. Mikrofon hanya bisa dipakai di https:// atau localhost.</small>
                </div>
              </fieldset>

              <fieldset className="group">
                <legend>Lampiran percakapan ini</legend>
                <div className="field">
                  <label htmlFor="contextText"><span>Catatan teks</span></label>
                  <textarea
                    id="contextText"
                    rows={5}
                    placeholder="Contoh: Promo bulan ini, jam operasional cabang, kebijakan biaya terbaru…"
                    value={draft.contextText}
                    onChange={upd('contextText')}
                  />
                  <small>Catatan ditempel ke percakapan yang sedang dibuka saat Anda klik Simpan pengaturan.</small>
                </div>

                <div className="field">
                  <label htmlFor="pdf-input" className="field-label"><span>Dokumen PDF</span></label>
                  <input
                    id="pdf-input"
                    className="file-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    disabled={pdfStatus.reading}
                    onChange={onPdfChange}
                  />
                  <small>Teks PDF dibaca di browser lalu ditempel ke percakapan ini. Lampiran tidak bisa dilepas; tekan Chat baru untuk percakapan tanpa lampiran. PDF hasil scan (gambar) tidak bisa dibaca.</small>
                  <p
                    id="pdf-status"
                    className={'pdf-status' + (pdfStatus.ok === true ? ' ok' : pdfStatus.ok === false ? ' bad' : '')}
                    role="status"
                    aria-live="polite"
                  >
                    {pdfStatus.text}
                  </p>
                  {documents.length > 0 && (
                    <ul id="pdf-list" className="pdf-list">
                      {documents.map((d) => (
                        <li key={d.id}>
                          <span className="pdf-name">{d.name}</span>
                          <span className="pdf-meta">{`${fmtNum(d.chars)} karakter`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={'context-size' + (contextOver ? ' over' : '')}>
                  {`Ukuran catatan: ${fmtNum(contextSize)} / ${fmtNum(MAX_CONTEXT)} karakter`}
                  {contextOver && <span> · terlalu panjang, bagian akhir akan dipotong</span>}
                </div>
              </fieldset>

              <div className="actions">
                <button type="submit" className="btn primary">Simpan pengaturan</button>
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
        <button type="button" className="nav-item" onClick={logout}>Keluar</button>
      </nav>

      <div className={'toast' + (toastMsg ? ' show' : '')} role="status" aria-live="polite">{toastMsg}</div>
    </div>
  );
}
