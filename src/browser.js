/** @type {boolean | null} */
let cached = null;

/** @param {string} [ua] */
export function isMobile(ua = navigator.userAgent) {
  if (cached != null) return cached;
  cached =
    /android|iphone|ipad|ipod|mobile/i.test(ua) ||
    (/\bmacintosh\b/i.test(ua) && navigator.maxTouchPoints > 1);
  return cached;
}

/** Sets `data-mobile` on the document element when on a mobile device. */
export function applyMobileDocumentFlag() {
  if (isMobile()) document.documentElement.dataset.mobile = '';
}
