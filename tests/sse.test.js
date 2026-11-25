import { describe, expect, it } from 'vitest';
import { createSseParser } from '../lib/sse';

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
});
