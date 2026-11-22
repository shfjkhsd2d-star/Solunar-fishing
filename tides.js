/* Tide data parsing and validation. Imported events are user-provided official or manual data. */
(function (global) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const makeKey = (year, month, day) => {
    const dt = new Date(Date.UTC(+year, +month - 1, +day));
    if (+year !== dt.getUTCFullYear() || +month !== dt.getUTCMonth() + 1 || +day !== dt.getUTCDate()) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  };
  function parseDate(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)/);
    if (m) return makeKey(+m[1], +m[2], +m[3]);
    m = s.match(/^([0-3]?\d)[\/.-]([01]?\d)[\/.-](\d{4})/);
    if (m) return makeKey(+m[3], +m[2], +m[1]); // Australian day/month/year
    return null;
  }
  function parseTime(raw) {
    const str = String(raw || '').trim().toUpperCase().replace(/\s+/g,' ');
    let hours, minutes;
    const ampm = str.match(/\s*(AM|PM)$/);
    let s = str.replace(/\s*(AM|PM)$/, '').trim();
    if (/^\d{3,4}$/.test(s)) {
      s = s.padStart(4, '0'); hours = +s.slice(0, 2); minutes = +s.slice(2);
    } else {
      const match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (!match) return null;
      hours = +match[1]; minutes = +match[2];
    }
    if (ampm) {
      if (hours < 1 || hours > 12) return null;
      hours = hours % 12 + (ampm[1] === 'PM' ? 12 : 0);
    }
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }
  function classifyType(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (/^(h|high|high tide|hw)$/.test(s)) return 'high';
    if (/^(l|low|low tide|lw)$/.test(s)) return 'low';
    return null;
  }
  function event(key, clock, type, height) {
    const date = parseDate(key), time = parseTime(clock), kind = classifyType(type);
    const reading = height === '' || height === undefined || height === null ? null : Number(height);
    if (!date || !time || !kind || (reading !== null && (!Number.isFinite(reading) || reading < -3 || reading > 20))) return null;
    return { date, time: Date.parse(`${date}T${time}:00+10:00`), clock, type: kind, height: reading };
  }
  function csvLine(line) {
    let fields = [], field = '', quotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (quotes && line[i + 1] === '"') { field += '"'; i++; }
        else quotes = !quotes;
      } else if (line[i] === ',' && !quotes) { fields.push(field.trim()); field=''; }
      else field += line[i];
    }
    fields.push(field.trim());
    return fields;
  }
  function addEvent(map, e) {
    (map[e.date] ||= []).push({ time: e.time, type: e.type, height: e.height });
  }
  function normalise(map) {
    for (const key in map) {
      const seen = new Set();
      map[key] = map[key].filter(e => {
        const sig = `${e.type}|${e.time}`;
        if (seen.has(sig)) return false;
        seen.add(sig); return true;
      }).sort((a,b) => a.time-b.time);
    }
    return map;
  }
  function parseCsv(text) {
    if (typeof text !== 'string' || text.length > 8000000) throw new Error('Please choose a CSV smaller than 8 MB.');
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const headerAt = lines.findIndex(line => {
      const cells = csvLine(line).map(c=>c.toLowerCase().replace(/[^a-z]/g,''));
      return cells.includes('date') && cells.includes('time') && (cells.includes('ind') || cells.includes('type'));
    });
    if (headerAt < 0) throw new Error('CSV needs Date, Time and Ind (H/L) columns, like Queensland predicted high/low files.');
    const names = csvLine(lines[headerAt]).map(c=>c.toLowerCase().replace(/[^a-z]/g,''));
    const idx = name => names.indexOf(name);
    const dateCol = idx('date'), timeCol = idx('time'), typeCol = idx('ind') !== -1 ? idx('ind') : idx('type');
    const readCol = idx('reading') !== -1 ? idx('reading') : idx('height');
    const map = {}; let accepted = 0, ignored = 0;
    for (let i = headerAt + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cells = csvLine(lines[i]);
      const e = event(cells[dateCol], cells[timeCol], cells[typeCol], readCol === -1 ? null : cells[readCol]);
      if (!e) { ignored++; continue; }
      addEvent(map, e); accepted++;
    }
    if (!accepted) throw new Error('No valid high/low events found. Check dates, times and H/L indicators.');
    return { byDate: normalise(map), accepted, ignored, days: Object.keys(map).length };
  }
  function parseManual(key, raw) {
    const map = {}, bad = [];
    String(raw).split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      const m = line.trim().match(/^(\d{1,2}:\d{2}|\d{3,4})\s+(H|L|HIGH|LOW)(?:\s+(-?\d+(?:\.\d+)?))?\s*$/i);
      const e = m && event(key, m[1], m[2], m[3] ?? null);
      if (!e) bad.push(i + 1); else addEvent(map, e);
    });
    if (bad.length) throw new Error(`Check tide entry line${bad.length>1?'s':''}: ${bad.join(', ')}. Use 06:20 H 2.5`);
    if (!(map[key]?.length >= 2)) throw new Error('Add at least two high/low tide events for this date.');
    return normalise(map);
  }
  function merge(current, addition) {
    const result = { ...current };
    for (const key of Object.keys(addition)) result[key] = addition[key];
    return result;
  }
  global.SolunarTides = { parseDate, parseTime, classifyType, parseCsv, parseManual, merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.SolunarTides;
})(typeof window !== 'undefined' ? window : globalThis);
