// Ritmo musical. Todas las horas de un vídeo se escriben en pulsos (beats):
// imagen y sonido leen el mismo reloj, así nada se desincroniza y mover un momento
// es cambiar un número.

/**
 * crearTempo({ bpm: 120, primerPulso: 0.25 }) — primerPulso es el segundo del vídeo
 * en el que cae el pulso 0 (normalmente el primer tiempo fuerte de la música).
 */
export function crearTempo({ bpm = 120, primerPulso = 0, pulsosPorCompas = 4 } = {}) {
  // Number.isFinite: un "bpm": 1e999 en proyecto.json llega como Infinity y dejaría pulsos de 0 s.
  if (!(Number.isFinite(bpm) && bpm > 0)) throw new Error(`bpm debe ser > 0 (recibido: ${bpm}).`);
  if (!(Number.isFinite(pulsosPorCompas) && pulsosPorCompas > 0)) {
    throw new Error(`pulsosPorCompas debe ser > 0 (recibido: ${pulsosPorCompas}).`);
  }
  if (!Number.isFinite(primerPulso)) throw new Error(`primerPulso debe ser un número (recibido: ${primerPulso}).`);
  const seg = 60 / bpm;
  return {
    bpm,
    primerPulso,
    pulsosPorCompas,
    /** Segundos de un pulso. */
    pulso: seg,
    /** Segundo del vídeo en el que cae el pulso n (admite fracciones: 2.5 = medio pulso). */
    beat: (n) => primerPulso + n * seg,
    /** Pulso (fraccionario) que corresponde al segundo t. */
    aBeat: (t) => (t - primerPulso) / seg,
    /** Segundo en el que empieza el compás n. */
    compas: (n) => primerPulso + n * pulsosPorCompas * seg,
    /** Duración en segundos de n pulsos. */
    pulsos: (n) => n * seg,
  };
}
