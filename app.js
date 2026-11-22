/* Solunar / Tide PWA. All personal data stays in this browser. */
(() => {
  'use strict';
  const Astro = window.SolunarAstro;
  const Tides = window.SolunarTides;
  const Weather = window.SolunarWeather;
  const app = document.getElementById('app');
  if (!app || !Astro || !Tides) {
    if (app) app.textContent = 'App files were not loaded. Please refresh the page.';
    return;
  }
  // Only these four locations can be selected for new forecasts and trips.
  // Keep existing IDs for saved settings and fishing trips from previous versions.
  const LOCATIONS = [
    { id: 'bowen', name: 'Bowen', lat: -20.013, lon: 148.245, station: 'bowen' },
    { id: 'lake-proserpine', name: 'Proserpine Dam', lat: -20.368, lon: 148.382, station: null, water: 'freshwater' },
    { id: 'shute', name: 'Shute Harbour', lat: -20.286, lon: 148.785, station: 'shute' },
    { id: 'proserpine', name: 'Proserpine River Mouth', lat: -20.414, lon: 148.747, station: 'shute' }
  ];
  // Historical trip labels remain visible, but these sites are no longer selectable.
  const RETIRED_LOCATION_NAMES = { airlie: 'Airlie Beach (previous location)', cannonvale: 'Cannonvale (previous location)' };
  const STATIONS = {
    shute: { name: 'Shute Harbour', link: 'https://www.data.qld.gov.au/dataset/shute-harbour-tide-gauge-predicted-high-low-data' },
    bowen: { name: 'Bowen', link: 'https://www.data.qld.gov.au/dataset/bowen-tide-gauge-predicted-high-low-data' }
  };
  const KEY = 'solunar-tide-v2';
  const escapeHtml = input => String(input ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const pad = n => String(n).padStart(2, '0');
  const todayKey = () => Astro.dateKey(new Date());
  const dateAt = key => new Date(Astro.dayStart(key) + 12 * 3600000);
  const fullDate = key => dateAt(key).toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = key => dateAt(key).toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short' });
  const timeText = timestamp => new Date(timestamp).toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  const clockRange = (start, end) => `${timeText(start)} – ${timeText(end)}`;
  const starText = count => '★'.repeat(count) + '☆'.repeat(5 - count);
  const stored = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const persistent = stored();
  const state = {
    tab: 'today',
    locId: LOCATIONS.some(l => l.id === persistent.locId) ? persistent.locId : 'shute',
    selected: todayKey(),
    month: todayKey().slice(0, 7),
    trips: Array.isArray(persistent.trips) ? persistent.trips : [],
    tides: persistent.tides && typeof persistent.tides === 'object' ? persistent.tides : {}, // previous manual imports as fallback
    official: {}, // live data from repo static files, not copied to localStorage
    manifest: null, manifestError: '', manifestPromise: null,
    intervals: {}, intervalManifest: null, intervalManifestPromise: null, intervalErrors: {},
    intervalLoaded: new Set(), intervalLoading: new Set(),
    loadedYears: new Set(), loadingYears: new Set(), yearErrors: {},
    flash: '',
    weatherByLoc: {}, weatherLoading: new Set(), weatherErrors: {}, weatherExpanded: false,
    windUnit: persistent.windUnit === 'kn' ? 'kn' : 'kmh'
  };
  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ locId: state.locId, trips: state.trips, tides: state.tides, windUnit: state.windUnit }));
      return true;
    } catch {
      state.flash = 'Unable to save on this device. Check that browser storage is available.';
      return false;
    }
  }
  const loc = () => LOCATIONS.find(l => l.id === state.locId) || LOCATIONS[0];
  const isFreshwater = () => loc().station === null;
  const tideMap = () => isFreshwater() ? {} : { ...(state.tides[loc().station] || {}), ...(state.official[loc().station] || {}) };
  const isOfficial = key => !isFreshwater() && !!state.official[loc().station]?.[key];
  const intervalMap = () => isFreshwater() ? {} : state.intervals[loc().station] || {};
  const hasInterval = key => !isFreshwater() && Array.isArray(intervalMap()[key]);
  const predict = key => Astro.predictDay(key, loc().lat, loc().lon, tideMap(), intervalMap());
  const nTideDays = () => Object.keys(tideMap()).length;
  const sourceStatus = p => isFreshwater() ? 'Freshwater · sun and moon only · no ocean tide influence' :
    p.intervalUsed ? 'Sun + moon + verified QLD 10-minute predicted water-level movement' :
    !p.hasTides ? 'Sun + moon only; tide predictions unavailable for this date' :
      isOfficial(p.key) ? 'Sun + moon + QLD Government predicted high/low tides' : 'Sun + moon + previously imported tides';
  const stationHint = () => isFreshwater() || loc().id === 'shute' || loc().id === 'bowen' ? '' : `<p class="hint">Tides use <b>${STATIONS[loc().station].name}</b> as a <b>reference port only</b>. Actual river-mouth tide times, heights and water movement may differ considerably; no estuary correction has been applied.</p>`;
  const tideStatus = year => {
    if (isFreshwater()) return 'Not applicable to freshwater';
    const key = `${loc().station}-${year}`;
    if (state.loadingYears.has(key)) return 'Checking official tide predictions…';
    if (state.yearErrors[key]) return `Official data not loaded: ${state.yearErrors[key]}`;
    if (state.loadedYears.has(key)) return `${nTideDays()} days available for ${STATIONS[loc().station].name} (all loaded years)`;
    if (state.manifestError) return `Tide source unavailable: ${state.manifestError}`;
    if (state.manifest?.stations?.[loc().station]?.years?.[year]) return 'Official file available · loading…';
    if (state.manifest) return `No complete official QLD prediction synced for ${year}; solunar-only scoring`;
    return 'Looking for Queensland Government tide predictions…';
  };

  function manifestLoad() {
    if (state.manifestPromise) return state.manifestPromise;
    state.manifestPromise = fetch('./tide-data/manifest.json', { cache: 'no-store' })
      .then(resp => {
        if (resp.status === 404) throw new Error('Tide index missing on website (/tide-data/manifest.json). Upload tide-data/manifest.json and check Render deployment.');
        if (!resp.ok) throw new Error(`Tide index request failed (HTTP ${resp.status})`);
        return resp.json();
      })
      .then(data => { if (data.schema !== 1 || !data.stations) throw new Error('Invalid tide index'); state.manifest = data; return data; })
      .catch(error => { state.manifestError = error.message || 'Network unavailable'; throw error; });
    return state.manifestPromise;
  }
  async function loadOfficial(station, year) {
    if (!station) return;
    const k = `${station}-${year}`;
    if (state.loadedYears.has(k) || state.loadingYears.has(k) || state.yearErrors[k]) return;
    state.loadingYears.add(k);
    render();
    try {
      const manifest = await manifestLoad();
      const entry = manifest.stations?.[station]?.years?.[year];
      if (!entry) { state.yearErrors[k] = `No verified ${station.toUpperCase()} ${year} file published. Run GitHub Actions → Sync official Queensland tide predictions and check its log.`; return; }
      const expectedFile = `./tide-data/${station}-${year}.json`;
      if (entry.file !== expectedFile) throw new Error('Unexpected tide file path');
      const resp = await fetch(expectedFile, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`Requested /tide-data/${station}-${year}.json returned HTTP ${resp.status}. The generated tide file is missing on Render; check GitHub Actions and redeploy.`);
      const obj = await resp.json();
      if (obj.schema !== 1 || obj.station !== station || obj.year !== +year || !/^https:\/\/(?:[a-z0-9-]+\.)*qld\.gov\.au\//i.test(obj.source_url || '') || !obj.byDate || Object.keys(obj.byDate).length < 350) {
        throw new Error('Invalid official tide data');
      }
      const converted = {};
      for (const [day, list] of Object.entries(obj.byDate)) {
        if (!(day.startsWith(`${year}-`) && /^\d{4}-\d{2}-\d{2}$/.test(day)) || !Array.isArray(list) || list.length < 2 || list.length > 6) throw new Error('Invalid tide date/events');
        converted[day] = list.map(item => {
          if (!Number.isFinite(item.time) || !['high','low'].includes(item.type) || !Number.isFinite(item.height)) throw new Error('Invalid tide event');
          return { time: item.time, type: item.type, height: item.height };
        });
      }
      (state.official[station] ||= {});
      state.official[station] = Tides.merge(state.official[station], converted);
      state.loadedYears.add(k);
    } catch (error) { state.yearErrors[k] = error.message || 'Unable to load official predictions'; }
    finally { state.loadingYears.delete(k); render(); }
  }
  function loadIntervalManifest() {
    if (state.intervalManifestPromise) return state.intervalManifestPromise;
    state.intervalManifestPromise = fetch('./tide-data/interval-manifest.json', { cache: 'no-store' })
      .then(resp => {
        if (!resp.ok) throw new Error(resp.status === 404 ? '10-minute files not published yet' : `10-minute index HTTP ${resp.status}`);
        return resp.json();
      })
      .then(data => {
        if (data.schema !== 1 || !data.stations) throw new Error('Invalid 10-minute index');
        state.intervalManifest = data;
        return data;
      });
    return state.intervalManifestPromise;
  }
  async function loadIntervals(station, year) {
    if (!station) return;
    const k = `${station}-${year}`;
    if (state.intervalLoaded.has(k) || state.intervalLoading.has(k) || state.intervalErrors[k]) return;
    state.intervalLoading.add(k);
    try {
      const manifest = await loadIntervalManifest();
      const entry = manifest.stations?.[station]?.years?.[year];
      if (!entry) throw new Error(`No verified ${year} 10-minute dataset published`);
      const file = `./tide-data/${station}-${year}-10min.json`;
      if (entry.file !== file) throw new Error('Unexpected 10-minute data file path');
      const response = await fetch(file, { cache: 'no-store' });
      if (!response.ok) throw new Error(`10-minute data file returned HTTP ${response.status}`);
      const result = await response.json();
      const days = (Date.UTC(+year + 1, 0, 1) - Date.UTC(+year, 0, 1)) / 86400000;
      if (result.schema !== 1 || result.station !== station || result.year !== +year ||
          result.interval_minutes !== 10 || !/^https:\/\/(?:[a-z0-9-]+\.)*qld\.gov\.au\//i.test(result.source_url || '') ||
          !result.byDate || Object.keys(result.byDate).length !== days) throw new Error('Invalid official 10-minute dataset');
      for (const [date, readings] of Object.entries(result.byDate)) {
        if (!date.startsWith(`${year}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Array.isArray(readings) || readings.length !== 144 ||
            !readings.every(h => typeof h === 'number' && Number.isFinite(h) && h >= -3 && h <= 20)) {
          throw new Error('Invalid 10-minute reading');
        }
      }
      state.intervals[station] = { ...(state.intervals[station] || {}), ...result.byDate };
      state.intervalLoaded.add(k);
    } catch (error) {
      state.intervalErrors[k] = error?.message || '10-minute predictions unavailable';
      // This never prevents the existing high/low predictions from loading.
    } finally {
      state.intervalLoading.delete(k);
      render();
    }
  }
  function intervalStatus(year) {
    if (isFreshwater()) return 'Not applicable to freshwater';
    const k = `${loc().station}-${year}`;
    if (state.intervalLoaded.has(k)) return 'Verified 10-minute predictions active';
    if (state.intervalLoading.has(k)) return 'Checking official 10-minute predictions…';
    if (state.intervalErrors[k]) return `${state.intervalErrors[k]} · High/low scoring still available`;
    return 'Looking for 10-minute predictions…';
  }
  function syncVisibleTides() {
    if (isFreshwater()) return;
    const year = state.tab === 'today' ? todayKey().slice(0,4) : state.selected.slice(0,4);
    void loadOfficial(loc().station, year);
    void loadIntervals(loc().station, year);
  }
  // Weather is intentionally a separate, best-match Open-Meteo model forecast.
  // The official BOM ACCESS-G feed has not published new public model runs since 2025-06-26.
  // Do not label these values as live BOM observations or apply them to star ratings.
  const AEST_HOUR = () => Number(new Intl.DateTimeFormat('en-AU', {
    timeZone:'Australia/Brisbane',hour:'2-digit',hourCycle:'h23'
  }).format(new Date()));
  function localHourText(h) { return `${(h % 12) || 12} ${h < 12 ? 'am' : 'pm'}`; }
  function weatherCacheFresh(item) {
    return !!item && item.data.day === todayKey() && Date.now() - item.loadedAt < 20 * 60 * 1000;
  }
  function syncVisibleWeather(force = false) {
    if (state.tab !== 'today' || !Weather) return;
    const current = loc();
    const id = current.id;
    if (state.weatherLoading.has(id)) return;
    if (!force && weatherCacheFresh(state.weatherByLoc[id])) return;
    if (!force && state.weatherErrors[id]) return;
    state.weatherLoading.add(id);
    state.weatherErrors[id] = '';
    render();
    fetch(Weather.buildUrl(current.lat, current.lon), {cache:'no-store'})
      .then(response => {
        if (!response.ok) throw new Error(`Forecast server returned HTTP ${response.status}`);
        return response.json();
      })
      .then(json => {
        // Forecast date is today's date in AEST, not the browser's local time zone.
        const data = Weather.parseForecast(json, todayKey());
        state.weatherByLoc[id] = { data, loadedAt: Date.now() };
        state.weatherErrors[id] = '';
      })
      .catch(error => {
        state.weatherErrors[id] = error?.message || 'Network connection unavailable';
      })
      .finally(() => { state.weatherLoading.delete(id); if (state.tab === 'today' && loc().id === id) render(); });
  }
  // Open-Meteo's request always uses km/h; convert displayed wind values only.
  // 1 international knot is exactly 1.852 km/h.
  const windUnitLabel = () => state.windUnit === 'kn' ? 'kn' : 'km/h';
  const windNumber = speed => speed == null ? '—' : state.windUnit === 'kn'
    ? (Math.round(speed / 1.852 * 10) / 10).toFixed(1)
    : String(Math.round(speed));
  const windReading = speed => speed == null ? '—' : `${windNumber(speed)} ${windUnitLabel()}`;
  function windUnitControl() {
    return `<div class="wind-unit-row"><span class="wind-unit-label">Wind units</span>
      <div class="wind-unit-switch" role="group" aria-label="Wind speed units">
        <button type="button" data-action="set-wind-unit" data-unit="kmh" aria-pressed="${state.windUnit === 'kmh'}" class="wind-unit-option${state.windUnit === 'kmh' ? ' selected' : ''}">km/h</button>
        <button type="button" data-action="set-wind-unit" data-unit="kn" aria-pressed="${state.windUnit === 'kn'}" class="wind-unit-option${state.windUnit === 'kn' ? ' selected' : ''}">knots</button>
      </div>
    </div>`;
  }
  function weatherCard() {
    const id = loc().id;
    const entry = state.weatherByLoc[id];
    const isCurrent = entry?.data?.day === todayKey();
    const error = state.weatherErrors[id];
    const source = `<p class="hint">Forecast model via <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener noreferrer">Open-Meteo</a>, not a live BOM observation. For official marine forecasts and warnings, see <a href="https://www.bom.gov.au/marine/" target="_blank" rel="noopener noreferrer">BOM Marine</a>. Conditions on the water may be different.</p>`;
    if (!Weather) return `<section class="card weather-card"><h2>Hourly weather & wind</h2>${windUnitControl()}<p class="small">Weather module is unavailable. Refresh the app to load the latest files.</p>${source}</section>`;
    if (!isCurrent) return `<section class="card weather-card"><div class="row"><h2>🌬️ Today's wind & weather</h2><span class="score-badge">Forecast</span></div>
      ${windUnitControl()}<p class="small">${state.weatherLoading.has(id) ? 'Loading hourly wind forecast…' : error ? `Weather temporarily unavailable: ${escapeHtml(error)}` : 'Waiting for the latest weather forecast…'}</p>
      ${error ? `<button class="btn secondary" data-action="retry-weather">Try weather again</button>` : ''}${source}</section>`;
    const data = entry.data;
    const hour = AEST_HOUR();
    const now = Weather.nearestHour(data, hour);
    const rows = state.weatherExpanded ? data.hours : data.hours.filter(r => r.hour >= Math.min(6,hour) && r.hour <= Math.max(21,hour));
    const renderRow = r => `<div class="weather-hour-row${r.hour===hour ? ' current' : ''}">
      <div class="weather-hour-time">${localHourText(r.hour)}${r.hour===hour ? '<small>Now</small>' : ''}</div>
      <div class="weather-hour-wind"><span class="wind-direction-arrow" aria-hidden="true" style="transform:rotate(${Math.round((r.direction+180)%360)}deg)">↑</span><div><strong>${escapeHtml(r.compass)} · ${windReading(r.speed)}</strong><small>Wind from ${escapeHtml(r.compass)}</small></div></div>
      <div class="weather-hour-gust"><strong>${windReading(r.gust)}</strong><small>gusts</small></div>
      <div class="weather-hour-more"><span>${r.temp == null ? '—' : Math.round(r.temp) + '°C'}</span><small>Rain ${r.rain == null ? '—' : Math.round(r.rain) + '%'}</small></div>
    </div>`;
    const lastUpdated = new Date(entry.loadedAt).toLocaleTimeString('en-AU', {timeZone:'Australia/Brisbane',hour:'numeric',minute:'2-digit',hour12:true});
    return `<section class="card weather-card" aria-label="Hourly wind forecast for ${escapeHtml(loc().name)}">
      <div class="row wrap"><h2>🌬️ Today's wind & weather</h2><span class="score-badge">Hourly · AEST</span></div>
      ${windUnitControl()}
      <p class="weather-location">📍 ${escapeHtml(loc().name)} · ${escapeHtml(fullDate(todayKey()))}</p>
      <div class="weather-now-grid">
        <div><span class="weather-now-label">Forecast for ${localHourText(now.hour)}</span><div class="weather-now-speed">${windNumber(now.speed)}<span> ${windUnitLabel()}</span></div><div class="weather-now-label">From ${escapeHtml(now.compass)} · Gusts ${windReading(now.gust)}</div></div>
        <div class="weather-now-side"><div>${now.temp == null ? '—' : Math.round(now.temp) + '°C'}</div><div>${escapeHtml(Weather.condition(now.code))}</div><div>Rain ${now.rain == null ? '—' : Math.round(now.rain) + '%'}</div></div>
      </div>
      <div class="weather-hours-header"><strong>Hour-by-hour wind</strong><span>Speed · direction · gusts</span></div>
      <div class="weather-hour-list" aria-label="Hourly wind speed, direction and gust forecast">${rows.map(renderRow).join('')}</div>
      <div class="weather-actions"><button class="btn secondary" data-action="toggle-weather">${state.weatherExpanded ? 'Show daytime hours' : 'Show all 24 hours'}</button><button class="btn outline" data-action="retry-weather">Refresh forecast</button></div>
      ${error ? `<p class="notice warning">Unable to update weather: ${escapeHtml(error)}. Showing the previously loaded forecast, which may be out of date.</p>` : ''}
      <p class="hint">Wind direction is where the wind <b>comes from</b>. Arrow shows where it blows. Checked ${escapeHtml(lastUpdated)} AEST. Weather is not included in the five-star score yet.</p>${source}
    </section>`;
  }
  function refresh() { render(); syncVisibleTides(); syncVisibleWeather(); }
  function locationPicker() {
    return `<label for="location-select">Fishing location</label><select id="location-select">${LOCATIONS.map(l => `<option value="${l.id}"${l.id === state.locId ? ' selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}</select>`;
  }
  function flash() {
    const msg = state.flash;
    state.flash = '';
    return msg ? `<div class="notice" role="status">${escapeHtml(msg)}</div>` : '';
  }
  function scoreCard(p, date, withSave = true) {
    return `<article class="card">
      <div class="eyebrow">${escapeHtml(fullDate(date))}</div>
      <div class="hero-score"><div><div class="score-number">${p.score}<span>/100</span></div><div class="stars" aria-label="${p.stars} out of 5 stars">${starText(p.stars)}</div></div><span class="score-badge">${isFreshwater() ? 'Freshwater' : p.intervalUsed ? '10-min QLD movement' : isOfficial(date) ? 'Official QLD tides' : p.hasTides ? 'Tide informed' : 'Solunar only'}</span></div>
      <p class="small">${escapeHtml(sourceStatus(p))}. A <b>relative planning score</b>, not a catch probability or guaranteed result.</p>
      ${withSave ? `<div class="actions"><button class="btn" data-action="save-trip" data-date="${date}">Save fishing session</button>${!isFreshwater() ? `<button class="btn secondary" data-action="show-date-tides" data-date="${date}">View tides</button>` : ''}</div>` : ''}
    </article>`;
  }
  function windowCards(p) {
    if (!p.windows.length) return '<p>No windows could be calculated for this day.</p>';
    return p.windows.map(w => `<div class="window"><div><div class="window-time">${clockRange(w.start, w.end)}</div><div class="window-detail">2-hour opportunity · Queensland time${w.movement ? ` · ${w.movement.direction === 'near-slack' ? 'gentle change' : w.movement.direction} ${Math.abs(w.movement.rate).toFixed(2)} m/h` : ''}</div></div><div class="window-score"><div class="star-small" aria-label="${w.stars} stars">${starText(w.stars)}</div><small>${w.score}/100</small></div></div>`).join('');
  }
  const eventName = type => ({ sunrise: 'Sunrise', sunset: 'Sunset', moonrise: 'Moonrise', moonset: 'Moonset', overhead: 'Moon overhead', underfoot: 'Moon underfoot', high: 'High tide', low: 'Low tide' }[type] || type);
  function eventsCard(p) {
    const a = p.astro;
    const events = [...a.visibleSun, ...a.visibleMoon].sort((x,y)=>x.time-y.time);
    return `<section class="card"><h2>Sun & moon today</h2><div class="grid-2">
      <div class="metric"><div class="metric-label">Moon phase</div><div class="metric-value">${escapeHtml(a.phase.name)}</div><div class="metric-sub">${Math.round(a.phase.fraction * 100)}% illuminated</div></div>
      <div class="metric"><div class="metric-label">Major solunar periods</div><div class="metric-value">${a.visibleMoon.filter(e => ['overhead','underfoot'].includes(e.type)).length} events</div><div class="metric-sub">Near overhead / underfoot</div></div>
    </div><div class="divider"></div><div class="event-list">${events.map(e => `<span class="event-chip">${eventName(e.type)} <b>${timeText(e.time)}</b></span>`).join('') || '<span class="muted">No events on this date.</span>'}</div>
    <p class="hint">Moon event times are approximate and can differ from published almanacs.</p></section>`;
  }
  function tideRows(p) {
    if (!p.tides.length) return '';
    return [...p.tides].sort((a,b)=>a.time-b.time).map(e => `<div class="tide-row"><span class="tide-type">${eventName(e.type)}</span><span>${timeText(e.time)}</span><span class="tide-h">${e.height === null || !Number.isFinite(Number(e.height)) ? '—' : `${Number(e.height).toFixed(2)} m`}</span></div>`).join('');
  }
  function tideCard(p) {
    if (isFreshwater()) return `<section class="card"><div class="row"><h2 style="margin:0">Proserpine Dam · freshwater</h2><span class="score-badge">No coastal tides</span></div>
      <p class="small">Peter Faust Dam is a freshwater reservoir. Ocean high and low tide times are <b>not used</b> for lake fishing predictions.</p>
      <p class="hint">Barramundi and sooty grunter are stocked. A Stocked Impoundment Permit is required for anglers aged 18 or older.</p>
      <p><a href="https://www.qld.gov.au/recreation/activities/boating-fishing/rec-fishing/dams/stocked-impoundment-permits/locations/peter-faust" target="_blank" rel="noopener noreferrer">Queensland Government · Peter Faust Dam rules ↗</a></p></section>`;
    const s = STATIONS[loc().station];
    const status = p.hasTides ? isOfficial(p.key) ? 'Official forecast' : 'Previously imported' : 'Not available';
    return `<section class="card"><div class="row"><h2 style="margin:0">Tides · ${s.name}</h2><span class="score-badge">${status}</span></div>
      ${p.tides.length ? `<div class="section-split">${tideRows(p)}</div>` : `<p class="small">Official QLD high/low tide predictions have not been loaded for this date. This score uses sun/moon only.</p>`}
      <p class="hint">${escapeHtml(tideStatus(p.key.slice(0,4)))}</p>${stationHint()}
      <div class="actions"><button class="btn secondary" data-action="show-date-tides" data-date="${p.key}">View tide forecast</button></div>
    </section>`;
  }
  function movementCard(p) {
    if (isFreshwater()) return '';
    if (!p.intervalUsed) return `<section class="card movement-card"><div class="row"><h2>≈ 10-minute tide movement</h2><span class="score-badge">High/low fallback</span></div>
      <p class="small">${escapeHtml(intervalStatus(p.key.slice(0, 4)))}. ${p.hasHighLow ? 'Your current score still uses the working high/low tide model.' : 'The current score uses sun/moon only.'}</p>
      <p class="hint">When a complete official 10-minute year is published, this section will show predicted water-level changes and use them to refine the rating.</p></section>`;
    const readings = intervalMap()[p.key];
    const preferred = [...p.windows].sort((a,b)=>b.score-a.score)[0];
    const rate = preferred?.movement || null;
    const width = 320, height = 90, left = 12, right = 308, top = 8, bottom = 78;
    const minimum = Math.min(...readings), maximum = Math.max(...readings), span = Math.max(.1, maximum - minimum);
    const pts = readings.map((h,i)=>`${(left + i / 143 * (right - left)).toFixed(1)},${(bottom - (h-minimum)/span*(bottom-top)).toFixed(1)}`).join(' ');
    return `<section class="card movement-card" aria-label="10-minute predicted tidal water levels for ${escapeHtml(loc().name)}">
      <div class="row wrap"><h2>≈ 10-minute tide movement</h2><span class="score-badge">Official forecast</span></div>
      <div class="movement-stats">
        <div><span>Best-window height change</span><strong>${rate ? `${rate.rate > 0 ? '+' : ''}${rate.rate.toFixed(2)} m/h` : '—'}</strong></div>
        <div><span>Water level</span><strong>${rate ? (rate.direction === 'rising' ? 'Rising' : rate.direction === 'falling' ? 'Falling' : 'Changing slowly') : '—'}</strong></div>
        <div><span>Relative movement</span><strong>${rate ? `${rate.percent}%` : '—'}</strong></div>
      </div>
      <p class="small">${preferred ? `Highest-rated window: <b>${clockRange(preferred.start, preferred.end)}</b>` : ''}</p>
      <div class="movement-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Predicted height throughout the day, in 10-minute increments" preserveAspectRatio="none"><line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#547b8a" stroke-width="1"/><polyline points="${pts}" fill="none" stroke="#64e0d3" stroke-width="2.2" stroke-linejoin="round"/></svg><div class="movement-axis"><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>12 am</span></div></div>
      <p class="hint">Predicted water-level change (metres/hour) over a 60-minute interval, calculated from official 10-minute heights. Relative movement compares this hour with stronger changes on the same day. <b>This does not measure current speed or predict fish catches.</b></p>
      ${stationHint()}
    </section>`;
  }
  function renderToday() {
    const date = todayKey(), p = predict(date);
    return `<p class="eyebrow">Your local fishing outlook</p><h1>Find your next great fishing window.</h1><p class="lead">Calculated for the Whitsundays, in Queensland time (AEST). Coastal tide forecasts sync automatically from Queensland Government data.</p>
      <div class="card soft">${locationPicker()}</div>${flash()}
      ${scoreCard(p,date)}
      ${weatherCard()}
      ${movementCard(p)}
      <section class="card"><div class="row"><h2>Best windows today</h2><span class="score-badge">Top 3</span></div>${windowCards(p)}<p class="hint">Windows favour moon transit/rise/set and sunrise/sunset. Verified 10-minute predictions replace rough high/low tidal-movement estimates when available. Freshwater locations never use ocean tides.</p></section>
      ${eventsCard(p)}${tideCard(p)}
      <div class="notice warning">Fishing activity is influenced by weather, habitat, water clarity and local conditions, not just tides or the moon. Check official forecasts and fishing regulations before leaving.</div>`;
  }
  const monthDate = (y,m,day) => `${y}-${pad(m)}-${pad(day)}`;
  function monthDates() {
    const [year, month] = state.month.split('-').map(Number);
    const max = new Date(Date.UTC(year,month,0)).getUTCDate();
    return Array.from({ length:max },(_,i)=> monthDate(year,month,i+1));
  }
  function renderCalendar() {
    const [year, month] = state.month.split('-').map(Number);
    const dateList = monthDates();
    const blank = (new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
    const forecasts = dateList.map(d => ({ date:d, ...predict(d) }));
    const selected = predict(state.selected);
    const label = new Date(Date.UTC(year,month-1,15)).toLocaleDateString('en-AU',{timeZone:'UTC',month:'long',year:'numeric'});
    const calendar = `<div class="cal-grid">${['M','T','W','T','F','S','S'].map(d=>`<div class="cal-week">${d}</div>`).join('')}${'<div class="cal-day empty"></div>'.repeat(blank)}${forecasts.map(d=>`<button class="cal-day ${d.date===todayKey()?'today-day':''} ${d.date===state.selected?'selected':''}" data-action="select-date" data-date="${d.date}" aria-label="${escapeHtml(fullDate(d.date))}, ${d.stars} stars"><span>${Number(d.date.slice(-2))}</span><span class="cal-rating">${d.stars}★${d.intervalUsed ? ' ≈' : d.hasTides ? ' ≋' : ''}</span></button>`).join('')}</div>`;
    const top = [...forecasts].sort((a,b)=>b.score-a.score || a.date.localeCompare(b.date)).slice(0,5);
    return `<p class="eyebrow">Plan ahead</p><h1>Fishing calendar</h1><p class="lead">Compare estimated fishing windows by day and save your trips.</p><div class="card soft">${locationPicker()}</div>${flash()}
      <section class="card"><div class="calendar-header"><button class="chevron" data-action="prev-month" aria-label="Previous month">‹</button><strong>${label}</strong><button class="chevron" data-action="next-month" aria-label="Next month">›</button></div>${calendar}<p class="hint">★ Relative score · ≈ Verified 10-minute movement · ≋ High/low tide estimate. Missing tide data uses sun/moon only. Freshwater ignores tides.</p></section>
      <section class="card"><div class="eyebrow">Selected date</div><h2>${escapeHtml(fullDate(state.selected))}</h2><div class="row"><span class="stars" aria-label="${selected.stars} out of 5 stars">${starText(selected.stars)}</span><span class="score-badge">${selected.score}/100</span></div><p class="small">${sourceStatus(selected)}</p>${selected.intervalUsed ? '<p class="hint">≈ Tide movement is based on official 10-minute predicted water heights.</p>' : ''}${windowCards(selected)}<div class="actions"><button class="btn" data-action="save-trip" data-date="${state.selected}">Save this session</button>${!isFreshwater() ? `<button class="btn secondary" data-action="show-date-tides" data-date="${state.selected}">View tides</button>` : ''}</div></section>
      <section class="card"><h2>Top 5 dates this month</h2><div class="best-days">${top.map(d=>`<button class="best-day" data-action="select-date" data-date="${d.date}"><span>${shortDate(d.date)}${d.hasTides ? ' · tides available':''}</span><span class="star-small">${starText(d.stars)} · ${d.score}</span></button>`).join('')}</div></section>`;
  }
  function renderTrips() {
    const trips = [...state.trips].filter(t => typeof t.date === 'string' && (LOCATIONS.some(l=>l.id===t.locId) || Object.hasOwn(RETIRED_LOCATION_NAMES, t.locId))).sort((a,b)=>a.date.localeCompare(b.date));
    return `<p class="eyebrow">Your saved sessions</p><h1>Fishing trips</h1><p class="lead">Sessions save on this device and remain available offline.</p>${flash()}
      <section class="card"><h2>Saved sessions (${trips.length})</h2>${trips.length ? trips.map(t => {
        const place = LOCATIONS.find(l=>l.id===t.locId);
        const displayName = place ? place.name : RETIRED_LOCATION_NAMES[t.locId];
        return `<div class="saved-item"><div class="row"><div><strong>${escapeHtml(fullDate(t.date))}</strong><span>${escapeHtml(displayName)}</span><span>${clockRange(t.start, t.end)}</span></div><button class="btn danger" data-action="remove-trip" data-id="${escapeHtml(t.id)}">Remove</button></div></div>`;
      }).join('') : `<div class="empty-state"><div class="empty-icon">🎣</div><h3>No saved fishing trips</h3><p class="small">Pick a date in the calendar, then select “Save this session”.</p><button class="btn" data-action="open-calendar">Open calendar</button></div>`}</section>
      <p class="hint">Saved trips are stored only in this browser. They do not automatically sync across devices.</p>`;
  }
  function renderTides() {
    if (isFreshwater()) return `<p class="eyebrow">Freshwater mode</p><h1>Proserpine Dam</h1><p class="lead">Peter Faust Dam does not experience coastal tidal cycles.</p>
      <div class="card soft">${locationPicker()}</div>${flash()}
      <section class="card"><h2>Why there is no tide chart</h2><p>Proserpine Dam (Lake Proserpine / Peter Faust Dam) is a freshwater impoundment. This app calculates the sun and moon windows for the lake without adding coastal tides to its five-star rating.</p><p>For barramundi, consider water temperature, wind direction, seasonal changes and local structure alongside these astronomical windows.</p><p>A Queensland Stocked Impoundment Permit is required for line fishing by anglers aged 18 and over.</p><a href="https://www.qld.gov.au/recreation/activities/boating-fishing/rec-fishing/dams/stocked-impoundment-permits/locations/peter-faust" target="_blank" rel="noopener noreferrer">Official Peter Faust Dam fishing information ↗</a></section>`;
    const p = predict(state.selected);
    const station = STATIONS[loc().station];
    return `<p class="eyebrow">Automatic official predictions</p><h1>Tide planner</h1><p class="lead">High and low tides from Queensland Government data, synced through the official Web API with a verified CSV fallback. No manual entry needed.</p>
      <div class="card soft">${locationPicker()}</div>${flash()}
      <section class="card"><div class="row"><h2>${station.name} tide station</h2><span class="score-badge">${p.intervalUsed ? '10-min QLD' : isOfficial(state.selected) ? 'Official QLD' : p.hasTides ? 'Legacy import' : 'Solunar only'}</span></div>
        <label for="tide-date">Date</label><input type="date" id="tide-date" value="${state.selected}">
        <div class="notice">${escapeHtml(tideStatus(state.selected.slice(0,4)))}</div>
        ${isOfficial(state.selected) ? `<p class="hint">Data channel: <b>${escapeHtml(state.manifest?.stations?.[loc().station]?.years?.[state.selected.slice(0,4)]?.source_method || 'Official Queensland dataset')}</b></p>` : ''}
        <p class="hint">${nTideDays()} dates currently loaded for this station. Times are predicted, not live measurements. All times use AEST (UTC+10).</p>${stationHint()}
        <div class="divider"></div>${p.tides.length ? tideRows(p) : '<p class="small">No verified high/low tide predictions for this date.</p>'}
        <p class="hint">${escapeHtml(intervalStatus(state.selected.slice(0, 4)))}</p>${movementCard(p)}
        <div class="actions"><button class="btn secondary" data-action="retry-tides">Check for updated tide files</button></div>
        <p class="hint">Troubleshooting: <a href="./tide-data/manifest.json" target="_blank" rel="noopener noreferrer">Open tide index</a> · <a href="./tide-data/${loc().station}-${state.selected.slice(0,4)}.json" target="_blank" rel="noopener noreferrer">Open year file</a> · <a href="https://github.com/shfjkhsd2d-star/Solunar-fishing/actions/workflows/sync-tides.yml" target="_blank" rel="noopener noreferrer">Check GitHub tide sync</a>.</p>
      </section>
      <section class="card"><h2>Official source & updates</h2><p class="small">The GitHub Actions job queries the Queensland Government <b>CKAN DataStore Web API</b>, validates the complete annual predicted high/low dataset and uses the official CSV as a fallback if the API is unavailable or incomplete. It checks weekly. These are BOM predictions republished by Maritime Safety Queensland; they are not real-time measurements.</p>
        <p><a href="${station.link}" target="_blank" rel="noopener noreferrer">View QLD Government ${station.name} dataset ↗</a></p>
        <p class="hint">If data isn't available, check the GitHub Actions “Sync official Queensland tide predictions” run. The government may not have published the desired year’s resource, or API/download access may be temporarily blocked. In either case, the app will not invent tide times.</p>
      </section><p class="hint">Not for navigation. Verify marine conditions and official predictions before boating.</p>`;
  }
  function renderAbout() {
    return `<p class="eyebrow">How it works</p><h1>About Solunar / Tide</h1>
      <section class="card"><h2>What's new · v3.8</h2><p>Coastal high/low predictions sync through Queensland Government’s CKAN Web API, with a verified official CSV fallback, using a GitHub Actions workflow. Once published to this site, tide data loads by station and year as needed. No manual entry is required.</p>
      <p>Verified 10-minute predicted heights now refine the tidal component of coastal five-star scores. If the complete interval dataset is unavailable, the app retains high/low-based scoring. Changes in predicted water height are not direct measurements of tidal current or proof of fish activity.</p><p>The Today screen now shows hourly wind speed, direction, gusts, temperature and rain chance for the selected fishing location, from Open-Meteo's active best-match forecast service. These are model forecasts, not live BOM measurements, and they do not change the five-star ratings.</p><p>Proserpine Dam (Peter Faust Dam / Lake Proserpine) is a freshwater location. Its ratings never use coastal tides.</p><p>Your previously saved fishing trips remain on this device.</p></section>
      <section class="card"><h2>The 1–5 star rating</h2><p>Our illustrative <b>relative fishing opportunity score</b> uses moon overhead/underfoot, moonrise/moonset, dawn/dusk and lunar illumination. Coastal forecasts use verified 10-minute water-height changes when available; otherwise they retain high/low timing and midpoint estimates.</p>
        <div class="tide-row"><span>★★★★★</span><span>78–100</span><span>Excellent</span></div><div class="tide-row"><span>★★★★☆</span><span>62–77</span><span>Very good</span></div><div class="tide-row"><span>★★★☆☆</span><span>46–61</span><span>Good</span></div><div class="tide-row"><span>★★☆☆☆</span><span>30–45</span><span>Fair</span></div><div class="tide-row"><span>★☆☆☆☆</span><span>1–29</span><span>Low</span></div>
        <p class="hint">This heuristic is not a scientifically validated fish-catch probability. No ocean tide score is used in freshwater.</p></section>
      <section class="card"><h2>Data sources and limitations</h2><p>Astronomy uses approximate SunCalc-style calculations in AEST (UTC+10). Tide events use Bureau of Meteorology predictions released via Maritime Safety Queensland and Queensland Government Open Data under CC BY 4.0. Shute Harbour tides are used as an uncorrected coastal reference for Proserpine River Mouth, where estuary tides can arrive at different times and heights. Bowen uses Bowen station data. Proserpine Dam uses no coastal tide data.</p>
        <p>Weather: <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener noreferrer">Open-Meteo</a> forecast data under CC BY 4.0. BOM ACCESS-G model updates are currently unavailable via the public Open-Meteo feed. This app does not present official BOM wind observations; see <a href="https://www.bom.gov.au/marine/" target="_blank" rel="noopener noreferrer">BOM Marine</a> for official forecasts and warnings.</p><p>Sources: <a href="https://www.msq.qld.gov.au/tides/open-data" target="_blank" rel="noopener noreferrer">MSQ Open Data</a> · <a href="https://www.data.qld.gov.au/dataset/shute-harbour-tide-gauge-predicted-high-low-data" target="_blank" rel="noopener noreferrer">Shute Harbour</a> · <a href="https://www.data.qld.gov.au/dataset/bowen-tide-gauge-predicted-high-low-data" target="_blank" rel="noopener noreferrer">Bowen</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · <a href="https://github.com/mourner/suncalc" target="_blank" rel="noopener noreferrer">SunCalc BSD-2-Clause</a>.</p>
        <div class="notice warning">Do not use this app for navigation, marine safety or regulatory compliance. Check current official forecasts, fishing rules and conditions.</div></section>
      <section class="card"><h2>Add to iPhone Home Screen</h2><p>Open the deployed website in <b>Safari</b>, tap Share, choose <b>Add to Home Screen</b>, then Add.</p><p class="small">Version 3.8 · 10-minute tide movement · Hourly weather + unit toggle · Four selectable locations</p></section>`;
  }
  function render() {
    try {
      app.innerHTML = ({ today: renderToday, calendar: renderCalendar, trips: renderTrips, tides: renderTides, about: renderAbout }[state.tab] || renderToday)();
      document.querySelectorAll('[data-tab]').forEach(btn => {
        const active = btn.dataset.tab === state.tab;
        btn.classList.toggle('active', active);
        if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
      });
    } catch (err) {
      console.error('Solunar rendering error:', err);
      app.innerHTML = `<section class="card"><h2>Unable to display this view</h2><p>Please refresh this page. If the problem continues, clear this site's cached data.</p><p class="tiny muted">${escapeHtml(err.message)}</p></section>`;
    }
  }
  function switchTab(tab) {
    if (!['today','calendar','trips','tides','about'].includes(tab)) return;
    state.tab = tab;
    refresh();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function saveTrip(key) {
    const p = predict(key);
    const preferred = [...p.windows].sort((a,b)=>b.score-a.score)[0];
    if (!preferred) return;
    if (state.trips.some(t => t.date===key && t.locId===state.locId)) {
      state.flash = 'This date and location are already saved in Trips.';
      render(); return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    state.trips.push({ id, date:key, locId:state.locId, start:preferred.start, end:preferred.end });
    saveState();
    state.flash = `Saved ${shortDate(key)} at ${loc().name}.`;
    render();
  }
  function moveMonth(delta) {
    const [y,m] = state.month.split('-').map(Number);
    const d = new Date(Date.UTC(y,m-1+delta,1));
    state.month = d.toISOString().slice(0,7);
    state.selected = state.month + '-01';
    refresh();
  }
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-tab]');
    if (nav) { switchTab(nav.dataset.tab); return; }
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const date = target.dataset.date;
    switch (target.dataset.action) {
      case 'open-calendar': switchTab('calendar'); break;
      case 'show-date-tides': state.selected=date;state.month=date.slice(0,7);switchTab('tides');break;
      case 'select-date': state.selected=date;state.month=date.slice(0,7);refresh();break;
      case 'prev-month': moveMonth(-1); break;
      case 'next-month': moveMonth(1); break;
      case 'save-trip': saveTrip(date); break;
      case 'remove-trip': state.trips=state.trips.filter(t => t.id !== target.dataset.id);saveState();render();break;
      case 'set-wind-unit': {
        const unit = target.dataset.unit;
        if (unit === 'kmh' || unit === 'kn') {
          if (state.windUnit !== unit) { state.windUnit = unit; saveState(); render(); }
        }
        break;
      }
      case 'toggle-weather': state.weatherExpanded = !state.weatherExpanded; render(); break;
      case 'retry-weather': { state.weatherErrors[loc().id] = ''; syncVisibleWeather(true); break; }
      case 'retry-tides': { state.manifestPromise = null; state.manifest = null; state.manifestError = ''; state.yearErrors = {}; state.official = {}; state.loadedYears.clear(); state.intervalManifestPromise = null; state.intervalManifest = null; state.intervalErrors = {}; state.intervals = {}; state.intervalLoaded.clear(); refresh(); break; }
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'location-select' && LOCATIONS.some(l=>l.id===event.target.value)) {
      state.locId=event.target.value;saveState();refresh();
    }
    if (event.target.id === 'tide-date') {
      const date = Tides.parseDate(event.target.value);
      if (date) { state.selected=date;state.month=date.slice(0,7);refresh(); }
    }
  });
  refresh();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('Offline service worker unavailable:',error));
  }
})();
