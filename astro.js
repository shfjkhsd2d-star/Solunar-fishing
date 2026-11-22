/* Solunar / Tide — astronomical computations. No server or API key required.
 * Core solar/lunar position equations adapted from SunCalc by Volodymyr Agafonkin
 * (BSD 2-Clause License): https://github.com/mourner/suncalc
 * Event times and fishing scores are approximations, not official ephemerides.
 */
(function (global) {
  'use strict';
  const RAD = Math.PI / 180;
  const DAY_MS = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const obliquity = RAD * 23.4397;
  const cache = new Map();
  const pad = n => String(n).padStart(2, '0');
  const dayStart = key => Date.parse(`${key}T00:00:00+10:00`);
  const dateKey = date => new Date(date.getTime() + 10 * 3600000).toISOString().slice(0, 10);
  const toDays = time => (time / DAY_MS - 0.5 + J1970) - J2000;
  function ra(l, b) { return Math.atan2(Math.sin(l) * Math.cos(obliquity) - Math.tan(b) * Math.sin(obliquity), Math.cos(l)); }
  function dec(l, b) { return Math.asin(Math.sin(b) * Math.cos(obliquity) + Math.cos(b) * Math.sin(obliquity) * Math.sin(l)); }
  function sidereal(d, lw) { return RAD * (280.16 + 360.9856235 * d) - lw; }
  function sunCoords(d) {
    const m = RAD * (357.5291 + 0.98560028 * d);
    const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
    const l = m + c + RAD * 102.9372 + Math.PI;
    return { ra: ra(l, 0), dec: dec(l, 0) };
  }
  function moonCoords(d) {
    const L = RAD * (218.316 + 13.176396 * d);
    const M = RAD * (134.963 + 13.064993 * d);
    const F = RAD * (93.272 + 13.229350 * d);
    const l = L + RAD * 6.289 * Math.sin(M);
    const b = RAD * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  function altitude(time, lat, lon, body) {
    const d = toDays(time);
    const c = body === 'sun' ? sunCoords(d) : moonCoords(d);
    const hourAngle = sidereal(d, -lon * RAD) - c.ra;
    const phi = lat * RAD;
    const h = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(hourAngle));
    return h;
  }
  function moonIllumination(time) {
    const d = toDays(time);
    const s = sunCoords(d), m = moonCoords(d);
    const sd = Math.acos(Math.max(-1, Math.min(1, Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra))));
    const inc = Math.atan2(149598000 * Math.sin(sd), m.dist - 149598000 * Math.cos(sd));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: (0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI) % 1 };
  }
  function phaseName(phase) {
    if (phase < 0.035 || phase > 0.965) return 'New moon';
    if (phase < 0.215) return 'Waxing crescent';
    if (phase < 0.285) return 'First quarter';
    if (phase < 0.465) return 'Waxing gibbous';
    if (phase < 0.535) return 'Full moon';
    if (phase < 0.715) return 'Waning gibbous';
    if (phase < 0.785) return 'Last quarter';
    return 'Waning crescent';
  }
  function refineExtremum(p, q, r, step) {
    // The apex of the parabola through equally spaced altitude samples.
    const den = p - 2 * q + r;
    if (Math.abs(den) < 1e-9) return 0;
    return Math.max(-1, Math.min(1, 0.5 * (p - r) / den)) * step;
  }
  function scanEvents(key, lat, lon) {
    const start = dayStart(key), end = start + DAY_MS, step = 15 * 60000;
    const from = start - 4 * 3600000, to = end + 4 * 3600000;
    const moon = [], sun = [], data = [];
    for (let t = from; t <= to; t += step) {
      data.push({ t, m: altitude(t, lat, lon, 'moon'), s: altitude(t, lat, lon, 'sun') });
    }
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1], curr = data[i];
      // Sunrise/sunset at solar centre -0.833 degrees incl. atmospheric refraction.
      const threshold = -0.833 * RAD;
      if ((prev.s - threshold) * (curr.s - threshold) < 0) {
        const t = prev.t + ((threshold - prev.s) / (curr.s - prev.s)) * step;
        sun.push({ type: curr.s > prev.s ? 'sunrise' : 'sunset', time: Math.round(t) });
      }
      // Approximate apparent moon horizon correction for refraction + parallax.
      const moonThreshold = 0.125 * RAD;
      if ((prev.m - moonThreshold) * (curr.m - moonThreshold) < 0) {
        const t = prev.t + ((moonThreshold - prev.m) / (curr.m - prev.m)) * step;
        moon.push({ type: curr.m > prev.m ? 'moonrise' : 'moonset', time: Math.round(t) });
      }
      if (i < data.length - 1) {
        const next = data[i + 1];
        if (curr.m > prev.m && curr.m > next.m) {
          moon.push({ type: 'overhead', time: Math.round(curr.t + refineExtremum(prev.m, curr.m, next.m, step)) });
        } else if (curr.m < prev.m && curr.m < next.m) {
          moon.push({ type: 'underfoot', time: Math.round(curr.t + refineExtremum(prev.m, curr.m, next.m, step)) });
        }
      }
    }
    const inDay = e => e.time >= start && e.time < end;
    const illumin = moonIllumination(start + 12 * 3600000);
    return {
      key, start, end, moon: moon.sort((a,b)=>a.time-b.time), sun: sun.sort((a,b)=>a.time-b.time),
      visibleMoon: moon.filter(inDay).sort((a,b)=>a.time-b.time),
      visibleSun: sun.filter(inDay).sort((a,b)=>a.time-b.time),
      phase: { ...illumin, name: phaseName(illumin.phase) }
    };
  }
  function dayAstronomy(key, lat, lon) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid date or coordinates');
    const cacheKey = `${key}|${lat}|${lon}`;
    if (!cache.has(cacheKey)) {
      if (cache.size > 110) cache.clear();
      cache.set(cacheKey, scanEvents(key, lat, lon));
    }
    return cache.get(cacheKey);
  }
  const expBoost = (center, events, types, strength, widthHours) => {
    const chosen = events.filter(e => types.includes(e.type));
    if (!chosen.length) return 0;
    const min = Math.min(...chosen.map(e => Math.abs(e.time - center) / 3600000));
    return strength * Math.exp(-0.5 * Math.pow(min / widthHours, 2));
  };
  function scoreAt(time, astro, tideEvents = [], movement = null) {
    const moon = astro.moon, sun = astro.sun;
    // Simple inspectable heuristic, not a trained fish-catch prediction model.
    let score = 15;
    score += expBoost(time, moon, ['overhead', 'underfoot'], 34, 1.25);
    score += expBoost(time, moon, ['moonrise', 'moonset'], 16, 1.15);
    score += expBoost(time, sun, ['sunrise', 'sunset'], 22, 1.1);
    score += 9 * Math.pow(Math.abs(astro.phase.fraction - 0.5) * 2, 1.15);
    if (movement) {
      // Verified 10-minute forecast water-level change supersedes the rough high/low midpoint proxy.
      score += movement.bonus;
    } else if (tideEvents.length) {
      score += expBoost(time, tideEvents, ['high', 'low'], 12, 1.5);
      // Mid-flood / mid-ebb often provides movement; require consecutive alternate turns.
      const ordered = [...tideEvents].sort((a,b) => a.time - b.time);
      const mids = [];
      for (let i = 1; i < ordered.length; i++) {
        if (ordered[i - 1].type !== ordered[i].type && ordered[i].time - ordered[i-1].time < 10 * 3600000) {
          mids.push({ type: 'movement', time: (ordered[i-1].time + ordered[i].time) / 2 });
        }
      }
      score += expBoost(time, mids, ['movement'], 8, 1.4);
    }
    return Math.max(1, Math.min(100, Math.round(score)));
  }
  function stars(score) { return score >= 78 ? 5 : score >= 62 ? 4 : score >= 46 ? 3 : score >= 30 ? 2 : 1; }
  function predictDay(key, lat, lon, tideByDate, intervalByDate = null) {
    const astro = dayAstronomy(key, lat, lon);
    const around = [-1,0,1].flatMap(delta => {
      const date = dateKey(new Date(astro.start + delta * DAY_MS));
      return tideByDate && Array.isArray(tideByDate[date]) ? tideByDate[date] : [];
    });
    const tides = around.map(e => ({ ...e, time: Number(e.time) })).filter(e => Number.isFinite(e.time));
    const hasTides = Boolean(tideByDate && Array.isArray(tideByDate[key]) && tideByDate[key].length >= 2);
    const eligibleTides = hasTides ? tides : [];
    const movement = global.SolunarMovement && intervalByDate && intervalByDate[key]
      ? global.SolunarMovement.build(intervalByDate[key]) : null;
    let candidates = [];
    // 2-hour fishing windows, 30-minute starts from 00:00 to 22:00 AEST.
    for (let offset = 0; offset <= 22 * 60; offset += 30) {
      const start = astro.start + offset * 60000;
      const center = start + 3600000;
      const movementInfo = movement ? movement.atMinute(offset + 60) : null;
      candidates.push({ start, end: start + 2 * 3600000,
        score: scoreAt(center, astro, eligibleTides, movementInfo), movement: movementInfo });
    }
    candidates.sort((a,b)=>b.score-a.score || a.start-b.start);
    const best = [];
    for (const c of candidates) {
      if (best.every(b => c.end <= b.start || c.start >= b.end)) best.push({ ...c, stars: stars(c.score) });
      if (best.length === 3) break;
    }
    best.sort((a,b)=>a.start-b.start);
    return { key, astro, score: candidates[0].score, stars: stars(candidates[0].score), windows: best,
      hasTides: hasTides || Boolean(movement), hasHighLow: hasTides, intervalUsed: Boolean(movement),
      movement: movement ? movement.atMinute(720) : null, tides: tideByDate?.[key] || [] };
  }
  global.SolunarAstro = { dayStart, dateKey, dayAstronomy, moonIllumination, predictDay, stars, phaseName, scoreAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.SolunarAstro;
})(typeof window !== 'undefined' ? window : globalThis);
