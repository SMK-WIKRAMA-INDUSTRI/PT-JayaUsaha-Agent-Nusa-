import { getUser } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { belanjaAcak } from '../../../../lib/demo';
import { fail, failDb } from '../../../../lib/server/http';
import { ingestTransaksi } from '../../../../lib/server/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Panel Demo: satu Transaksi QRIS keluar acak lewat jalur ingest yang sama dengan Transaksi sungguhan.
export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  const b = belanjaAcak();
  try {
    const { transaksi } = await ingestTransaksi(createAdminClient(), user.id, {
      arah: 'keluar',
      nominal: b.nominal,
      kategori: 'qris',
      pihak: b.pihak,
      kanal: 'QRIS',
      kategori_belanja: b.kategori_belanja
    });
    return Response.json({ transaksi: { ...transaksi, pihak: b.pihak, kategori_belanja: b.kategori_belanja } });
  } catch (e) {
    return failDb(e);
  }
}
