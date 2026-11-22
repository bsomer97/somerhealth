// ============================================================
//  APP CONFIG — the ONLY file you need to edit before uploading
// ============================================================
//
// 1) FIREBASE_CONFIG: paste the block Firebase showed you in
//    Project settings → Your apps → Web app → "SDK setup and configuration".
//    (It's safe for this to be public. Security comes from firestore.rules.)
//
// 2) MEMBERS: the two User UIDs from Firebase → Authentication → Users,
//    with the name and color each person should show up as.
//    These MUST be the same two UIDs you put in firestore.rules.
//
// 3) IMAGE_BASE: where exercise photos are loaded from (see README).

window.APP_CONFIG = {
  APP_NAME: "ourHealth",

  FIREBASE_CONFIG: {
    apiKey: "AIzaSyC_fkbxU7hCOoGjsOpG5uWLCnq-LH5_SbQ",
    authDomain: "somerfitness-28c7f.firebaseapp.com",
    projectId: "somerfitness-28c7f",
    storageBucket: "somerfitness-28c7f.firebasestorage.app",
    messagingSenderId: "527939509847",
    appId: "1:527939509847:web:1659f451df2394c029cd12",
    measurementId: "G-EF2Q0K7810"
  },

  MEMBERS: {
    "PASTE_BERK_UID": { name: "Berk", color: "#38bdf8" },
    "PASTE_WIFE_UID": { name: "Alara", color: "#f472b6" }
  },

  // Exercise photos are ~200 MB, too big to upload comfortably through the
  // GitHub website, so by default they're loaded straight from the old
  // myHealth repo. If you ever copy the data/images folder into this repo,
  // change this to "data/images/".
  IMAGE_BASE: "https://raw.githubusercontent.com/bsomer97/myHealth/main/data/images/",

  // How many days of workouts / food / weight stay "live-synced".
  // Older weeks load on demand. Keeps you far inside Firebase's free quota.
  LIVE_WINDOW_DAYS: 42
};
