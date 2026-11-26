import { getUser } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { fail, failDb } from '../../../../lib/server/http';
import { ingestTransaksi } from '../../../../lib/server/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Panel Demo: mensimulasikan Gaji masuk lewat jalur ingest yang sama dengan Transaksi sungguhan.
const GAJI_DEMO = { nominal: 12500000, pihak: 'Gaji PT Nusantara Digital' };

export async function POST() {
  const { user } = await getUser();
  if (!user) return fail(401, 'Silakan masuk dulu.');
  try {
    const { transaksi, plan } = await ingestTransaksi(createAdminClient(), user.id, {
      arah: 'masuk',
      nominal: GAJI_DEMO.nominal,
      kategori: 'payroll',
      pihak: GAJI_DEMO.pihak,
      kanal: 'Kredit'
    });
    return Response.json({ transaksi, plan_id: plan ? plan.id : null });
  } catch (e) {
    return failDb(e);
  }
}
