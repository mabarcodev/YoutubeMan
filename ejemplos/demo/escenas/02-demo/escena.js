// 02 · Demo — el punto crece hasta ser la app; un clic real en "Optimizar ruta" y la ruta se recalcula.
//
// Mapa de pulsos (120 BPM: 1 pulso = 0,5 s; tiempos locales de la escena):
//   0     el punto del gancho (mismo sitio y tamaño) crece hasta ser la tarjeta, naranja entera       → whoosh
//   0.75  el naranja se recoge hasta ser el botón "Optimizar ruta" de la captura real: punto → tarjeta → botón
//   1.5   entra el cursor y la cámara se acerca (zoom logarítmico) a donde va a trabajar
//   3     clic: la captura "optimizada" se abre en círculo desde el clic                             → click
//         (20,7 km y "−11,7 km · −36 %" aparecen porque están en la captura: no se dibuja nada de la app)
//   4.5   el cursor se va
//   4.75  la cámara se aleja: se ve la ruta naranja entera
//   6.5   la tarjeta se aplasta hasta ser la barra de distancia del cierre                            → whoosh
//   8     traspaso: el cierre empieza aquí (solape de 1 pulso) con la barra en el mismo sitio
//   9     fin
//
// La interfaz son SOLO capturas de kit/capturas/ (las hace kit/app/capturar.mjs pulsando el botón de verdad);
// capturas.json dice dónde están el botón y el pie de la lista, así el cursor apunta al botón real.
import { clamp, logZoom, spring, trackN } from '/estudio/engine/motion.js';
import { camara, colocarCursor, crear, crearCursor, pulsoClic } from '/estudio/engine/tecnicas.js';
import {
  COLOR,
  FUENTES,
  IMAGENES_CAPTURAS,
  cargarCapturas,
  centro,
  centroZona,
  colocarCaja,
  diametroCentro,
  elegirDispositivo,
  geometriaBarra,
  mezclarCaja,
  radioTarjeta,
  rectTarjeta,
  vistaFoco,
  zonaEnTarjeta,
} from '../comun.js';

const PULSOS = 9;
/** Pulso (local) en el que empieza el cierre encima de esta escena: aquí la tarjeta ya es la barra. */
export const PULSO_TRASPASO = 8;
const RECOGE = 0.75;
const CAMARA = 1.5;
const CLIC = 3;
const SALE_CURSOR = 4.5;
const ALEJA = 4.75;
const APLASTA = 6.5;

let m; // elementos y geometría que calcula montar() una vez

export default {
  nombre: '02-demo',
  duracion: (ctx) => ctx.tempo.pulsos(PULSOS),
  fondo: COLOR.fondo,
  fuentes: FUENTES,
  imagenes: IMAGENES_CAPTURAS,
  sonidos: (ctx) => {
    const b = ctx.tempo.beat;
    return [
      { t: b(0) + 0.08, tipo: 'whoosh', volumen: 0.45 },
      { t: b(CLIC), tipo: 'click' },
      { t: b(APLASTA) + 0.08, tipo: 'whoosh', volumen: 0.35 },
    ];
  },

  async montar(escenario, ctx) {
    const datos = await cargarCapturas();
    // Escritorio en 16:9 y 1:1, móvil en 9:16 y 4:5: cada formato se reencuadra con la interfaz que mejor llena.
    const disp = elegirDispositivo(datos, ctx);
    const rect = rectTarjeta(ctx, disp);
    const zonas = disp.optimizada.zonas;
    const boton = zonaEnTarjeta(rect, zonas.boton);
    const pie = zonaEnTarjeta(rect, zonas.pie);

    // Un único contenedor de cámara: tarjeta y cursor se mueven juntos, como en una grabación de pantalla.
    const cam = crear('div', { left: '0', top: '0', width: `${ctx.W}px`, height: `${ctx.H}px` }, escenario);
    const tarjeta = crear('div', { overflow: 'hidden', background: COLOR.tinta }, cam);
    // ctx.img trae las capturas ya decodificadas: se usan tal cual (una <img> nueva podría no estar lista a t=0).
    const captura = (estado) => {
      const img = ctx.img[`${disp.nombre}-${estado}`];
      Object.assign(img.style, { position: 'absolute', display: 'block', width: `${rect.w}px`, height: `${rect.h}px` });
      tarjeta.appendChild(img);
      return img;
    };
    const entrada = captura('entrada');
    const optimizada = captura('optimizada');
    const naranja = crear('div', { background: COLOR.acento }, tarjeta);
    const cursor = crearCursor(cam, { tam: 36 * ctx.u });

    // Zoom hasta que el pie de la lista (distancia + botón) ocupe ~60 % del ancho útil; tope 2× para que la
    // captura (a 2× o 3× de densidad) no se vea blanda.
    const zoom = clamp((0.62 * ctx.zona.w) / pie.w, 1.5, 2);
    const cb = centro(boton);
    const clic = { x: cb.x + boton.w * 0.12, y: cb.y + boton.h * 0.15 };
    const esquinas = [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h],
    ];
    m = {
      rect,
      boton: { ...boton, r: 12 * rect.escala }, // radio real del botón en la app (12 px CSS)
      tarjeta,
      entrada,
      optimizada,
      naranja,
      cursor,
      cam,
      zoom,
      clic,
      vista: vistaFoco(pie, zoom, rect, ctx),
      fuera: { x: rect.x + rect.w * 0.8, y: ctx.H + 60 * ctx.u }, // el cursor entra y sale por abajo
      radioOnda: Math.max(...esquinas.map(([x, y]) => Math.hypot(x - clic.x, y - clic.y))),
    };
  },

  dibujar(t, ctx) {
    const b = ctx.tempo.beat;
    const { rect } = m;

    // Tarjeta: punto (el del gancho) → tarjeta con la captura → barra (la del cierre). Una sola forma.
    const D = diametroCentro(ctx);
    const c = centroZona(ctx);
    const punto = { x: c.x - D / 2, y: c.y - D / 2, w: D, h: D, r: D / 2 };
    const barra = geometriaBarra(ctx);
    const g = spring(t - b(0), 'normal');
    const s = spring(t - b(APLASTA), 'normal');
    const caja = mezclarCaja(mezclarCaja(punto, { ...rect, r: radioTarjeta(ctx) }, g), { ...barra, r: barra.h / 2 }, s);
    colocarCaja(m.tarjeta, caja);

    // Las capturas no se mueven con la tarjeta: la tarjeta es una ventana que se abre y se cierra sobre ellas.
    // Al aplastarse, la interfaz se apaga en la segunda mitad: la barra que queda es lisa, como la del cierre.
    const opacidad = String(1 - clamp((s - 0.35) / 0.45));
    for (const img of [m.entrada, m.optimizada]) {
      Object.assign(img.style, { left: `${rect.x - caja.x}px`, top: `${rect.y - caja.y}px`, opacity: opacidad });
    }

    // El naranja de la tarjeta se recoge en el botón real (mismo color, mismo radio). Cuando lo cubre exacto,
    // se aparta en 0,1 s: lo único que "aparece" es el texto blanco del botón, que ya estaba debajo.
    const k = spring(t - b(RECOGE), 'normal');
    const nar = mezclarCaja(caja, m.boton, k);
    colocarCaja(m.naranja, { ...nar, x: nar.x - caja.x, y: nar.y - caja.y });
    m.naranja.style.opacity = String(1 - clamp((t - (b(RECOGE) + 0.62)) / 0.1));

    // Clic: la captura optimizada se abre en círculo desde la punta del cursor.
    const onda = m.radioOnda * spring(t - b(CLIC), 'normal');
    m.optimizada.style.clipPath = `circle(${onda}px at ${m.clic.x - rect.x}px ${m.clic.y - rect.y}px)`;

    // Cursor: entra por abajo, espera medio pulso quieto antes del clic (se lee la intención) y se va.
    const [cx, cy] = trackN(
      t,
      [
        [0, [m.fuera.x, m.fuera.y]],
        [b(CAMARA), [m.clic.x, m.clic.y]],
        [b(SALE_CURSOR), [m.fuera.x, m.fuera.y]],
      ],
      'normal',
    );
    colocarCursor(m.cursor, cx, cy, { pulsado: pulsoClic(t, b(CLIC) - 0.08, 0.16) });

    // Cámara: un movimiento cada vez. Se acerca al pie de la lista mientras llega el cursor y se aleja después.
    const [vx, vy] = trackN(
      t,
      [
        [0, [ctx.W / 2, ctx.H / 2]],
        [b(CAMARA), [m.vista.x, m.vista.y]],
        [b(ALEJA), [ctx.W / 2, ctx.H / 2]],
      ],
      'normal',
    );
    const zoom = logZoom(
      t,
      [
        [0, 1],
        [b(CAMARA), m.zoom],
        [b(ALEJA), 1],
      ],
      'normal',
    );
    camara(m.cam, { x: vx, y: vy, zoom }, ctx);
  },
};
