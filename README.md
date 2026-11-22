# Solunar / Tide Fishing Planner — v2.1

This is a static, installable iPhone-friendly website for Whitsundays fishing sessions.
No npm installation, backend server or API key is required to run it on a **Render Static Site**.

## Upload to GitHub

1. Download `Solunar-Fishing-v2.1-GitHub-Upload.zip` and **extract** it.
2. Open your GitHub repository: https://github.com/shfjkhsd2d-star/Solunar-fishing
3. Select **Add file → Upload files** on the **main** branch. You may need to use **Request Desktop Website** on an iPhone to see the full controls.
4. Upload the extracted contents **into the root of the repository**, next to the existing `index.html`. Select **Replace** when GitHub asks about duplicate filenames. Do not upload the ZIP itself, and do not put everything inside an extra `solunar-fishing-v2` folder.
5. Commit the changes. Render should redeploy automatically if automatic deployments are enabled; otherwise select **Manual Deploy → Deploy latest commit** for the existing service.
6. After deployment, open https://solunar-fishing.onrender.com/ in Safari and refresh. If an installed Home Screen icon continues to show an older app, fully close and reopen it; if necessary, remove that Home Screen icon and add it again after verifying the new site in Safari.

Existing root files are replaced; the new `styles.css`, `astro.js`, and `tides.js` files are added.
The files `tests/` and this README do not affect deployment.

## Features

- **Today:** real computed approximate moon overhead/underfoot, moonrise/moonset, moon illumination, sunrise/sunset, and the top three 2-hour planning windows.
- **Calendar:** 1–5 star ratings across any month, day selection and top-five dates.
- **Trips:** save and remove fishing sessions; retained in browser storage on the same device.
- **Tides:** manually enter high/low tide times for a selected day, or import an official Queensland Government predicted high/low CSV for a whole year.
- **Location:** Shute Harbour, Airlie Beach, Cannonvale, Bowen and the Proserpine River mouth. Approximate solar/lunar events are calculated for the selected location; the tide reference stations are Shute Harbour or Bowen.
- **Offline:** after the initial load, the shell and astronomical calculations may work without connectivity. Saved trips and imported tide data are stored locally.

## Import actual tide predictions

The package does **not** contain tide predictions and does **not** make up tide times. The rating is clearly shown as **Solunar only** until real tide data is supplied for that particular date.

1. Tap **Tides** in the app and choose the relevant location.
2. Tap the link to the Queensland Open Data predicted high/low dataset. Download the relevant year's **CSV**, not the 10-minute interval dataset.
3. Return to the app, choose the downloaded CSV using the file picker, and tap **Import tide predictions**.
4. The app reads `Date`, `Time`, `Ind` (`H`/`L`), and `Reading` columns, interprets dates using Australian day/month/year (or ISO format), and times as AEST (UTC+10). It displays how many entries were imported.
5. Alternately, enter events on a date, one line per event, e.g. `06:20 H 2.50` and `12:35 L 0.65`.

If imported data is from a different station, the app cannot automatically detect that: **always choose the station matching the file**. Data from Shute Harbour is a *nearby reference*, not an adjustment to tidal phase at the Proserpine River mouth or an individual creek.

Official references:
- Shute Harbour: https://www.data.qld.gov.au/dataset/shute-harbour-tide-gauge-predicted-high-low-data
- Bowen: https://www.data.qld.gov.au/dataset/bowen-tide-gauge-predicted-high-low-data
- Queensland open tide data: https://www.msq.qld.gov.au/tides/open-data

## Interpretation and limitations

Ratings are **relative opportunity scores**, not an empirical fish-catching probability. This is an original heuristic rewarding moon overhead/underfoot, moonrise/moonset, sunrise/sunset and certain lunar illumination patterns. When user-supplied tide events exist for the date, proximity to high/low turns and nearby periods of water movement are added. All scores are **approximate** and should not be used for marine navigation. Weather, water quality, fishing pressure, habitat, and species-specific behaviour are not included.

Astronomical calculations use SunCalc-derived positional formulas with a custom event scan and heuristic scoring system. See `THIRD_PARTY_NOTICES.txt` for license attribution. Queensland tide CSV datasets may carry CC BY 4.0 licensing; please observe the source terms if redistributing data.

## Technical verification

Requires only an up-to-date browser supporting JavaScript, `Intl`, `localStorage`, and file input.

For optional automated checks on a computer with Node.js (no dependencies):

```sh
node tests/test-core.js
node tests/test-ui.js
```

On Render, the application can be hosted as a Static Site with **Publish Directory** `.` (repository root). If your existing deployment works, keep its current settings.

## Troubleshooting

- **Old blank screen:** new `app.js` may not have deployed or Safari may be serving an old cached app. Verify that the new `astro.js`, `tides.js`, and `styles.css` appear in GitHub at repository root, then reload the page.
- **App loads but tides say Not loaded:** expected until you import real predictions or enter them manually.
- **No trips after a different device:** saved trips are local to the browser on the device where they were created.
- **CSV import fails:** ensure it's the **predicted high/low** CSV with Date, Time, Ind and Reading fields, rather than a historical/10-minute interval file.
- **Outdated tide data:** each future year may need a new official CSV import.
