// Detección de "saltos": fotogramas sueltos que se separan de sus dos vecinos mucho más
// de lo que los vecinos se separan entre sí. A velocidad normal no se ven, pero en el tercer
// bucle el espectador sí los nota. Un corte de plano NO es un salto (el fotograma siguiente
// también es distinto del anterior).

export function diferenciaMedia(a, b) {
  if (a.length !== b.length) throw new Error('Los fotogramas deben tener el mismo tamaño.');
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/**
 * fotogramas: array de buffers en gris del mismo tamaño.
 * Devuelve [{ indice, puntuacion }] ordenados por puntuación (0–255, más alto = peor).
 */
export function detectarSaltos(fotogramas, { umbral = 10 } = {}) {
  const saltos = [];
  for (let i = 1; i < fotogramas.length - 1; i++) {
    const conAnterior = diferenciaMedia(fotogramas[i - 1], fotogramas[i]);
    const conSiguiente = diferenciaMedia(fotogramas[i], fotogramas[i + 1]);
    const vecinos = diferenciaMedia(fotogramas[i - 1], fotogramas[i + 1]);
    const puntuacion = Math.min(conAnterior, conSiguiente) - vecinos;
    if (puntuacion > umbral) saltos.push({ indice: i, puntuacion: Math.round(puntuacion * 10) / 10 });
  }
  return saltos.sort((a, b) => b.puntuacion - a.puntuacion);
}
