// Cálculo de la posición del Sol en el instante de totalidad máxima del
// eclipse del 12 de agosto de 2026, para una latitud/longitud dadas.
//
// La hora exacta de la totalidad máxima varía ligeramente según el punto
// exacto (unos pocos minutos entre el norte y el sur de la Comunidad de
// Madrid). Usamos 20:30 CEST como referencia central de la franja de
// totalidad en la zona; es suficientemente preciso para decidir en qué
// dirección y a qué altura buscar el Sol con la cámara.
const ECLIPSE_TOTALITY_TIME = new Date('2026-08-12T20:30:00+02:00');

const Sun = {
  totalityTime: ECLIPSE_TOTALITY_TIME,

  // Devuelve { azimuth, altitude } en grados para lat/lon dados, en el
  // instante de totalidad. azimuth: 0=N, 90=E, 180=S, 270=O (convención
  // de brújula). altitude: grados sobre el horizonte (positivo = visible).
  positionAtTotality(lat, lon) {
    const pos = SunCalc.getPosition(ECLIPSE_TOTALITY_TIME, lat, lon);
    // SunCalc da azimuth en radianes medido desde el Sur, hacia el Oeste
    // positivo. Lo convertimos a la convención estándar de brújula (desde
    // el Norte, hacia el Este positivo).
    const azimuthCompass = (pos.azimuth * 180 / Math.PI + 180 + 360) % 360;
    const altitude = pos.altitude * 180 / Math.PI;
    return { azimuth: azimuthCompass, altitude };
  },

  // Posición actual del sol (para comprobar el compás/AR fuera de la
  // franja horaria del eclipse, en pruebas de escritorio por ejemplo).
  positionNow(lat, lon) {
    const pos = SunCalc.getPosition(new Date(), lat, lon);
    const azimuthCompass = (pos.azimuth * 180 / Math.PI + 180 + 360) % 360;
    const altitude = pos.altitude * 180 / Math.PI;
    return { azimuth: azimuthCompass, altitude };
  }
};
