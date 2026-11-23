SOLUNAR FISHING v3.13 — HARDY REEF OFFSHORE ACCURACY
==================================================
SMALL WEBSITE-ONLY PATCH — BASED ON OUR VERIFIED v3.12 PROJECT FILES.
NOT AN EXACT SNAPSHOT OF YOUR LIVE GITHUB BRANCH.

WHAT CHANGED
1) HARDY REEF WIND — OPEN WATER GRID PREFERENCE
   - Only Hardy Reef wind calls use Open-Meteo `cell_selection=sea`.
   - Other locations retain existing best-match grid behaviour.
   - Swell forecasts already request sea grid cells and still do.
   - These are model grid estimates, NOT on-site wind/buoy measurements.

2) GRID-POINT TRANSPARENCY — TODAY AND CALENDAR
   - Open the "Model grid locations" expandable section in the weather card.
   - Shows the requested fishing location's coordinates, returned wind grid
     centre, returned swell grid centre and approximate great-circle distances.
   - If a grid is >30 km from the selected location, show an explicit warning.
   - Missing/invalid grid metadata is flagged rather than invented.
   - Actual values are read from each live Open-Meteo API response.

3) HARDY REEF TIDE REFERENCE — VERIFIED GUIDANCE, NO FALSE DATA
   - Tides and Today now link to Maritime Safety Queensland tide tables,
     BOM's Queensland tide reference pages, and a separately labelled
     independent Hardy Reef tide listing.
   - MSQ Whitsundays port guidance notes a maximum tidal rise/fall of about
     4.2 metres and strong reef-gap tidal flows. This is NOT today's prediction.
   - No verified and licensed automatic Hardy Reef tide feed was confirmed.
     Consequently Hardy Reef ratings remain **solunar-only** and do not use
     Shute Harbour or Bowen heights as a proxy. This protects rating integrity.
   - Hardy Reef is a Marine National Park / Green Zone where recreational
     fishing is prohibited: the app keeps its zoning reminder.

UPLOAD ONLY THESE SIX FILES INTO THE ROOT OF YOUR REPOSITORY
  app.js
  weather.js
  marine.js
  styles.css
  index.html
  sw.js

SAFE UPLOAD / VERIFY
  1. Download your current repo as backup: GitHub -> Code -> Download ZIP.
  2. Create a branch from main, e.g. hardy-grid-v313.
  3. Upload ONLY the six files above, replacing root files.
  4. Open a pull request and check only those six website files changed.
  5. DO NOT merge if any files in tide-data, scripts, or .github differ.
  6. Merge and wait until Render redeploys. Refresh the mobile web app.
  7. Select Hardy Reef -> Today. Inspect "Model grid locations" and check the
     wind and swell grid-cell coordinates/distance. Check for an offshore wind
     request with `cell_selection=sea` if inspecting browser network tools.
  8. Select Hardy Reef -> Calendar and inspect the same model-grid metadata.
  9. Select Hardy Reef -> Tides and confirm official tide reference links are
     shown without unverified times and the rating says solunar-only.
 10. Select Shute Harbour -> Today, then Bowen -> Today, and confirm the usual
     Queensland tide predictions and 10-minute scoring are unaffected.
 11. Optional: if iPhone PWA still shows v3.12, reload in Safari, close and
     reopen the Home Screen app and allow the new service worker to activate.

NEVER UPLOAD/REPLACE/DELETE IN THIS PATCH
  .github/workflows/*
  scripts/*.py
  tide-data/*
  astro.js, tides.js, movement.js, icons, manifest.webmanifest

TESTING PERFORMED
  - JavaScript syntax checks for changed modules.
  - Existing forecast, astronomy, movement and missing-data tests.
  - Browser tests on a 390px-wide screen using synthetic but structurally
    realistic model JSON, covering Hardy sea wind requests, actual returned
    grid centres and distances, >30 km grid warnings, calendar transparency,
    Hardy reef tide advisory, no saved trips at Green Zone, and coastal fallbacks.
  - No unexpected JavaScript console/page errors in simulated browser tests.
  - Cannot directly verify live Open-Meteo requests or live GitHub deployment
    from this testing environment. Confirm after merging.

SOURCES
  Open-Meteo weather API: https://open-meteo.com/en/docs
  Open-Meteo marine API: https://open-meteo.com/en/docs/marine-weather-api
  Maritime Safety Queensland tide tables: https://www.msq.qld.gov.au/tides/tide-tables
  BOM tide predictions: https://www.bom.gov.au/australia/tides/
  MSQ Hardy Reef site guidance (Whitsundays Port Procedures, 2024):
  https://www.publications.qld.gov.au/ckan-publications-attachments-prod/resources/de65d45b-109f-403c-a3bd-f1f7949e2114/pages-from-whitsundays_ppm_master_november_2024-sec-4.pdf

LIMITATIONS / FURTHER WORK
  - Grid proximity alone cannot guarantee forecast accuracy. Reef-scale wind,
    swell, currents and wind-against-tide effects can vary considerably.
  - Third-party Hardy tide pages are provided as separately labelled links,
    not imported into calculations (no vetted data licence/API/datum).
  - Do not use this app for navigation. Check BOM marine warnings, official
    tide tables, charts, zoning and current local conditions before boating.
