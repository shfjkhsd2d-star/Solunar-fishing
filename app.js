/* Solunar / Tide PWA. All personal data stays in this browser. */
(() => {
  'use strict';
  const Astro = window.SolunarAstro;
  const Tides = window.SolunarTides;
  const app = document.getElementById('app');
  if (!app || !Astro || !Tides) {
    if (app) app.textContent = 'App files were not loaded. Please refresh the page.';
    return;
  }
  const LOCATIONS = [
    { id: 'shute', name: 'Shute Harbour', lat: -20.286, lon: 148.785, station: 'shute' },
    { id: 'airlie', name: 'Airlie Beach', lat: -20.268, lon: 148.719, station: 'shute' },
    { id: 'cannonvale', name: 'Cannonvale', lat: -20.280, lon: 148.705, station: 'shute' },
    { id: 'bowen', name: 'Bowen', lat: -20.013, lon: 148.245, station: 'bowen' },
    { id: 'proserpine', name: 'Proserpine River mouth', lat: -20.414, lon: 148.747, station: 'shute' }
  ];
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
    tides: persistent.tides && typeof persistent.tides === 'object' ? persistent.tides : {},
    flash: ''
  };
  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ locId: state.locId, trips: state.trips, tides: state.tides }));
      return true;
    } catch {
      state.flash = 'Unable to save on this device. Check that browser storage is available.';
      return false;
    }
  }
  const loc = () => LOCATIONS.find(l => l.id === state.locId) || LOCATIONS[0];
  const tideMap = () => state.tides[loc().station] || {};
  const predict = key => Astro.predictDay(key, loc().lat, loc().lon, tideMap());
  const nTideDays = () => Object.keys(tideMap()).length;
  const sourceStatus = p => p.hasTides ? 'Sun + moon + imported tides' : 'Sun + moon only';
  const stationHint = () => loc().id === 'shute' || loc().id === 'bowen' ? '' : `<p class="hint">Tides shown are from <b>${STATIONS[loc().station].name}</b>, a nearby reference port. Local creek and beach times may differ.</p>`;
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
      <div class="hero-score"><div><div class="score-number">${p.score}<span>/100</span></div><div class="stars" aria-label="${p.stars} out of 5 stars">${starText(p.stars)}</div></div><span class="score-badge">${p.hasTides ? 'Tide informed' : 'Solunar only'}</span></div>
      <p class="small">${escapeHtml(sourceStatus(p))}. A <b>relative planning score</b>, not a catch probability or guaranteed result.</p>
      ${withSave ? `<div class="actions"><button class="btn" data-action="save-trip" data-date="${date}">Save fishing session</button><button class="btn secondary" data-action="show-date-tides" data-date="${date}">View tides</button></div>` : ''}
    </article>`;
  }
  function windowCards(p) {
    if (!p.windows.length) return '<p>No windows could be calculated for this day.</p>';
    return p.windows.map(w => `<div class="window"><div><div class="window-time">${clockRange(w.start, w.end)}</div><div class="window-detail">2-hour opportunity · Queensland time</div></div><div class="window-score"><div class="star-small" aria-label="${w.stars} stars">${starText(w.stars)}</div><small>${w.score}/100</small></div></div>`).join('');
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
    const s = STATIONS[loc().station];
    return `<section class="card"><div class="row"><h2 style="margin:0">Tides · ${s.name}</h2><span class="score-badge">${p.hasTides ? 'Imported' : 'Not loaded'}</span></div>
      ${p.tides.length ? `<div class="section-split">${tideRows(p)}</div>` : `<p class="small">No tide times have been entered for this date. Fishing scores currently use only astronomical conditions.</p>`}
      ${stationHint()}
      <div class="actions"><button class="btn secondary" data-action="show-date-tides" data-date="${p.key}">${p.tides.length ? 'Manage tide data' : 'Add real tide data'}</button></div>
    </section>`;
  }
  function renderToday() {
    const date = todayKey(), p = predict(date);
    return `<p class="eyebrow">Your local fishing outlook</p><h1>Find your next great fishing window.</h1><p class="lead">Calculated for the Whitsundays, in Queensland time (AEST).</p>
      <div class="card soft">${locationPicker()}</div>${flash()}
      ${scoreCard(p,date)}
      <section class="card"><div class="row"><h2>Best windows today</h2><span class="score-badge">Top 3</span></div>${windowCards(p)}<p class="hint">Windows favour moon transit/rise/set, sunrise/sunset and, where imported, tidal movement.</p></section>
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
    const calendar = `<div class="cal-grid">${['M','T','W','T','F','S','S'].map(d=>`<div class="cal-week">${d}</div>`).join('')}${'<div class="cal-day empty"></div>'.repeat(blank)}${forecasts.map(d=>`<button class="cal-day ${d.date===todayKey()?'today-day':''} ${d.date===state.selected?'selected':''}" data-action="select-date" data-date="${d.date}" aria-label="${escapeHtml(fullDate(d.date))}, ${d.stars} stars"><span>${Number(d.date.slice(-2))}</span><span class="cal-rating">${d.stars}★${d.hasTides ? ' ≋' : ''}</span></button>`).join('')}</div>`;
    const top = [...forecasts].sort((a,b)=>b.score-a.score || a.date.localeCompare(b.date)).slice(0,5);
    return `<p class="eyebrow">Plan ahead</p><h1>Fishing calendar</h1><p class="lead">Compare estimated fishing windows by day and save your trips.</p><div class="card soft">${locationPicker()}</div>${flash()}
      <section class="card"><div class="calendar-header"><button class="chevron" data-action="prev-month" aria-label="Previous month">‹</button><strong>${label}</strong><button class="chevron" data-action="next-month" aria-label="Next month">›</button></div>${calendar}<p class="hint">★ Relative score · ≋ User-imported tide data · Other dates use sun/moon only</p></section>
      <section class="card"><div class="eyebrow">Selected date</div><h2>${escapeHtml(fullDate(state.selected))}</h2><div class="row"><span class="stars" aria-label="${selected.stars} out of 5 stars">${starText(selected.stars)}</span><span class="score-badge">${selected.score}/100</span></div><p class="small">${sourceStatus(selected)}</p>${windowCards(selected)}<div class="actions"><button class="btn" data-action="save-trip" data-date="${state.selected}">Save this session</button><button class="btn secondary" data-action="show-date-tides" data-date="${state.selected}">View tides</button></div></section>
      <section class="card"><h2>Top 5 dates this month</h2><div class="best-days">${top.map(d=>`<button class="best-day" data-action="select-date" data-date="${d.date}"><span>${shortDate(d.date)}${d.hasTides ? ' · tides loaded':''}</span><span class="star-small">${starText(d.stars)} · ${d.score}</span></button>`).join('')}</div></section>`;
  }
  function renderTrips() {
    const trips = [...state.trips].filter(t => typeof t.date === 'string' && LOCATIONS.some(l=>l.id===t.locId)).sort((a,b)=>a.date.localeCompare(b.date));
    return `<p class="eyebrow">Your saved sessions</p><h1>Fishing trips</h1><p class="lead">Sessions save on this device and remain available offline.</p>${flash()}
      <section class="card"><h2>Saved sessions (${trips.length})</h2>${trips.length ? trips.map(t => {
        const place = LOCATIONS.find(l=>l.id===t.locId);
        return `<div class="saved-item"><div class="row"><div><strong>${escapeHtml(fullDate(t.date))}</strong><span>${escapeHtml(place.name)}</span><span>${clockRange(t.start, t.end)}</span></div><button class="btn danger" data-action="remove-trip" data-id="${escapeHtml(t.id)}">Remove</button></div></div>`;
      }).join('') : `<div class="empty-state"><div class="empty-icon">🎣</div><h3>No saved fishing trips</h3><p class="small">Pick a date in the calendar, then select “Save this session”.</p><button class="btn" data-action="open-calendar">Open calendar</button></div>`}</section>
      <p class="hint">Saved trips are stored only in this browser. They do not automatically sync across devices.</p>`;
  }
  function renderTides() {
    const p = predict(state.selected);
    const station = STATIONS[loc().station];
    const existing = p.tides.length ? tideRows(p) : '<p class="small">No tide events saved for this date.</p>';
    return `<p class="eyebrow">Official data & manual entry</p><h1>Tide planner</h1><p class="lead">Bring real high/low tide predictions into the app. No invented tide times.</p>
      <div class="card soft">${locationPicker()}</div>${flash()}
      <section class="card"><h2>${station.name} tide station</h2><label for="tide-date">Date</label><input type="date" id="tide-date" value="${state.selected}"><p class="hint">${nTideDays()} dates loaded for this station. The selected location may not be the actual tide-gauge site.</p>${stationHint()}<div class="divider"></div>${existing}</section>
      <section class="card"><h2>Import Queensland tide CSV</h2><p class="small">Download the <b>predicted high/low CSV</b> for ${station.name} from Queensland Open Data, then choose that downloaded CSV below. The imported dates can be used throughout your calendar.</p>
        <p><a href="${station.link}" target="_blank" rel="noopener noreferrer">Open official ${station.name} tide dataset ↗</a></p>
        <label for="tide-file">Choose downloaded high/low CSV</label><input type="file" id="tide-file" accept=".csv,text/csv"><div class="actions"><button class="btn" data-action="import-file">Import tide predictions</button></div>
        <p class="hint">Expected columns: Date, Time, Ind (H/L), Reading. Select the correct station yourself; the app cannot independently authenticate an uploaded file. Times are assumed to be Queensland AEST (UTC+10).</p>
      </section>
      <section class="card"><h2>Or add tides for one date</h2><p class="small">Enter at least two events, one per line. Example:</p>
        <p class="tiny muted">06:20 H 2.50<br>12:35 L 0.65<br>18:45 H 2.10</p>
        <label for="manual-tides">Tide entries for ${state.selected}</label><textarea id="manual-tides" placeholder="06:20 H 2.50&#10;12:35 L 0.65"></textarea><div class="actions"><button class="btn" data-action="save-manual">Save this date</button><button class="btn danger" data-action="remove-tides-date">Clear this date</button></div>
      </section><p class="hint">For boating safety, use current official tide tables and marine forecasts. Imported predictions are not live tide measurements.</p>`;
  }
  function renderAbout() {
    return `<p class="eyebrow">How it works</p><h1>About Solunar / Tide</h1>
      <section class="card"><h2>What works in this version</h2><p>Today’s 3 best 2-hour fishing windows, solunar events, sun times, moon phase, star-rated monthly calendar, saved sessions, location choices, and import/manual entry of actual tide predictions.</p>
      <p>All astronomical calculations run in your browser. You can use previously loaded app screens offline. Your saved sessions and imported tides are stored locally.</p></section>
      <section class="card"><h2>The 1–5 star rating</h2><p>We calculate an illustrative <b>relative opportunity score</b> from moon overhead/underfoot, moonrise/moonset, sunrise/sunset and moon illumination. When tide events have been imported for the selected day, proximity to high/low tide and the movement between adjacent highs/lows also contribute.</p>
        <div class="tide-row"><span>★★★★★</span><span>78–100</span><span>Excellent</span></div><div class="tide-row"><span>★★★★☆</span><span>62–77</span><span>Very good</span></div><div class="tide-row"><span>★★★☆☆</span><span>46–61</span><span>Good</span></div><div class="tide-row"><span>★★☆☆☆</span><span>30–45</span><span>Fair</span></div><div class="tide-row"><span>★☆☆☆☆</span><span>1–29</span><span>Low</span></div>
        <p class="hint">This is a heuristic, not a scientifically validated catch-probability model. Scores without loaded tide data are clearly labelled “Solunar only”.</p></section>
      <section class="card"><h2>Data and limitations</h2><p>Astronomical calculations are approximate and based on SunCalc-style solar and lunar position equations. Local events use <b>Australia/Brisbane (AEST, UTC+10)</b>. Tide events are not automatically sourced and must be imported or entered. Nearby tide stations do not capture all local variations.</p>
        <p>Queensland high/low tide predictions: <a href="https://www.msq.qld.gov.au/tides/open-data" target="_blank" rel="noopener noreferrer">Maritime Safety Queensland</a>. Data files published by Queensland Government are typically available under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>; review the individual source’s conditions. Astronomy based on <a href="https://github.com/mourner/suncalc" target="_blank" rel="noopener noreferrer">SunCalc</a> (BSD 2-Clause License).</p>
        <div class="notice warning">Not for navigation or marine safety. Check official tide times, weather, marine warnings, boating requirements and fishing regulations before fishing.</div></section>
      <section class="card"><h2>Add to iPhone Home Screen</h2><p>Open your deployed website in <b>Safari</b>, tap the Share icon, choose <b>Add to Home Screen</b>, then Add.</p><p class="small">Version 2.1 · Local-first fishing planner</p></section>`;
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
    render();
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
    render();
  }
  async function importFile() {
    const input = document.getElementById('tide-file');
    const file = input?.files?.[0];
    if (!file) { state.flash = 'Choose a downloaded tide CSV file first.'; render(); return; }
    const stationId = loc().station;
    try {
      const result = Tides.parseCsv(await file.text());
      state.tides[stationId] = Tides.merge(state.tides[stationId] || {}, result.byDate);
      saveState();
      state.flash = `Imported ${result.accepted} tide events across ${result.days} dates for ${STATIONS[stationId].name}. ${result.ignored} lines skipped.`;
    } catch (error) { state.flash = `Import failed: ${error.message}`; }
    render();
  }
  function saveManual() {
    try {
      const rows = Tides.parseManual(state.selected, document.getElementById('manual-tides').value);
      state.tides[loc().station] = Tides.merge(tideMap(), rows);
      saveState();
      state.flash = `Saved ${rows[state.selected].length} high/low events for ${shortDate(state.selected)}.`;
    } catch (error) { state.flash = error.message; }
    render();
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
      case 'select-date': state.selected=date;state.month=date.slice(0,7);render();break;
      case 'prev-month': moveMonth(-1); break;
      case 'next-month': moveMonth(1); break;
      case 'save-trip': saveTrip(date); break;
      case 'remove-trip': state.trips=state.trips.filter(t => t.id !== target.dataset.id);saveState();render();break;
      case 'import-file': importFile();break;
      case 'save-manual': saveManual();break;
      case 'remove-tides-date': {
        if (!tideMap()[state.selected]) { state.flash='No tide entries to clear for this date.';render();break; }
        if (window.confirm(`Clear tide predictions for ${fullDate(state.selected)}?`)) {
          delete tideMap()[state.selected];saveState();state.flash='Tide events cleared for this date.';render();
        }
        break;
      }
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'location-select' && LOCATIONS.some(l=>l.id===event.target.value)) {
      state.locId=event.target.value;saveState();render();
    }
    if (event.target.id === 'tide-date') {
      const date = Tides.parseDate(event.target.value);
      if (date) { state.selected=date;state.month=date.slice(0,7);render(); }
    }
  });
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('Offline service worker unavailable:',error));
  }
})();
