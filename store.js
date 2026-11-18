// Shared storage for the team (Google Firebase / Firestore).
// Everything lives under teams/<team id>/..., and the team id comes from the team code in the app link.
export const FB_SDK = "https://www.gstatic.com/firebasejs/12.19.0/";

export async function connect(config, teamId, appCheckKey) {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(FB_SDK + "firebase-app.js"),
    import(FB_SDK + "firebase-auth.js"),
    import(FB_SDK + "firebase-firestore.js"),
  ]);
  const app = initializeApp(config);
  // App Check proves requests come from this app, so the AI can't be used by anyone who copies the Firebase settings.
  if (appCheckKey) {
    try { const ac = await import(FB_SDK + "firebase-app-check.js");
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaEnterpriseProvider(appCheckKey), isTokenAutoRefreshEnabled: true });
    } catch (e) { console.warn("App Check didn't start", e); }
  }
  const a = auth.getAuth(app);
  const cred = await auth.signInAnonymously(a);
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch { db = fs.getFirestore(app); }
  const root = `teams/${teamId}`;
  const full = path => root + "/" + path;
  const docSnap = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
  const docRef = path => {
    const r = fs.doc(db, full(path));
    return {
      id: r.id,
      set: (d, opts) => opts ? fs.setDoc(r, d, opts) : fs.setDoc(r, d),
      update: d => fs.updateDoc(r, d),
      delete: () => fs.deleteDoc(r),
      get: async () => docSnap(await fs.getDoc(r)),
      onSnapshot: (next, err) => fs.onSnapshot(r, s => next(docSnap(s)), err),
    };
  };
  // cons: list of ["where", field, op, value] / ["orderBy", field, dir] / ["limit", n]
  const query = (path, cons = []) => {
    const c = fs.collection(db, full(path));
    const q = cons.length ? fs.query(c, ...cons.map(([k, ...args]) => fs[k](...args))) : c;
    const snapOf = s => ({ docs: s.docs.map(docSnap), size: s.size, empty: s.empty });
    return {
      doc: id => docRef(path + "/" + (id || fs.doc(c).id)),
      add: async d => { const r = await fs.addDoc(c, d); return docRef(path + "/" + r.id); },
      orderBy: (f, dir) => query(path, [...cons, ["orderBy", f, dir || "asc"]]),
      where: (f, op, v) => query(path, [...cons, ["where", f, op, v]]),
      limit: n => query(path, [...cons, ["limit", n]]),
      get: async () => snapOf(await fs.getDocs(q)),
      onSnapshot: (next, err) => fs.onSnapshot(q, s => next(snapOf(s)), err),
    };
  };
  // Several writes that land together or not at all. Paths are relative to the team.
  const batch = () => {
    const b = fs.writeBatch(db);
    return {
      set(path, d) { b.set(fs.doc(db, full(path)), d); return this; },
      update(path, d) { b.update(fs.doc(db, full(path)), d); return this; },
      delete(path) { b.delete(fs.doc(db, full(path))); return this; },
      commit: () => b.commit(),
    };
  };
  return {
    app,
    collection: query, doc: docRef, batch,
    uid: cred.user.uid,
    newId: path => fs.doc(fs.collection(db, full(path))).id,
    serverTime: () => fs.serverTimestamp(),
  };
}
