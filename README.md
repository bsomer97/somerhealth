# ourHealth

A shared workout, food and progress tracker for two people. It runs as a home-screen app (PWA) on both phones, hosted free on GitHub Pages, with data synced through your Firebase project.

- **Each of you has your own** schedule, workouts, history, weight, food log, goals and targets.
- **You can see each other's.** Use the name switch at the top of the screen. Your partner's data is read-only, with one-tap "copy to mine" buttons.
- **Meals are shared.** A meal either of you saves (with calories and protein) goes into one library that you both log from.
- **Medications stay private.** Only the person who added them can see them.
- **Works offline.** Anything logged at the gym without signal syncs once you're back online.

---

## One-time setup (about 15 minutes)

### 1. Fill in `js/config.js`

Open `js/config.js` and replace every `PASTE_...` value.

- **FIREBASE_CONFIG** comes from Firebase console → ⚙️ Project settings → *Your apps* → your web app → *SDK setup and configuration* → **Config**. Copy the values from the `firebaseConfig = { ... }` block.
- **MEMBERS** comes from Firebase console → Authentication → **Users**.
  - Copy the *User UID* of each account.
  - Put each UID in place of `PASTE_BERK_UID` and `PASTE_WIFE_UID`.
  - Set each person's name and color.

### 2. Publish the security rules

Open `firestore.rules`. Replace the same two `PASTE_..._UID` values with the real UIDs.

Then go to Firebase console → Firestore Database → **Rules**. Delete everything there, paste the whole file in, and click **Publish**.

> These rules replace the earlier version. They add the `history` and `customExercises` collections and make medications private.

### 3. Upload to GitHub

1. Create a new **public** repository, e.g. `ourHealth`.
2. Click **Add file → Upload files**.
3. Drag in **everything inside** this folder: `index.html`, `css/`, `js/`, `data/`, `icons/`, `manifest.json`, `sw.js`, `firestore.rules` and `README.md`. Don't drag the folder itself.
4. Click **Commit changes**.
5. Go to **Settings → Pages**. Set *Source* to "Deploy from a branch", choose `main` and `/ (root)`, and click **Save**. After a minute the site is live at `https://bsomer97.github.io/ourHealth/`.

Your data is not in the repo. It lives in Firestore behind the rules, so a public repo is fine.

### 4. Allow your site to sign in

Firebase console → Authentication → **Settings → Authorized domains** → **Add domain** → `bsomer97.github.io`

### 5. Install on both phones

1. On each iPhone, open the site in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open the app **from the home screen icon** and sign in there.

The installed app has its own storage, separate from Safari, so you sign in inside the app itself.

### 6. Bring over your old data (Berk)

1. In the **old** myHealth app: **Settings → Download backup**.
2. In the **new** app: **Settings → Bring over your old myHealth data**, and choose that file.

This copies your schedule, history, saved workouts, favorites, exercise memory, weights, meals, food log, medications and custom exercises. Running it twice won't create duplicates.

Old meals arrive with 0 g protein. Edit them in **Food → Shared meal library**.

### 7. Fill in your profile (both of you)

Go to **Settings → Profile & targets** and fill in age, sex, height, weight, workouts per week, daily activity, goal and protein per kg. The app then calculates daily calorie and protein targets, and shows how in *How this is calculated*.

---

## Updating the app later

Edit or replace files in the repo and commit. Both phones get the new version the next time the app is opened while online.

You no longer need to bump a cache version number. App code is always fetched fresh when there's signal. If a phone ever seems stuck on an old version, use **Settings → check for app update**.

## Files

| File | What it does |
|---|---|
| `js/config.js` | **Your settings.** Firebase keys, the two members, where photos load from |
| `js/cloud.js` | The only file that talks to Firebase (sign-in, live sync, offline cache) |
| `js/store.js` | Data layer: reads and writes for every kind of data |
| `js/app.js` | App shell: navigation, person switch, intensity engine, calorie and protein math |
| `js/views/workouts.js` | Schedule, workout detail, exercise library, Today and the live session |
| `js/views/food.js` | Food tab and the shared meal library |
| `js/views/progress.js` | Weekly summary, "the two of you" comparison, goals |
| `js/views/settings.js` | Profile, medications, old-data import, exports |
| `js/muscle-map.js`, `js/vendor/` | Muscle map (unchanged from myHealth) |
| `data/exercises.json` | The exercise database (unchanged from myHealth) |
| `firestore.rules` | Database security rules (paste into Firebase) |
| `sw.js`, `manifest.json`, `icons/` | Make it installable and offline-capable |

## How the data is stored (Firestore collections)

Every personal document has an `ownerId`. The rules let both of you **read** it but only the owner **change** it.

| Collection | Contents |
|---|---|
| `profiles/{uid}` | Profile, targets settings, favorites, last-used weights per exercise, live-workout status |
| `sessions` | Scheduled workouts (date, time, exercises) |
| `history` | Completed workouts with what was actually lifted |
| `templates` | Saved workouts |
| `meals` | **Shared** meal library (name, serving, calories, protein) |
| `foodLog` | What each person ate per day (calories and protein copied in at log time) |
| `bodyMetrics` | Weight log, one doc per person per day |
| `goals` | Goals with progress |
| `customExercises` | Exercises either of you added (shared) |
| `meds` | Medications, **private to the owner** |

## Staying on the free plan

The app only live-syncs the last 6 weeks of workouts, food and weights (`LIVE_WINDOW_DAYS` in `config.js`). Older weeks load once when you browse to them.

For two people this is typically a few thousand reads a day. Firebase's free tier allows 50,000 reads and 20,000 writes per day, so it costs nothing.

**Backups:** the free plan has no automatic database backups. Use **Settings → Download my data** now and then. **Download daily CSV** gives you both people's day-by-day numbers for Excel or Sheets.

## Exercise photos

The photos (~200 MB) aren't in this repo. They load from the old myHealth repo (`IMAGE_BASE` in `config.js`) and are cached on the phone after first view. **Don't delete the old repo**, or copy its `data/images` folder here with Git or GitHub Desktop and set `IMAGE_BASE` to `"data/images/"`.

## Troubleshooting

- **"The database refused this request"**: the two UIDs in `firestore.rules` and `js/config.js` don't match the ones in Authentication → Users.
- **Sign-in works locally but not on the live site**: add `bsomer97.github.io` to Authorized domains (step 4).
- **"Almost there" screen**: `js/config.js` still has `PASTE_...` values.
- **"This account isn't on the list"**: that account's UID isn't in `MEMBERS` in `config.js`.
- **Changes from the other phone don't appear**: check the top bar. *offline · will sync* means that phone has no connection right now.
