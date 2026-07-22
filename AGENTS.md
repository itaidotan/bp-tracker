# BP Log Engineering Notes

Read this file before changing the app. `README.md` is the user-facing overview; this file records implementation details and project decisions for future coding sessions.

## Product and Architecture

BP Log is a dependency-free, local-first blood pressure tracker. It is a static PWA made from `index.html`, `styles.css`, and `app.js`, with `manifest.webmanifest`, `icon.svg`, and `sw.js` providing installability and offline use. There is no server, framework, package manager, build step, analytics, or cloud data synchronization.

All health data stays in the browser's IndexedDB database. GitHub Pages serves only the application files.

## Storage Safety — Non-Negotiable

Existing user data must never be deleted, rewritten, migrated, or invalidated during ordinary feature work.

The persistent identifiers in `app.js` are:

```js
const DB_NAME = "bp-log-db";
const DB_VERSION = 1;
const STORE = "sessions";
```

Do not change these values or add database cleanup/migration code unless the user explicitly authorizes a data migration after making a backup. Updating application files or the service-worker cache does not affect IndexedDB.

The Restore action is intentionally destructive: it clears the store and replaces it with the selected JSON backup. Do not invoke it during testing.

Each stored session has this shape:

```js
{
  id: crypto.randomUUID(),
  startedAt: ISO_DATE,
  readings: [{ sys, dia, pulse, recordedAt: ISO_DATE }]
}
```

When a pending batch is saved, `startedAt` is the save time and its readings are assigned timestamps one minute apart. Keep exports backward-compatible with existing JSON and CSV data.

## Current Behavior

- The entry area contains three compact fields—Sys, Dia, and Pulse—side by side, including on phones. Preserve this layout unless the user asks to change it.
- The fields use `enterkeyhint="next"` / `enterkeyhint="done"` and JavaScript Enter handling. Web apps cannot add custom controls inside the iPhone system numeric keyboard.
- From/To are native `input type="time"` controls. On iPhone they invoke the native wheel-style time picker.
- Time presets are All day, Nighttime (22:00–06:00), Daytime (06:00–16:00), and Evening (16:00–22:00).
- Equal From/To values mean all day. Otherwise, the start is inclusive and the end is exclusive. A start later than the end is an overnight range.
- Time filtering uses each individual reading's local time and spans all stored dates. It affects history, session averages, chart points, and summary statistics.
- Selected-hours average and highest selected use every matching reading across all dates. The 30-day average applies both the time filter and its date cutoff.
- The chart plots filtered session averages. Its x-axis uses actual session timestamps, so missed days create proportional gaps. The 14-day and 30-day views use a fixed cutoff-to-now domain; All uses the first-to-last matching session.
- JSON backup and CSV export always include all stored data, regardless of the active visual filter.

## Editing and Validation

Keep the app dependency-free unless there is a strong, user-approved reason to change that.

After JavaScript changes, run:

```powershell
node --check app.js
node --check sw.js
git diff --check
```

Also verify that every `document.querySelector("#...")` reference has a matching HTML ID. For filtering changes, test normal, overnight, and equal-time/all-day ranges, especially exact boundary times.

For UI changes, inspect a narrow mobile rendering. Preserve large tap targets, safe-area padding, and the original compact measurement row.

## PWA and Deployment

The service worker caches the complete static app. Increment the `CACHE` value in `sw.js` whenever deployed assets change so installed copies receive the update. A phone may need one close/reopen or two refreshes while the new worker takes control. Cache deletion in `sw.js` removes only old Cache Storage entries, never IndexedDB.

The repository deploys from `main` to:

https://itaidotan.github.io/bp-tracker/

Use short, informative commit messages. After pushing `main`, verify the public page contains a unique marker from the new revision and that the new service-worker cache version is live. Confirm the working tree is clean and `main` matches `origin/main`.
