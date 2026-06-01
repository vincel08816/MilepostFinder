/** @returns {boolean} */
function isMobileViewport() {
  return window.matchMedia('(max-width: 767px)').matches;
}

/**
 * @param {HTMLElement} el
 * @param {{ nearest: Array<{ feature: import('geojson').Feature, km: number }>, direction: string | null, offThruway: boolean, roadName?: string, milepostLabel: (f: import('geojson').Feature) => string, milepostRoadSegment?: (f: import('geojson').Feature) => string }} data
 */
export function renderResults(el, data) {
  const {
    nearest,
    direction,
    offThruway,
    roadName,
    milepostLabel,
    milepostRoadSegment = () => '',
  } = data;
  const mobile = isMobileViewport();
  const roadSegment =
    (nearest[0] ? milepostRoadSegment(nearest[0].feature) : '') || roadName || '';

  let items = '';

  if (mobile) {
    const first = nearest[0];
    if (first) {
      items = `
    <dt>Nearest milepost</dt>
    <dd>${escapeHtml(milepostLabel(first.feature))}</dd>`;
    }
    // <dt>2nd nearest</dt>
    // <dd>${nearest[1] ? escapeHtml(milepostLabel(nearest[1].feature)) + ` (${(nearest[1].km * 0.621371).toFixed(2)} mi)` : '—'}</dd>
    // Distance to nearest milepost:
    // <dd class="muted">${first ? `${(first.km * 0.621371).toFixed(2)} mi away` : ''}</dd>
  } else {
    items = nearest
      .map(
        ({ feature, km }, i) => `
    <dt>${i === 0 ? 'Nearest milepost' : '2nd nearest'}</dt>
    <dd>${escapeHtml(milepostLabel(feature))} (${(km * 0.621371).toFixed(2)} mi)</dd>`,
      )
      .join('');
  }

  const roadSegmentRow = roadSegment
    ? `<dt>Road segment</dt><dd>${escapeHtml(roadSegment)}</dd>`
    : `<dt>Road segment</dt><dd>—</dd>`;

  let directionRow = '';
  if (mobile) {
    directionRow = direction
      ? `<dt>Heading</dt><dd>${escapeHtml(direction)}</dd>`
      : `<dt>Heading</dt><dd>—</dd>`;
    // <dt>Road direction</dt><dd>${direction ? escapeHtml(direction) : '—'}${roadSegment ? ` <span class="muted">(${escapeHtml(roadSegment)})</span>` : ''}</dd>
  } else {
    directionRow = direction
      ? `<dt>Road direction</dt><dd>${escapeHtml(direction)}</dd>`
      : `<dt>Road direction</dt><dd>—</dd>`;
  }

  const warning = offThruway
    ? `<p class="warning">You might not be on the Thruway. Nearest milepost and direction may be less accurate.</p>`
    : '';

  el.innerHTML = `<dl>${items}${directionRow}${roadSegmentRow}</dl>${warning}`;
}

/** @param {HTMLElement} el @param {string} message */
export function setStatus(el, message) {
  el.textContent = message;
}

/** @param {HTMLElement} el @param {string} message */
export function showError(el, message) {
  el.innerHTML = `<p class="warning">${escapeHtml(message)}</p>`;
}

/** @param {string} s */
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
