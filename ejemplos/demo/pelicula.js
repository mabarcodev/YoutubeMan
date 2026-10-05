// Montaje de la demo de Ruta: las tres escenas en una sola línea de tiempo, con un solo reloj.
//
//   gancho (8 pulsos) ─┐ solape 1 pulso: el punto espera en el centro y la demo lo hace crecer
//                      demo (9 pulsos) ─┐ solape 1 pulso: la tarjeta ya es la barra y el cierre la mide
//                                       cierre (9 pulsos) → último fotograma = primero del gancho (bucle)
//   total: 8 + 9 + 9 − 2 = 24 pulsos = 12 s a 120 BPM
//
// Cada traspaso es una forma compartida (punto → tarjeta → barra → punto): nunca un corte ni un fundido.
import { encadenar } from '/estudio/engine/composicion.js';
import gancho from './escenas/01-gancho/escena.js';
import demo from './escenas/02-demo/escena.js';
import cierre from './escenas/03-cierre/escena.js';
import { COLOR } from './escenas/comun.js';

// 1 pulso a 120 BPM (proyecto.json). encadenar() pide el solape en segundos: si cambia el tempo, cambia esto.
const SOLAPE = 0.5;

// La escena que entra encima de otra va sin fondo propio: durante el solape se ven las dos (la de abajo termina
// su salida mientras la de arriba empieza). Sueltas, cada escena conserva su fondo para revisarla.
const encima = (escena) => ({ ...escena, fondo: undefined });

export default encadenar([gancho, encima(demo), encima(cierre)], {
  nombre: 'pelicula',
  fondo: COLOR.fondo,
  solape: SOLAPE,
});
