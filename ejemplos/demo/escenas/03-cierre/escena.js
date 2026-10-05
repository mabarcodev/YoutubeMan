// 03 · Cierre — la prueba con el dato real y la frase de marca que cierra el bucle.
//
// Mapa de pulsos (120 BPM: 1 pulso = 0,5 s; tiempos locales de la escena):
//   0      la barra que deja la demo (mismo sitio y tamaño): la distancia en orden de entrada
//   0.5    sube "32,4 km" y aparece el punto (la furgoneta) al final de la barra                 → pop
//   1.5    la barra se encoge hasta la distancia optimizada y el contador baja con ella
//   3      llega a "20,7 km" y sube "−36 %"                                                      → ding
//   3–5    la prueba completa, quieta: un segundo para leerla (y para capturarla de pantalla)
//   5      el contador se va y la barra se recoge en el punto
//   5.5–7  el claim sube palabra a palabra (medio pulso cada una) y el punto salta tras cada una → tick ×3, pop
//   9      fin: "Reparte sin dar vueltas●", idéntico al primer fotograma del gancho (bucle)
//
// Los números salen de kit/capturas/capturas.json (los calcula la app al optimizar): 32,4 km, 20,7 km y 36 %.
import { clamp, lerp, spring } from '/estudio/engine/motion.js';
import { crear, formatearNumero, subirDesdeMascara } from '/estudio/engine/tecnicas.js';
import {
  CLAIM,
  COLOR,
  ESTILO_ACENTO,
  ESTILO_CIFRAS,
  FUENTES,
  cargarCapturas,
  colocarCaja,
  colocarPunto,
  crearPunto,
  crearTitular,
  geometriaBarra,
  medirEnLinea,
  salto,
  textoEnMascara,
} from '../comun.js';

const PULSOS = 9;
const APARECE = 0.5;
const ENCOGE = 1.5;
const LLEGA = 3;
const RECOGE = 5;
const CLAIM_INICIO = 5.5; // primera palabra; luego una cada medio pulso
const ESCALON = 0.06;

const km = (v) => formatearNumero(v, { decimales: 1, sufijo: ' km' });

let m; // elementos y geometría que calcula montar() una vez

export default {
  nombre: '03-cierre',
  duracion: (ctx) => ctx.tempo.pulsos(PULSOS),
  fondo: COLOR.fondo,
  fuentes: FUENTES,
  sonidos: (ctx) => {
    const b = ctx.tempo.beat;
    return [
      { t: b(APARECE), tipo: 'pop', volumen: 0.7 },
      { t: b(LLEGA), tipo: 'ding', volumen: 0.6 },
      ...[0, 1, 2].map((i) => ({ t: b(CLAIM_INICIO + i / 2), tipo: 'tick', volumen: 0.5 })),
      { t: b(CLAIM_INICIO + 1.5), tipo: 'pop', volumen: 0.6 },
    ];
  },

  async montar(escenario, ctx) {
    const { datos } = await cargarCapturas();
    const barra = geometriaBarra(ctx);
    const pista = crear('div', { background: COLOR.pista }, escenario);
    const relleno = crear('div', { background: COLOR.tinta }, escenario);

    // Contador y etiqueta en la misma línea base, encima de la barra: el contador a la izquierda (crece con
    // las cifras) y el porcentaje alineado a la derecha. Se miden a 100 px y se escalan para que quepan juntos.
    // Holgura mínima: las cifras no tienen tildes ni descendentes y la barra está justo debajo; con la holgura
    // por defecto el número se vería pasar por encima de la barra al subir (como un tachado).
    const cifras = { holgura: 0.12 };
    const contador = textoEnMascara(escenario, km(datos.kmEntrada), { ...ESTILO_CIFRAS, fontSize: '100px' }, cifras);
    const etiqueta = textoEnMascara(
      escenario,
      `−${datos.porcentaje} %`,
      { ...ESTILO_ACENTO, fontSize: '100px' },
      cifras,
    );
    const lc = contador.parentElement.parentElement;
    const le = etiqueta.parentElement.parentElement;
    const tam = Math.min(260 * ctx.u, (100 * barra.w) / (lc.offsetWidth + le.offsetWidth + 40));
    for (const l of [lc, le]) l.style.fontSize = `${tam}px`;
    const base = barra.y - 0.32 * tam;
    Object.assign(lc.style, { left: `${barra.x}px`, top: `${base - medirEnLinea(contador).base}px` });
    Object.assign(le.style, {
      left: `${barra.x + barra.w - le.offsetWidth}px`,
      top: `${base - medirEnLinea(etiqueta).base}px`,
    });
    // Las cifras suben desde el borde de abajo de su máscara: si ese borde pisa la barra, se las ve cruzarla
    // como un tachado. Se mide la máscara real (offset*: sin transformaciones) y se suben las dos líneas lo justo.
    const fondoMascara = (l, s) => l.offsetTop + s.parentElement.offsetTop + s.parentElement.offsetHeight;
    const sobra = Math.max(fondoMascara(lc, contador), fondoMascara(le, etiqueta)) - (barra.y - 8 * ctx.u);
    if (sobra > 0) for (const l of [lc, le]) l.style.top = `${l.offsetTop - sobra}px`;

    // La frase final se monta con la misma función y los mismos datos que el primer fotograma del gancho.
    const claim = crearTitular(escenario, CLAIM, ctx);
    const punto = crearPunto(escenario);
    m = { datos, barra, pista, relleno, contador, etiqueta, claim, punto, marcador: barra.h * 1.7 };
  },

  dibujar(t, ctx) {
    const b = ctx.tempo.beat;
    const { datos, barra, claim } = m;
    const proporcion = datos.kmOptimizada / datos.kmEntrada;

    // La barra mide la distancia: encoge con un muelle pesado (sin rebote: es un dato) y el contador la sigue.
    const q = spring(t - b(ENCOGE), 'pesado');
    const fin = barra.x + barra.w * lerp(1, proporcion, q); // final del relleno = posición de la furgoneta
    m.contador.textContent = km(lerp(datos.kmEntrada, datos.kmOptimizada, q));

    // La barra se recoge en el punto como una cinta métrica: sus dos extremos van hacia él. Muelle rápido: medio
    // pulso después el punto se va a la frase y no puede quedar un resto de barra a la vista.
    const r = spring(t - b(RECOGE), 'rapido');
    const radio = barra.h / 2;
    const izq = lerp(barra.x, fin, r);
    colocarCaja(m.pista, { x: izq, y: barra.y, w: barra.w * (1 - r), h: barra.h, r: radio });
    colocarCaja(m.relleno, { x: izq, y: barra.y, w: (fin - barra.x) * (1 - r), h: barra.h, r: radio });
    const recogida = r > 0.995 ? 'hidden' : 'visible'; // lo que queda (< 0,5 %) cabe bajo el punto
    m.pista.style.visibility = recogida;
    m.relleno.style.visibility = recogida;

    // Textos: suben por su máscara y se van por arriba; nada aparece con un fundido.
    const sale = (inicio) => spring(t - inicio, 'rapido');
    subirDesdeMascara(m.contador, spring(t - b(APARECE), 'pesado') + sale(b(RECOGE)));
    subirDesdeMascara(m.etiqueta, spring(t - b(LLEGA), 'pesado') + sale(b(RECOGE) + ESCALON));

    // Claim: una palabra cada medio pulso; el punto salta detrás de cada palabra y acaba de punto final.
    const tiempos = claim.spans.map((_, i) => b(CLAIM_INICIO + i / 2));
    claim.spans.forEach((s, i) => subirDesdeMascara(s, spring(t - tiempos[i], 'pesado')));

    // El punto: aparece al final de la barra, viaja con ella y luego salta de palabra en palabra. Cada salto suma
    // su tramo con un muelle propio (como track()), pero el primer tramo parte de la barra, que se mueve.
    const pos = { x: fin, y: barra.y + barra.h / 2 };
    let previo = { x: barra.x + barra.w * proporcion, y: pos.y };
    let alto = 0;
    claim.finales.forEach((p, i) => {
      const k = spring(t - tiempos[i], 'normal');
      pos.x += (p.x - previo.x) * k;
      pos.y += (p.y - previo.y) * k;
      alto += salto(t, tiempos[i], (i === 0 ? 110 : 60) * ctx.u);
      previo = p;
    });
    pos.y -= alto;
    const aparece = clamp(spring(t - b(APARECE), 'rapido'), 0, 1.2);
    const d = lerp(m.marcador, claim.punto.d, spring(t - tiempos[0], 'normal')) * aparece;
    colocarPunto(m.punto, pos, d);
  },
};
