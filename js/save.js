/* ===========================================================================
 * save.js - PlayerPrefs equivalent.
 *
 * GameManager persists exactly one entry:
 *     PlayerPrefs.SetString("GM_FinishedLevelIDs", string.Join(",", ids))
 * loaded back with Split(',') + int.TryParse.
 *
 * We keep the identical key and the identical comma separated value format in
 * localStorage, so the save data stays byte-for-byte what Unity would store.
 * ======================================================================== */

const PlayerPrefs = (function () {
  'use strict';
  const PREFIX = ''; // Unity has no prefix inside its own store; we mirror the key 1:1

  function available() {
    try { window.localStorage.setItem('__g5', '1'); window.localStorage.removeItem('__g5'); return true; }
    catch (e) { return false; }
  }
  const ok = available();
  const memory = {};

  return {
    GetString(key, def) {
      try {
        const v = ok ? window.localStorage.getItem(PREFIX + key) : memory[key];
        return (v === null || v === undefined) ? (def === undefined ? '' : def) : v;
      } catch (e) { return def === undefined ? '' : def; }
    },
    SetString(key, value) {
      try { if (ok) window.localStorage.setItem(PREFIX + key, value); else memory[key] = value; }
      catch (e) { memory[key] = value; }
    },
    DeleteKey(key) {
      try { if (ok) window.localStorage.removeItem(PREFIX + key); } catch (e) {}
      delete memory[key];
    },
    Save() { /* localStorage writes are already synchronous */ },
  };
})();
