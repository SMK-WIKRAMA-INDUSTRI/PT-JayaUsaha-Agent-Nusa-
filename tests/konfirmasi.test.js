import { describe, expect, it } from 'vitest';
import { jenisJawaban } from '../lib/konfirmasi';

describe('jenisJawaban', () => {
  it.each(['ya', 'Iya', 'iya kak', 'ya, catat', 'oke', 'ok deh', 'benar', 'betul', 'bener banget', 'boleh', 'sip', 'lanjut', 'ya catat aja', 'Ya.', 'iyaa', 'yaudah', 'oke makasih', 'iya makasih kak', 'ya benar, terima kasih', 'yoi', 'enggak salah', 'nggak salah', 'gak salah', 'tidak salah'])(
    '"%s" -> ya',
    (t) => expect(jenisJawaban(t)).toBe('ya')
  );
  it.each(['tidak', 'nggak', 'gak jadi', 'batal', 'batalkan', 'jangan', 'salah', 'bukan', 'ga usah', 'enggak kak', 'jangan dulu'])('"%s" -> tidak', (t) =>
    expect(jenisJawaban(t)).toBe('tidak')
  );
  it.each([
    'iya tapi 30 ribu',
    'pengeluaranku bulan ini gimana?',
    'ya gak',
    'oh iya tadi juga beli es teh',
    '',
    'ya ya ya ya ya ya ya'
  ])('"%s" -> lain', (t) => expect(jenisJawaban(t)).toBe('lain'));
});
