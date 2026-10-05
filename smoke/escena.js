// Prueba de humo del estudio: 3 s a 1920x1080. Un punto verde aparece con un muelle,
// se estira hasta ser una píldora en t = 1.0 (con pitido exactamente ahí) y el texto
// sube desde su máscara. Sirve para comprobar determinismo, desenfoque de movimiento y sincronía de audio.
import { spring, springTo, clamp } from '/estudio/engine/motion.js';
import { crear, palabrasEnMascara, subirDesdeMascara } from '/estudio/engine/tecnicas.js';

const VERDE = '#0B8F63';
const FONDO = '#F7F8F6';
const T_ESTIRAR = 1.0;

let punto;
let palabras;

export default {
  nombre: 'smoke',
  duracion: 3,
  fondo: FONDO,
  sonidos: [{ t: T_ESTIRAR, tipo: 'beep' }],
  montar(escenario, ctx) {
    punto = crear('div', { left: '0', top: '0', background: VERDE, borderRadius: '999px' }, escenario);
    const caja = crear(
      'div',
      {
        left: '0',
        top: '0',
        width: `${ctx.W}px`,
        height: `${ctx.H}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      escenario,
    );
    palabras = palabrasEnMascara(caja, 'Estudio listo', {
      position: 'relative',
      font: `700 ${64 * ctx.u}px system-ui, sans-serif`,
      color: '#FFFFFF',
      letterSpacing: '-0.02em',
    });
  },
  dibujar(t, ctx) {
    const alto = 120 * ctx.u;
    const aparece = spring(t - 0.15, 'rapido');
    const ancho = springTo(t, alto, 640 * ctx.u, T_ESTIRAR, 'rapido');
    const s = clamp(aparece, 0, 1.2);
    Object.assign(punto.style, {
      width: `${ancho}px`,
      height: `${alto}px`,
      transform: `translate(${(ctx.W - ancho) / 2}px, ${(ctx.H - alto) / 2}px) scale(${s})`,
    });
    palabras.forEach((p, i) => subirDesdeMascara(p, spring(t - (T_ESTIRAR + 0.25 + i * 0.12), 'normal')));
  },
};
