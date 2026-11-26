/* Queensland observed Abbot Point wave buoy adapter, not a forecast. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SolunarWaves = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';
  const COORDS = {lat:-19.860567,lon:148.094333};
  const SOURCE = 'https://www.qld.gov.au/environment/coasts-waterways/beach/monitoring/waves-sites/abbot-point';
  const maxAgeHours = 18;
  const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
  function parse(body, now = Date.now()) {
    if (!body || body.schema !== 1 || body.station !== 'abbot-point' || !Array.isArray(body.observations)) {
      throw new Error('Invalid Abbot Point wave observation file');
    }
    const readings = body.observations.map(row => {
      const ms = typeof row?.time === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(row.time) ? Date.parse(row.time) : NaN;
      const hs = num(row?.hs, 0, 25);
      if (!Number.isFinite(ms) || hs === null || ms > now + 30*60000) return null;
      return {ms, time:new Date(ms).toISOString(), hs,
        hmax:num(row.hmax,0,50),tp:num(row.tp,0,40),direction:num(row.direction,0,360),sst:num(row.sst,-5,42)};
    }).filter(Boolean).sort((a,b)=>b.ms-a.ms);
    if (!readings.length) throw new Error('No valid Abbot Point observations');
    const newest = readings[0];
    const hoursOld = Math.max(0,(now-newest.ms)/3600000);
    if (hoursOld > maxAgeHours) throw new Error('Abbot Point observations are older than 18 hours');
    return { latest:newest, hoursOld, site:'Abbot Point', buoy:COORDS, sourcePage:SOURCE };
  }
  const compass = deg => deg == null ? '—' :
    ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round((deg % 360)/22.5)%16];
  return {parse,compass,COORDS,SOURCE};
});
