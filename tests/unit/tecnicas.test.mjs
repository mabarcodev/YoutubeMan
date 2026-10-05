// Tests de engine/tecnicas.js. Las funciones puras, directamente; las que tocan el DOM (palabrasEnMascara,
// cursor, cámara...), con un DOM falso para comprobar qué crean y qué estilos escriben. Lo que se VE con esos
// estilos (máscaras, punta del cursor, encuadre de la cámara) se prueba con Chromium de verdad en
// tests/integracion/tecnicas.test.mjs.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicar,
  camara,
  colocarCursor,
  crear,
  crearCursor,
  formatearNumero,
  palabrasEnMascara,
  pulsoClic,
  subirDesdeMascara,
  transformCamara,
  transformar,
} from '../../engine/tecnicas.js';
import { instalarDomFalso } from '../helpers/dom-falso.mjs';
import { cerca } from '../helpers/entorno.mjs';

const NBSP = ' ';

describe('transformar', () => {
  test('sin argumentos es la identidad', () => {
    assert.equal(transformar(), 'translate(0px, 0px) rotate(0deg) scale(1, 1)');
    assert.equal(transformar({}), 'translate(0px, 0px) rotate(0deg) scale(1, 1)');
  });

  test('orden fijo: mover, rotar, escalar', () => {
    assert.equal(transformar({ x: 10, y: -5, rot: 45, escala: 2 }), 'translate(10px, -5px) rotate(45deg) scale(2, 2)');
  });

  test('escalaX y escalaY sustituyen a escala en su eje', () => {
    assert.equal(transformar({ escala: 2, escalaX: 3 }), 'translate(0px, 0px) rotate(0deg) scale(3, 2)');
    assert.equal(transformar({ escalaY: 0.5 }), 'translate(0px, 0px) rotate(0deg) scale(1, 0.5)');
  });

  test('redondea a 4 decimales para que el CSS sea idéntico entre ejecuciones', () => {
    assert.equal(
      transformar({ x: 10.123456, y: 1 / 3, rot: 0.00004, escala: 1.000049 }),
      'translate(10.1235px, 0.3333px) rotate(0deg) scale(1, 1)',
    );
  });

  test('nunca escribe "-0" cuando un valor negativo diminuto se redondea a cero', () => {
    const css = transformar({ x: -0.00001, y: -0.00004, rot: -1e-9 });
    assert.equal(css, 'translate(0px, 0px) rotate(0deg) scale(1, 1)');
    assert.ok(!css.includes('-0'));
  });
});

describe('transformCamara', () => {
  /** Aplica la cadena "translate(A, B) scale(S) translate(C, D)" a un punto, como haría el navegador. */
  function aplicarA(css, [px, py]) {
    const m = css.match(
      /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+)\) translate\((-?[\d.]+)px, (-?[\d.]+)px\)$/,
    );
    assert.ok(m, `formato inesperado: ${css}`);
    const [a, b, s, c, d] = m.slice(1).map(Number);
    return [a + s * (px + c), b + s * (py + d)];
  }

  test('genera la cadena esperada', () => {
    assert.equal(
      transformCamara({ x: 100, y: 50, zoom: 2 }, { W: 1920, H: 1080 }),
      'translate(960px, 540px) scale(2) translate(-100px, -50px)',
    );
    assert.equal(
      transformCamara({ x: 0, y: 0 }, { W: 1080, H: 1920 }),
      'translate(540px, 960px) scale(1) translate(0px, 0px)',
    );
  });

  test('el punto (x, y) del contenido queda en el centro del lienzo con cualquier zoom', () => {
    for (const vista of [
      { x: 100, y: 50, zoom: 2 },
      { x: 1500.5, y: 20.25, zoom: 0.75 },
      { x: -40, y: 900, zoom: 3.5 },
    ]) {
      const [cx, cy] = aplicarA(transformCamara(vista, { W: 1920, H: 1080 }), [vista.x, vista.y]);
      cerca(cx, 960, 1e-3);
      cerca(cy, 540, 1e-3);
      // Un punto a 10 px del enfoque acaba a 10·zoom px del centro.
      const [dx] = aplicarA(transformCamara(vista, { W: 1920, H: 1080 }), [vista.x + 10, vista.y]);
      cerca(dx - 960, 10 * vista.zoom, 1e-3);
    }
  });
});

describe('formatearNumero', () => {
  test('formato español por defecto: sin decimales, coma decimal y punto de miles', () => {
    assert.equal(formatearNumero(1234.5), '1235');
    assert.equal(formatearNumero(12345.678, { decimales: 2 }), '12.345,68');
    assert.equal(formatearNumero(-3), '-3');
    assert.equal(formatearNumero(1500000), '1.500.000');
  });

  test('nunca muestra "-0" ni "-0,00" por culpa del redondeo', () => {
    for (let decimales = 0; decimales <= 3; decimales++) {
      for (const v of [-0, -1e-12, -0.0004, -0.4 * Math.pow(10, -decimales)]) {
        const txt = formatearNumero(v, { decimales });
        assert.ok(!txt.startsWith('-'), `${v} con ${decimales} decimales dio "${txt}"`);
      }
    }
    assert.equal(formatearNumero(-0.4), '0');
    assert.equal(formatearNumero(-0.004, { decimales: 2 }), '0,00');
    assert.equal(formatearNumero(-0.001, { moneda: 'EUR', decimales: 2 }), `0,00${NBSP}€`);
  });

  test('los negativos que no se redondean a cero conservan el signo', () => {
    assert.equal(formatearNumero(-0.5), '-1');
    assert.equal(formatearNumero(-0.005, { decimales: 2 }), '-0,01');
  });

  test('moneda: euros con espacio duro antes del símbolo, y decimales a elegir', () => {
    assert.equal(formatearNumero(1234.5, { moneda: 'EUR', decimales: 2 }), `1234,50${NBSP}€`);
    assert.equal(formatearNumero(9.99, { moneda: 'EUR' }), `10${NBSP}€`);
    assert.equal(formatearNumero(1234.5, { moneda: 'USD', decimales: 2, locale: 'en-US' }), '$1,234.50');
  });

  test('prefijo, sufijo y otro idioma', () => {
    assert.equal(formatearNumero(5, { prefijo: '+', sufijo: ' %' }), '+5 %');
    assert.equal(formatearNumero(1234567.891, { decimales: 2, locale: 'en-US' }), '1,234,567.89');
  });
});

describe('pulsoClic', () => {
  test('vale 0 fuera del clic y (salvo redondeo) en sus bordes', () => {
    for (const t of [0, 0.99, 1, 1.17, 1.5]) assert.equal(pulsoClic(t, 1), 0, `t=${t}`);
    // (1.16 − 1) / 0.16 da 0.9999999999999994 en coma flotante: sin(π·p) ≈ 2e-15, invisible.
    cerca(pulsoClic(1.16, 1), 0, 1e-12);
  });

  test('sube a 1 a mitad de la duración y es simétrico', () => {
    cerca(pulsoClic(1.08, 1), 1, 1e-12);
    cerca(pulsoClic(1.04, 1), pulsoClic(1.12, 1), 1e-12);
    assert.ok(pulsoClic(1.04, 1) > 0 && pulsoClic(1.04, 1) < 1);
  });

  test('duración propia', () => {
    cerca(pulsoClic(2.25, 2, 0.5), 1, 1e-12);
    assert.equal(pulsoClic(2.5, 2, 0.5), 0);
    for (let i = 0; i <= 100; i++) {
      const v = pulsoClic(2 + i / 200, 2, 0.5);
      assert.ok(v >= 0 && v <= 1);
    }
  });
});

describe('funciones de DOM (con DOM falso: qué crean y qué estilos escriben)', () => {
  let restaurar;
  before(() => {
    restaurar = instalarDomFalso();
  });
  after(() => restaurar());

  /** Números de una cadena CSS: "translateY(calc(50% + 0.25em))" → [50, 0.25]. */
  const numeros = (css) => (css.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  describe('crear', () => {
    test('posición absoluta, estilos y padre; sin padre no se cuelga de ningún sitio', () => {
      const padre = document.createElement('div');
      const el = crear('p', { left: '10px', color: 'red' }, padre);
      assert.equal(el.tagName, 'P');
      assert.deepEqual(el.style, { position: 'absolute', left: '10px', color: 'red' });
      assert.deepEqual(padre.children, [el]);
      assert.equal(el.parentNode, padre);
      const suelto = crear('div');
      assert.deepEqual(suelto.style, { position: 'absolute' });
      assert.equal(suelto.parentNode, null);
    });

    test('los estilos pueden cambiar la posición (p. ej. "relative" dentro de un flex)', () => {
      assert.equal(crear('div', { position: 'relative' }).style.position, 'relative');
    });

    test('atributos: "texto" es textContent, "html" es innerHTML y el resto, setAttribute', () => {
      const el = crear('div', {}, null, { texto: 'Hola <b>', html: '<i>x</i>', 'data-id': 7, alt: 'logo' });
      assert.equal(el.textContent, 'Hola <b>');
      assert.equal(el.innerHTML, '<i>x</i>');
      assert.deepEqual(el.atributos, { 'data-id': '7', alt: 'logo' });
    });
  });

  describe('aplicar', () => {
    test('escribe el transform de transformar() y la opacidad redondeada', () => {
      const el = document.createElement('div');
      aplicar(el, { x: 10, y: -5, escala: 2, rot: 45, opacidad: 0.123456 });
      assert.equal(el.style.transform, transformar({ x: 10, y: -5, escala: 2, rot: 45 }));
      assert.equal(el.style.opacity, '0.1235');
    });

    test('sin opacidad no la toca; sin nada, deja el elemento en su sitio', () => {
      const el = document.createElement('div');
      el.style.opacity = '0.3';
      aplicar(el, { x: 1 });
      assert.equal(el.style.opacity, '0.3');
      aplicar(el);
      assert.equal(el.style.transform, 'translate(0px, 0px) rotate(0deg) scale(1, 1)');
    });

    test('opacidad 0 sí se escribe (no se confunde con "sin opacidad")', () => {
      const el = document.createElement('div');
      aplicar(el, { opacidad: 0 });
      assert.equal(el.style.opacity, '0');
    });
  });

  describe('palabrasEnMascara y subirDesdeMascara', () => {
    test('una línea sin saltos con una máscara por palabra y un espacio entre ellas', () => {
      const padre = document.createElement('div');
      const spans = palabrasEnMascara(padre, '  Cobra   en\tsegundos ', { left: '96px', font: '700 64px x' });
      assert.equal(padre.children.length, 1);
      const [linea] = padre.children;
      assert.deepEqual(linea.style, { position: 'absolute', whiteSpace: 'nowrap', left: '96px', font: '700 64px x' });
      // máscara, espacio, máscara, espacio, máscara
      assert.deepEqual(
        linea.children.map((n) => (n.nodeType === 3 ? `"${n.textContent}"` : n.tagName)),
        ['SPAN', '" "', 'SPAN', '" "', 'SPAN'],
      );
      assert.deepEqual(
        spans.map((s) => s.textContent),
        ['Cobra', 'en', 'segundos'],
      );
      const mascaras = linea.children.filter((n) => n.nodeType !== 3);
      spans.forEach((s, i) => {
        assert.equal(s.parentNode, mascaras[i], 'devuelve el span interior de cada máscara');
        assert.equal(s.style.display, 'inline-block');
      });
    });

    test('la máscara recorta lo que sale de ella y su hueco para descendentes no mueve la línea', () => {
      const [s] = palabrasEnMascara(document.createElement('div'), 'gpy');
      const m = s.parentNode.style;
      assert.deepEqual([m.display, m.overflow, m.verticalAlign], ['inline-block', 'hidden', 'bottom']);
      // El hueco de abajo (padding) se compensa con un margen negativo igual: la línea no crece.
      assert.ok(m.paddingBottom && numeros(m.paddingBottom)[0] > 0, `paddingBottom ${m.paddingBottom}`);
      assert.deepEqual(
        numeros(m.marginBottom),
        numeros(m.paddingBottom).map((v) => -v),
      );
    });

    test('las palabras empiezan escondidas: tan abajo como subirDesdeMascara(span, 0)', () => {
      const [s] = palabrasEnMascara(document.createElement('div'), 'Hola');
      const inicial = s.style.transform;
      assert.ok(numeros(inicial)[0] >= 100, `empieza a ${inicial}: tiene que bajar al menos su alto`);
      subirDesdeMascara(s, 0);
      assert.deepEqual(numeros(s.style.transform), numeros(inicial));
    });

    test('acentos: la clase solo en las palabras pedidas, y sin claseAcento ninguna', () => {
      const opciones = { claseAcento: 'acento', acentos: [0, 2] };
      const conClase = palabrasEnMascara(document.createElement('div'), 'Cobra en segundos', {}, opciones);
      assert.deepEqual(
        conClase.map((s) => s.className ?? ''),
        ['acento', '', 'acento'],
      );
      const sinClase = palabrasEnMascara(document.createElement('div'), 'Cobra en segundos', {}, { acentos: [1] });
      assert.deepEqual(
        sinClase.map((s) => s.className ?? ''),
        ['', '', ''],
      );
    });

    test('una sola palabra no lleva espacios, y un texto vacío no crea palabras', () => {
      const padre = document.createElement('div');
      assert.equal(palabrasEnMascara(padre, 'Hola').length, 1);
      assert.equal(padre.children[0].children.length, 1);
      assert.deepEqual(palabrasEnMascara(padre, '   '), []);
      assert.equal(padre.children[1].children.length, 0);
    });

    test('subirDesdeMascara: p = 1 en su sitio, lineal entre medias, con rebote por encima y redondeado', () => {
      const s = document.createElement('span');
      subirDesdeMascara(s, 0);
      const abajo = numeros(s.style.transform);
      subirDesdeMascara(s, 1);
      assert.ok(
        numeros(s.style.transform).every((v) => v === 0),
        `en p = 1 debería estar en su sitio: ${s.style.transform}`,
      );
      assert.ok(!s.style.transform.includes('-0'), `sin "-0" en el CSS: ${s.style.transform}`);
      subirDesdeMascara(s, 0.5);
      numeros(s.style.transform).forEach((v, i) => cerca(v, abajo[i] / 2, 1e-9));
      subirDesdeMascara(s, 1.05); // un muelle que se pasa un poco: la palabra sube algo más que su sitio
      assert.ok(numeros(s.style.transform)[0] < 0, s.style.transform);
      subirDesdeMascara(s, 1 / 3);
      assert.ok(
        numeros(s.style.transform).every((v) => Math.round(v * 1e4) / 1e4 === v),
        `más de 4 decimales: ${s.style.transform}`,
      );
    });
  });

  describe('holgura de la máscara', () => {
    test('por defecto 0.35 em arriba y abajo; una escena puede pedir menos (y la palabra baja menos)', () => {
      const [normal] = palabrasEnMascara(document.createElement('div'), 'Hola');
      const [justa] = palabrasEnMascara(document.createElement('div'), '32,4', {}, { holgura: 0.12 });
      const m = normal.parentNode.style;
      assert.deepEqual(
        [m.paddingTop, m.marginTop, m.paddingBottom, m.marginBottom],
        ['0.35em', '-0.35em', '0.35em', '-0.35em'],
      );
      const j = justa.parentNode.style;
      assert.deepEqual([j.paddingBottom, j.marginBottom], ['0.12em', '-0.12em']);
      // Escondida: su alto + dos holguras + 0.05 em.
      assert.deepEqual(numeros(normal.style.transform), [100, 0.75]);
      assert.deepEqual(numeros(justa.style.transform), [100, 0.29]);
      subirDesdeMascara(justa, 0.5);
      assert.deepEqual(numeros(justa.style.transform), [50, 0.145]);
    });
  });

  describe('cursor', () => {
    test('crearCursor: flecha SVG de 44 px, con la punta en su origen y por encima de todo', () => {
      const padre = document.createElement('div');
      const c = crearCursor(padre);
      assert.deepEqual(padre.children, [c]);
      assert.deepEqual(
        [c.style.position, c.style.left, c.style.top, c.style.width, c.style.height],
        ['absolute', '0', '0', '44px', '44px'],
      );
      assert.equal(c.style.transformOrigin, '0 0', 'al encoger o escalar, la punta no se mueve');
      assert.equal(c.style.zIndex, '1000');
      assert.match(c.innerHTML, /^<svg [^>]*viewBox="0 0 24 24"[^>]*>.*<path d="M4 2\.5 /);
      assert.match(c.style.filter, /^drop-shadow\(/);
    });

    test('crearCursor con otro tamaño', () => {
      const c = crearCursor(document.createElement('div'), { tam: 60 });
      assert.deepEqual([c.style.width, c.style.height], ['60px', '60px']);
    });

    test('colocarCursor: mueve la punta a (x, y), opacidad 1 por defecto, y pulsado lo encoge hasta 0.86', () => {
      const c = crearCursor(document.createElement('div'));
      colocarCursor(c, 100, 200);
      assert.equal(c.style.transform, transformar({ x: 100, y: 200 }));
      assert.equal(c.style.opacity, '1');
      colocarCursor(c, 100, 200, { pulsado: 1, escala: 2, opacidad: 0.5 });
      assert.equal(c.style.transform, transformar({ x: 100, y: 200, escala: 1.72 }));
      assert.equal(c.style.opacity, '0.5');
      colocarCursor(c, 0, 0, { pulsado: pulsoClic(1.04, 1) }); // a medio clic: entre 0.86 y 1
      const [, , , escala] = numeros(c.style.transform);
      assert.ok(escala > 0.86 && escala < 1, `escala a medio clic: ${escala}`);
    });
  });

  describe('camara', () => {
    test('fija el origen en la esquina y escribe el transform de transformCamara()', () => {
      const mundo = document.createElement('div');
      const ctx = { W: 1080, H: 1920 };
      camara(mundo, { x: 300, y: 200, zoom: 2 }, ctx);
      assert.equal(mundo.style.transformOrigin, '0 0');
      assert.equal(mundo.style.transform, transformCamara({ x: 300, y: 200, zoom: 2 }, ctx));
      camara(mundo, { x: 540, y: 960 }, ctx); // zoom 1 por defecto
      assert.equal(mundo.style.transform, 'translate(540px, 960px) scale(1) translate(-540px, -960px)');
    });
  });
});
