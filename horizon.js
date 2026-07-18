// Perfil de horizonte real hacia el Sol, usando datos de elevación del
// terreno (Open-Meteo Elevation API, gratis, sin API key, CORS abierto).
// Necesita conexión a internet — pensado para explorar sitios candidatos
// con antelación, no necesariamente el día del eclipse.

const EARTH_RADIUS_M = 6371000;
const EYE_HEIGHT_M = 1.6; // altura aproximada de los ojos de una persona de pie

// Punto de destino a partir de lat/lon inicial, rumbo (grados) y distancia (m).
// Fórmula geodésica estándar (esfera).
function destinationPoint(lat, lon, bearingDeg, distanceM) {
  const R = EARTH_RADIUS_M;
  const brng = bearingDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;
  const dR = distanceM / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(brng)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(dR) * Math.cos(lat1),
    Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
}

const Horizon = {
  // Genera puntos de muestreo a lo largo del azimut dado, cada `stepM`
  // metros hasta `maxM` metros.
  samplePoints(lat, lon, azimuthDeg, stepM = 300, maxM = 15000) {
    const points = [];
    for (let d = stepM; d <= maxM; d += stepM) {
      points.push({ dist: d, ...destinationPoint(lat, lon, azimuthDeg, d) });
    }
    return points;
  },

  // Consulta Open-Meteo (lote único, hasta 100 puntos) y devuelve el
  // perfil con el ángulo de elevación aparente de cada punto, corregido
  // por la caída debida a la curvatura terrestre.
  async fetchProfile(lat, lon, azimuthDeg, opts = {}) {
    const points = this.samplePoints(lat, lon, azimuthDeg, opts.stepM, opts.maxM);
    const originElevs = await this._fetchElevations([{ lat, lon }]);
    const eyeElev = originElevs[0] + EYE_HEIGHT_M;

    const elevs = await this._fetchElevations(points);
    return points.map((p, i) => {
      const curvatureDrop = (p.dist * p.dist) / (2 * EARTH_RADIUS_M);
      const heightDiff = elevs[i] - eyeElev - curvatureDrop;
      const angleDeg = Math.atan2(heightDiff, p.dist) * 180 / Math.PI;
      return { dist: p.dist, elevation: elevs[i], angle: angleDeg };
    });
  },

  async _fetchElevations(points) {
    const lats = points.map(p => p.lat.toFixed(6)).join(',');
    const lons = points.map(p => p.lon.toFixed(6)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error consultando elevación (' + res.status + ')');
    const data = await res.json();
    return data.elevation;
  },

  // Ángulo máximo de obstrucción en el perfil.
  maxAngle(profile) {
    return profile.reduce((m, p) => Math.max(m, p.angle), -90);
  }
};
