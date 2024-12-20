/** @about Silver Logger 2.0.0 @min_zeppos 1.0 @author: Silver, Zepp Health. @license: MIT */

let log_level = 1;
let log_prefix = "[log]";

export function setupLogger(options) {
  if (options.prefix) {
    log_prefix = `[${options.prefix}]`;
  }
  if (typeof options.level === 'number') {
    log_level = options.level;
  }
}

export function debugLog(level, ...params) {
  if (level <= log_level) {
    const trunc_params = params.map((param) => {
      const MAX_ITEMS = 2;
      if (Array.isArray(param) && param.length > MAX_ITEMS) {
        return [...param.slice(0, MAX_ITEMS), ' ...more'];
      } else {
        return param;
      }
    });
    console.log(log_prefix, ...trunc_params);
  }
}