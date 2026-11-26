# Solunar Fishing v3.14 — Abbot Point observed waves

## Exactly what this update does

- **Today** (Bowen, Shute Harbour, Hardy Reef): shows *observed* wave conditions from the Queensland Government's **Abbot Point** buoy (official spelling: one "t" in "Abbot").
- Displays significant wave height (Hs), maximum observed wave height (Hmax), peak energy period (Tp), and wave direction, where available.
- Shows the observation time in Queensland time (AEST), hours since measurement, and distance between the buoy and the selected fishing location.
- Checks the source every ~30 minutes while Today is being viewed; refresh button allows an immediate check. A separate GitHub Actions workflow updates the published JSON every three hours.
- Rejects observations older than 18 hours; a missing or stale dataset produces a clear message, **not made-up wave figures**.
- **Calendar** still uses the existing Open-Meteo *forecast* swell data, as future wave observations do not exist.
- Existing wind forecasts, 10-minute tides, high/low tides, five-star ratings, trips, and locations remain unchanged. Weather/waves do not influence star ratings.

## Important accuracy limitation

This buoy measures total sea-state waves, NOT a separately measured swell component. It is located at **19.860567° S, 148.094333° E**, approximately 23 km from Bowen, 86 km from Shute Harbour and 120 km from Hardy Reef (great-circle distances based on the app's fishing-location coordinates). Observed waves at the buoy are not necessarily representative of fishing grounds or exposed offshore reef passages. Refer to official BOM marine warnings before boating. The QLD site describes the near-real-time observations as unverified.

## Upload to GitHub WITHOUT overwriting the tide system

Create a branch from `main` named `abbot-point-waves-v314`.

Upload/replace these **five files in the repository ROOT**:
- `app.js`
- `index.html`
- `styles.css`
- `sw.js`
- `waves.js` (new)

Upload these **two files into their correct folders**:
- `scripts/sync_abbot_point_waves.py` (new)
- `.github/workflows/sync-abbot-waves.yml` (new; hidden `.github` folder)

Do not upload the ZIP file itself. Do not replace `scripts/sync_qld_tides.py`, `scripts/sync_qld_intervals.py`, `.github/workflows/sync-tides.yml`, or ANY `tide-data/` files.

Open a pull request and review the seven file changes. Merge into main. The new Abbot Point workflow should trigger on that commit; if not, open GitHub Actions and choose **Sync Queensland Abbot Point observed waves → Run workflow**. The workflow is independent of the tide sync.

**Do not delete any old Hay Point script or workflow until the Abbot Point workflow has succeeded and the live app displays readings.** If a separate old Hay Point workflow was deployed, disable it afterward to avoid needless runs. If the Hay Point work was never uploaded, there is nothing to remove.

After GitHub Actions succeeds, open:

`https://solunar-fishing.onrender.com/wave-data/abbot-point.json`

This must show `"station": "abbot-point"` and a nonempty `observations` array. Check that the `recordedAt` date is recent. If you see 404, the generated data file has not been published/deployed yet; see the Abbot Point Actions job log.

When Render redeploys, refresh the iPhone Home Screen app. On Today select Bowen or Shute Harbour, then look for **Abbot Point · measured waves** within Wind & Weather. On Proserpine Dam, ocean wave observations are not applicable.

## Data sources and attribution

- Government live station: https://www.qld.gov.au/environment/coasts-waterways/beach/monitoring/waves-sites/abbot-point
- QLD near-real-time dataset: https://www.data.qld.gov.au/dataset/coastal-data-system-near-real-time-wave-data
- Source publisher: The State of Queensland, under Creative Commons Attribution 4.0; read the government site disclaimer.
- Calendar swell **forecast**: Open-Meteo Marine API. Today's observed buoy readings are not the same thing as forecasts.

## Verification performed

- Python syntax and wave CSV parsing tests (incl. filtering other sites, Hsig/Hs fields, timestamps)
- JavaScript syntax and data validation tests, including stale/wrong-station data
- Simulated in-browser Today and Calendar test (Abbot Point card rendered; no JS errors)
- The real government feed was **not** downloaded from this runtime. Confirm the first GitHub workflow run before treating the feature as operational.

## Rollback

Revert only these website files through GitHub if something unexpected occurs. The tide scripts and tide-data have not been touched.
