# Solunar Fishing v3.8 — official 10-minute tide movement

This is a **patch** for the working v3.7 app, not a fresh app. It does not replace `scripts/sync_qld_tides.py` or existing `tide-data/*.json`.

## Files to upload to the root of the GitHub repository

- `app.js` — load validated 10-minute predictions and display movement/chart/scoring labels.
- `astro.js` — use ten-minute movement score when present, retain existing high/low fallback.
- `movement.js` **new** — computes 60-minute predicted water-level changes using 10-minute heights.
- `styles.css` — mobile-friendly movement display.
- `index.html` — loads new script and busts iPhone cache.
- `sw.js` — updated offline cache.
- `.github/workflows/sync-tides.yml` — **replace the workflow** with version that runs the existing working high/low script, then the *optional* interval script before committing files.
- `scripts/sync_qld_intervals.py` **new** — downloads, validates and publishes 10-minute QLD predicted water levels.

Upload hidden `.github` and `scripts` directories exactly as arranged here. Do **not** delete `tide-data`, `weather.js`, `tides.js`, `manifest.webmanifest`, `scripts/sync_qld_tides.py`, or any other repository file. GitHub may require the desktop view to upload to nested folders.

## What changes in the scoring

If a complete verified 10-minute annual tide file exists for Bowen or Shute Harbour, the app measures predicted water-height difference across a 60-minute window around the **centre of each 2-hour fishing candidate**:

- `m/h = predicted height (30 minutes later) - predicted height (30 minutes earlier)`.
- The absolute value is compared with the daily 90th-percentile water-level change.
- The **tide component** contributes between 0 and 20 points to a 1–100 heuristic score.
- The existing score bands remain: 5★ at ≥78, 4★ at ≥62, 3★ at ≥46, 2★ at ≥30.
- Existing lunar/sun components remain unchanged. The new tide component **replaces** the previous tide high/low timing and midpoint components; it is not added on top of them.
- Without a validated 10-minute year file, the previous high/low tide scoring is retained unchanged.
- Proserpine Dam always remains solunar-only. Proserpine River Mouth uses **Shute Harbour as an unadjusted reference station**; in-river tidal currents and tide times may differ substantially.

**Important**: rate of predicted water-height change is not a measurement of current speed, and the score is not an empirically validated fish-catch probability. Wind weather is still presented separately and does not influence the star score.

## Data source & automation

Official **predicted** 10-minute levels are published by Maritime Safety Queensland, using Bureau of Meteorology forecasts, via Queensland Open Data (CC BY 4.0):
- https://www.data.qld.gov.au/dataset/shute-harbour-tide-gauge-predicted-interval-data
- https://www.data.qld.gov.au/dataset/bowen-tide-gauge-predicted-interval-data
- https://www.msq.qld.gov.au/tides/open-data

The GitHub workflow runs on a push to `main`, via manual `workflow_dispatch`, and weekly on Monday. The *existing* high/low step is unchanged and required. The **new interval step is optional**: if QLD API or CSV download fails, the workflow may still be green, with an interval-step warning. In that case existing high/low tides and scores stay working. The app will not invent interval readings.

The optional interval script automatically discovers annual CSV resources via QLD CKAN `package_show`; it tries paginated `datastore_search`, then the official resource CSV. It requires **every 10-minute sample** for **all 365/366 days** in that year, and rejects duplicates/off-grid/invalid values. Previously verified years are retained when a source is temporarily unavailable.

If successful, the workflow commits `tide-data/interval-manifest.json` and verified `tide-data/shute-YYYY-10min.json`, `tide-data/bowen-YYYY-10min.json`. Only after **Render deploys these files** will the Today, calendar and Tide views show the new 10-minute label and water-level chart.

## Verify after upload

1. Open GitHub → Actions → `Sync official Queensland tide predictions` → latest run → `fetch-and-publish`.
2. Look for `OK shute 2026: verified all 52560 ten-minute API readings` (or CSV fallback); likewise Bowen. An interval-step warning means this extra data is not available, **not** that high/low tides broke.
3. Open `https://solunar-fishing.onrender.com/tide-data/interval-manifest.json` (should list verified years, if available).
4. Open `https://solunar-fishing.onrender.com/tide-data/shute-2026-10min.json` (should show an official source and `byDate` with 144 readings per day).
5. In app Today → Shute Harbour, the badge should say **10-min QLD movement**, the new card should show a day chart and best-window movement. Test Bowen and Proserpine River Mouth; confirm Proserpine Dam shows no tides.
6. If the phone still shows v3.7, close and reopen the installed app / hard refresh Safari. `index.html` and the service worker use v3.8 cache versioning.

## Validation performed

Tests are offline with generated synthetic annual samples, not live QLD API responses. They verify missing/duplicate data rejection, CSV + paginated API reading, fail-safe fallback to high/low, live UI simulation with complete year files, station/freshwater behaviour and existing forecast/weather/trips functions. Live QLD API output and deployment still need to be confirmed from your GitHub Actions logs.
