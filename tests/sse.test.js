import { describe, expect, it } from 'vitest';
import { createSseParser, createToolCallCollector } from '../lib/sse';

describe('createSseParser', () => {
  it('menyambung baris yang terpotong di antara chunk', () => {
    const p = createSseParser();
    expect(p.push('data: {"choices":[{"delta":{"content":"Hal"}}]}\n\ndata: {"choices":[{"delta":{"con')).toEqual([{ text: 'Hal' }]);
    expect(
      p.push('tent":"o"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":900,"prompt_cache_hit_tokens":768}}\n\ndata: [DONE]\n\n')
    ).toEqual([{ text: 'o' }, { usage: { prompt_tokens: 900, prompt_cache_hit_tokens: 768 } }, { done: true }]);
  });

  it('meneruskan pesan error', () => {
    expect(createSseParser().push('data: {"error":{"message":"kuota habis"}}\n')).toEqual([{ error: 'kuota habis' }]);
  });

  it('mengabaikan baris non-data dan JSON rusak', () => {
    expect(createSseParser().push(': keep-alive\ndata: {rusak\n')).toEqual([]);
  });

  it('meneruskan potongan tool_calls dan event nusa', () => {
    const p = createSseParser();
    expect(
      p.push(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"catat_pengeluaran","arguments":"{\\"barang\\""}}]}}]}\n' +
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"Bakso\\"}"}}]}}]}\n' +
          'data: {"nusa":{"pesan":{"id":5,"role":"pembaruan"}}}\n'
      )
    ).toEqual([
      { toolCall: { index: 0, id: 'call_1', name: 'catat_pengeluaran', arguments: '{"barang"' } },
      { toolCall: { index: 0, id: '', name: '', arguments: ':"Bakso"}' } },
      { nusa: { pesan: { id: 5, role: 'pembaruan' } } }
    ]);
  });
});

describe('createToolCallCollector', () => {
  it('merakit potongan menjadi panggilan utuh per index', () => {
    const c = createToolCallCollector();
    c.push({ index: 0, id: 'call_1', name: 'catat_pengeluaran', arguments: '{"a"' });
    c.push({ index: 0, id: '', name: '', arguments: ':1}' });
    c.push({ index: 1, id: 'call_2', name: 'minta_ringkasan', arguments: '{}' });
    expect(c.list()).toEqual([
      { id: 'call_1', name: 'catat_pengeluaran', arguments: '{"a":1}' },
      { id: 'call_2', name: 'minta_ringkasan', arguments: '{}' }
    ]);
  });
  it('kosong jika tidak ada panggilan', () => {
    expect(createToolCallCollector().list()).toEqual([]);
  });
});
