// Tests de tools/capturar.mjs sin red ni navegador: opciones de la línea de comandos, URLs y rutas de Windows,
// selectores de --ocultar, la lista de capturas (--lista) y la cabecera PNG.
// Las capturas de verdad, con Chromium, están en tests/integracion/captura.test.mjs.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PREDETERMINADAS,
  aNumero,
  aURL,
  construirTrabajos,
  cssOcultar,
  explicarErrorCarga,
  leerLista,
  leerOpciones,
  nombreDesdeURL,
  normalizarOpciones,
  rutaPNG,
  separarSelectores,
  tamanoPNG,
  traducirErrorArgs,
} from '../../tools/capturar.mjs';
import { borrar, carpetaTemporal } from '../helpers/entorno.mjs';

const enWindows = process.platform === 'win32';
const nunca = () => false;
const siempre = () => true;

/** Cabecera PNG mínima (firma + IHDR) con el tamaño dado: basta para tamanoPNG. */
function cabeceraPNG(ancho, alto) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(ancho, 16);
  b.writeUInt32BE(alto, 20);
  b.set([8, 6, 0, 0, 0], 24);
  return b;
}

describe('PREDETERMINADAS', () => {
  test('son las del uso documentado y no se pueden modificar por accidente', () => {
    assert.equal(PREDETERMINADAS.ancho, 1440);
    assert.equal(PREDETERMINADAS.alto, 900);
    assert.equal(PREDETERMINADAS.escala, 2);
    assert.equal(PREDETERMINADAS.completa, false);
    assert.equal(PREDETERMINADAS.transparente, false);
    assert.equal(PREDETERMINADAS.oscuro, false);
    assert.equal(PREDETERMINADAS.esperar, 0);
    assert.deepEqual(PREDETERMINADAS.ocultar, []);
    assert.ok(Object.isFrozen(PREDETERMINADAS));
  });
});

describe('aNumero', () => {
  test('acepta la coma decimal española y los espacios', () => {
    assert.equal(aNumero('1,5'), 1.5);
    assert.equal(aNumero(' 2 '), 2);
    assert.equal(aNumero('0.25'), 0.25);
    assert.equal(aNumero(3), 3);
  });

  test('vacío o texto no son números', () => {
    assert.ok(Number.isNaN(aNumero('')));
    assert.ok(Number.isNaN(aNumero('   ')));
    assert.ok(Number.isNaN(aNumero(undefined)));
    assert.ok(Number.isNaN(aNumero('abc')));
  });
});

describe('traducirErrorArgs', () => {
  test('opción desconocida', () => {
    const e = { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION', message: "Unknown option '--foo'. To specify a positional…" };
    assert.equal(traducirErrorArgs(e), 'Opción desconocida: --foo.');
  });

  test('falta el valor: se queda con el nombre largo aunque haya alias corto', () => {
    const e = {
      code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
      message: "Option '-o, --salida <value>' argument missing",
    };
    assert.equal(traducirErrorArgs(e), 'Falta el valor de --salida.');
  });

  test('un interruptor no lleva valor', () => {
    const e = { code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE', message: "Option '--completa' does not take an argument" };
    assert.equal(traducirErrorArgs(e), '--completa no lleva valor.');
  });

  test('detrás venía algo que empieza por "-": falta el valor o hay que pegarlo con =', () => {
    const e = {
      code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
      message: "Option '--ancho' argument is ambiguous.\nDid you forget to specify the option argument for '--ancho'?",
    };
    assert.equal(
      traducirErrorArgs(e),
      'Falta el valor de --ancho (si empieza por "-", escríbelo pegado: --ancho=<valor>).',
    );
  });

  test('con el error de leerArgs usa el original de parseArgs, que guarda en cause', () => {
    const original = {
      code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
      message: "Option '--completa' does not take an argument",
    };
    const envuelto = Object.assign(new Error('Falta el valor de --completa o empieza por "-"…', { cause: original }), {
      code: original.code,
    });
    assert.equal(traducirErrorArgs(envuelto), '--completa no lleva valor.');
  });

  test('otro error se deja tal cual (si viene de leerArgs, con su traducción)', () => {
    assert.equal(traducirErrorArgs(new Error('otra cosa')), 'otra cosa');
    const posicional = new Error('Argumento inesperado: "x". Usa --ayuda para ver el uso.', {
      cause: { code: 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL', message: "Unexpected argument 'x'" },
    });
    assert.equal(traducirErrorArgs(posicional), 'Argumento inesperado: "x". Usa --ayuda para ver el uso.');
  });
});

describe('leerOpciones', () => {
  test('--ayuda y -h', () => {
    assert.deepEqual(leerOpciones(['--ayuda']), { ayuda: true });
    assert.deepEqual(leerOpciones(['-h']), { ayuda: true });
  });

  test('sin opciones solo hay entrada: los valores por defecto se ponen al construir los trabajos', () => {
    assert.deepEqual(leerOpciones(['https://example.com']), {
      entrada: 'https://example.com',
      lista: null,
      opciones: {},
    });
  });

  test('todas las opciones, convertidas y validadas', () => {
    const op = leerOpciones([
      'http://localhost:3000',
      ...['--salida', 'kit/capturas/inicio.png', '--ancho', '1280', '--alto', '720', '--escala', '1,5'],
      ...['--completa', '--selector', '#app', '--transparente', '--esperar', '500', '--esperar-a', '.listo'],
      ...['--oscuro', '--ocultar', '#cookies, .chat', '--ocultar', '#intercom', '--idioma', 'en-US'],
    ]);
    assert.deepEqual(op, {
      entrada: 'http://localhost:3000',
      lista: null,
      opciones: {
        salida: 'kit/capturas/inicio.png',
        ancho: 1280,
        alto: 720,
        escala: 1.5,
        completa: true,
        selector: '#app',
        transparente: true,
        esperar: 500,
        esperarA: '.listo',
        oscuro: true,
        ocultar: ['#cookies', '.chat', '#intercom'],
        idioma: 'en-US',
      },
    });
  });

  test('-o es el alias de --salida', () => {
    assert.equal(leerOpciones(['x.html', '-o', 'a.png']).opciones.salida, 'a.png');
  });

  test('--lista no admite una URL suelta', () => {
    assert.deepEqual(leerOpciones(['--lista', 'trabajos.json', '--escala', '1']), {
      entrada: null,
      lista: 'trabajos.json',
      opciones: { escala: 1 },
    });
    assert.throws(() => leerOpciones(['https://example.com', '--lista', 'x.json']), /Con --lista, las URL van dentro/);
  });

  test('errores de la línea de comandos, en castellano', () => {
    assert.throws(() => leerOpciones(['--foo']), /Opción desconocida: --foo\. Usa --ayuda/);
    assert.throws(() => leerOpciones(['x.html', '--salida']), /Falta el valor de --salida\. Usa --ayuda/);
    // Con el alias corto también se nombra la opción larga, que es la que sale en la ayuda.
    assert.throws(() => leerOpciones(['x.html', '-o']), /Falta el valor de --salida\./);
    assert.throws(() => leerOpciones(['x.html', '--completa=si']), /--completa no lleva valor/);
    assert.throws(() => leerOpciones(['x.html', '--ancho', '-5']), /Falta el valor de --ancho .*--ancho=<valor>/);
    assert.throws(() => leerOpciones(['x.html', '--salida', '--completa']), /Falta el valor de --salida/);
    assert.throws(() => leerOpciones(['a.html', 'b.html']), /Sobran argumentos: b\.html\. Si una ruta lleva espacios/);
  });

  test('el error conserva la cadena de causas hasta el de parseArgs', () => {
    try {
      leerOpciones(['--foo']);
      assert.fail('debería lanzar');
    } catch (e) {
      assert.equal(e.cause?.code, 'ERR_PARSE_ARGS_UNKNOWN_OPTION', 'error de leerArgs');
      assert.equal(e.cause?.cause?.code, 'ERR_PARSE_ARGS_UNKNOWN_OPTION', 'error original de parseArgs');
    }
  });

  test('números fuera de rango o mal escritos', () => {
    assert.throws(() => leerOpciones(['x', '--ancho', '0']), /--ancho debe ser un entero entre 16 y 7680/);
    assert.throws(() => leerOpciones(['x', '--alto', '12.5']), /--alto debe ser un entero/);
    assert.throws(() => leerOpciones(['x', '--escala', '9']), /--escala debe ser un número entre 0\.25 y 4/);
    assert.throws(() => leerOpciones(['x', '--esperar=-1']), /--esperar debe ser un entero entre 0/);
    assert.throws(() => leerOpciones(['x', '--ancho', 'ancho']), /pone "ancho"/);
    assert.throws(() => leerOpciones(['x', '--idioma', 'español']), /--idioma debe ser un código como es-ES/);
  });
});

describe('normalizarOpciones (entradas de --lista)', () => {
  test('acepta números o textos, esperar-a o esperarA, y salta los comentarios con _', () => {
    const r = normalizarOpciones({
      ancho: 1280,
      escala: '2',
      completa: true,
      'esperar-a': '#app',
      ocultar: ['#a', '.b, .c'],
      _nota: 'pantalla de cobro',
    });
    assert.deepEqual(r, { ancho: 1280, escala: 2, completa: true, esperarA: '#app', ocultar: ['#a', '.b', '.c'] });
    assert.deepEqual(normalizarOpciones({ esperarA: ' .listo ' }), { esperarA: '.listo' });
  });

  test('una clave desconocida es un error que dice dónde está', () => {
    assert.throws(
      () => normalizarOpciones({ selectr: '#x' }, 'la captura 2 de la lista'),
      /Opción desconocida en la captura 2 de la lista: "selectr"/,
    );
  });

  test('tipos equivocados', () => {
    assert.throws(() => normalizarOpciones({ oscuro: 'true' }), /--oscuro es true o false/);
    assert.throws(() => normalizarOpciones({ selector: '' }), /--selector necesita un texto/);
    assert.throws(() => normalizarOpciones({ salida: 3 }), /--salida necesita un texto/);
    assert.throws(() => normalizarOpciones({ ocultar: '.a { color: red }' }), /Selector no válido en --ocultar/);
  });
});

describe('separarSelectores', () => {
  test('separa por las comas de primer nivel', () => {
    assert.deepEqual(separarSelectores('#a, .b'), ['#a', '.b']);
    assert.deepEqual(separarSelectores('#cookies'), ['#cookies']);
  });

  test('respeta las comas dentro de paréntesis, corchetes, comillas y escapes', () => {
    assert.deepEqual(separarSelectores(':is(.a, .b) > p, #c'), [':is(.a, .b) > p', '#c']);
    assert.deepEqual(separarSelectores('[title="a,b"], .x'), ['[title="a,b"]', '.x']);
    assert.deepEqual(separarSelectores("[data-x='1,2'],.y"), ["[data-x='1,2']", '.y']);
    assert.deepEqual(separarSelectores('.a\\,b, .c'), ['.a\\,b', '.c']);
  });

  test('ignora los huecos vacíos', () => {
    assert.deepEqual(separarSelectores(' , ,#x , '), ['#x']);
    assert.deepEqual(separarSelectores(''), []);
  });
});

describe('cssOcultar', () => {
  test('una regla por selector, para que uno inválido no anule los demás', () => {
    assert.equal(
      cssOcultar(['#a', '.b']),
      '#a { visibility: hidden !important; }\n.b { visibility: hidden !important; }',
    );
    assert.equal(cssOcultar('#a, .b'), cssOcultar(['#a', '.b']));
  });

  test('sin selectores no hay CSS', () => {
    assert.equal(cssOcultar([]), '');
    assert.equal(cssOcultar(null), '');
  });
});

describe('aURL', () => {
  let tmp;
  let html;
  before(() => {
    tmp = carpetaTemporal('capturar-url ñ');
    fs.mkdirSync(path.join(tmp, 'carpeta con espacios'));
    html = path.join(tmp, 'carpeta con espacios', 'página de inicio.html');
    fs.writeFileSync(html, '<!doctype html><p>hola</p>');
  });
  after(() => borrar(tmp));

  test('las URL http(s) se normalizan', () => {
    assert.equal(aURL('https://example.com'), 'https://example.com/');
    assert.equal(aURL('HTTP://LOCALHOST:3000/ventas'), 'http://localhost:3000/ventas');
    assert.equal(aURL('  https://example.com/a?b=1  '), 'https://example.com/a?b=1');
  });

  test('localhost y 127.0.0.1 sin http:// son la app en desarrollo', () => {
    assert.equal(aURL('localhost:3000'), 'http://localhost:3000/');
    assert.equal(aURL('localhost:3000/ventas/nueva'), 'http://localhost:3000/ventas/nueva');
    assert.equal(aURL('127.0.0.1:5173/app?x=1', { existe: nunca }), 'http://127.0.0.1:5173/app?x=1');
  });

  test('un archivo local pasa a file:// con espacios y tildes codificados', () => {
    const url = aURL(html);
    assert.equal(url, pathToFileURL(html).href);
    assert.match(url, /^file:\/\//);
    assert.match(url, /carpeta%20con%20espacios\/p%C3%A1gina%20de%20inicio\.html$/);
  });

  test('una ruta relativa se resuelve desde la base', () => {
    assert.equal(aURL('carpeta con espacios/página de inicio.html', { base: tmp }), pathToFileURL(html).href);
  });

  test('rutas de Windows con unidad y barras invertidas', { skip: !enWindows && 'solo en Windows' }, () => {
    assert.equal(aURL('C:\\Mis Vídeos\\app.html', { existe: siempre }), 'file:///C:/Mis%20V%C3%ADdeos/app.html');
    // Una unidad no es un esquema de URL ni un dominio: si no existe, se dice.
    assert.throws(() => aURL('C:\\no\\existe.html', { existe: nunca }), /No existe el archivo C:\\no\\existe\.html/);
  });

  test('un dominio suelto se abre por https', () => {
    assert.equal(aURL('mi-producto.com/precios', { existe: nunca }), 'https://mi-producto.com/precios');
    assert.equal(aURL('www.example.com', { existe: nunca }), 'https://www.example.com/');
  });

  test('un .html que no existe no se confunde con un dominio', () => {
    assert.throws(
      () => aURL('index.html', { base: tmp }),
      /No existe el archivo .*index\.html.*pon http:\/\/ o https:\/\//,
    );
    assert.throws(() => aURL('./falta.html', { base: tmp }), /No existe el archivo/);
  });

  test('vacío o URL rota', () => {
    assert.throws(() => aURL(''), /Falta la URL o el archivo HTML/);
    assert.throws(() => aURL('https://'), /no es una URL válida/);
  });

  test('file:// y data: se dejan pasar', () => {
    assert.equal(aURL('file:///D:/a%20b/x.html'), 'file:///D:/a%20b/x.html');
    assert.equal(aURL('data:text/html,<p>hola</p>'), 'data:text/html,<p>hola</p>');
  });
});

describe('nombreDesdeURL', () => {
  test('host, puerto y ruta, sin caracteres raros', () => {
    assert.equal(nombreDesdeURL('http://localhost:3000/ventas/nueva'), 'localhost-3000-ventas-nueva');
    assert.equal(nombreDesdeURL('https://example.com/'), 'example-com');
  });

  test('archivo local: su nombre sin extensión ni tildes', () => {
    const url = pathToFileURL(path.resolve('página de inicio.html')).href;
    assert.equal(nombreDesdeURL(url), 'pagina-de-inicio');
  });

  test('otros esquemas: "captura"', () => {
    assert.equal(nombreDesdeURL('data:text/html,hola'), 'captura');
  });
});

describe('rutaPNG', () => {
  const base = path.resolve('base de prueba');
  const url = 'https://example.com/';

  test('respeta un .png y añade la extensión si falta', () => {
    assert.equal(rutaPNG('captura.png', url, { base, esCarpeta: nunca }), path.join(base, 'captura.png'));
    assert.equal(rutaPNG('CAPTURA.PNG', url, { base, esCarpeta: nunca }), path.join(base, 'CAPTURA.PNG'));
    assert.equal(rutaPNG('inicio', url, { base, esCarpeta: nunca }), path.join(base, 'inicio.png'));
    assert.equal(rutaPNG('pantalla.v2', url, { base, esCarpeta: nunca }), path.join(base, 'pantalla.v2.png'));
  });

  test('una carpeta (acaba en barra o ya existe) recibe el nombre de la URL', () => {
    assert.equal(
      rutaPNG('kit/capturas/', url, { base, esCarpeta: nunca }),
      path.join(base, 'kit', 'capturas', 'example-com.png'),
    );
    assert.equal(rutaPNG('kit\\capturas\\', url, { base, esCarpeta: nunca }).endsWith('example-com.png'), true);
    assert.equal(rutaPNG('kit', url, { base, esCarpeta: siempre }), path.join(base, 'kit', 'example-com.png'));
  });

  test('otro formato de imagen es un error: las capturas van sin pérdida', () => {
    assert.throws(() => rutaPNG('foto.jpg', url, { base, esCarpeta: nunca }), /se guardan en PNG.*"foto\.jpg"/);
    assert.throws(() => rutaPNG('foto.webp', url, { base, esCarpeta: nunca }), /PNG/);
  });
});

describe('construirTrabajos', () => {
  const cwd = path.resolve('cwd de prueba');
  const base = path.join(cwd, 'kit', 'capturas');

  test('una captura suelta lleva los valores por defecto y rutas absolutas', () => {
    const op = leerOpciones(['https://example.com', '--salida', 'salida/x.png', '--ancho', '800']);
    const [t, ...resto] = construirTrabajos(op, { cwd, esCarpeta: nunca });
    assert.equal(resto.length, 0);
    assert.deepEqual(t, {
      ...PREDETERMINADAS,
      ancho: 800,
      url: 'https://example.com/',
      salida: path.join(cwd, 'salida', 'x.png'),
      ocultar: [],
    });
  });

  test('falta la URL o la salida', () => {
    assert.throws(() => construirTrabajos(leerOpciones(['--salida', 'x.png'])), /Falta qué capturar/);
    assert.throws(
      () => construirTrabajos(leerOpciones(['https://example.com']), { cwd, esCarpeta: nunca }),
      /Falta la salida de la captura \(--salida captura\.png\)/,
    );
  });

  test('--lista: rutas del JSON relativas al JSON; las de la línea de comandos, al directorio actual', () => {
    const op = leerOpciones([
      '--lista',
      'kit/capturas/trabajos.json',
      '--salida',
      'capturas/',
      '--escala',
      '1',
      '--ocultar',
      '#cookies',
    ]);
    const lista = [
      { url: 'pantalla.html', salida: 'cobro.png', oscuro: true, _nota: 'pantalla de cobro' },
      { url: 'https://example.com', ocultar: '.chat', escala: 2 },
    ];
    const [a, b] = construirTrabajos(op, { lista, base, cwd, existe: siempre, esCarpeta: nunca });
    assert.equal(a.url, pathToFileURL(path.join(base, 'pantalla.html')).href);
    assert.equal(a.salida, path.join(base, 'cobro.png'));
    assert.equal(a.oscuro, true);
    assert.equal(a.escala, 1);
    assert.deepEqual(a.ocultar, ['#cookies']);
    assert.equal(b.salida, path.join(cwd, 'capturas', 'example-com.png'));
    assert.equal(b.escala, 2);
    assert.deepEqual(b.ocultar, ['#cookies', '.chat']);
    assert.equal(b.ancho, PREDETERMINADAS.ancho);
  });

  test('--lista mal formada', () => {
    const op = leerOpciones(['--lista', 'x.json']);
    const con = (lista) => () => construirTrabajos(op, { lista, base, cwd, existe: siempre, esCarpeta: nunca });
    assert.throws(con({ url: 'x' }), /debe ser un array JSON con al menos una captura/);
    assert.throws(con([]), /debe ser un array JSON/);
    assert.throws(con(['https://example.com']), /La captura 1 de la lista no es un objeto/);
    assert.throws(con([{ salida: 'a.png' }]), /Falta "url" en la captura 1 de la lista/);
    assert.throws(con([{ url: 'https://example.com' }]), /Falta la salida de la captura 1 de la lista/);
    assert.throws(
      con([{ url: 'https://example.com', salida: 'a.png', zoom: 2 }]),
      /Opción desconocida en la captura 1/,
    );
  });

  test('dos capturas al mismo archivo es un error (en Windows sin distinguir mayúsculas)', () => {
    const op = leerOpciones(['--lista', 'x.json']);
    const lista = [
      { url: 'https://example.com', salida: 'a.png' },
      { url: 'https://example.com', salida: enWindows ? 'A.png' : 'a.png', oscuro: true },
    ];
    assert.throws(
      () => construirTrabajos(op, { lista, base, cwd, existe: siempre, esCarpeta: nunca }),
      /Varias capturas irían al mismo archivo/,
    );
  });
});

describe('leerLista', () => {
  let tmp;
  before(() => {
    tmp = carpetaTemporal('capturar-lista');
  });
  after(() => borrar(tmp));

  test('lee el JSON (también con el BOM que deja PowerShell) y devuelve su carpeta como base', () => {
    const ruta = path.join(tmp, 'trabajos.json');
    fs.writeFileSync(ruta, '\uFEFF[{ "url": "https://example.com", "salida": "a.png" }]');
    assert.deepEqual(leerLista(ruta), { lista: [{ url: 'https://example.com', salida: 'a.png' }], base: tmp });
  });

  test('JSON roto o archivo que no existe', () => {
    const ruta = path.join(tmp, 'roto.json');
    fs.writeFileSync(ruta, '[{ "url": ');
    assert.throws(() => leerLista(ruta), /no es JSON válido/);
    assert.throws(() => leerLista(path.join(tmp, 'no-existe.json')), /No puedo leer la lista/);
  });
});

describe('tamanoPNG', () => {
  test('lee ancho y alto de la cabecera', () => {
    assert.deepEqual(tamanoPNG(cabeceraPNG(2880, 1800)), { ancho: 2880, alto: 1800 });
    assert.deepEqual(tamanoPNG(cabeceraPNG(1, 1)), { ancho: 1, alto: 1 });
  });

  test('lo que no es un PNG es un error', () => {
    assert.throws(() => tamanoPNG(Buffer.from('no soy un png, soy texto plano')), /No es un PNG válido/);
    assert.throws(() => tamanoPNG(cabeceraPNG(10, 10).subarray(0, 20)), /No es un PNG válido/);
    assert.throws(() => tamanoPNG(null), /No es un PNG válido/);
  });
});

describe('explicarErrorCarga', () => {
  const url = 'http://localhost:3000/';
  const err = (message, name = 'Error') => Object.assign(new Error(message), { name });

  test('traduce los errores de red de Chromium', () => {
    assert.match(explicarErrorCarga(err('page.goto: net::ERR_CONNECTION_REFUSED at …'), url), /¿está arrancada la app/);
    assert.match(explicarErrorCarga(err('net::ERR_NAME_NOT_RESOLVED'), url), /No encuentro el dominio/);
    assert.match(explicarErrorCarga(err('net::ERR_INTERNET_DISCONNECTED'), url), /Se cortó la conexión/);
    assert.match(
      explicarErrorCarga(err('net::ERR_FILE_NOT_FOUND'), 'file:///x.html'),
      /No existe el archivo file:\/\/\/x\.html/,
    );
  });

  test('tiempo agotado', () => {
    assert.match(explicarErrorCarga(err('Timeout 60000ms exceeded.', 'TimeoutError'), url), /no respondió en 60 s/);
  });

  test('cualquier otro error: solo su primera línea (Playwright añade un registro largo)', () => {
    const texto = explicarErrorCarga(err('algo raro\n=== logs ===\nmucho ruido'), url);
    assert.equal(texto, `No pude abrir ${url}: algo raro`);
  });
});
