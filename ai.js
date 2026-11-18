// Online AI photo match (Google Gemini through Firebase AI Logic). Used only when the phone is online and a manager
// has turned AI on; everything else in the app keeps working offline without it.
// The Gemini key lives inside the Firebase project (Firebase console → AI Logic), never on the phones.
import { FB_SDK } from "./store.js";

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-flash-latest";
export const SHELF_MODEL = "gemini-3.8-flash";

let sdkP = null;
const sdk = () => sdkP || (sdkP = import(FB_SDK + "firebase-ai.js"));
let aiInst = null;
async function modelFor(app, name, generationConfig) {
  const m = await sdk();
  aiInst = aiInst || m.getAI(app, { backend: new m.GoogleAIBackend() });
  return m.getGenerativeModel(aiInst, { model: name, generationConfig });
}
// Only a missing or retired model moves on to the next one; anything else (bad setup, no signal, quota) is reported.
const retired = e => e?.customErrorData?.status === 404 || /\[404\b|is not found|not supported for generateContent|is not available/i.test(String(e?.message || ""));

// Try each model in turn when a name has been retired or isn't available, ending with a general "latest" model.
async function run(app, models, parts, makeConfig, timeoutMs) {
  const list = [...new Set([...(Array.isArray(models) ? models : [models]).filter(Boolean), DEFAULT_MODEL, FALLBACK_MODEL])];
  const S = (await sdk()).Schema;
  let last;
  for (const name of list) {
    try {
      const model = await modelFor(app, name, makeConfig(S));
      const res = await model.generateContent(parts, { timeout: timeoutMs });
      return res.response.text();
    } catch (e) { last = e; if (!retired(e)) throw e; }
  }
  throw last;
}
const img = dataUrl => ({ inlineData: { mimeType: "image/jpeg", data: dataUrl.split(",")[1] } });
// The item list goes first and stays word-for-word the same between snaps, so Gemini can reuse it from its cache
// (cheaper and faster); the photo goes last.
const listText = items => "Inventory list. Each line is: item code | item name | producer.\n\n" + items.map(r => `${r[0]} | ${r[1]} | ${r[2]}`).join("\n");

// items: [[code, name, producer, category, page], …]. Returns { matches: [{code, confidence}], seen }.
export async function aiIdentify({ app, model, imageDataUrl, items, timeoutMs = 20000 }) {
  const prompt = `You help a bartender find a bottle on the bar's inventory list above.
Look at the photo of the bottle (or can, keg tap, carton or produce) and pick the matching items from the list.

Rules:
- Only return codes that are on the list. Never invent a code.
- Match on producer, product name, style and size together. A different size or vintage of the same product is a weaker match.
- Return up to 3 matches, best first, with confidence from 0 to 1. If nothing on the list fits, return no matches.
- In "seen", write in a few words what the label says (producer, product, size).`;
  const text = await run(app, model, [listText(items), prompt, img(imageDataUrl)], S => ({
    temperature: 0, responseMimeType: "application/json",
    responseSchema: S.object({ properties: { seen: S.string(), matches: S.array({ items: S.object({ properties: { code: S.string(), confidence: S.number() } }) }) } }),
  }), timeoutMs);
  let out; try { out = JSON.parse(text); } catch { out = { seen: "", matches: [] }; }
  const known = new Set(items.map(r => r[0]));
  const matches = (Array.isArray(out.matches) ? out.matches : [])
    .map(m => ({ code: String(m?.code || "").trim(), confidence: Math.max(0, Math.min(1, Number(m?.confidence) || 0)) }))
    .filter(m => known.has(m.code)).slice(0, 3);
  return { matches, seen: String(out.seen || "").slice(0, 200) };
}

// Quick check that AI Logic is turned on for the project and the model answers.
export async function aiTest(app, model) {
  await run(app, model, ["Reply with the word OK."], () => ({ maxOutputTokens: 5 }), 15000);
  return true;
}

// A photo of a whole shelf or wall: every bottle in order (top shelf first, left to right), matched to the list.
// Returns { shelves: [[{code, seen, count, confidence}], …] }; code is "" for bottles not on the list.
export async function aiShelf({ app, model, imageDataUrl, items, timeoutMs = 60000 }) {
  const prompt = `The photo below shows a bar's back shelves (a wall of bottles). A bartender will scan inventory barcodes in the same order as the bottles stand.
List every bottle you can see, shelf by shelf from the TOP shelf down, and LEFT to RIGHT along each shelf, and match each one to the inventory list above.

Rules:
- Only use codes from the list. Never invent a code. If a bottle isn't on the list or you can't tell, use an empty code "".
- When identical bottles stand next to each other, list them once with "count" set to how many there are.
- "seen" is a few words of what the label says (producer, product, size), even when matched.
- "confidence" is 0 to 1 for the match.
- Include partly hidden bottles if you can still tell what they are; skip ones you can't make out at all.`;
  const text = await run(app, [SHELF_MODEL, model], [listText(items), prompt, img(imageDataUrl)], S => ({
    temperature: 0, responseMimeType: "application/json",
    responseSchema: S.object({ properties: { shelves: S.array({ items: S.object({ properties: { bottles: S.array({ items: S.object({ properties: {
      code: S.string(), seen: S.string(), count: S.integer(), confidence: S.number() } }) }) } }) }) } }),
  }), timeoutMs);
  let out; try { out = JSON.parse(text); } catch { out = { shelves: [] }; }
  const known = new Set(items.map(r => r[0]));
  const shelves = (Array.isArray(out.shelves) ? out.shelves : []).map(sh => (Array.isArray(sh?.bottles) ? sh.bottles : []).map(b => {
    const code = String(b?.code || "").trim();
    return { code: known.has(code) ? code : "", seen: String(b?.seen || "").slice(0, 120),
      count: Math.max(1, Math.min(99, parseInt(b?.count, 10) || 1)), confidence: Math.max(0, Math.min(1, Number(b?.confidence) || 0)) };
  })).filter(sh => sh.length);
  return { shelves };
}
