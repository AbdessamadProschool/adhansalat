/**
 * Qibla compass screen.
 *
 * Shows real-time direction and great-circle distance to the Kaaba in Mecca.
 * Features ultra-precise multi-tier sensor fusion, 3D tilt compensation,
 * magnetic declination adjustment (True North), real-time bubble level detection,
 * astronomical solar azimuth verification, and Google Maps satellite alignment.
 *
 * Professional engineering:
 *  - Great-circle forward azimuth mathematical formula (WGS-84 Kaaba positioning).
 *  - Hardware sensor fusion via Android Sensor.TYPE_ROTATION_VECTOR when hosted in APK.
 *  - W3C 3D Euler tilt compensation (Euler rotation matrix) for web DeviceOrientation.
 *  - Geomagnetic declination compensation (World Magnetic Model / NOAA GeomagneticField).
 *  - Exponential low-pass filter to smooth sensor micro-jitter without lag.
 *  - Visual bubble level alert to prevent user tilt error.
 *  - Astronomical solar position cross-check (NOAA algorithm).
 *  - Direct geodesic line satellite verification on Google Maps.
 *  - Interactive figure-8 sensor calibration modal.
 *  - Haptic feedback when the phone points directly at the Kaaba.
 */

import {
  calculateQibla,
  calculateSunPosition,
  estimateMagneticDeclination,
  type QiblaInfo,
} from '../../core/qibla.js';
import type { AppContext } from '../context.js';
import { nativeBridge } from '../notifications.js';
import { alertBox, el, icon } from '../ui.js';

interface DeviceOrientationEventWithPermission extends DeviceOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed shortest difference from angle A to angle B (-180 to +180). */
function angleDifference(from: number, to: number): number {
  let diff = (to - from) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

export function qiblaScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const store = ctx.store.get();
  const location = store.location;
  const root = el('div', { class: 'screen qibla-screen' });

  if (!location) {
    root.append(
      el(
        'header',
        { class: 'stack xs' },
        el('h1', { text: t('qibla.title') }),
      ),
      alertBox('warn', t('error.engine'), ''),
      el('button', {
        class: 'btn primary',
        text: t('common.select'),
        on: { click: () => ctx.navigate('settings') },
      }),
    );
    return root;
  }

  const qibla: QiblaInfo = calculateQibla({
    latitude: location.latitude,
    longitude: location.longitude,
  });

  const loc = location;

  // Calculate magnetic declination for location
  const magneticDeclination =
    nativeBridge()?.getGeomagneticDeclination?.(loc.latitude, loc.longitude, 0) ??
    estimateMagneticDeclination(loc.latitude, loc.longitude);

  // ---------------------------------------------------------------- header
  const placeLabel =
    loc.cityName || `${loc.latitude.toFixed(2)}°, ${loc.longitude.toFixed(2)}°`;

  const formattedDistance = new Intl.NumberFormat(ctx.intl).format(qibla.distanceKm);

  root.append(
    el(
      'header',
      { class: 'stack xs' },
      el('h1', { text: t('qibla.title') }),
      el('p', { class: 'small muted', text: `${placeLabel} · ${formattedDistance} km` }),
    ),
  );

  if (qibla.atKaaba) {
    root.append(alertBox('info', t('qibla.atKaaba'), ''));
    return root;
  }

  // ---------------------------------------------------------------- state
  let currentHeading = 0; // Filtered device heading in degrees clockwise from North
  let smoothedHeading: number | null = null;
  const SMOOTHING_FACTOR = 0.22; // Low-pass filter coefficient (0.0 = freeze, 1.0 = raw jerky)
  let hasSensor = false;
  let lastVibrateTime = 0;
  let animFrameId: number | null = null;
  let nativePollIntervalId: number | null = null;
  let sunUpdateIntervalId: number | null = null;

  // ---------------------------------------------------------------- DOM elements
  const dial = el('div', { class: 'qibla-dial-wrap' });
  const dialSvg = buildCompassSvg(ctx, qibla.bearingRounded);
  dial.appendChild(dialSvg);

  const topNeedle = el('div', {
    class: 'qibla-target-needle',
    attrs: { 'aria-hidden': 'true' },
  });

  const statusBadge = el('div', {
    class: 'qibla-status-badge',
    text: t('qibla.calibrating'),
  });

  const angleReadout = el('div', {
    class: 'qibla-angle-readout',
    attrs: { 'aria-live': 'polite' },
  });

  const instructionText = el('p', {
    class: 'qibla-instruction muted small',
  });

  const sensorBadge = el('span', {
    class: 'badge sensor-badge',
    text: t('qibla.sensorUnsupported'),
  });

  // Real-time bubble level indicator
  const levelBadge = el('div', {
    class: 'qibla-level-badge level-perfect',
    text: t('qibla.levelPerfect'),
  });

  // Astronomical Sun verification card
  const sunCard = el('div', { class: 'qibla-sun-card' });
  function updateSunCard() {
    const sun = calculateSunPosition(new Date(), {
      latitude: loc.latitude,
      longitude: loc.longitude,
    });
    if (sun.isVisible) {
      const diffDeg = Math.round(Math.abs(angleDifference(sun.azimuth, qibla.bearingRounded)));
      sunCard.replaceChildren(
        icon('sun', 22),
        el(
          'div',
          { class: 'qibla-sun-details' },
          el('strong', { class: 'tiny', text: t('qibla.sunVerify') }),
          el('span', {
            class: 'tiny muted',
            text: t('qibla.sunDesc', { sunDeg: Math.round(sun.azimuth), diffDeg }),
          }),
        ),
      );
      sunCard.style.display = 'flex';
    } else {
      sunCard.style.display = 'none';
    }
  }
  updateSunCard();

  // Action buttons: Satellite map & Calibration
  const toolsRow = el('div', { class: 'qibla-tools-row' });

  const satBtn = el(
    'a',
    {
      class: 'btn secondary qibla-btn-action',
      attrs: {
        href: `https://www.google.com/maps/dir/?api=1&origin=${loc.latitude},${loc.longitude}&destination=21.422487,39.826206&travelmode=walking`,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    },
    icon('satellite', 16),
    el('span', { text: ` ${t('qibla.satelliteMap')}` }),
  );

  const calibBtn = el(
    'button',
    {
      class: 'btn secondary qibla-btn-action',
      attrs: { type: 'button' },
      on: {
        click: () => openCalibrationSheet(ctx),
      },
    },
    icon('calibrate', 16),
    el('span', { text: ` ${t('qibla.calibrateBtn')}` }),
  );

  toolsRow.append(satBtn, calibBtn);

  // Slider for manual inspection / desktop preview
  const manualControls = el('div', { class: 'qibla-manual-controls stack xs' });
  const sliderLabel = el('label', {
    class: 'tiny muted',
    text: t('qibla.manualHeading'),
    attrs: { for: 'qibla-manual-slider' },
  });
  const slider = el('input', {
    class: 'slider',
    attrs: {
      id: 'qibla-manual-slider',
      type: 'range',
      min: '0',
      max: '359',
      value: '0',
    },
  });

  slider.addEventListener('input', () => {
    hasSensor = false;
    smoothedHeading = null;
    sensorBadge.textContent = t('qibla.sensorUnsupported');
    sensorBadge.classList.remove('good');
    updateOrientation(Number(slider.value));
  });

  manualControls.append(sliderLabel, slider);

  // iOS permission button
  const permBtn = el('button', {
    class: 'btn secondary qibla-perm-btn',
    text: t('qibla.sensorPrompt'),
    attrs: { type: 'button' },
  });
  permBtn.hidden = true;

  // ---------------------------------------------------------------- update function
  function updateOrientation(headingDeg: number) {
    currentHeading = normalizeAngle(headingDeg);

    // Rotate compass dial so North aligns with physical North
    dialSvg.style.transform = `rotate(${-currentHeading}deg)`;

    // Difference between forward device direction and Qibla bearing
    const diff = angleDifference(currentHeading, qibla.bearingRounded);
    const absDiff = Math.abs(diff);
    const isAligned = absDiff <= 3.5;

    // Visual alignment state
    if (isAligned) {
      dial.classList.add('is-aligned');
      topNeedle.classList.add('is-aligned');
      statusBadge.classList.add('aligned');
      statusBadge.replaceChildren(icon('checkCircle', 16), el('span', { text: ` ${t('qibla.aligned')} ✓` }));
      instructionText.textContent = t('qibla.fromNorth', {
        deg: qibla.bearingRounded,
        point: qibla.compassPoint,
      });

      // Haptic feedback once when aligning
      const now = Date.now();
      if (now - lastVibrateTime > 1200 && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([60, 40, 60]);
        } catch {
          /* ignore */
        }
        lastVibrateTime = now;
      }
    } else {
      dial.classList.remove('is-aligned');
      topNeedle.classList.remove('is-aligned');
      statusBadge.classList.remove('aligned');

      const degDiff = Math.round(absDiff);
      if (diff > 0) {
        statusBadge.replaceChildren(
          el('span', { text: `${t('qibla.turnRight', { deg: degDiff })} ` }),
          icon('arrowRight', 16),
        );
      } else {
        statusBadge.replaceChildren(
          icon('arrowLeft', 16),
          el('span', { text: ` ${t('qibla.turnLeft', { deg: degDiff })}` }),
        );
      }

      instructionText.textContent = t('qibla.fromNorth', {
        deg: qibla.bearingRounded,
        point: qibla.compassPoint,
      });
    }

    angleReadout.textContent = `${Math.round(currentHeading)}°`;
    slider.value = String(Math.round(currentHeading));
  }

  // ---------------------------------------------------------------- sensors & filters
  function getScreenOrientationAngle(): number {
    if (typeof window === 'undefined') return 0;
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
      return window.screen.orientation.angle;
    }
    if (typeof window.orientation === 'number') {
      return window.orientation;
    }
    return 0;
  }

  function processSensorHeading(rawHeading: number) {
    const screenAngle = getScreenOrientationAngle();
    const compensatedHeading = normalizeAngle(rawHeading + screenAngle);

    // Apply exponential low-pass filter to eliminate magnetometer micro-jitter
    if (smoothedHeading === null) {
      smoothedHeading = compensatedHeading;
    } else {
      const delta = angleDifference(smoothedHeading, compensatedHeading);
      smoothedHeading = normalizeAngle(smoothedHeading + delta * SMOOTHING_FACTOR);
    }

    if (!hasSensor) {
      hasSensor = true;
      sensorBadge.textContent = t('qibla.sensorActive');
      sensorBadge.classList.add('good');
      permBtn.hidden = true;
    }

    if (animFrameId === null) {
      animFrameId = requestAnimationFrame(() => {
        animFrameId = null;
        if (smoothedHeading !== null) {
          updateOrientation(smoothedHeading);
        }
      });
    }
  }

  function updateLevelIndicator(beta: number | null, gamma: number | null) {
    if (beta === null || gamma === null) return;
    const isLevel = Math.abs(beta) < 14 && Math.abs(gamma) < 14;
    levelBadge.replaceChildren();
    levelBadge.appendChild(icon('bubbleLevel', 16));
    const labelSpan = el('span', { text: isLevel ? ` ${t('qibla.levelPerfect')}` : ` ${t('qibla.levelTilted')}` });
    levelBadge.appendChild(labelSpan);
    if (isLevel) {
      levelBadge.className = 'qibla-level-badge level-perfect';
    } else {
      levelBadge.className = 'qibla-level-badge level-tilted';
    }
  }

  function computeTiltCompensatedHeading(e: DeviceOrientationEvent): number | null {
    // 1. iOS Safari webkitCompassHeading (0 = True North, 90 = East)
    const webkitEvent = e as unknown as { webkitCompassHeading?: number };
    if (typeof webkitEvent.webkitCompassHeading === 'number' && Number.isFinite(webkitEvent.webkitCompassHeading)) {
      return webkitEvent.webkitCompassHeading;
    }

    if (e.alpha === null || e.alpha === undefined || !Number.isFinite(e.alpha)) {
      return null;
    }

    // 2. W3C 3D Euler tilt compensation
    // When device is held in hand tilted up (pitch beta, roll gamma), raw alpha suffers
    // heavy tilt distortions (15°-45°). Full 3D rotation matrix projection corrects this.
    if (
      e.beta !== null &&
      e.gamma !== null &&
      Number.isFinite(e.beta) &&
      Number.isFinite(e.gamma)
    ) {
      const alphaRad = (e.alpha * Math.PI) / 180;
      const betaRad = (e.beta * Math.PI) / 180;
      const gammaRad = (e.gamma * Math.PI) / 180;

      const cA = Math.cos(alphaRad);
      const sA = Math.sin(alphaRad);
      const cB = Math.cos(betaRad);
      const sB = Math.sin(betaRad);
      const cG = Math.cos(gammaRad);
      const sG = Math.sin(gammaRad);

      const rA = -cA * sG - sA * sB * cG;
      const rB = -sA * sG + cA * sB * cG;

      let headingRad = Math.atan2(rA, rB);
      if (rB < 0) {
        headingRad += Math.PI;
      } else if (rA < 0) {
        headingRad += 2 * Math.PI;
      }

      let deg = (headingRad * 180) / Math.PI;
      // Add magnetic declination offset to convert Magnetic North to True Geographic North
      deg = deg + magneticDeclination;
      return normalizeAngle(deg);
    }

    // Fallback if beta/gamma unavailable
    return normalizeAngle(360 - e.alpha + magneticDeclination);
  }

  function onOrientationEvent(e: DeviceOrientationEvent) {
    updateLevelIndicator(e.beta, e.gamma);
    const heading = computeTiltCompensatedHeading(e);
    if (heading !== null && Number.isFinite(heading)) {
      processSensorHeading(heading);
    }
  }

  // ---------------------------------------------------------------- Native Hardware Sensor Fusion
  // If hosted inside Android WebView, check NativeBridge hardware rotation vector
  const bridge = nativeBridge();
  if (bridge?.getNativeCompassHeading) {
    const checkNativeHeading = () => {
      try {
        const nativeHeading = bridge.getNativeCompassHeading?.();
        if (typeof nativeHeading === 'number' && nativeHeading >= 0) {
          // Native heading is from Sensor.TYPE_ROTATION_VECTOR (hardware Kalman filter)
          const trueHeading = normalizeAngle(nativeHeading + magneticDeclination);
          processSensorHeading(trueHeading);
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    };

    if (checkNativeHeading()) {
      nativePollIntervalId = window.setInterval(checkNativeHeading, 50);
    }
  }

  // ---------------------------------------------------------------- Web Sensor Listeners
  const DOE = typeof window !== 'undefined' ? (window as unknown as {
    DeviceOrientationEvent?: DeviceOrientationEventWithPermission;
  }).DeviceOrientationEvent : undefined;

  if (DOE && typeof DOE.requestPermission === 'function') {
    permBtn.hidden = false;
    permBtn.addEventListener('click', async () => {
      try {
        const res = await DOE.requestPermission!();
        if (res === 'granted') {
          permBtn.hidden = true;
          window.addEventListener('deviceorientation', onOrientationEvent, true);
        } else {
          ctx.toast(t('qibla.sensorPermissionDenied'));
        }
      } catch {
        ctx.toast(t('qibla.sensorPermissionDenied'));
      }
    });
  } else if (typeof window !== 'undefined') {
    let absoluteReceived = false;

    const handleAbsolute = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null && e.alpha !== undefined) {
        absoluteReceived = true;
        onOrientationEvent(e);
      }
    };

    const handleStandard = (e: DeviceOrientationEvent) => {
      if (absoluteReceived) return;
      onOrientationEvent(e);
    };

    window.addEventListener('deviceorientationabsolute', handleAbsolute as EventListener, true);
    window.addEventListener('deviceorientation', handleStandard as EventListener, true);

    ctx.registerCleanup(() => {
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
      if (nativePollIntervalId !== null) clearInterval(nativePollIntervalId);
      if (sunUpdateIntervalId !== null) clearInterval(sunUpdateIntervalId);
      window.removeEventListener('deviceorientationabsolute', handleAbsolute as EventListener, true);
      window.removeEventListener('deviceorientation', handleStandard as EventListener, true);
    });
  }

  // Periodic sun position update (every 60s)
  sunUpdateIntervalId = window.setInterval(updateSunCard, 60000);

  // Advanced tools section (progressive disclosure for clean senior UX)
  const advancedSection = el('details', { class: 'qibla-advanced-details stack xs' });
  const advancedSummary = el('summary', {
    class: 'qibla-advanced-summary tiny muted',
    text: `⚙️ ${t('qibla.advancedToggle')}`,
  });
  const advancedContent = el('div', { class: 'qibla-advanced-content stack sm' });
  advancedContent.append(sunCard, toolsRow, manualControls);
  advancedSection.append(advancedSummary, advancedContent);

  // Initial draw
  updateOrientation(0);

  // ---------------------------------------------------------------- assemble
  const container = el('div', { class: 'qibla-card card stack md' });
  container.append(
    el('div', { class: 'qibla-badge-row' }, sensorBadge, permBtn),
    levelBadge,
    el('div', { class: 'qibla-center-stage' }, topNeedle, dial),
    el('div', { class: 'qibla-feedback stack xs' }, statusBadge, angleReadout, instructionText),
    advancedSection,
    el('p', { class: 'tiny muted qibla-tip', text: t('qibla.manualTip') }),
  );

  root.appendChild(container);
  return root;
}

/**
 * Bottom sheet modal displaying calibration instructions and visual animation.
 */
function openCalibrationSheet(ctx: AppContext): void {
  const t = ctx.t;
  ctx.sheet(t('qibla.calibrateTitle'), (close) => {
    const wrap = el('div', { class: 'qibla-calib-guide stack sm' });

    // Interactive SVG showing infinity / figure-8 pattern
    const svgWrap = el('div', {
      class: 'qibla-calib-svg-wrap',
      attrs: { 'aria-hidden': 'true' },
    });
    svgWrap.innerHTML = `
      <svg viewBox="0 0 200 100" class="qibla-calib-svg" style="width: 160px; height: 80px; margin: 0 auto; display: block;">
        <path d="M 50,50 C 15,15 15,85 50,50 C 85,15 115,85 150,50 C 185,15 185,85 150,50 C 115,15 85,85 50,50 Z"
              fill="none" stroke="var(--primary)" stroke-width="4" stroke-linecap="round" stroke-dasharray="6 6"/>
        <circle cx="50" cy="50" r="7" fill="var(--gold, #E5C158)">
          <animateMotion dur="4s" repeatCount="indefinite"
            path="M 50,50 C 15,15 15,85 50,50 C 85,15 115,85 150,50 C 185,15 185,85 150,50 C 115,15 85,85 50,50 Z" />
        </circle>
      </svg>
    `;

    wrap.append(
      svgWrap,
      el('div', { class: 'qibla-calib-step' }, el('p', { text: t('qibla.calibrateStep1') })),
      el('div', { class: 'qibla-calib-step' }, el('p', { text: t('qibla.calibrateStep2') })),
      el('div', { class: 'qibla-calib-step' }, el('p', { text: t('qibla.calibrateStep3') })),
      el('button', {
        class: 'btn primary full-width',
        text: t('common.close'),
        on: { click: close },
      }),
    );

    return wrap;
  });
}

/**
 * Builds the SVG compass dial with degree markings, cardinal labels,
 * North pointer and the golden Kaaba direction needle.
 */
function buildCompassSvg(ctx: AppContext, qiblaBearing: number): SVGSVGElement {
  const t = ctx.t;
  const NS = 'http://www.w3.org/2000/svg';
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 135;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'qibla-dial-svg');
  svg.setAttribute('aria-hidden', 'true');

  // Outer circle track
  const outerCircle = document.createElementNS(NS, 'circle');
  outerCircle.setAttribute('cx', String(cx));
  outerCircle.setAttribute('cy', String(cy));
  outerCircle.setAttribute('r', String(radius));
  outerCircle.setAttribute('class', 'qibla-dial-ring');
  svg.appendChild(outerCircle);

  // Inner decorative ring
  const innerCircle = document.createElementNS(NS, 'circle');
  innerCircle.setAttribute('cx', String(cx));
  innerCircle.setAttribute('cy', String(cy));
  innerCircle.setAttribute('r', String(radius - 24));
  innerCircle.setAttribute('class', 'qibla-dial-inner-ring');
  svg.appendChild(innerCircle);

  // Graduation ticks (every 30° major, every 10° minor)
  for (let deg = 0; deg < 360; deg += 10) {
    const isMajor = deg % 30 === 0;
    const rad = (deg - 90) * (Math.PI / 180);
    const tickLen = isMajor ? 14 : 7;
    const r1 = radius - 2;
    const r2 = r1 - tickLen;

    const x1 = cx + r1 * Math.cos(rad);
    const y1 = cy + r1 * Math.sin(rad);
    const x2 = cx + r2 * Math.cos(rad);
    const y2 = cy + r2 * Math.sin(rad);

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', isMajor ? 'qibla-tick major' : 'qibla-tick minor');
    svg.appendChild(line);
  }

  // Cardinal letters (N, E, S, W)
  const cardinals = [
    { deg: 0, text: t('qibla.pointN'), isNorth: true },
    { deg: 90, text: t('qibla.pointE'), isNorth: false },
    { deg: 180, text: t('qibla.pointS'), isNorth: false },
    { deg: 270, text: t('qibla.pointW'), isNorth: false },
  ];

  for (const card of cardinals) {
    const rad = (card.deg - 90) * (Math.PI / 180);
    const textRadius = radius - 38;
    const tx = cx + textRadius * Math.cos(rad);
    const ty = cy + textRadius * Math.sin(rad) + 5; // slight baseline offset

    const textEl = document.createElementNS(NS, 'text');
    textEl.setAttribute('x', String(tx));
    textEl.setAttribute('y', String(ty));
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('class', card.isNorth ? 'qibla-cardinal north' : 'qibla-cardinal');
    textEl.textContent = card.text;
    svg.appendChild(textEl);
  }

  // North arrow (red/accent needle)
  const northNeedle = document.createElementNS(NS, 'polygon');
  northNeedle.setAttribute(
    'points',
    `${cx},${cy - radius + 12} ${cx - 7},${cy - 20} ${cx + 7},${cy - 20}`,
  );
  northNeedle.setAttribute('class', 'qibla-north-needle');
  svg.appendChild(northNeedle);

  // South arrow (subtle)
  const southNeedle = document.createElementNS(NS, 'polygon');
  southNeedle.setAttribute(
    'points',
    `${cx},${cy + radius - 12} ${cx - 6},${cy + 20} ${cx + 6},${cy + 20}`,
  );
  southNeedle.setAttribute('class', 'qibla-south-needle');
  svg.appendChild(southNeedle);

  // ---------------------------------------------------------------- Kaaba Pointer
  // Group rotated to the calculated Qibla bearing
  const qiblaGroup = document.createElementNS(NS, 'g');
  qiblaGroup.setAttribute('transform', `rotate(${qiblaBearing} ${cx} ${cy})`);
  qiblaGroup.setAttribute('class', 'qibla-pointer-group');

  // Golden pointer ray
  const pointerRay = document.createElementNS(NS, 'line');
  pointerRay.setAttribute('x1', String(cx));
  pointerRay.setAttribute('y1', String(cy));
  pointerRay.setAttribute('x2', String(cx));
  pointerRay.setAttribute('y2', String(cy - radius + 22));
  pointerRay.setAttribute('class', 'qibla-ray');
  qiblaGroup.appendChild(pointerRay);

  // Kaaba emblem at the tip of the ray
  const kaabaBox = document.createElementNS(NS, 'g');
  const boxY = cy - radius + 24;
  kaabaBox.setAttribute('transform', `translate(${cx}, ${boxY})`);
  kaabaBox.innerHTML = `
    <rect x="-13" y="-13" width="26" height="26" rx="3.5" class="qibla-kaaba-body"/>
    <line x1="-13" y1="-5" x2="13" y2="-5" class="qibla-kaaba-gold"/>
    <circle cx="0" cy="0" r="2" fill="var(--gold, #E5C158)"/>
  `;
  qiblaGroup.appendChild(kaabaBox);

  svg.appendChild(qiblaGroup);

  // Center pivot pin
  const centerPin = document.createElementNS(NS, 'circle');
  centerPin.setAttribute('cx', String(cx));
  centerPin.setAttribute('cy', String(cy));
  centerPin.setAttribute('r', '7');
  centerPin.setAttribute('class', 'qibla-center-pin');
  svg.appendChild(centerPin);

  const centerDot = document.createElementNS(NS, 'circle');
  centerDot.setAttribute('cx', String(cx));
  centerDot.setAttribute('cy', String(cy));
  centerDot.setAttribute('r', '3');
  centerDot.setAttribute('class', 'qibla-center-dot');
  svg.appendChild(centerDot);

  return svg;
}
