// 名刺の写真から、名前・会社名・肩書きを読む。写真は読むときだけ受け取り、保存しない
const PROMPT = `これは日本の名刺の写真です。名刺が2枚以上写っていることもあります。写っている名刺を1枚ずつ、書いてある文字だけを読んで、次のJSONだけを返してください。説明は不要です。
{"cards":[{"name":"氏名（漢字。読みがなは入れない）","company":"会社名・屋号（名刺に書いてある表記のまま。カタカナならカタカナ）","title":"肩書き・部署","mobile":"携帯電話番号（090/080/070で始まる番号）","tel":"会社・固定の電話番号","email":"メールアドレス"}]}
読めない項目は空文字にしてください。推測で作らないでください。英語に言いかえないでください。`;
const MODELS = ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-4-scout-17b-16e-instruct'];

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
      const cards = (Array.isArray(o.cards) ? o.cards : [o]).slice(0, 5).map(c => ({ name: s(c.name), company: s(c.company), title: s(c.title), mobile: ph(c.mobile), tel: ph(c.tel), email: s(c.email) })).filter(c => c.name || c.company || c.title);
      const first = cards.find(c => c.name) || cards[0] || { name: '', company: '', title: '' };
      const pick = k => (cards.find(c => c[k]) || {})[k] || '';
      return json({ name: first.name, company: first.company, title: first.title, mobile: pick('mobile'), tel: pick('tel'), email: pick('email'), cards });
    } catch (e) { last = String(e && e.message || e); errs.push(model + ': ' + last.slice(0, 160)); }
  }
  return json({ error: 'read failed', detail: errs }, 502);
}
const ph = v => (typeof v === 'string' ? v.replace(/[^0-9０-９+\-－ー()（）]/g, '').replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[－ー]/g, '-').replace(/[（）]/g, '').slice(0, 20) : '');
const s = v => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
function json(o, st = 200) {
  return new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
