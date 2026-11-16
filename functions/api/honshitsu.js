// 誕生日から「本質」を返す。計算表は Cloudflare の秘密の設定（HON_TABLE）にだけ置く
export async function onRequestGet({ request, env }) {
  const b = new URL(request.url).searchParams.get('b') || '';
  const m = b.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !env.HON_TABLE) return json({ error: 'bad request' }, 400);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const table = JSON.parse(env.HON_TABLE);
  const off = Number(env.HON_OFFSET || 0);
  const days = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(1900, 0, 1)) / 86400000);
  const i = (((off + days) % 60) + 60) % 60 + 1;
  const v = table[String(i)];
  if (!v) return json({ error: 'not found' }, 404);
  return json({ type: v[0], g: v[1] });
}
function json(o, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
