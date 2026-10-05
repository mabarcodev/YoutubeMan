// Montaje: todas las escenas en una sola línea de tiempo, con un solo reloj y una sola banda sonora.
//
//   01-gancho ─┐ solape: la forma con la que acaba el gancho es con la que empieza la demo
//              02-demo ─┐ solape
//                       03-cierre → si hace bucle, su último fotograma es el primero del gancho
//
// Cada traspaso es una forma compartida (un punto, una píldora, una tarjeta, un número): nunca un corte ni un
// fundido. Copia este archivo a la raíz del proyecto como pelicula.js. Referencia: _estudio/docs/CONTRATO-ESCENA.md.
import { encadenar } from '/estudio/engine/composicion.js';
import gancho from './escenas/01-gancho/escena.js';
import demo from './escenas/02-demo/escena.js';
import cierre from './escenas/03-cierre/escena.js';

// Solape en segundos: 1 pulso a 120 BPM. Si cambia el tempo de proyecto.json, cambia esto.
const SOLAPE = 0.5;

// La escena que entra encima de otra durante el solape va sin fondo propio para que se vean las dos.
const encima = (escena) => ({ ...escena, fondo: undefined });

export default encadenar([gancho, encima(demo), encima(cierre)], {
  nombre: 'pelicula',
  fondo: '#121418', // el lienzo de LOOK.md
  solape: SOLAPE,
  // La subida (AUDIO.json) debe caer en el momento de la prueba: ajusta `desde` o `inicio` para que coincida.
  // musica: { archivo: '/kit/audio/tema.wav', desde: 0, inicio: 0, volumen: 0.9, fundido: 1 },
});
