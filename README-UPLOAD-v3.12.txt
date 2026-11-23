SOLUNAR FISHING v3.12 — HARDY REEF + SWELL + CALENDAR WEATHER
===========================================================

WEBSITE-ONLY PATCH; NOT A FULL REPOSITORY REPLACEMENT.
Based on the previously produced Version 3.11 website code, not verified
byte-for-byte against the live GitHub main branch. Review the PR carefully.

UPLOAD EXACTLY THESE SIX FILES TO YOUR REPOSITORY ROOT:
  app.js
  index.html
  marine.js        <-- NEW file: do not forget it
  weather.js
  styles.css
  sw.js

WHAT IT ADDS
  - Hardy Reef to the location dropdown as an OFFSHORE CONDITIONS REFERENCE.
    Hardy Reef is in a Marine National Park / Green no-take zone; recreational
    fishing is prohibited there. The app shows a prominent warning and links
    to the Reef Authority zoning information. It does not allow saving a fishing
    session at Hardy Reef.
  - Hardy Reef's offshore position is approx -19.75, 149.233333 (AEST).
  - Hardy Reef uses offshore wind and swell model forecasts and sun/moon only:
    it does NOT borrow Shute Harbour's tides or 10-minute tide records.
  - Today: a compact swell summary with current hour's predicted swell
    height/direction/period and the day's peak swell and combined wave height.
    It stays within the existing weather panel; the scrollable hourly wind
    list and km/h/knots control are retained.
  - Calendar: selected day gets an average wind speed/direction and peak gust,
    plus maximum forecast swell height, mean period, direction and combined waves.
    Open-Meteo wind model forecasts typically cover up to 16 days and marine
    forecasts cover up to 8 days. Past dates and longer-range forecasts do NOT
    show fictional forecast values. Different models have different horizons.
  - Proserpine Dam: wind forecast but no ocean swell or tides.
  - 10-minute and high/low tide-scoring toggle still applies to Shute Harbour
    and Bowen; unchanged scoring code and backend data.

SAFE DEPLOYMENT
  1. Save or download a backup of the current main branch (GitHub Code -> Download ZIP).
  2. Create a new branch from main: 'hardy-swell-calendar-v312'.
  3. Extract the patch ZIP locally. Upload the SIX named files into the ROOT
     on that branch, replacing only existing files with matching names.
     marine.js is new; upload it to root, not scripts/ or tide-data/.
  4. Open the pull request and verify ONLY five existing files are changed
     and marine.js is added. Abort if any tide JSON or workflow is changed.
  5. Merge to main, confirm Render redeploys, reload the iPhone app.
  6. Test Today > Shute Harbour: wind, swell, and tide-scoring toggle.
  7. Test Calendar > Shute Harbour: today's wind + swell, a day >8 days away
     (wind only), and a day >16 days away (no live model forecasts).
  8. Test Proserpine Dam: swell N/A; test Hardy Reef: zoning warning and
     no tide station or saved-trip button.
  9. If old version persists, close the Home Screen app, open the website in
     Safari and refresh once to allow the versioned offline cache to update.

DO NOT UPLOAD, REPLACE, OR DELETE:
  .github/workflows/sync-tides.yml
  scripts/sync_qld_tides.py
  scripts/sync_qld_intervals.py
  tide-data/* (all your generated JSON files)
  astro.js, tides.js, movement.js, icons, and manifest.webmanifest

LIMITATIONS
  - Marine and wind forecasts are model-based data supplied through Open-Meteo;
    they are not official BOM marine warnings or live observations. Always
    check https://www.bom.gov.au/marine/ and marine park zoning before boating.
  - Some nearshore marine grid cells may not deliver usable swell values; the
    app will show unavailable, rather than invent readings.
  - Marine/swell source availability was verified from API documentation; a
    live API request from your deployed Render website has not yet been tested.
  - Browser integration tests ran using realistic synthetic API responses.

ROLLBACK
  Revert the six-file merge commit (or revert the PR) in GitHub; your existing
  verified Queensland tide files and tide-sync jobs remain unchanged.
