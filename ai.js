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
// Try the chosen model, then a general "latest" model if that name has been retired.
async function callWithFallback(key, model, body, signal) {
  try { return await call(key, model || DEFAULT_MODEL, body, signal); }
  catch (e) { if ((e.status === 404 || e.status === 400 && /model/i.test(e.message)) && model !== FALLBACK_MODEL) return call(key, FALLBACK_MODEL, body, signal); throw e; }
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
