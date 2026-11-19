export const DEFAULT_SYSTEM_PROMPT = [
  'Kamu adalah Agent Nusa, asisten virtual customer service Agent Nusa (agen fiktif untuk demo).',
  'Jawab dalam Bahasa Indonesia yang sopan dan ringkas (maksimal 4 kalimat). Tulis teks biasa, tanpa markdown, tanpa tabel.',
  'Gunakan hanya informasi dari DATA DEMO NASABAH di bawah. Jika informasi tidak ada, katakan tidak tahu dan tawarkan untuk menghubungkan ke agen manusia.',
  'Jangan pernah meminta atau menerima PIN, password, CVV, atau kode OTP di chat. Jika nasabah mengetikkannya, ingatkan agar tidak membagikannya.',
  'Untuk kartu hilang, dugaan penipuan, dana hilang, atau komplain berat, arahkan nasabah menekan tombol "Hubungi agen" di atas chat.',
  'Jangan memberi nasihat investasi atau keputusan kredit. Kamu tidak bisa melakukan transaksi nyata; jelaskan langkah-langkahnya saja.',
  'Selalu sebut tanggal dan jam data yang kamu rujuk.'
].join('\n');

export const DEFAULTS = {
  apiKey: '',
  model: 'deepseek/deepseek-v4.1-flash',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxTokens: 600,
  temperature: 0.3,
  reasoning: 'off',
  stream: true
};

export function normalizeSettings(d) {
  const t = Number(d.temperature);
  const temp = d.temperature === '' || Number.isNaN(t) ? DEFAULTS.temperature : Math.max(0, Math.min(2, t));
  return {
    ...d,
    apiKey: String(d.apiKey || '').trim(),
    model: String(d.model || '').trim() || DEFAULTS.model,
    systemPrompt: String(d.systemPrompt || '').trim() || DEFAULT_SYSTEM_PROMPT,
    maxTokens: Math.max(16, Math.min(8192, Number(d.maxTokens) || DEFAULTS.maxTokens)),
    temperature: temp
  };
}

export const CHIPS = [
  ['Cek status transfer', 'Transfer saya ke Rina tanggal 17 Nov belum masuk, tolong dicek.'],
  ['Blokir kartu', 'Kartu debit saya hilang, tolong bantu blokir.'],
  ['Tagihan kartu kredit', 'Berapa tagihan kartu kredit saya bulan ini dan kapan jatuh tempo?'],
  ['Biaya transfer', 'Berapa biaya dan limit transfer BI-FAST?']
];

// Data demo. Ganti dengan data dari backend bank sebelum dipakai di produksi.
export const TXS = [
  { ini: 'RW', name: 'Transfer ke Rina Wijaya', date: '17 Nov', time: '13:02', channel: 'BI-FAST', kind: 'Transfer', amt: 500000, dir: 'out', st: 'fail', status: 'Gagal', note: 'gagal karena gangguan di bank tujuan; dana dikembalikan ke rekening pukul 13:05' },
  { ini: 'PL', name: 'Token Listrik PLN', date: '17 Nov', time: '09:15', channel: 'Pembayaran', kind: 'Pembayaran', amt: 205000, dir: 'out', st: 'ok', status: 'Berhasil' },
  { ini: 'KS', name: 'Kopi Senja (QRIS)', date: '16 Nov', time: '18:40', channel: 'QRIS', kind: 'QRIS', amt: 47500, dir: 'out', st: 'ok', status: 'Berhasil' },
  { ini: 'AL', name: 'Transfer dari Ayu Lestari', date: '16 Nov', time: '11:20', channel: 'BI-FAST', kind: 'Transfer', amt: 350000, dir: 'in', st: 'ok', status: 'Berhasil' },
  { ini: 'PN', name: 'Gaji PT Nusantara Digital', date: '14 Nov', time: '08:00', channel: 'Kredit', kind: 'Kredit', amt: 12500000, dir: 'in', st: 'ok', status: 'Berhasil' },
  { ini: 'KK', name: 'Tagihan Kartu Kredit', date: '13 Nov', time: '20:05', channel: 'Autodebet', kind: 'Autodebet', amt: 2750000, dir: 'out', st: 'wait', status: 'Diproses' },
  { ini: 'DW', name: 'Top up Dompet Digital', date: '12 Nov', time: '19:33', channel: 'Top up', kind: 'Top up', amt: 100000, dir: 'out', st: 'ok', status: 'Berhasil' },
  { ini: 'BS', name: 'Transfer dari Budi Santoso', date: '10 Nov', time: '15:48', channel: 'SKN', kind: 'Transfer', amt: 1200000, dir: 'in', st: 'ok', status: 'Berhasil' }
];

// Format manual agar hasil server dan browser identik (tanpa mismatch hydration).
export const rp = (n) => 'Rp ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function demoContext() {
  const lines = TXS.map(
    (t) =>
      `- ${t.date} ${t.time} | ${t.name} | ${t.dir === 'in' ? 'masuk' : 'keluar'} ${rp(t.amt)} | status: ${t.status}${t.note ? ' (' + t.note + ')' : ''} | kanal: ${t.channel}`
  );
  return [
    'DATA DEMO NASABAH (waktu sekarang: 17 Nov 2026, 14:12 WIB)',
    'Nama nasabah: Dimas. Rekening: Tabungan Agent Nusa berakhiran 4821. Saldo tersedia: Rp 24.380.500.',
    'Kartu debit Agent Nusa berakhiran 4821 (aktif). Kartu Kredit Agent Nusa: tagihan Rp 2.750.000, pembayaran minimum Rp 275.000, jatuh tempo 25 Nov 2026.',
    'Biaya dan limit demo: transfer BI-FAST Rp 2.500 per transaksi, limit Rp 250.000.000 per transaksi, layanan 24 jam. Transfer SKN Rp 3.500, diproses jam kerja. QRIS tanpa biaya untuk nasabah.',
    'Riwayat transaksi:',
    ...lines
  ].join('\n');
}
