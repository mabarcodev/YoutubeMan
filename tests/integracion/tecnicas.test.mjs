// Integración: las técnicas de DOM de engine/tecnicas.js (palabrasEnMascara, subirDesdeMascara, crearCursor,
// colocarCursor y camara) pintadas por Chromium de verdad. El CSS que escriben ya lo prueban los unitarios con
// un DOM falso; aquí importa lo que se VE: qué aparece, dónde, de qué tamaño, y que el mismo t da siempre la
// misma imagen. Las escenas se escriben en una carpeta temporal con espacios y tildes, como un proyecto real.
// Si falta el Chromium de Playwright, se salta con el motivo.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { abrirEscena, fotograma } from '../../tools/lib/navegador.mjs';
import { zonaSegura } from '../../engine/layout.js';
import { borrar, carpetaTemporal, motivoSinChromium } from '../helpers/entorno.mjs';
import { caja, hexARgb, leerPNG, parecido } from '../helpers/png.mjs';

const motivo = await motivoSinChromium();

const FONDO = '#F7F8F6';
const TINTA = '#1D3557';
const ACENTO = '#0B8F63';
const MARCA = '#D9480F';
const T_CLIC = 2.5;
const TAM_CURSOR = 44; // tamaño por defecto de crearCursor
const QUIETO = 2.4; // todo ha llegado a su sitio y aún no se ha hecho clic
const CLIC = T_CLIC + 0.08; // mitad del clic: pulsoClic vale 1

// Escena de prueba, como la escribiría un animador pero en pequeño: un titular que sube palabra a palabra con
// la última en color de acento, un cursor que aparece, viaja y hace clic, y una cámara que se acerca a un
// cuadrado. Todo en proporción a ctx.W y ctx.H, para comprobar que la misma escena se reencuadra en vertical.
const ESCENA = `// Escena temporal de tests/integracion/tecnicas.test.mjs.
import { clamp, logZoom, spring, track, trackN } from '/estudio/engine/motion.js';
import {
  camara, colocarCursor, crear, crearCursor, palabrasEnMascara, pulsoClic, subirDesdeMascara,
} from '/estudio/engine/tecnicas.js';

let mundo;
let palabras;
let cursor;

export default {
  nombre: 'tecnicas',
  duracion: 3,
  fondo: '${FONDO}',
  montar(escenario, ctx) {
    // Una regla de clase estática (sin transiciones) para la palabra de acento.
    const estilo = document.createElement('style');
    estilo.textContent = '.acento { color: ${ACENTO}; }';
    document.head.appendChild(estilo);
    // La cámara mueve un único contenedor con el "mundo"; el titular y el cursor van fuera, fijos en pantalla.
    mundo = crear('div', { left: '0', top: '0', width: ctx.W + 'px', height: ctx.H + 'px' }, escenario);
    crear('div', {
      left: 0.25 * ctx.W - 50 + 'px',
      top: 0.65 * ctx.H - 50 + 'px',
      width: '100px',
      height: '100px',
      background: '${MARCA}',
    }, mundo);
    palabras = palabrasEnMascara(
      escenario,
      'Cobra en segundos',
      { left: ctx.zona.x + 'px', top: ctx.zona.y + 'px', font: '700 64px system-ui, sans-serif', color: '${TINTA}' },
      { claseAcento: 'acento', acentos: [2] },
    );
    cursor = crearCursor(escenario);
  },
  dibujar(t, ctx) {
    const { W, H } = ctx;
    palabras.forEach((s, i) => subirDesdeMascara(s, spring(t - 0.2 - i * 0.1, 'normal')));
    const [x, y] = trackN(t, [[0, [0.7 * W, 0.3 * H]], [0.5, [0.8 * W, 0.6 * H]]], 'normal');
    colocarCursor(cursor, x, y, { pulsado: pulsoClic(t, ${T_CLIC}), opacidad: clamp((t - 0.1) / 0.2) });
    camara(mundo, {
      x: track(t, [[0, W / 2], [1, 0.25 * W]]),
      y: track(t, [[0, H / 2], [1, 0.65 * H]]),
      zoom: logZoom(t, [[0, 1], [1, 2]]),
    }, ctx);
  },
};
`;

// El mismo titular con máscara (izquierda) y sin ella (derecha, la referencia), con varios interlineados.
// t < 1: palabras escondidas (p = 0); t >= 1: en su sitio (p = 1). Lleva tildes altas (É, á) y descendentes
// (p, y, g), que es lo primero que corta una máscara mal medida.
const TITULAR = 'Éxito rápido y ágil';
const INTERLINEADOS = ['normal', '1.2', '1', '0.9'];
const FILA = 260;
const MASCARA = `// Escena temporal de tests/integracion/tecnicas.test.mjs.
import { crear, palabrasEnMascara, subirDesdeMascara } from '/estudio/engine/tecnicas.js';

let grupos = [];

export default {
  nombre: 'mascara',
  duracion: 2,
  fondo: '#FFFFFF',
  montar(escenario) {
    grupos = ${JSON.stringify(INTERLINEADOS)}.map((alto, k) => {
      const estilos = { top: 40 + k * ${FILA} + 'px', font: '700 88px system-ui, sans-serif', color: '#000000', lineHeight: alto };
      crear('div', { ...estilos, left: '1000px', whiteSpace: 'nowrap' }, escenario, { texto: '${TITULAR}' });
      return palabrasEnMascara(escenario, '${TITULAR}', { ...estilos, left: '40px' });
    });
  },
  dibujar(t) {
    for (const palabras of grupos) for (const s of palabras) subirDesdeMascara(s, t < 1 ? 0 : 1);
  },
};
`;

const rgb = (hex) => hexARgb(hex);
const esTinta = (c) => parecido(c, rgb(TINTA), 30);
const esAcento = (c) => parecido(c, rgb(ACENTO), 30);
const esMarca = (c) => parecido(c, rgb(MARCA), 20);
// El relleno del cursor es #111; el borde blanco y la sombra no cuentan, así se mide la flecha y no su halo.
const esFlecha = (c) => c.every((v) => v < 60);
const esTinta0 = (c) => c[0] < 128; // texto negro sobre blanco (escena de la máscara)

/** Fotograma t de una escena abierta, ya decodificado. */
const foto = async (escena, t) => leerPNG(await fotograma(escena.pagina, t));

/** Comprueba que una caja medida está a ±tol px de la esperada, con un mensaje que enseña las dos. */
function cajaCerca(real, esperada, tol, que) {
  const ok = real.n > 0 && ['x0', 'y0', 'x1', 'y1'].every((k) => Math.abs(real[k] - esperada[k]) <= tol);
  assert.ok(ok, `${que}: medida ${JSON.stringify(real)}, esperada ${JSON.stringify(esperada)} (±${tol} px)`);
}

/** Caja que ocupa en pantalla un cuadrado de `lado` px centrado en (cx, cy). */
const cuadrado = (cx, cy, lado) => ({
  x0: cx - lado / 2,
  y0: cy - lado / 2,
  x1: cx + lado / 2 - 1,
  y1: cy + lado / 2 - 1,
});

describe('técnicas de DOM en Chromium', { skip: motivo || false, timeout: 180_000 }, () => {
  let tmp;
  let proyecto;
  let navegador;
  const abiertas = [];

  /** Abre una escena del proyecto temporal con el Chromium compartido; se cierra sola al final. */
  async function abrir(modulo, formato = '16:9') {
    const e = await abrirEscena({ proyecto, modulo, formato, navegador });
    abiertas.push(e);
    return e;
  }

  before(async () => {
    tmp = carpetaTemporal('tecnicas');
    proyecto = path.join(tmp, 'Proyecto de técnicas ñ');
    fs.mkdirSync(proyecto, { recursive: true });
    fs.writeFileSync(path.join(proyecto, 'proyecto.json'), JSON.stringify({ nombre: 'técnicas', tempo: { bpm: 120 } }));
    fs.writeFileSync(path.join(proyecto, 'escena.js'), ESCENA);
    fs.writeFileSync(path.join(proyecto, 'mascara.js'), MASCARA);
    navegador = await chromium.launch();
  });

  after(async () => {
    for (const e of abiertas) await e.cerrar();
    await navegador?.close();
    borrar(tmp);
  });

  describe('horizontal (16:9)', () => {
    let e;
    before(async () => {
      e = await abrir('escena.js');
    });

    test('la escena se abre al tamaño del formato y el runtime publica sus datos', () => {
      assert.deepEqual(
        { ...e.meta },
        {
          listo: true,
          nombre: 'tecnicas',
          duracion: 3,
          formato: '16:9',
          W: 1920,
          H: 1080,
          fondo: FONDO,
          sonidos: [],
          musica: null,
        },
      );
    });

    test('palabrasEnMascara: una máscara por palabra, con espacios entre ellas y el acento donde se pide', async () => {
      const dom = await e.pagina.evaluate(() => {
        const linea = [...document.getElementById('escenario').children].find((d) => d.querySelector('span'));
        const estilo = (el) => window.getComputedStyle(el);
        return {
          texto: linea.textContent,
          mascaras: [...linea.children].map((m) => [estilo(m).overflow, estilo(m).display]),
          palabras: [...linea.children].map((m) => {
            const s = m.firstElementChild;
            return [s.textContent, s.className, estilo(s).color];
          }),
        };
      });
      assert.equal(dom.texto, 'Cobra en segundos');
      assert.deepEqual(dom.mascaras, Array(3).fill(['hidden', 'inline-block']));
      const [t, a] = [rgb(TINTA), rgb(ACENTO)].map((c) => `rgb(${c.join(', ')})`);
      assert.deepEqual(dom.palabras, [
        ['Cobra', '', t],
        ['en', '', t],
        ['segundos', 'acento', a],
      ]);
    });

    test('subirDesdeMascara: en p = 0 el titular no se ve; en p = 1 se ve entero, con el acento en su color', async () => {
      const zona = zonaSegura('16:9');
      const region = { x0: zona.x - 20, y0: zona.y - 30, x1: zona.x + 1000, y1: zona.y + 130 };
      const inicio = await foto(e, 0);
      assert.equal(caja(inicio, esTinta, region).n, 0, 't = 0: asoma texto por debajo de la máscara');
      assert.equal(caja(inicio, esAcento, region).n, 0, 't = 0: asoma la palabra de acento');

      const final = await foto(e, QUIETO);
      const tinta = caja(final, esTinta, region);
      const acento = caja(final, esAcento, region);
      assert.ok(tinta.n > 1000 && acento.n > 1000, `píxeles de texto: tinta ${tinta.n}, acento ${acento.n}`);
      assert.ok(acento.x0 > tinta.x1, 'la palabra de acento es la última, a la derecha del resto');
      // Cada palabra ha subido hasta su sitio: el interior coincide con el borde de arriba del CONTENIDO de su
      // máscara (la máscara tiene holgura por arriba para que no se corten las tildes).
      const desfases = await e.pagina.evaluate(() =>
        [...document.querySelectorAll('#escenario span > span')].map((s) => {
          const m = s.parentElement;
          const holgura = parseFloat(window.getComputedStyle(m).paddingTop);
          return s.getBoundingClientRect().top - (m.getBoundingClientRect().top + holgura);
        }),
      );
      assert.equal(desfases.length, 3);
      for (const d of desfases) assert.ok(Math.abs(d) < 0.5, `palabra desplazada ${d} px de su sitio`);
    });

    test('crearCursor y colocarCursor: aparece con su opacidad y la punta queda en (x, y)', async () => {
      const region = { x0: 0.6 * 1920, y0: 0.2 * 1080, x1: 1920, y1: 0.75 * 1080 };
      assert.equal(caja(await foto(e, 0), esFlecha, region).n, 0, 'con opacidad 0 el cursor no se ve');
      // Antes de moverse está en (0.7·W, 0.3·H); después, en (0.8·W, 0.6·H). La flecha queda dentro del cuadro
      // del cursor, pegada a su esquina de arriba a la izquierda (la punta).
      for (const [t, x, y] of [
        [0.45, 0.7 * 1920, 0.3 * 1080],
        [QUIETO, 0.8 * 1920, 0.6 * 1080],
      ]) {
        const f = caja(await foto(e, t), esFlecha, region);
        assert.ok(f.n > 100, `t = ${t}: flecha de ${f.n} px`);
        // El relleno oscuro empieza unos 9 px dentro (la punta del dibujo más su borde blanco).
        assert.ok(f.x0 >= x && f.y0 >= y && f.x0 - x < 16 && f.y0 - y < 16, `t = ${t}: punta en ${f.x0},${f.y0}`);
        assert.ok(f.x1 < x + TAM_CURSOR && f.y1 < y + TAM_CURSOR, `t = ${t}: la flecha se sale de su cuadro`);
      }
    });

    test('pulsoClic + colocarCursor: el clic encoge el cursor hacia la punta, que no se mueve', async () => {
      const region = { x0: 0.6 * 1920, y0: 0.2 * 1080, x1: 1920, y1: 0.75 * 1080 };
      const suelto = caja(await foto(e, QUIETO), esFlecha, region);
      const pulsado = caja(await foto(e, CLIC), esFlecha, region);
      const ratio = pulsado.n / suelto.n;
      // Escala 0.86 en cada eje: el área baja a ~0.74 (algo menos por el borde blanco, que no encoge igual).
      assert.ok(ratio > 0.5 && ratio < 0.9, `área pulsado/suelto = ${ratio.toFixed(2)}`);
      // Al encoger hacia la punta, el borde de arriba a la izquierda del relleno (a ~9 px de ella) se acerca a
      // la punta algo más de 1 px; si encogiera hacia el centro, se alejaría. El de abajo a la derecha retrocede.
      const [dx, dy] = [pulsado.x0 - suelto.x0, pulsado.y0 - suelto.y0];
      assert.ok(dx <= 0 && dx >= -2 && dy <= 0 && dy >= -2, `la punta se ha movido (${dx}, ${dy})`);
      assert.ok(pulsado.x1 <= suelto.x1 - 2 && pulsado.y1 <= suelto.y1 - 2, 'no ha encogido');
      // Y en el DOM: mismo origen, 0.86 de tamaño.
      const medir = () =>
        e.pagina.evaluate(() => {
          const r = document.querySelector('#escenario svg').parentElement.getBoundingClientRect();
          return [r.left, r.top, r.width, r.height];
        });
      await fotograma(e.pagina, CLIC);
      const [x, y, w, h] = await medir();
      assert.ok(Math.abs(x - 0.8 * 1920) < 0.5 && Math.abs(y - 0.6 * 1080) < 0.5, `origen ${x},${y}`);
      assert.ok(Math.abs(w - TAM_CURSOR * 0.86) < 0.5 && Math.abs(h - TAM_CURSOR * 0.86) < 0.5, `tamaño ${w}x${h}`);
    });

    test('camara: sin zoom el mundo está quieto; luego centra el punto enfocado y lo amplía al doble', async () => {
      cajaCerca(caja(await foto(e, 0), esMarca), cuadrado(0.25 * 1920, 0.65 * 1080, 100), 1, 't = 0');
      cajaCerca(caja(await foto(e, QUIETO), esMarca), cuadrado(960, 540, 200), 1, `t = ${QUIETO}`);
      // A mitad del viaje está entre los dos: ni en su sitio ni centrado, y de un tamaño intermedio.
      const medio = caja(await foto(e, 1.23), esMarca);
      const lado = medio.x1 - medio.x0 + 1;
      assert.ok(lado > 110 && lado < 190, `lado a mitad del zoom: ${lado}`);
      assert.ok(medio.x0 > 430 && medio.x1 < 1059, `x a mitad del viaje: ${medio.x0}..${medio.x1}`);
    });

    test('el mismo t da la misma imagen: en otro orden, después de otros instantes y en otra página', async () => {
      const t = 1.23; // a mitad de todo: palabras subiendo, cursor viajando y cámara acercándose
      const f1 = await fotograma(e.pagina, t);
      await fotograma(e.pagina, 0.3);
      await fotograma(e.pagina, 2.9);
      const f2 = await fotograma(e.pagina, t);
      const otra = await abrir('escena.js');
      await fotograma(otra.pagina, 2.2);
      const f3 = await fotograma(otra.pagina, t);
      assert.ok(f1.equals(f2), 'misma página, otro orden');
      assert.ok(f1.equals(f3), 'página nueva');
      // Si no cambiara nada entre instantes cercanos, la comparación no probaría nada.
      assert.ok(!f1.equals(await fotograma(e.pagina, t + 1 / 60)), 'el fotograma siguiente debería ser distinto');
      assert.deepEqual(otra.errores, []);
    });

    test('la página no ha registrado errores', () => {
      assert.deepEqual(e.errores, []);
    });
  });

  describe('vertical (9:16): la misma escena se reencuadra', () => {
    let e;
    before(async () => {
      e = await abrir('escena.js', '9:16');
    });

    test('la cámara centra el punto enfocado en el centro del lienzo vertical', async () => {
      assert.deepEqual([e.meta.W, e.meta.H, e.meta.formato], [1080, 1920, '9:16']);
      cajaCerca(caja(await foto(e, 0), esMarca), cuadrado(0.25 * 1080, 0.65 * 1920, 100), 1, 't = 0');
      cajaCerca(caja(await foto(e, QUIETO), esMarca), cuadrado(540, 960, 200), 1, `t = ${QUIETO}`);
    });

    test('el titular cae dentro de la zona segura y el cursor en su sitio', async () => {
      const f = await foto(e, QUIETO);
      const zona = zonaSegura('9:16');
      const texto = caja(f, (c) => esTinta(c) || esAcento(c), { x1: 1080, y1: 960 });
      assert.ok(texto.n > 2000, `píxeles de texto: ${texto.n}`);
      // 2 px de margen: la tinta de una letra puede empezar un poco antes de su caja según la fuente.
      assert.ok(
        texto.x0 >= zona.x - 2 && texto.y0 >= zona.y && texto.x1 < zona.x + zona.w && texto.y1 < zona.y + zona.h,
        `texto en ${JSON.stringify(texto)} fuera de la zona ${JSON.stringify(zona)}`,
      );
      const flecha = caja(f, esFlecha, { x0: 0.6 * 1080, y0: 0.5 * 1920, x1: 1080, y1: 0.7 * 1920 });
      const [x, y] = [0.8 * 1080, 0.6 * 1920];
      assert.ok(flecha.n > 100 && flecha.x0 >= x && flecha.y0 >= y, `flecha ${JSON.stringify(flecha)}`);
      assert.ok(flecha.x1 < x + TAM_CURSOR && flecha.y1 < y + TAM_CURSOR);
      assert.deepEqual(e.errores, []);
    });
  });

  describe('palabrasEnMascara con distintos interlineados', () => {
    let e;
    before(async () => {
      e = await abrir('mascara.js');
    });

    /** Tinta de la fila k con máscara (izquierda) y sin ella (derecha) en el instante t. */
    async function medirFilas(t) {
      const f = await foto(e, t);
      return INTERLINEADOS.map((alto, k) => {
        const y0 = 40 + k * FILA - 30;
        const y1 = y0 + FILA;
        return {
          alto,
          mascara: caja(f, esTinta0, { x0: 0, x1: 960, y0, y1 }),
          referencia: caja(f, esTinta0, { x0: 960, x1: 1920, y0, y1 }),
        };
      });
    }

    /**
     * p = 0 no deja ver nada y p = 1 enseña lo mismo que el texto sin máscara: tildes y descendentes enteros.
     * Junta todos los problemas en un solo fallo, para ver de una vez qué interlineados fallan y cuánto.
     */
    async function comprobar(altos) {
      const [ocultas, visibles] = [await medirFilas(0), await medirFilas(1.5)];
      const problemas = [];
      for (const alto of altos) {
        const o = ocultas.find((f) => f.alto === alto);
        const v = visibles.find((f) => f.alto === alto);
        assert.ok(v.referencia.n > 5000, `interlineado ${alto}: la referencia no se ha pintado (${v.referencia.n} px)`);
        if (o.mascara.n > 0) problemas.push(`${alto}, p = 0: asoman ${o.mascara.n} px de letra bajo la máscara`);
        const perdidos = v.referencia.n - v.mascara.n;
        if (Math.abs(perdidos) > v.referencia.n * 0.01) {
          problemas.push(`${alto}, p = 1: la máscara recorta ${perdidos} px de tinta de ${v.referencia.n}`);
        }
        const altoTinta = (c) => c.y1 - c.y0 + 1;
        if (Math.abs(altoTinta(v.mascara) - altoTinta(v.referencia)) > 1) {
          problemas.push(
            `${alto}, p = 1: la tinta mide ${altoTinta(v.mascara)} px de alto con máscara y ` +
              `${altoTinta(v.referencia)} px sin ella (tildes o descendentes cortados)`,
          );
        }
      }
      assert.deepEqual(problemas, [], `Interlineado ${problemas.join('; ')}`);
    }

    test('con el interlineado por defecto (normal o 1.2) esconde todo y luego no corta tildes ni descendentes', () =>
      comprobar(['normal', '1.2']));

    test('con interlineado apretado (1 o 0.9, habitual en titulares) tampoco asoman tildes ni se cortan descendentes', () =>
      comprobar(['1', '0.9']));

    test('la página no ha registrado errores', () => {
      assert.deepEqual(e.errores, []);
    });
  });
});
