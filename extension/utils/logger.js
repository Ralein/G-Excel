/**
 * Toggleable debug logging utility
 * Errors are always logged regardless of enabled state.
 */
const Logger = (() => {
  let enabled = false;

  return {
    enable() { enabled = true; },
    disable() { enabled = false; },
    isEnabled() { return enabled; },

    log(...args) {
      if (enabled) console.log('[G-Excel]', ...args);
    },

    warn(...args) {
      if (enabled) console.warn('[G-Excel]', ...args);
    },

    error(...args) {
      // Always log errors
      console.error('[G-Excel]', ...args);
    },

    info(...args) {
      if (enabled) console.info('[G-Excel]', ...args);
    },

    group(label) {
      if (enabled) console.group(`[G-Excel] ${label}`);
    },

    groupEnd() {
      if (enabled) console.groupEnd();
    },

    table(data) {
      if (enabled) console.table(data);
    }
  };
})();
