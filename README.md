# BP Log

A private, local-first blood pressure tracker. It stores sessions in the browser with IndexedDB and can run as a static site.

## Features

- Save several blood pressure readings as one measurement session.
- Filter readings and calculated statistics by time of day, including overnight ranges.
- Compare session averages on a chart whose spacing reflects the actual time between sessions.
- Move through the measurement fields with visible Next and Done buttons on mobile.
- Export CSV data or create and restore a JSON backup.

## Use Locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173` from this folder.

## iPhone Use

Put this folder on GitHub Pages or any static host, open it in Safari, then use Share -> Add to Home Screen. Data stays in that browser install unless you export/import a backup.

## Backups

- `Backup` exports all sessions as JSON.
- `Restore` imports that JSON backup and replaces the local database.
- `CSV` exports readings for spreadsheets or sharing with a clinician.

This app is for tracking only and does not provide medical advice.
