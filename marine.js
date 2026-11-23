/* Offshore and nearshore swell forecasts via Open-Meteo Marine API.
   Model predictions, not live wave buoy observations, tidal current or marine-safety guidance. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SolunarMarine = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';
  const ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
  const VARS = ['swell_wave_height','swell_wave_direction','swell_wave_period','wave_height'];
  const compass = degree => {
    if (!Number.isFinite(degree)) return '—';
    const names = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return names[Math.round((((degree % 360) + 360) % 360) / 22.5) % 16];
  };
  function buildUrl(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) throw new Error('Invalid marine forecast coordinates');
    const q = new URLSearchParams({latitude:String(lat),longitude:String(lon),hourly:VARS.join(','),timezone:'Australia/Brisbane',forecast_days:'8',cell_selection:'sea'});
    return ENDPOINT + '?' + q.toString();
  }
  const valid = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v>=min && v<=max ? v : null;
  function gridInfo(payload) {
    const lat = payload?.latitude, lon = payload?.longitude;
    return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
      typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180
      ? { lat, lon } : null;
  }
  function parseDays(json) {
    if (!json || json.error || json.timezone !== 'Australia/Brisbane') throw new Error('Invalid Queensland marine forecast response');
    const h = json.hourly;
    if (!h || !Array.isArray(h.time) || !Array.isArray(h.swell_wave_height) || h.swell_wave_height.length !== h.time.length) throw new Error('Marine swell heights missing');
    const out = {};
    const get = (name,i) => Array.isArray(h[name]) && h[name].length === h.time.length ? h[name][i] : null;
    for (let i=0;i<h.time.length;i++) {
      const t = h.time[i];
      if (typeof t!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(t)) continue;
      const date=t.slice(0,10), hour=Number(t.slice(11,13));
      if (hour>23 || !Number.isInteger(hour)) continue;
      const height = valid(get('swell_wave_height',i),0,30);
      if (height===null) continue;
      (out[date] ||= {day:date, hours:[]}).hours.push({hour,height,
        direction:valid(get('swell_wave_direction',i),0,360),
        period:valid(get('swell_wave_period',i),0,40),
        waveHeight:valid(get('wave_height',i),0,40)});
    }
    // Do not present a largely missing forecast as a representative whole day.
    for (const [key,value] of Object.entries(out)) {
      value.hours.sort((a,b)=>a.hour-b.hour);
      if (new Set(value.hours.map(r=>r.hour)).size<12) delete out[key];
    }
    return out;
  }
  function dominantDirection(records) {
    let x=0,y=0;
    for (const r of records) {
      if (r.direction===null) continue;
      const weight=Math.max(r.height,0.1);
      x+=Math.cos(r.direction*Math.PI/180)*weight;
      y+=Math.sin(r.direction*Math.PI/180)*weight;
    }
    return x===0 && y===0 ? null : (Math.atan2(y,x)*180/Math.PI+360)%360;
  }
  function summary(day) {
    if (!day || !Array.isArray(day.hours) || !day.hours.length) return null;
    const h=day.hours;
    const periods=h.map(r=>r.period).filter(Number.isFinite);
    const waveHeights=h.map(r=>r.waveHeight).filter(Number.isFinite);
    const direction=dominantDirection(h);
    return {maxSwell:Math.max(...h.map(r=>r.height)),period:periods.length ? periods.reduce((a,b)=>a+b,0)/periods.length : null,
      direction,compass:compass(direction),maxWave:waveHeights.length ? Math.max(...waveHeights):null,samples:h.length};
  }
  function nearestHour(day, hour) {
    return day?.hours?.reduce((best,r)=>!best || Math.abs(r.hour-hour)<Math.abs(best.hour-hour)?r:best,null) || null;
  }
  return {buildUrl,parseDays,summary,nearestHour,compass,gridInfo};
});
