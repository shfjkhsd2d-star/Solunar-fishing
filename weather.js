/* Hourly weather forecast adapter. Source: Open-Meteo forecast API (best_match), NOT a live BOM observation.
   Queensland / Brisbane timestamps returned as local ISO strings without browser time-zone conversion. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SolunarWeather = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';
  const ORIGIN = 'https://api.open-meteo.com/v1/forecast';
  const VARS = [
    'temperature_2m', 'weather_code', 'precipitation_probability',
    'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'
  ];
  const compassPoints = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  function compass(deg) {
    if (!Number.isFinite(deg)) return '—';
    return compassPoints[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  }
  function buildUrl(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error('Invalid fishing-location coordinates');
    }
    const args = [
      'latitude=' + encodeURIComponent(latitude), 'longitude=' + encodeURIComponent(longitude),
      'hourly=' + VARS.join(','), 'timezone=Australia%2FBrisbane', 'forecast_days=16',
      'wind_speed_unit=kmh', 'models=best_match'
    ];
    return ORIGIN + '?' + args.join('&');
  }
  function optionalNumber(v, min, max) {
    return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
  }
  function parseForecast(payload, dayKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error('Invalid forecast day');
    if (!payload || payload.error || payload.timezone !== 'Australia/Brisbane') throw new Error('Weather provider returned an invalid Queensland forecast');
    const h = payload.hourly;
    if (!h || !Array.isArray(h.time) || !h.time.length) throw new Error('Hourly weather data is missing');
    // Wind speed and direction are essential; temperature, rain, codes and gusts
    // are optional because best-match model availability may vary by location.
    if (['wind_speed_10m','wind_direction_10m'].some(name => !Array.isArray(h[name]) || h[name].length !== h.time.length)) {
      throw new Error('Incomplete hourly wind response');
    }
    const valueAt = (name, index) => Array.isArray(h[name]) && h[name].length === h.time.length ? h[name][index] : null;
    const hours = [];
    const seen = new Set();
    for (let i = 0; i < h.time.length; i++) {
      const time = h.time[i];
      if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(time) || !time.startsWith(dayKey + 'T')) continue;
      const hour = Number(time.slice(11,13));
      const speed = optionalNumber(valueAt('wind_speed_10m',i), 0, 300);
      const direction = optionalNumber(valueAt('wind_direction_10m',i), 0, 360);
      if (!Number.isInteger(hour) || hour > 23 || seen.has(hour) || speed === null || direction === null) continue;
      seen.add(hour);
      hours.push({
        hour, speed, direction, compass: compass(direction),
        gust: optionalNumber(valueAt('wind_gusts_10m',i), 0, 350),
        temp: optionalNumber(valueAt('temperature_2m',i), -25, 60),
        rain: optionalNumber(valueAt('precipitation_probability',i), 0, 100),
        code: optionalNumber(valueAt('weather_code',i), 0, 99)
      });
    }
    hours.sort((a,b)=>a.hour-b.hour);
    if (hours.length < 18) throw new Error('Weather provider returned an incomplete forecast for today');
    return { day: dayKey, hours, source: 'Open-Meteo best-match forecast', timezone: 'Australia/Brisbane' };
  }
  function nearestHour(forecast, nowHour) {
    return forecast?.hours?.reduce((best, value) => !best || Math.abs(value.hour-nowHour) < Math.abs(best.hour-nowHour) ? value : best, null) || null;
  }
  function condition(code) {
    if (code == null) return 'Forecast';
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 48) return 'Cloudy or foggy';
    if (code <= 67) return 'Rain';
    if (code <= 77) return 'Showers';
    if (code <= 86) return 'Showers';
    if (code >= 95) return 'Thunderstorm risk';
    return 'Forecast';
  }
  function parseDays(payload) {
    if (!payload || !payload.hourly || !Array.isArray(payload.hourly.time)) throw new Error('Weather provider returned missing hourly forecasts');
    const days = [...new Set(payload.hourly.time.filter(t=>typeof t==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(t)).map(t=>t.slice(0,10)))];
    const result = {};
    for (const date of days) {
      try { result[date] = parseForecast(payload, date); } catch { /* Skip incomplete forecast dates. */ }
    }
    if (!Object.keys(result).length) throw new Error('No complete hourly wind forecasts available');
    return result;
  }
  function summary(day) {
    if (!day?.hours?.length) return null;
    const hours=day.hours;
    const speed=hours.reduce((total,h)=>total+h.speed,0)/hours.length;
    const gusts=hours.map(h=>h.gust).filter(Number.isFinite);
    let x=0,y=0;
    for (const h of hours) { const rad=h.direction*Math.PI/180; const weight=Math.max(h.speed,0.1); x+=Math.cos(rad)*weight;y+=Math.sin(rad)*weight; }
    const direction = x===0 && y===0 ? null : (Math.atan2(y,x)*180/Math.PI+360)%360;
    return {avgWind:speed,maxGust:gusts.length?Math.max(...gusts):null,direction,compass:compass(direction),samples:hours.length};
  }
  return { buildUrl, parseForecast, parseDays, summary, compass, nearestHour, condition };
});
