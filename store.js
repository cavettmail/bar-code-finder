// Shared storage for the team (Google Firebase / Firestore).
// Everything lives under teams/<team id>/..., and the team id comes from the team code in the app link.
const V = "10.14.1";
const BASE = `https://www.gstatic.com/firebasejs/${V}/`;

export async function connect(config, teamId) {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(BASE + "firebase-app.js"),
    import(BASE + "firebase-auth.js"),
    import(BASE + "firebase-firestore.js"),
  ]);
  const app = initializeApp(config);
  const a = auth.getAuth(app);
  await auth.signInAnonymously(a);
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch { db = fs.getFirestore(app); }
  const root = `teams/${teamId}`;
  const docSnap = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
  const docRef = path => {
    const r = fs.doc(db, root + "/" + path);
    return {
      id: r.id,
      set: d => fs.setDoc(r, d),
      update: d => fs.updateDoc(r, d),
      delete: () => fs.deleteDoc(r),
      get: async () => docSnap(await fs.getDoc(r)),
      onSnapshot: (next, err) => fs.onSnapshot(r, s => next(docSnap(s)), err),
    };
  };
  const query = (path, order) => {
    const c = fs.collection(db, root + "/" + path);
    const q = order ? fs.query(c, fs.orderBy(order[0], order[1])) : c;
    return {
      doc: id => docRef(path + "/" + (id || fs.doc(c).id)),
      add: async d => { const r = await fs.addDoc(c, d); return docRef(path + "/" + r.id); },
      orderBy: (f, dir) => query(path, [f, dir || "asc"]),
      onSnapshot: (next, err) => fs.onSnapshot(q, s => next({ docs: s.docs.map(docSnap), size: s.size, empty: s.empty }), err),
    };
  };
  return { collection: query, doc: docRef };
}
