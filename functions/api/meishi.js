// 名刺の写真から、名前・会社名・肩書きを読む。写真は読むときだけ受け取り、保存しない
const PROMPT = `これは日本の名刺の写真です。名刺に書いてある文字だけを読んで、次のJSONだけを返してください。説明は不要です。
{"name":"氏名（漢字。読みがなは入れない）","company":"会社名・屋号","title":"肩書き"}
読めない項目は空文字にしてください。推測で作らないでください。`;
const MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/mistralai/mistral-small-3.1-24b-instruct'];

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const image = body && body.image;
  if (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > 3_000_000) return json({ error: 'bad image' }, 400);
  let last = ''; const errs = [];
  for (const model of MODELS) {
    try {
      const r = await env.AI.run(model, {
        messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: image } }] }],
        max_tokens: 300, temperature: 0
      });
      const text = (r && (r.response ?? r.result?.response)) || '';
      last = typeof text === 'string' ? text : JSON.stringify(text);
      const m = last.match(/\{[\s\S]*\}/);
      if (!m) { errs.push(model + ': ' + last.slice(0, 120)); continue; }
      const o = JSON.parse(m[0]);
      return json({ name: s(o.name), company: s(o.company), title: s(o.title) });
    } catch (e) { last = String(e && e.message || e); errs.push(model + ': ' + last.slice(0, 160)); }
  }
  return json({ error: 'read failed', detail: errs }, 502);
}
const s = v => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
function json(o, st = 200) {
  return new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
