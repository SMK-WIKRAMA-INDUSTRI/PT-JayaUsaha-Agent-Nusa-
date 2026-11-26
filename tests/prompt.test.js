import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT_VERSION, buildPromptMessages, systemPromptFor } from '../lib/prompt';
import { buildSnapshot, renderSnapshot } from '../lib/snapshot';
import { CALL_RULES } from '../lib/speech';
import { snapshotInput } from './fixtures';

const session = { system_prompt_version: SYSTEM_PROMPT_VERSION, snapshot: buildSnapshot(snapshotInput) };
const m = (id, role, content, created_at) => ({ id, role, content, created_at });
const h1 = [m(1, 'user', 'Saldo saya berapa?', '2026-11-24T07:12:00Z')];

describe('buildPromptMessages', () => {
  it('urutan: system statis, snapshot, riwayat', () => {
    const p = buildPromptMessages({ session, history: h1, mode: 'text' });
    expect(p[0]).toEqual({ role: 'system', content: systemPromptFor(SYSTEM_PROMPT_VERSION) });
    expect(p[1]).toEqual({ role: 'system', content: renderSnapshot(session.snapshot) });
    expect(p[2]).toEqual({ role: 'user', content: '[waktu: 24 Nov 2026 14:12 WIB] Saldo saya berapa?' });
    expect(p).toHaveLength(3);
  });

  it('prompt giliran berikutnya diawali prompt giliran sebelumnya persis (prefix cache)', () => {
    const p1 = buildPromptMessages({ session, history: h1, mode: 'text' });
    const h2 = [...h1, m(2, 'assistant', 'Saldo Total Anda Rp 9.500.000.', '2026-11-24T07:12:05Z'), m(3, 'user', 'Terima kasih', '2026-11-24T07:13:00Z')];
    const p2 = buildPromptMessages({ session, history: h2, mode: 'text' });
    expect(p2.slice(0, p1.length)).toEqual(p1);
    expect(p2[3]).toEqual({ role: 'assistant', content: 'Saldo Total Anda Rp 9.500.000.' });
  });

  it('snapshot dari jsonb (urutan key berbeda) menghasilkan prompt identik', () => {
    const fromDb = { ...session, snapshot: Object.fromEntries(Object.entries(session.snapshot).reverse()) };
    expect(buildPromptMessages({ session: fromDb, history: h1, mode: 'text' })).toEqual(buildPromptMessages({ session, history: h1, mode: 'text' }));
  });

  it('mode telepon menyisipkan CALL_RULES setelah snapshot', () => {
    const text = buildPromptMessages({ session, history: h1, mode: 'text' });
    const call = buildPromptMessages({ session, history: h1, mode: 'call' });
    expect(call.slice(0, 2)).toEqual(text.slice(0, 2));
    expect(call[2]).toEqual({ role: 'system', content: CALL_RULES });
    expect(call[3]).toEqual(text[2]);
  });

  it('lampiran dan pembaruan dirender sebagai pesan system', () => {
    const p = buildPromptMessages({
      session,
      history: [m(1, 'lampiran', '[Dokumen: promo.pdf]\nPromo bulan ini', '2026-11-24T07:00:00Z'), m(2, 'pembaruan', 'Gaji masuk Rp 12.500.000', '2026-11-24T07:01:00Z')],
      mode: 'text'
    });
    expect(p[2]).toEqual({ role: 'system', content: 'LAMPIRAN DARI NASABAH\n[Dokumen: promo.pdf]\nPromo bulan ini' });
    expect(p[3]).toEqual({ role: 'system', content: 'PEMBARUAN DATA\nGaji masuk Rp 12.500.000' });
  });
});

describe('systemPromptFor', () => {
  it('melempar error untuk versi yang tidak dikenal', () => {
    expect(() => systemPromptFor(999)).toThrow();
  });
  it('system prompt statis tidak berisi tanggal (agar prefix stabil)', () => {
    expect(systemPromptFor(SYSTEM_PROMPT_VERSION)).not.toMatch(/\b\d{1,2} (Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des) \d{4}\b/);
  });
});

describe('versi prompt dan kartu', () => {
  it('versi terbaru adalah 2, dan v1 tetap tersedia tanpa perubahan', () => {
    expect(SYSTEM_PROMPT_VERSION).toBe(2);
    expect(systemPromptFor(1)).toContain('Jangan pernah mengarang nominal: sebut angka hanya jika tertulis di data. Jangan menawarkan atau merekomendasikan produk investasi tertentu.');
    expect(systemPromptFor(1).split('\n')).toHaveLength(13);
  });

  it('v2 menjelaskan Kantong, kartu, dan cara mengubah Rencana', () => {
    const p = systemPromptFor(2);
    expect(p).toContain('KARTU');
    expect(p).toContain('Saldo Bebas');
    expect(p).toContain('Terapkan');
  });

  it('pesan kartu dirender sebagai system apa adanya', () => {
    const history = [m(1, 'kartu', 'KARTU RENCANA ALOKASI (ditampilkan ke nasabah; semua angka dihitung oleh Aturan Alokasi)\nGaji masuk: Rp 1.000', '2026-11-24T07:12:00Z')];
    const p = buildPromptMessages({ session: { ...session, system_prompt_version: 2 }, history, mode: 'text' });
    expect(p[2]).toEqual({ role: 'system', content: history[0].content });
  });
});
