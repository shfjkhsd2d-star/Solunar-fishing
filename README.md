# Solunar / Tide Fishing Planner — v3.1

An installable, mobile-friendly static web app for the Whitsundays and Peter Faust Dam.

**New in v3.1:** Official Queensland Government **CKAN DataStore Web API** is the preferred tide source. The sync paginates through API records and validates a complete annual high/low prediction dataset; if the API is blocked, incomplete, or unavailable, it tries the official government CSV. Lake Proserpine remains a freshwater location. No user CSV imports or tide entry are necessary once either official source succeeds.

**Important:** The upload ZIP does **not** include invented or sample tide predictions. The first real official tide files are created and committed by a GitHub Actions job after upload. **These files are not pre-populated with sample tides.** If the Queensland portal blocks downloads or has not yet published a future-year CSV, the app labels that date **Solunar only**, rather than manufacturing a high/low tide time. Queensland's 2027 *tide tables* PDF exists but the individual station's annual high/low CSV may not be available yet.

## How to upload

1. Download and **extract** `Solunar-Fishing-v3.1-QLD-Web-API.zip`.
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

## Available locations

| Fishing location | Tide behaviour |
|---|---|
| Shute Harbour | Official Shute Harbour station |
| Airlie Beach | Shute Harbour **reference**, no local phase correction |
| Cannonvale | Shute Harbour **reference**, no local phase correction |
| Proserpine River mouth | Shute Harbour **reference**, not river-mouth tides |
| Bowen | Official Bowen station |
| Lake Proserpine (Peter Faust Dam) | **Freshwater** — no ocean tidal influence; uses sun/moon only |

The reference station is especially approximate in estuaries where tide timing and water movement can be very different. Lake Proserpine is a Stocked Impoundment Permit Scheme (SIPS) location; adults aged 18+ need a permit to line fish. See the [official Queensland Peter Faust Dam page](https://www.qld.gov.au/recreation/activities/boating-fishing/rec-fishing/dams/stocked-impoundment-permits/locations/peter-faust).

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
python tests/test-sync.py
```

These include simulated **multi-page Web API**, **incomplete-API-to-CSV fallback**, and mock annual tide fixtures, **not actual tide predictions**. For a real end-to-end test, inspect the first GitHub Actions log after the files are uploaded.

## Troubleshooting

- **Site looks unchanged:** confirm Render deployed the latest GitHub commit. Refresh Safari, or close and reopen the installed Home Screen app. The service-worker cache identifier is updated in v3.
- **Site works but tides say unavailable:** check GitHub **Actions** sync result, ensure the JSON files exist, and confirm Render deployed the data commit. An annual API resource and CSV may not yet be published or may be blocked from automated downloads.
- **GitHub workflow says read-only:** in GitHub **Settings → Actions → General → Workflow permissions**, set **Read and write permissions** if you control the repository. The workflow itself also requests `contents: write`.
- **Main branch is not your default branch:** edit `.github/workflows/sync-tides.yml` to use your current branch instead of `main`.
- **Future months are solunar only:** government may have published only the printed tide table PDF, not the station’s API/CSV annual resource. Do not infer tide times from a neighbouring year.
- **Lake Proserpine shows no tides:** correct and intentional — it's a freshwater reservoir.
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
