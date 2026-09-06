/** FOC token 探测结果缓存（health 与 CAS 续登共用） */
const SF_FOC_PROBE_CACHE_MS = 90 * 1000;
let cache = { key: "", at: 0, result: null };

function getSfFocProbeCache() {
  return cache;
}

function setSfFocProbeCache(next) {
  cache = next;
}

function clearSfFocProbeCache() {
  cache = { key: "", at: 0, result: null };
}

module.exports = {
  SF_FOC_PROBE_CACHE_MS,
  getSfFocProbeCache,
  setSfFocProbeCache,
  clearSfFocProbeCache,
};
