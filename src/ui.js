/** @returns {boolean} */
function isMobileViewport() {
  return window.matchMedia('(max-width: 767px)').matches;
}

/** @param {string} term @param {string} valueHtml */
function dlRow(term, valueHtml) {
  return `<dt class="col-5 col-sm-5 fw-semibold text-body-secondary">${escapeHtml(term)}</dt><dd class="col-7 col-sm-7 mb-0">${valueHtml}</dd>`;
}

/**
 * @param {HTMLElement} el
 * @param {{ locationCoords: string, nearest: Array<{ feature: import('geojson').Feature, km: number }>, direction: string | null, offThruway: boolean, impreciseGps?: boolean, roadName?: string, milepostLabel: (f: import('geojson').Feature) => string, milepostRoadSegment?: (f: import('geojson').Feature) => string }} data
 */
export function renderResults(el, data) {
  const {
    locationCoords,
    nearest,
    direction,
    offThruway,
    impreciseGps = false,
    roadName,
    milepostLabel,
    milepostRoadSegment = () => '',
  } = data;
  const mobile = isMobileViewport();
  const roadSegment =
    (nearest[0] ? milepostRoadSegment(nearest[0].feature) : '') || roadName || '';

  const locationRow = dlRow(
    'Coordinates',
    `<span id="location-coords" class="tabular-nums">${escapeHtml(locationCoords)}</span>`,
  );

  let items = '';

  if (mobile) {
    const first = nearest[0];
    if (first) {
      items = dlRow('Nearest milepost', escapeHtml(milepostLabel(first.feature)));
    }
  } else {
    items = nearest
      .map(({ feature, km }, i) =>
        dlRow(
          i === 0 ? 'Nearest milepost' : '2nd nearest',
          `${escapeHtml(milepostLabel(feature))} (${(km * 0.621371).toFixed(2)} mi)`,
        ),
      )
      .join('');
  }

  const roadSegmentRow = dlRow(
    'Road segment',
    roadSegment ? escapeHtml(roadSegment) : '—',
  );

  const directionLabel = mobile ? 'Heading' : 'Road direction';
  const directionRow = dlRow(
    directionLabel,
    direction ? escapeHtml(direction) : '—',
  );

  const notes = [];
  if (impreciseGps) {
    notes.push(
      '<div class="alert alert-warning mb-2 py-2" role="note">GPS is imprecise. Milepost and direction are approximate until accuracy improves.</div>',
    );
  }
  if (offThruway) {
    notes.push(
      '<div class="alert alert-warning mb-0 py-2" role="note">You might not be on the Thruway. Nearest milepost and direction may be less accurate.</div>',
    );
  }

  el.innerHTML = `<dl class="row g-2 mb-4">${locationRow}${items}${directionRow}${roadSegmentRow}</dl>${notes.join('')}`;
}

/** @typedef {'success' | 'warning' | 'error'} MapSnackbarVariant */

const SNACKBAR_ALERT_CLASS = {
  success: 'alert-success',
  warning: 'alert-warning',
  error: 'alert-danger',
};

const SNACKBAR_TITLES = {
  success: 'GPS ready',
  warning: 'Low GPS accuracy',
  error: 'Location problem',
};

const SNACKBAR_BASE_CLASS = 'map-snackbar alert shadow mb-0';

/** @type {ReturnType<typeof setTimeout> | null} */
let mapSnackbarTimer = null;

/** @param {GeolocationCoordinates} coords */
export function describeAccuracy(coords) {
  const accM = coords.accuracy != null ? Math.round(coords.accuracy) : null;
  if (accM == null) {
    return 'Accuracy is unknown.';
  }
  if (accM >= 1000) {
    const km = accM / 1000;
    const rounded = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
    const unit = rounded === 1 ? 'kilometer' : 'kilometers';
    return `Estimated error is about ${rounded} ${unit}.`;
  }
  const unit = accM === 1 ? 'meter' : 'meters';
  return `Estimated error is about ${accM} ${unit}.`;
}

/** @param {MapSnackbarVariant} variant @param {string} [detail] */
export function formatSnackbarMessage(variant, detail = '') {
  const title = SNACKBAR_TITLES[variant];
  return detail ? `${title}. ${detail}` : `${title}.`;
}

export function hideMapSnackbar() {
  const bar = document.getElementById('map-snackbar');
  const text = document.getElementById('map-snackbar-text');
  if (!bar) return;
  if (mapSnackbarTimer) {
    clearTimeout(mapSnackbarTimer);
    mapSnackbarTimer = null;
  }
  if (text) text.textContent = '';
  bar.className = `${SNACKBAR_BASE_CLASS} d-none`;
  bar.hidden = true;
}

/**
 * @param {MapSnackbarVariant} variant
 * @param {string} message Full message text (pass formatSnackbarMessage output).
 * @param {number} [autoHideMs=0] 0 = stay until dismissed or replaced.
 */
export function showMapSnackbar(variant, message, autoHideMs = 0) {
  const bar = document.getElementById('map-snackbar');
  const text = document.getElementById('map-snackbar-text');
  if (!bar || !text) return;

  if (mapSnackbarTimer) {
    clearTimeout(mapSnackbarTimer);
    mapSnackbarTimer = null;
  }

  bar.className = `${SNACKBAR_BASE_CLASS} ${SNACKBAR_ALERT_CLASS[variant]}`;
  bar.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  bar.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
  text.textContent = message;
  bar.classList.remove('d-none');
  bar.hidden = false;

  if (autoHideMs > 0) {
    mapSnackbarTimer = setTimeout(() => hideMapSnackbar(), autoHideMs);
  }
}

/** @param {GeolocationCoordinates} coords */
function formatAccuracySuffix(coords) {
  const accM = coords.accuracy != null ? Math.round(coords.accuracy) : null;
  if (accM == null) return '';
  if (accM >= 1000) {
    const km = accM / 1000;
    return km >= 10 ? ` ±${Math.round(km)} km` : ` ±${km.toFixed(1)} km`;
  }
  return ` ±${accM} m`;
}

/** @param {GeolocationCoordinates} coords */
export function formatLocationCoords(coords) {
  return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}${formatAccuracySuffix(coords)}`;
}

/** @param {GeolocationCoordinates} coords */
export function setLocation(coords) {
  const el = document.getElementById('location-coords');
  if (!el) return;
  el.textContent = formatLocationCoords(coords);
}

/** @param {string} message @param {number} [autoHideMs=8000] */
export function showMapError(message, autoHideMs = 8000) {
  showMapSnackbar('error', message, autoHideMs);
}

/** @param {string} s */
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
