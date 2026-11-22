SOLUNAR FISHING v3.11 — COMPACT TODAY (WEBSITE-ONLY PATCH)
=========================================================

This PATCH is based on the Version 3.10 website files produced earlier in this
conversation. It has not been compared byte-for-byte with your latest live
GitHub code. If you have made manual edits since Version 3.10, use a branch
and inspect the changes before merging.

ONLY these FOUR files replace files in your repository ROOT:
  app.js
  styles.css
  index.html
  sw.js

WHAT'S NEW
  1. Today: The 24-hour hourly wind list is now a compact 228-pixel
     scrollable panel, with the current hour highlighted, and no extra
     Show all / Show daytime toggle. Existing km/h / knots unit control stays.
  2. Today: Removes the separate 10-minute tidal movement card.
     Detailed 10-minute data and chart remain accessible in the Tides tab.
  3. Today: A 10-min / High-low toggle is inside the fishing-score card.
     This actually changes the tide inputs to all calculated fishing scores,
     including the calendar. The preference is saved on the device.
  4. The default remains 10-minute tidal scoring. If data for that date is
     unavailable, it falls back to high/low tides; if both are unavailable,
     the rating is calculated from the sun and moon only.
  5. Proserpine Dam remains freshwater/solunar-only; only Bowen and Shute
     Harbour have the tide-scoring toggle. No River Mouth option is restored.

WHAT IS NOT INCLUDED / MUST NOT BE DELETED
  .github/workflows/
  scripts/sync_qld_tides.py
  scripts/sync_qld_intervals.py
  tide-data/ (all existing JSON files)
  astro.js, movement.js, tides.js, weather.js, icons and manifest
  Saved trips stored on the phone/browser

SAFEST UPDATE PROCESS
  1. In GitHub, create a branch from main: 'compact-today-v311'.
  2. Extract the ZIP and upload only app.js, styles.css, index.html, sw.js
     to your repository ROOT on this branch. Do NOT upload the ZIP itself.
  3. Inspect the pull request. Exactly 4 existing website files should
     change; your scripts and tide-data should have NO changes.
  4. Merge into main and let Render deploy. Refresh the app on iPhone.
  5. On Today > Shute Harbour, confirm hourly wind scrolls inside its panel.
  6. Tap High / low, then 10-min. The score and top windows may change.
     Changing methods does not guarantee a change in rounded star count.
  7. In Tides, confirm the official 10-minute chart still displays.
  8. Check Proserpine Dam and Bowen, calendar, and saved trips.

ROLLBACK
  If anything looks wrong, revert the four-file merge commit in GitHub.
  This restores your previous website code without touching your verified
  Queensland tide JSON files or GitHub tide-sync workflow.

LIMITATION
  Tests use sample tide/weather data; no live Render deployment was modified,
  and an actual iPhone browser session was not available for testing here.
