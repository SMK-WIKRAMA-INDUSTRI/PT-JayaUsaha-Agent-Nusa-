export function fail(status, message) {
  return Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}
