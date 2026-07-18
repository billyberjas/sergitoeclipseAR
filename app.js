// Orquestación: permisos, geolocalización, cámara, brújula/inclinómetro,
// bucle de proyección AR, vista radar, perfil de horizonte y panel info.

const DEFAULT_LOCATION = { lat: 40.5057, lon: -3.5354 }; // Paracuellos de Jarama (aprox.), usado si no hay GPS

const FOV_H = 65; // grados, campo de visión horizontal aproximado de cámara trasera de móvil
const FOV_V = 50; // grados, campo de visión vertical aproximado

const state = {
  lat: null, lon: null, usingDefaultLocation: false,
  heading: null, // grados, 0 = Norte, brújula
  beta: null,    // inclinación del dispositivo (deviceorientation)
  sun: null,     // { azimuth, altitude } en el punto actual
};

// ---------- Utilidades ----------
function angleDiff(a, b) {
  // diferencia a-b normalizada a [-180, 180]
  return ((a - b + 540) % 360) - 180;
}
function fmt(n, d = 1) { return Number(n).toFixed(d); }

function updateSunForCurrentLocation() {
  const lat = state.lat ?? DEFAULT_LOCATION.lat;
  const lon = state.lon ?? DEFAULT_LOCATION.lon;
  state.sun = Sun.positionAtTotality(lat, lon);
  refreshInfoPanel();
}

// ---------- Geolocalización ----------
function startGeolocation() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      state.usingDefaultLocation = true;
      updateSunForCurrentLocation();
      resolve(false);
      return;
    }
    let resolved = false;
    navigator.geolocation.watchPosition(
      (pos) => {
        state.lat = pos.coords.latitude;
        state.lon = pos.coords.longitude;
        state.usingDefaultLocation = false;
        updateSunForCurrentLocation();
        if (!resolved) { resolved = true; resolve(true); }
      },
      () => {
        state.usingDefaultLocation = true;
        updateSunForCurrentLocation();
        if (!resolved) { resolved = true; resolve(false); }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }
    );
    // por si watchPosition tarda más de lo esperado en la primera respuesta
    setTimeout(() => {
      if (!resolved) {
        state.usingDefaultLocation = true;
        updateSunForCurrentLocation();
        resolved = true; resolve(false);
      }
    }, 8000);
  });
}

// ---------- Orientación del dispositivo ----------
function handleOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading !== 'undefined' && e.webkitCompassHeading !== null) {
    heading = e.webkitCompassHeading; // iOS: ya es rumbo real 0=N, sentido horario
  } else if (e.alpha !== null) {
    // Android: aproximación estándar. e.absolute indica que alpha está
    // referenciado al norte (no siempre fiable en todos los dispositivos).
    heading = (360 - e.alpha) % 360;
  }
  if (heading !== null) state.heading = heading;
  if (e.beta !== null) state.beta = e.beta;
}

async function startOrientation() {
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      const res = await DOE.requestPermission();
      if (res !== 'granted') return false;
    } catch (err) {
      return false;
    }
  }
  const evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evName, handleOrientation, true);
  return true;
}

// ---------- Cámara ----------
async function startCamera() {
  const video = document.getElementById('ar-video');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    return true;
  } catch (err) {
    return false;
  }
}

// ---------- Bucle AR ----------
let arCtx = null;
function setupArCanvas() {
  const canvas = document.getElementById('ar-canvas');
  const video = document.getElementById('ar-video');
  function resize() {
    canvas.width = video.clientWidth || window.innerWidth;
    canvas.height = video.clientHeight || window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  arCtx = canvas.getContext('2d');
}

function drawArFrame() {
  const canvas = document.getElementById('ar-canvas');
  const hud = document.getElementById('ar-hud');
  const warning = document.getElementById('ar-warning');
  if (!arCtx) { requestAnimationFrame(drawArFrame); return; }
  const w = canvas.width, h = canvas.height;
  arCtx.clearRect(0, 0, w, h);

  if (state.sun && state.heading !== null && state.beta !== null) {
    const cameraElevation = 90 - state.beta;
    const dAz = angleDiff(state.sun.azimuth, state.heading);
    const dAlt = state.sun.altitude - cameraElevation;

    const inH = Math.abs(dAz) <= FOV_H / 2;
    const inV = Math.abs(dAlt) <= FOV_V / 2;

    if (inH && inV) {
      warning.classList.remove('show');
      const x = w / 2 + (dAz / (FOV_H / 2)) * (w / 2);
      const y = h / 2 - (dAlt / (FOV_V / 2)) * (h / 2);
      drawSunMarker(x, y);
    } else {
      warning.textContent = '☀️ El Sol está fuera de encuadre — ' + directionHint(dAz, dAlt);
      warning.classList.add('show');
      drawEdgeArrow(w, h, dAz, dAlt);
    }

    hud.innerHTML = `Sol: <b>${fmt(state.sun.altitude)}°</b> altura · <b>${fmt(state.sun.azimuth)}°</b> azimut
      &nbsp;|&nbsp; Móvil: ${fmt(state.heading)}° rumbo, ${fmt(cameraElevation)}° elevación
      ${state.usingDefaultLocation ? '<br><span style="color:#ffb547">Usando ubicación por defecto (Paracuellos) — activa el GPS para tu posición real</span>' : ''}`;
  } else {
    hud.textContent = 'Esperando datos de brújula/orientación…';
  }

  requestAnimationFrame(drawArFrame);
}

function drawSunMarker(x, y) {
  arCtx.save();
  arCtx.shadowColor = '#ffb547';
  arCtx.shadowBlur = 25;
  arCtx.fillStyle = '#ffcf70';
  arCtx.beginPath();
  arCtx.arc(x, y, 22, 0, Math.PI * 2);
  arCtx.fill();
  arCtx.restore();
  arCtx.strokeStyle = 'rgba(255,213,120,.6)';
  arCtx.lineWidth = 2;
  arCtx.beginPath();
  arCtx.arc(x, y, 34, 0, Math.PI * 2);
  arCtx.stroke();
}

function directionHint(dAz, dAlt) {
  const parts = [];
  if (Math.abs(dAz) > FOV_H / 2) parts.push(dAz > 0 ? 'gira a la derecha' : 'gira a la izquierda');
  if (Math.abs(dAlt) > FOV_V / 2) parts.push(dAlt > 0 ? 'sube el móvil' : 'baja el móvil');
  return parts.join(' y ');
}

function drawEdgeArrow(w, h, dAz, dAlt) {
  const cx = w / 2, cy = h / 2;
  const angle = Math.atan2(-dAlt, dAz);
  const r = Math.min(w, h) / 2 - 40;
  const x = cx + Math.cos(angle) * r;
  const y = cy + Math.sin(angle) * r;
  arCtx.save();
  arCtx.translate(x, y);
  arCtx.rotate(angle);
  arCtx.fillStyle = '#ffb547';
  arCtx.beginPath();
  arCtx.moveTo(18, 0);
  arCtx.lineTo(-10, -12);
  arCtx.lineTo(-10, 12);
  arCtx.closePath();
  arCtx.fill();
  arCtx.restore();
}

// ---------- Vista Radar (fallback sin cámara) ----------
function drawRadar() {
  const svg = document.getElementById('radar');
  const readout = document.getElementById('radar-readout');
  if (!svg.dataset.built) buildRadarBase(svg);

  const needle = svg.querySelector('#radar-needle');
  const sunDot = svg.querySelector('#radar-sun');
  const heading = state.heading ?? 0;

  if (needle) needle.setAttribute('transform', `rotate(${-heading} 100 100)`);
  if (sunDot && state.sun) {
    const rel = (state.sun.azimuth - heading + 360) % 360;
    const rad = (rel - 90) * Math.PI / 180;
    const x = 100 + Math.cos(rad) * 78;
    const y = 100 + Math.sin(rad) * 78;
    sunDot.setAttribute('cx', x);
    sunDot.setAttribute('cy', y);
  }

  if (state.sun) {
    readout.innerHTML = `Altura del Sol en totalidad: <b>${fmt(state.sun.altitude)}°</b><br>
      Azimut: <b>${fmt(state.sun.azimuth)}°</b> (0=N, 90=E, 180=S, 270=O)<br>
      Rumbo actual del móvil: <b>${state.heading !== null ? fmt(state.heading) + '°' : '—'}</b>`;
  }
  requestAnimationFrame(drawRadar);
}

function buildRadarBase(svg) {
  svg.dataset.built = '1';
  svg.innerHTML = `
    <circle cx="100" cy="100" r="90" fill="#131a2b" stroke="#2a3552" stroke-width="2"/>
    <circle cx="100" cy="100" r="78" fill="none" stroke="#2a3552" stroke-width="1"/>
    <text x="100" y="18" fill="#8a93a8" font-size="12" text-anchor="middle">N</text>
    <text x="182" y="104" fill="#8a93a8" font-size="12" text-anchor="middle">E</text>
    <text x="100" y="188" fill="#8a93a8" font-size="12" text-anchor="middle">S</text>
    <text x="18" y="104" fill="#8a93a8" font-size="12" text-anchor="middle">O</text>
    <g id="radar-needle"><line x1="100" y1="100" x2="100" y2="30" stroke="#dfe6f5" stroke-width="3"/></g>
    <circle id="radar-sun" cx="100" cy="22" r="9" fill="#ffb547"/>
  `;
}

// ---------- Panel Horizonte ----------
async function analyzeHorizon() {
  const result = document.getElementById('horizon-result');
  const canvas = document.getElementById('horizon-canvas');
  if (!state.sun) { result.textContent = 'Aún no hay posición del Sol calculada.'; return; }
  const lat = state.lat ?? DEFAULT_LOCATION.lat;
  const lon = state.lon ?? DEFAULT_LOCATION.lon;

  result.className = ''; result.textContent = 'Consultando elevación del terreno…';
  try {
    const profile = await Horizon.fetchProfile(lat, lon, state.sun.azimuth);
    drawHorizonChart(canvas, profile, state.sun.altitude);
    const maxA = Horizon.maxAngle(profile);
    if (maxA > state.sun.altitude) {
      result.className = 'blocked';
      result.innerHTML = `⚠️ El terreno alcanza hasta <b>${fmt(maxA)}°</b> en esa dirección, por encima de los <b>${fmt(state.sun.altitude)}°</b> del Sol. Es posible que algo tape la vista — comprueba con la cámara (pestaña AR) antes de descartar el sitio.`;
    } else {
      result.className = 'ok';
      result.innerHTML = `✅ El terreno más alto en esa dirección llega a <b>${fmt(maxA)}°</b>, por debajo de los <b>${fmt(state.sun.altitude)}°</b> del Sol. El horizonte parece despejado (esto no tiene en cuenta edificios ni árboles, solo el terreno).`;
    }
  } catch (err) {
    result.className = ''; result.textContent = 'Error consultando datos de elevación: ' + err.message;
  }
}

function drawHorizonChart(canvas, profile, sunAlt) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * devicePixelRatio;
  const h = canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.clearRect(0, 0, w, h);

  const angles = profile.map(p => p.angle).concat([sunAlt]);
  const minA = Math.min(-2, ...angles), maxA = Math.max(...angles) + 1;
  const toY = (a) => h - ((a - minA) / (maxA - minA)) * h;
  const toX = (i) => (i / (profile.length - 1)) * w;

  // línea de altura del sol
  ctx.strokeStyle = '#ffb547'; ctx.setLineDash([6 * devicePixelRatio, 6 * devicePixelRatio]);
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.beginPath(); ctx.moveTo(0, toY(sunAlt)); ctx.lineTo(w, toY(sunAlt)); ctx.stroke();
  ctx.setLineDash([]);

  // perfil de terreno
  ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2 * devicePixelRatio;
  ctx.beginPath();
  profile.forEach((p, i) => { const x = toX(i), y = toY(p.angle); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = 'rgba(74,222,128,.12)'; ctx.fill();
}

// ---------- Panel Info ----------
function refreshInfoPanel() {
  const el = document.getElementById('info-eclipse');
  if (!el || !state.sun) return;
  el.innerHTML = `Totalidad máxima: <b>12 ago 2026, 20:30 CEST</b> (aprox., varía unos minutos según el punto exacto).<br>
    En tu posición actual, el Sol estará a <b>${fmt(state.sun.altitude)}°</b> de altura, azimut <b>${fmt(state.sun.azimuth)}°</b>.
    ${state.usingDefaultLocation ? '<br><span class="pill">ubicación por defecto: Paracuellos de Jarama</span>' : '<span class="pill">usando tu GPS</span>'}`;
}

// ---------- Tabs ----------
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
    });
  });
  document.getElementById('horizon-btn').addEventListener('click', analyzeHorizon);
}

// ---------- Arranque ----------
async function start() {
  const status = document.getElementById('start-status');
  setupTabs();

  // iOS exige que DeviceOrientationEvent.requestPermission() se llame lo
  // más cerca posible del tap del usuario (sin otro permiso nativo de por
  // medio) o el "user gesture" caduca y la petición falla en silencio.
  // Por eso la orientación se pide ANTES que geolocalización/cámara.
  status.textContent = 'Pidiendo permiso de orientación…';
  const orientationOk = await startOrientation();

  status.textContent = 'Pidiendo permiso de cámara…';
  const cameraOk = await startCamera();

  status.textContent = 'Obteniendo ubicación…';
  await startGeolocation();

  document.getElementById('start-screen').classList.add('hidden');

  if (!orientationOk) {
    document.getElementById('ar-warning').textContent =
      'No se pudo activar la brújula del móvil. En iOS: Ajustes > Safari > ' +
      'Movimiento y orientación debe estar activado, y recarga la página ' +
      'volviendo a pulsar "Empezar" sin haber tocado antes otro permiso.';
    document.getElementById('ar-warning').classList.add('show');
  }

  if (cameraOk) {
    setupArCanvas();
    requestAnimationFrame(drawArFrame);
  } else {
    // sin cámara: usar la pestaña radar por defecto
    document.querySelector('.tab[data-view="radar"]').click();
  }
  drawRadar();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-btn').disabled = true;
  start();
});
