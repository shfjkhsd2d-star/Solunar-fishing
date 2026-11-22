# Solunar / Tide Fishing Planner — v3.2

**What this update fixes:** clearer 404 diagnostics, sync on every normal GitHub push, and offline app installation that does not depend on optional tide JSON files. It **does not include guessed tide predictions**, and cannot guarantee the Queensland Government API will permit automated downloading.

## If the Tide screen says HTTP 404 (Version 3.2)

An HTTP 404 from your Render app means the **site** could not supply one of its own `tide-data/` JSON files; it is not proof that the Queensland API itself returned 404. Version 3.2 now shows the specific missing filename.

1. Open `https://solunar-fishing.onrender.com/tide-data/manifest.json` in Safari. If that says 404, `tide-data/manifest.json` is not in the deployed publish directory. Upload this folder and verify Render's publish directory is `.`.
2. If it opens and shows `"stations": {}`, the index exists **but has no annual predictions yet**. The initial ZIP intentionally contains an empty index. Open GitHub **Actions → Sync official Queensland tide predictions → Run workflow** on `main`.
3. Check the workflow log. Green completion with real data should add `tide-data/shute-2026.json` and/or `tide-data/bowen-2026.json` and update `manifest.json`. If the API and CSV downloads are blocked, the log will report the reason. **Do not upload mock/test tide files as real predictions.**
4. Open `https://solunar-fishing.onrender.com/tide-data/shute-2026.json`. If GitHub contains this file but Render returns 404, check that Render deployed the latest data commit and is publishing the repository root (not an old nested folder).
5. After the two real files are accessible from Render, tap **Check for updated tide files** in the app. If the screen is stale on iPhone, fully close and reopen the Home Screen app or refresh Safari.

The corrected GitHub Actions workflow also runs on an ordinary push to `main`, not just edits to two specific workflow files. The app keeps solunar-only ratings when tide data is absent; it will **not** fabricate tide times to hide the error.

**Current testing limitation:** The Queensland government's CSV download returned an automated-access verification challenge in this environment. Until a green GitHub Actions run publishes genuine JSON, automatic tide integration cannot be claimed to be working.

An installable, mobile-friendly static web app for the Whitsundays and Peter Faust Dam.

**Updated in v3.3:** Official Queensland Government **CKAN DataStore Web API** is the preferred tide source. The sync paginates through API records and validates a complete annual high/low prediction dataset; if the API is blocked, incomplete, or unavailable, it tries the official government CSV. Proserpine Dam (Peter Faust Dam / Lake Proserpine) remains a freshwater location. No user CSV imports or tide entry are necessary once either official source succeeds.

**Important:** The upload ZIP does **not** include invented or sample tide predictions. The first real official tide files are created and committed by a GitHub Actions job after upload. **These files are not pre-populated with sample tides.** If the Queensland portal blocks downloads or has not yet published a future-year CSV, the app labels that date **Solunar only**, rather than manufacturing a high/low tide time. Queensland's 2027 *tide tables* PDF exists but the individual station's annual high/low CSV may not be available yet.

## How to upload

1. Download and **extract** `Solunar-Fishing-v3.3-Four-Locations.zip`.
2. Open [your GitHub repository](https://github.com/shfjkhsd2d-star/Solunar-fishing) on the **main** branch.
3. Upload the **extracted contents** into the repository root; replace matching files. **Keep the directory structure** exactly as shown below. Don't upload the ZIP unchanged. On desktop, drag the contents of the extracted folder (including the hidden `.github` directory) into **Add file → Upload files**. If using a phone, use GitHub's desktop-site view and make sure the nested folders also upload. GitHub's file-upload control does not always preserve folders selected in a mobile file picker.
4. Commit the changes. Render will redeploy the app if auto-deploy is enabled. Existing Render **Static Site** settings can stay unchanged (publish directory `.`).
5. In GitHub, open **Actions → Sync official Queensland tide predictions**. On a new upload, the push should trigger the workflow. If it does not, choose **Run workflow** on the main branch. The workflow requires repository **Actions** enabled and **Contents: write** permission for `GITHUB_TOKEN` (the YAML requests that permission). Some repository or organisation settings may override this.
6. Check the green workflow result. A successful sync creates files such as `tide-data/shute-2026.json` and `tide-data/bowen-2026.json`, plus `tide-data/manifest.json`; those are automatically committed. Verify Render has deployed the new data commit as well.
7. Open <https://solunar-fishing.onrender.com/> in Safari and refresh. Select Shute Harbour or Bowen and open **Tides**. You should see "Official QLD" and true high/low data when those official files have been synced.

### Required repository layout

```text
index.html
styles.css
app.js
astro.js
tides.js
sw.js
manifest.webmanifest
icon-192.png
icon-512.png
tide-data/
  manifest.json                 # starts empty; GitHub Actions updates it
  shute-2026.json              # example: produced by GitHub Actions
  bowen-2026.json              # example: produced by GitHub Actions
.github/
  workflows/
    sync-tides.yml
scripts/
  sync_qld_tides.py
tests/
  test-core.js
  test-ui.js
  test-404.js
  test-sync.py
README.md
THIRD_PARTY_NOTICES.txt
```

**GitHub upload caution:** The `.github/workflows/sync-tides.yml` and `scripts/sync_qld_tides.py` files are essential for automatic updates. Without either one, the website still works, but will show "Solunar only" unless previously imported data exists on the device.

## How automatic tide sync works

- Every Monday (UTC) and at first upload, GitHub Actions runs `python scripts/sync_qld_tides.py` on GitHub’s servers. It uses the official QLD CKAN catalogue to locate annual **predicted high/low** resources, then tries the **Web API first**. Confirmed 2026 Shute Harbour and Bowen resource IDs/CSV links provide a fallback if the catalogue request fails.
- The script first queries the public CKAN `datastore_search` endpoint by station resource ID in pages of 300 records. It checks that results include the published `Date`, `Time`, `Ind`, and `Reading` columns, requires **every day of the year** and at least 1100 high/low events, and refuses partial or malformed data. If this fails, the same validation runs against the official CSV for that resource. Discovery uses `package_show` for the corresponding annual dataset. Only HTTPS `*.qld.gov.au` endpoints are accepted.
- The script generates local `tide-data/` JSON files and a manifest, then GitHub Actions commits them. Render republishes the updated repository files on the next deployment.
- The app fetches only the needed station and year from its own website. No cross-origin browser request is required; fetched files may be available offline after first use.
- **The workflow has been tested with simulated API responses and mock official-format CSVs. This development environment could not connect to the live QLD Web API or CSV endpoints, so actual external access must be verified in GitHub Actions after your first upload.** If both API and CSV downloads fail (for example due to access restrictions), the workflow fails transparently and the app remains solunar-only rather than displaying fake tide values.
- If one year's official CSV is not available, no file is created for that year; the calendar displays only astronomical scores. Data from older successfully downloaded years is retained when a temporary connection problem occurs.

## Available locations — v3.3

The app has **exactly four choices** in the Today, Calendar and Tides location picker, in this order:

| Fishing location | Tide behaviour |
|---|---|
| Bowen | Official Bowen tide station (once synced) |
| Proserpine Dam | **Freshwater** (Peter Faust Dam / Lake Proserpine); no ocean tides, solunar only |
| Shute Harbour | Official Shute Harbour tide station (once synced) |
| Proserpine River Mouth | Shute Harbour station used as **uncorrected reference only**; no measured river-mouth tide predictions |

Airlie Beach and Cannonvale can no longer be selected. Previously saved trips at those places are still visible as **previous location** records and may be removed, so the update does not silently discard existing trip history. If one of those locations was selected in an older version, the initial active location resets to Shute Harbour.

**Important:** Shute Harbour water levels and timing may differ considerably from conditions inside the Proserpine River estuary. No local tide correction has been applied. The tidal data sync still depends on a successful live Queensland API or CSV download through GitHub Actions, and the `HTTP 404` problem will persist until verified data files are generated and served by Render. Do not treat this location-choice update as proof that government tide data is syncing.

Proserpine Dam is a Stocked Impoundment Permit Scheme (SIPS) location; adults aged 18+ need a permit to line fish. See the [official Queensland Peter Faust Dam page](https://www.qld.gov.au/recreation/activities/boating-fishing/rec-fishing/dams/stocked-impoundment-permits/locations/peter-faust).

## Scores and limitations

- Solunar calculations provide approximate moonrise/moonset, overhead/underfoot, sunrise/sunset, moon illumination and suggested 2-hour fishing windows.
- The five-star output is a *relative planning heuristic*, not a measured catch probability. Fishing results depend on water temperature, weather, species, river discharge, baitfish and habitat.
- When verified QLD government high/low data is loaded for a coastal date, the tide-related score components switch on. If unavailable, the app labels the score as **Solunar only**.
- These are **predictions**, not observed real-time sea levels. Not for boating/navigation safety or regulatory compliance; check official tidal predictions, marine forecasts and fishing rules before leaving.
- Your past saved trips are kept on the same device under the original app storage key. Old manually imported tides (if present) remain fallback data but do not override new official files.

## Source credit

- [Queensland Government CKAN Data API example](https://www.data.qld.gov.au/api/1/util/snippet/api_info.html?resource_id=35c2e31e-b648-4334-bcf9-b44a37c7b9ca)
- [Maritime Safety Queensland Open Tide Data](https://www.msq.qld.gov.au/tides/open-data)
- [Shute Harbour predicted high/low dataset](https://www.data.qld.gov.au/dataset/shute-harbour-tide-gauge-predicted-high-low-data)
- [Bowen predicted high/low dataset](https://www.data.qld.gov.au/dataset/bowen-tide-gauge-predicted-high-low-data)
- Predictions are prepared by the Bureau of Meteorology and released via QLD Government Open Data, typically with CC BY 4.0 attribution; review each official dataset's metadata and conditions.
- Astronomy incorporates SunCalc-style BSD-2-Clause calculations; see `THIRD_PARTY_NOTICES.txt`.

## Offline verification checks

```sh
node tests/test-core.js
node tests/test-ui.js
node tests/test-404.js
node tests/test-locations.js
python tests/test-sync.py
```

These include simulated **multi-page Web API**, **incomplete-API-to-CSV fallback**, and mock annual tide fixtures, **not actual tide predictions**. For a real end-to-end test, inspect the first GitHub Actions log after the files are uploaded.

## Troubleshooting

- **Site looks unchanged:** confirm Render deployed the latest GitHub commit. Refresh Safari, or close and reopen the installed Home Screen app. The service-worker cache identifier is updated in v3.
- **Site works but tides say unavailable:** check GitHub **Actions** sync result, ensure the JSON files exist, and confirm Render deployed the data commit. An annual API resource and CSV may not yet be published or may be blocked from automated downloads.
- **GitHub workflow says read-only:** in GitHub **Settings → Actions → General → Workflow permissions**, set **Read and write permissions** if you control the repository. The workflow itself also requests `contents: write`.
- **Main branch is not your default branch:** edit `.github/workflows/sync-tides.yml` to use your current branch instead of `main`.
- **Future months are solunar only:** government may have published only the printed tide table PDF, not the station’s API/CSV annual resource. Do not infer tide times from a neighbouring year.
- **Proserpine Dam shows no tides:** correct and intentional — it's a freshwater reservoir.
- **Government API and CSV both blocked:** the app won't present unverified data; this needs an alternative licensed, server-accessible source or permissioned feed.

## Web API integration details (v3.1)

- Public dataset resource IDs confirmed in the Queensland portal for **2026**:
  - Shute Harbour: `35c2e31e-b648-4334-bcf9-b44a37c7b9ca`
  - Bowen: `d4324ba3-322a-4d7c-b9d2-9b1703f96f76`
- Example endpoint (public GET form as documented by QLD):

  `https://www.data.qld.gov.au/api/action/datastore_search?resource_id=35c2e31e-b648-4334-bcf9-b44a37c7b9ca&limit=300&offset=0`

- The app doesn't call this third-party endpoint from Safari. GitHub Actions queries it, saves verified predictions as static JSON, and Render serves those JSON files from the app's own origin. This avoids browser CORS and works for the offline-capable iPhone app.
- **API availability is not guaranteed:** some portal resource metadata flags the Shute Harbour DataStore as not containing all source-file records. Validation rejects incomplete sets before the app can use them. The official annual CSV fallback is retained by design.
- API is not a live water-level stream. It provides officially predicted high/low tides; live/observed gauges are different datasets.
- If API access requires credentials or is blocked, the public CSV fallback may still work. Do not put private keys in JavaScript or commit them into the repository.
