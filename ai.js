// Online AI photo match (Google Gemini). Used only when the phone is online and a manager has added a key;
// everything else in the app keeps working offline without it.
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-flash-latest";
const URL_FOR = m => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;

async function call(key, model, body, signal) {
  const res = await fetch(URL_FOR(model), {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = ""; try { msg = (await res.json())?.error?.message || ""; } catch {}
    const err = new Error(msg || `AI request failed (${res.status})`); err.status = res.status; throw err;
  }
  const j = await res.json();
  return (j?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
}
// Try each model in turn when a name has been retired or isn't available on this key, ending with a general "latest" model.
async function callWithFallback(key, model, body, signal) {
  const list = [...new Set([...(Array.isArray(model) ? model : [model]).filter(Boolean), DEFAULT_MODEL, FALLBACK_MODEL])];
  let last;
  for (const m of list) {
    try { return await call(key, m, body, signal); }
    catch (e) { last = e; if (!(e.status === 404 || e.status === 403 && /model|permission/i.test(e.message) || e.status === 400 && /model/i.test(e.message))) throw e; }
  }
  throw last;
}

// items: [[code, name, producer, category, page], …]. Returns { matches: [{code, confidence}], seen }.
export async function aiIdentify({ key, model, imageDataUrl, items, timeoutMs = 20000 }) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const list = items.map(r => `${r[0]} | ${r[1]} | ${r[2]}`).join("\n");
    const prompt = `You help a bartender find a bottle on the bar's inventory sheet.
Look at the photo of the bottle (or can, keg tap, carton or produce) and pick the matching items from this inventory list.
Each line is: item code | item name | producer.

${list}

Rules:
- Only return codes that are on the list above. Never invent a code.
- Match on producer, product name, style and size together. A different size or vintage of the same product is a weaker match.
- Return up to 3 matches, best first, with confidence from 0 to 1. If nothing on the list fits, return no matches.
- In "seen", write in a few words what the label says (producer, product, size).`;
    const body = {
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: "image/jpeg", data: imageDataUrl.split(",")[1] } },
        { text: prompt },
      ] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: {
          seen: { type: "STRING" },
          matches: { type: "ARRAY", items: { type: "OBJECT", properties: { code: { type: "STRING" }, confidence: { type: "NUMBER" } }, required: ["code", "confidence"] } },
        }, required: ["seen", "matches"] },
      },
    };
    const text = await callWithFallback(key, model, body, ctrl.signal);
    let out; try { out = JSON.parse(text); } catch { out = { seen: "", matches: [] }; }
    const known = new Set(items.map(r => r[0]));
    const matches = (Array.isArray(out.matches) ? out.matches : [])
      .map(m => ({ code: String(m.code || "").trim(), confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0)) }))
      .filter(m => known.has(m.code)).slice(0, 3);
    return { matches, seen: String(out.seen || "").slice(0, 200) };
  } finally { clearTimeout(t); }
}

// Quick check that a key works.
export async function aiTest(key, model) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    await callWithFallback(key, model, { contents: [{ role: "user", parts: [{ text: "Reply with the word OK." }] }], generationConfig: { maxOutputTokens: 5 } }, ctrl.signal);
    return true;
  } finally { clearTimeout(t); }
}

// A photo of a whole shelf or wall: every bottle in order (top shelf first, left to right), matched to the list.
// Returns { shelves: [[{code, seen, count, confidence}], …] }; code is "" for bottles not on the list.
export const SHELF_MODEL = "gemini-3.8-flash";
export async function aiShelf({ key, model, imageDataUrl, items, timeoutMs = 60000 }) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const list = items.map(r => `${r[0]} | ${r[1]} | ${r[2]}`).join("\n");
    const prompt = `This is a photo of a bar's back shelves (a wall of bottles). A bartender will scan inventory barcodes in the same order as the bottles stand.
List every bottle you can see, shelf by shelf from the TOP shelf down, and LEFT to RIGHT along each shelf.
Match each bottle to this inventory list. Each line is: item code | item name | producer.

${list}

Rules:
- Only use codes from the list above. Never invent a code. If a bottle isn't on the list or you can't tell, use an empty code "".
- When identical bottles stand next to each other, list them once with "count" set to how many there are.
- "seen" is a few words of what the label says (producer, product, size), even when matched.
- "confidence" is 0 to 1 for the match.
- Include partly hidden bottles if you can still tell what they are; skip ones you can't make out at all.`;
    const body = {
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: "image/jpeg", data: imageDataUrl.split(",")[1] } },
        { text: prompt },
      ] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { shelves: { type: "ARRAY", items: { type: "OBJECT", properties: {
          bottles: { type: "ARRAY", items: { type: "OBJECT", properties: {
            code: { type: "STRING" }, seen: { type: "STRING" }, count: { type: "INTEGER" }, confidence: { type: "NUMBER" },
          }, required: ["code", "seen", "count", "confidence"] } },
        }, required: ["bottles"] } } }, required: ["shelves"] },
      },
    };
    const text = await callWithFallback(key, [SHELF_MODEL, model], body, ctrl.signal);
    let out; try { out = JSON.parse(text); } catch { out = { shelves: [] }; }
    const known = new Set(items.map(r => r[0]));
    const shelves = (Array.isArray(out.shelves) ? out.shelves : []).map(sh => (Array.isArray(sh?.bottles) ? sh.bottles : []).map(b => {
      const code = String(b?.code || "").trim();
      return { code: known.has(code) ? code : "", seen: String(b?.seen || "").slice(0, 120),
        count: Math.max(1, Math.min(99, parseInt(b?.count, 10) || 1)), confidence: Math.max(0, Math.min(1, Number(b?.confidence) || 0)) };
    })).filter(sh => sh.length);
    return { shelves };
  } finally { clearTimeout(t); }
}
