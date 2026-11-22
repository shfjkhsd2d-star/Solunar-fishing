/* 10-minute tidal height-change analysis. This is NOT a tidal-current or fish-catch model.
   Uses verified forecast water heights to estimate rise/fall in metres per hour. */
(function (global) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function build(heights) {
    if (!Array.isArray(heights) || heights.length !== 144 ||
        !heights.every(x => typeof x === 'number' && Number.isFinite(x) && x >= -3 && x <= 20)) return null;
    // Linear interpolation between 10-minute predicted heights. No extrapolation.
    function heightAt(minute) {
      if (minute < 0 || minute > 1430) return null;
      const index = minute / 10, lo = Math.floor(index), hi = Math.min(143, lo + 1);
      const fraction = index - lo;
      return heights[lo] * (1 - fraction) + heights[hi] * fraction;
    }
    function changeAt(minute) {
      const before = heightAt(minute - 30), after = heightAt(minute + 30);
      return before == null || after == null ? null : after - before; // metres per hour
    }
    const rates = [];
    for (let minute = 30; minute <= 1400; minute += 10) {
      const value = changeAt(minute);
      if (value !== null) rates.push(Math.abs(value));
    }
    rates.sort((a,b) => a-b);
    // Use a robust daily 90th-percentile benchmark, avoiding near-zero division.
    const reference = Math.max(0.08, rates[Math.floor(0.9 * (rates.length - 1))] || 0);
    function atMinute(minute) {
      const rate = changeAt(minute);
      if (rate === null) return null;
      const relative = clamp(Math.abs(rate) / reference, 0, 1);
      return {
        rate: Math.round(rate * 1000) / 1000,
        direction: rate > 0.04 ? 'rising' : rate < -0.04 ? 'falling' : 'near-slack',
        percent: Math.round(relative * 100),
        bonus: Math.round(20 * Math.pow(relative, 0.85)),
      };
    }
    return { atMinute, reference: Math.round(reference * 1000)/1000, minHeight: Math.min(...heights), maxHeight: Math.max(...heights) };
  }
  global.SolunarMovement = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.SolunarMovement;
})(typeof window !== 'undefined' ? window : globalThis);
