// 名刺の写真から、名前・会社名・肩書き・電話・メールを読む。写真は読むときだけ受け取り、保存しない
const PROMPT = `これは日本の名刺の写真です。
・写真は横向きや逆さまのことがあります。向きを頭の中で直してから読んでください。
・名刺が2枚以上写っていたら、いちばん大きく写っている1枚だけを読んでください。
・名前の上や横に読みがな（ひらがな・ローマ字）があれば、それも書いてください。漢字は読みがなと合う字を選んでください。
・会社名と肩書きは、名刺に書いてある表記のまま。カタカナならカタカナ。英語に言いかえない。
・書いていないことは空文字。推測で作らない。
次のJSONだけを返してください。説明は不要です。
{"cards":[{"name":"氏名（漢字）","yomi":"読みがな","company":"会社名","title":"肩書き・部署","mobile":"携帯電話番号","tel":"会社・固定の電話番号","email":"メールアドレス"}]}`;
const MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/mistralai/mistral-small-3.1-24b-instruct'];

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const imgs = (Array.isArray(body && body.images) ? body.images : [body && body.image]).filter(x => typeof x === 'string' && x.startsWith('data:image/') && x.length < 6_000_000).slice(0, 3);
  if (!imgs.length) return json({ error: 'bad image' }, 400);

  const jobs = [];
  for (const img of imgs) for (const m of MODELS) jobs.push(readWith(env, m, img));
  const results = await Promise.all(jobs);
  const ok = results.filter(r => r.cards && r.cards.length);
  if (!ok.length) return json({ error: 'read failed', detail: results.map(r => r.err).filter(Boolean) }, 502);
  // 多数決：2回以上同じ答えが出たものだけ使う（1回だけの番号やメールは作り話の可能性が高い）
  const firsts = ok.map(r => r.cards.find(c => c.name) || r.cards[0]);
  const vote = (k, need) => {
    const cnt = new Map();
    for (const c of firsts) { const v = c[k]; if (!v) continue; const key = norm(v); const e = cnt.get(key) || { v, n: 0 }; e.n++; cnt.set(key, e); }
    let best = null; for (const e of cnt.values()) if (!best || e.n > best.n) best = e;
    return best && best.n >= need ? best.v : '';
  };
  const out = { name: vote('name', 2) || firsts[0].name, yomi: vote('yomi', 2), company: vote('company', 2), title: vote('title', 2), mobile: vote('mobile', 2), tel: vote('tel', 2), email: vote('email', 2) };
  if (out.tel && out.mobile && norm(out.tel) === norm(out.mobile)) out.tel = '';
  return json({ ...out, cards: [out], votes: firsts.length });
}

const norm = v => { const t = String(v).replace(/\s|　/g, '').toLowerCase(); return /^[0-9+\-]+$/.test(t) ? t.replace(/\D/g, '') : t; };

async function readWith(env, model, image) {
  try {
    const r = await env.AI.run(model, {
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: image } }] }],
      max_tokens: 600, temperature: 0
    });
    const text = (r && (r.response ?? r.result?.response)) || '';
    const t = typeof text === 'string' ? text : JSON.stringify(text);
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return { model, err: model + ': no json' };
    const o = JSON.parse(m[0]);
    const cards = (Array.isArray(o.cards) ? o.cards : [o]).slice(0, 5)
      .map(c => ({ name: s(c.name), yomi: s(c.yomi), company: s(c.company), title: s(c.title), mobile: ph(c.mobile), tel: ph(c.tel), email: s(c.email) }))
      .filter(c => c.name || c.company || c.title);
    return { model, cards };
  } catch (e) { return { model, err: model + ': ' + String(e && e.message || e).slice(0, 160) }; }
}

function score(cards) {
  let p = 0;
  for (const c of cards) for (const k of ['name', 'yomi', 'company', 'title', 'mobile', 'tel', 'email']) if (c[k]) p += k === 'yomi' ? 2 : 1;
  return p + (cards.length > 1 ? 3 : 0);
}
const ph = v => { if (typeof v !== 'string') return ''; const t = v.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[－ー―‐]/g, '-').replace(/[^0-9+\-]/g, '').slice(0, 20); const n = t.replace(/\D/g, '').length; return n >= 10 && n <= 12 && /^(\+|0)/.test(t) ? t : ''; };
const s = v => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
function json(o, st = 200) {
  return new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
