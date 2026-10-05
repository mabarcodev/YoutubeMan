// 01 · Gancho — la miniatura dice la promesa y en dos segundos se entiende el problema.
//
// Mapa de pulsos (120 BPM: 1 pulso = 0,5 s; tiempos locales de la escena):
//   0     "Reparte sin dar vueltas●" completo: primer fotograma = miniatura = último fotograma del cierre (bucle)
//   0.5   "Reparte", "sin" y "dar" salen hacia arriba por su máscara
//   1     "vueltas●" se desliza a su sitio en la frase nueva y sube "12"                → tick
//   2     sube "paradas,"                                                              → tick
//   3     sube "demasiadas": "12 paradas, demasiadas vueltas●" completa                → tick
//   5.5   las palabras salen hacia arriba; el punto se queda solo, donde acababa la frase
//   6     el punto salta al centro y crece: es la forma que pasa a la demo             → whoosh
//   7     traspaso: la demo empieza aquí (solape de 1 pulso) con el punto en el mismo sitio
//   8     fin
//
// "12" es el número de paradas que enseña la app (kit/capturas/capturas.json), no un dato escrito a mano.
import { spring, lerp } from '/estudio/engine/motion.js';
import { subirDesdeMascara } from '/estudio/engine/tecnicas.js';
import {
  CLAIM,
  COLOR,
  FUENTES,
  cargarCapturas,
  centroZona,
  colocarPunto,
  crearPunto,
  crearTitular,
  diametroCentro,
  mezclar,
  salto,
} from '../comun.js';

const PULSOS = 8;
/** Pulso (local) en el que empieza la demo encima de esta escena: aquí el punto ya espera en el centro. */
export const PULSO_TRASPASO = 7;
const SALIDA = 5.5; // las palabras se van antes de que salte el punto: nunca pasa por encima del texto
const SALTO = 6;

// Escalonado de las salidas: rápido, para que la frase se vaya como un bloque que se deshace.
const ESCALON = 0.06;

let claim; // la frase de marca (bucle)
let dolor; // la frase del problema
let punto;

export default {
  nombre: '01-gancho',
  duracion: (ctx) => ctx.tempo.pulsos(PULSOS),
  fondo: COLOR.fondo,
  fuentes: FUENTES,
  sonidos: (ctx) => {
    const b = ctx.tempo.beat;
    return [
      { t: b(1), tipo: 'tick', volumen: 0.6 },
      { t: b(2), tipo: 'tick', volumen: 0.6 },
      { t: b(3), tipo: 'tick', volumen: 0.6 },
      // El pico del whoosh cae cuando el punto va más deprisa (unos 60 ms después de arrancar el muelle).
      { t: b(SALTO) + 0.06, tipo: 'whoosh', volumen: 0.5 },
    ];
  },

  async montar(escenario, ctx) {
    const { datos } = await cargarCapturas();
    claim = crearTitular(escenario, CLAIM, ctx);
    dolor = crearTitular(
      escenario,
      [
        { texto: String(datos.paradas), junto: true },
        { texto: 'paradas,' },
        { texto: 'demasiadas' },
        { texto: 'vueltas', acento: true },
      ],
      ctx,
    );
    // "vueltas" no se repite: la del claim viaja a este hueco (forma compartida entre las dos frases).
    dolor.mascaras[3].style.visibility = 'hidden';
    claim.mascaras[3].style.transformOrigin = '0 0';
    punto = crearPunto(escenario);
  },

  dibujar(t, ctx) {
    const b = ctx.tempo.beat;
    const sale = (inicio) => spring(t - inicio, 'rapido'); // 0 → 1: de su sitio a fuera por arriba

    // Claim: tres palabras se van en el pulso 0.5; "vueltas" se queda y se va con la frase del dolor.
    claim.spans.forEach((s, i) => {
      const inicio = i < 3 ? b(0.5) + i * ESCALON : b(SALIDA) + 3 * ESCALON;
      subirDesdeMascara(s, 1 + sale(inicio));
    });

    // "vueltas" se desliza (y escala si el cuerpo cambia) hasta su hueco en la frase nueva. Muelle pesado:
    // tipografía grande, sin rebote.
    const q = spring(t - b(1), 'pesado');
    const de = claim.cajas[3];
    const a = dolor.cajas[3];
    // Sin transform en el pulso 0: así el primer fotograma se pinta igual que el último del cierre.
    claim.mascaras[3].style.transform =
      q === 0 ? '' : `translate(${(a.x - de.x) * q}px, ${(a.y - de.y) * q}px) scale(${lerp(1, a.h / de.h, q)})`;

    // Frase del dolor: una palabra por pulso; sale entera de golpe (escalonada) en el pulso 5.5.
    dolor.spans.forEach((s, i) => {
      if (i === 3) return;
      subirDesdeMascara(s, spring(t - b(1 + i), 'pesado') + sale(b(SALIDA) + i * ESCALON));
    });

    // El punto: viaja pegado a "vueltas" y luego salta al centro, donde lo recoge la demo. Muelle rápido: tiene
    // que estar quieto (a menos de medio píxel) un pulso después, cuando empieza la demo.
    const r = spring(t - b(SALTO), 'rapido');
    const pos = mezclar(mezclar(claim.punto, dolor.punto, q), centroZona(ctx), r);
    pos.y -= salto(t, b(SALTO), 90 * ctx.u, 'rapido');
    const d = lerp(lerp(claim.punto.d, dolor.punto.d, q), diametroCentro(ctx), r);
    // Desde el traspaso lo dibuja la demo (encima): dos puntos superpuestos podrían verse con doble borde.
    colocarPunto(punto, pos, t < b(PULSO_TRASPASO) ? d : 0);
  },
};
