/* Persistência local (texto e ajustes) com tolerância a falhas:
 * modo privado, cota cheia ou armazenamento bloqueado nunca quebram o app. */
(function (TP) {
  "use strict";
  var PREFIX = "tp:";

  function get(key, fallback) {
    try {
      var raw = window.localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function set(key, value) {
    try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function remove(key) {
    try { window.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignora */ }
  }

  TP.storage = { get: get, set: set, remove: remove };
})(window.TP = window.TP || {});
