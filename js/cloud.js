// Cloud layer: the ONLY file that talks to Firebase.
//
// - Signs you in (email + password).
// - Keeps live listeners on every shared collection and pours the results
//   into the in-memory Cache (store.js), then asks the app to re-render.
// - Uses Firestore's on-device cache, so the app opens instantly and keeps
//   working without signal; writes made offline sync once you reconnect.
//
// Loaded as an ES module straight from Google's CDN, so there's no build
// step: just commit the files and GitHub Pages serves them.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const cfg = window.APP_CONFIG;

if (!cfg || !cfg.FIREBASE_CONFIG || String(cfg.FIREBASE_CONFIG.apiKey).includes("PASTE")) {
  window.App && window.App.showSetupNeeded();
  throw new Error("Fill in js/config.js first");
}

const app = initializeApp(cfg.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Collections that grow every day are only live-synced for a recent window.
const WINDOWED = ["sessions", "history", "foodLog", "bodyMetrics"];
// Small, slowly growing collections are synced in full.
const FULL = ["profiles", "templates", "meals", "customExercises", "goals"];

let unsubscribers = [];

function windowStart() {
  const d = new Date();
  d.setDate(d.getDate() - (cfg.LIVE_WINDOW_DAYS || 42));
  return d.toISOString().slice(0, 10);
}

function listen(name, q) {
  const unsub = onSnapshot(q, (snap) => {
    const changes = snap.docChanges().map((c) => ({
      type: c.type,
      id: c.doc.id,
      data: c.doc.data()
    }));
    window.DataCache.applyChanges(name, changes);
  }, (err) => {
    console.error("Listener failed:", name, err);
    window.App && window.App.onCloudError(err);
  });
  unsubscribers.push(unsub);
}

function startListeners(uid) {
  stopListeners();
  const since = windowStart();
  FULL.forEach((name) => listen(name, collection(db, name)));
  WINDOWED.forEach((name) => listen(name, query(collection(db, name), where("date", ">=", since))));
  // Medications are private: each person only ever reads their own.
  listen("meds", query(collection(db, "meds"), where("ownerId", "==", uid)));
}

function stopListeners() {
  unsubscribers.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
  unsubscribers = [];
}

function reportWriteError(err) {
  console.error("Write failed", err);
  window.App && window.App.onCloudError(err);
}

window.Cloud = {
  windowStart,

  signIn(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  },
  signOut() {
    stopListeners();
    return signOut(auth);
  },
  resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  },

  // Writes are "fire and forget": the cache is already updated locally by
  // store.js, Firestore queues the write while offline and syncs it later.
  set(col, id, data) {
    setDoc(doc(db, col, id), data).catch(reportWriteError);
  },
  merge(col, id, data) {
    setDoc(doc(db, col, id), data, { merge: true }).catch(reportWriteError);
  },
  remove(col, id) {
    deleteDoc(doc(db, col, id)).catch(reportWriteError);
  },

  // Bulk write (used by the old-backup import). Firestore batches hold at
  // most 500 writes, so the list is split into chunks.
  async setMany(items, onProgress) {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db);
      items.slice(i, i + 400).forEach((it) => batch.set(doc(db, it.col, it.id), it.data));
      await batch.commit();
      if (onProgress) onProgress(Math.min(items.length, i + 400), items.length);
    }
  },

  // One-off read of an older date range (e.g. browsing a past week in
  // Progress). Results are merged into the cache but not live-synced.
  async loadRange(col, fromDate, toDate) {
    const q = query(collection(db, col), where("date", ">=", fromDate), where("date", "<=", toDate));
    const snap = await getDocs(q);
    const changes = snap.docs.map((d) => ({ type: "added", id: d.id, data: d.data() }));
    window.DataCache.applyChanges(col, changes);
    return changes.length;
  },

  // Everything of mine in one collection (for the JSON backup download).
  async loadAllMine(col) {
    const q = query(collection(db, col), where("ownerId", "==", auth.currentUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }
};

onAuthStateChanged(auth, (user) => {
  if (user && cfg.MEMBERS[user.uid]) {
    startListeners(user.uid);
  } else {
    stopListeners();
  }
  window.App.onAuth(user);
});
