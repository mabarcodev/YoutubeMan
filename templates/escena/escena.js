// NN · Nombre de la escena — qué tiene que entender el espectador al acabarla.
//
// Mapa de pulsos (ver tempo en proyecto.json; tiempos locales de la escena):
//   0    el titular sube palabra a palabra desde su máscara        → tick por palabra
//   3    la tarjeta crece desde un punto (forma que viene de la escena anterior)  → pop
//   6    la tarjeta se recoge en un punto (forma que pasa a la escena siguiente)
//   8    fin
//
// Copia esta carpeta a escenas/NN-nombre/, cambia el texto, los colores (LOOK.md) y las capturas (kit/capturas).
// Referencia del motor: _estudio/docs/CONTRATO-ESCENA.md. Reglas: _estudio/REGLAS.md.
import { spring, springTo, lerp } from '/estudio/engine/motion.js';
import { crear, aplicar, palabrasEnMascara, subirDesdeMascara } from '/estudio/engine/tecnicas.js';

const COLOR = { fondo: '#121418', tinta: '#F3F4F6', acento: '#FF5B2E' }; // del LOOK.md del proyecto
const TITULAR = ['Tu', 'promesa', 'aquí'];
const ACENTO = 2; // índice de la palabra de acento (una por titular)

// Elementos creados en montar() y colocados en dibujar(). Nada más se guarda entre fotogramas.
let palabras = [];
let tarjeta;

export default {
  nombre: 'NN-nombre',
  duracion: (ctx) => ctx.tempo.pulsos(8),
  fondo: COLOR.fondo,
  // fuentes: [{ familia: 'Manrope', url: '/kit/fuentes/Manrope-800.ttf', peso: 800 }],
  // imagenes: { panel: '/kit/capturas/panel.png' },
  sonidos: (ctx) => [
    ...TITULAR.map((_, i) => ({ t: ctx.tempo.beat(i), tipo: 'tick' })),
    { t: ctx.tempo.beat(3), tipo: 'pop' },
  ],

  montar(escenario, ctx) {
    const { zona, u } = ctx;
    const caja = crear(
      'div',
      { left: `${zona.x}px`, top: `${zona.y}px`, width: `${zona.w}px`, height: `${zona.h * 0.4}px` },
      escenario,
    );
    palabras = palabrasEnMascara(
      caja,
      TITULAR.join(' '),
      { position: 'relative', font: `800 ${96 * u}px system-ui, sans-serif`, color: COLOR.tinta, lineHeight: '1.05' },
      { acentos: [ACENTO], claseAcento: 'acento' },
    );
    palabras[ACENTO].style.color = COLOR.acento;
    // La tarjeta: aquí iría la captura real (ctx.img.panel) dentro de un div con overflow hidden.
    tarjeta = crear('div', { left: '0', top: '0', background: COLOR.tinta, borderRadius: `${24 * u}px` }, escenario);
  },

  dibujar(t, ctx) {
    const { W, H, u, tempo } = ctx;
    palabras.forEach((p, i) => subirDesdeMascara(p, spring(t - tempo.beat(i), 'normal')));

    // Crece desde un punto de 40 px hasta 60 % del ancho, y se recoge en el pulso 6.
    const crece = spring(t - tempo.beat(3), 'rapido');
    const recoge = spring(t - tempo.beat(6), 'rapido');
    const p = crece * (1 - recoge);
    const w = lerp(40 * u, W * 0.6, p);
    const h = lerp(40 * u, H * 0.3, p);
    Object.assign(tarjeta.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${lerp(20, 24, p) * u}px` });
    aplicar(tarjeta, {
      x: (W - w) / 2,
      y: springTo(t, H * 0.62, H * 0.6, tempo.beat(3), 'normal') - h / 2,
      opacidad: crece > 0.001 ? 1 : 0,
    });
  },
};
