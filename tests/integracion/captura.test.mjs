// Integración de tools/capturar.mjs (Chromium de verdad) y tools/referencia.mjs (ffmpeg de verdad), en carpetas
// temporales con espacios y tildes que se borran al terminar. No depende de internet: las páginas son HTML locales
// o un servidor HTTP local (que hace de app en desarrollo y de api.fxtwitter.com), y los vídeos son smoke.mp4 y
// otros sintéticos con un contenido conocido en cada instante. Si falta Chromium o ffmpeg, se salta con el motivo.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { capturarUno, construirTrabajos, leerOpciones } from '../../tools/capturar.mjs';
import { planHoja, prepararReferencia } from '../../tools/referencia.mjs';
import { ejecutar, ffmpeg, info, resolverBinario } from '../../tools/lib/ffmpeg.mjs';
import {
  ESTUDIO,
  borrar,
  carpetaTemporal,
  cerca,
  ejecutarNode,
  motivoSinChromium,
  motivoSinFfmpeg,
} from '../helpers/entorno.mjs';
import { colorEn, hexARgb, leerPNG, parecido } from '../helpers/png.mjs';

const sinChromium = await motivoSinChromium();
const sinFfmpeg = motivoSinFfmpeg();
const SMOKE = path.join(ESTUDIO, 'smoke', 'salida', 'smoke.mp4');

const FONDO = hexARgb('#F7F8F6');
const PANEL = hexARgb('#D0D4DA');
const VERDE = hexARgb('#0B8F63');
const ROJO = hexARgb('#FF0000');
const AZUL = hexARgb('#0000FF');
const OSCURO = hexARgb('#101010');

/** Opacidad (0–255) del píxel (x, y); 255 si el PNG no tiene canal alfa. */
function alfaEn(img, x, y) {
  const conAlfa = img.canales === 2 || img.canales === 4;
  return conAlfa ? img.datos[(y * img.ancho + x) * img.canales + img.canales - 1] : 255;
}

/** Servidor HTTP en un puerto libre de 127.0.0.1, como el del estudio (así Windows no pregunta por el cortafuegos). */
async function servidorLocal(responder) {
  const peticiones = [];
  const servidor = http.createServer((req, res) => {
    peticiones.push(req.url);
    responder(req, res);
  });
  await new Promise((ok, mal) => servidor.once('error', mal).listen(0, '127.0.0.1', ok));
  const { port } = servidor.address();
  return {
    url: `http://127.0.0.1:${port}`,
    puerto: port,
    peticiones,
    // Chromium y fetch dejan conexiones abiertas (keep-alive): sin cortarlas, close() no terminaría nunca.
    cerrar: () =>
      new Promise((ok) => {
        servidor.close(() => ok());
        servidor.closeAllConnections();
      }),
  };
}

/** Un puerto de 127.0.0.1 en el que no escucha nadie: una app «apagada». */
async function puertoCerrado() {
  const s = await servidorLocal(() => {});
  await s.cerrar();
  return s.puerto;
}

/** Tamaño de la hoja de contactos de un plan de planHoja: tile con 4 px de separación y de margen. */
const tamHoja = (p, altoMiniatura) => [
  p.columnas * p.anchoMiniatura + (p.columnas - 1) * 4 + 2 * 4,
  p.filas * altoMiniatura + (p.filas - 1) * 4 + 2 * 4,
];

const leerImagen = (ruta) => leerPNG(fs.readFileSync(ruta));
const fotogramasDe = (dir) => fs.readdirSync(path.join(dir, 'fotogramas')).sort();
const nombres = (n) => Array.from({ length: n }, (_, i) => `f_${String(i + 1).padStart(4, '0')}.png`);

// Página con colores conocidos en sitios conocidos (px CSS): fondo en (20, 20), panel gris en (110, 110),
// tarjeta verde de 200 x 100 con esquinas redondeadas centrada en (250, 200) y banner de cookies abajo.
const PAGINA = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Prueba de captura</title><style>
  html, body { margin: 0; background: #f7f8f6; }
  #panel { position: absolute; left: 100px; top: 100px; width: 400px; height: 300px; background: #d0d4da; }
  #tarjeta { position: absolute; left: 50px; top: 50px; width: 200px; height: 100px;
             border-radius: 24px; background: #0b8f63; }
  #cookies { position: fixed; left: 0; right: 0; bottom: 0; height: 80px; background: #ff0000; }
  @media (prefers-color-scheme: dark) { html, body { background: #101010; } }
</style></head><body>
  <div id="panel"><div id="tarjeta"></div></div>
  <div id="cookies"></div>
</body></html>`;

// 2000 px de alto; el bloque del final solo se pone verde cuando entra en la ventana, como las imágenes
// perezosas o las animaciones que arrancan al hacer scroll.
const LARGA = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #f7f8f6; }
  #final { position: absolute; left: 0; top: 1900px; width: 100%; height: 100px; background: #d0d4da; }
  #final.visto { background: #0b8f63; }
</style></head><body><div id="final"></div><script>
  const final = document.getElementById('final');
  new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && final.classList.add('visto')).observe(final);
</script></body></html>`;

// Pinta su contenido 1,5 s después de cargar, cuando la red ya se ha calmado: como una app que espera a su API.
const TARDE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #f7f8f6; }
  #listo { position: absolute; left: 0; top: 0; width: 100px; height: 100px; background: #0b8f63; }
</style></head><body><script>
  setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<div id="listo"></div>'), 1500);
</script></body></html>`;

describe('capturar.mjs con Chromium', { skip: sinChromium || false, timeout: 300_000 }, () => {
  let tmp;
  let navegador;
  let pagina;
  let larga;
  let tarde;

  /** Captura como desde la línea de comandos (mismas opciones y valores por defecto) con un solo navegador. */
  async function capturar(entrada, args) {
    const [trabajo] = construirTrabajos(leerOpciones([entrada, ...args]), { cwd: tmp });
    const r = await capturarUno(navegador, trabajo);
    return { ...r, img: leerImagen(r.salida) };
  }

  before(async () => {
    tmp = carpetaTemporal('captura ñ');
    pagina = path.join(tmp, 'página de prueba.html');
    larga = path.join(tmp, 'página larga.html');
    tarde = path.join(tmp, 'página que tarda.html');
    fs.writeFileSync(pagina, PAGINA);
    fs.writeFileSync(larga, LARGA);
    fs.writeFileSync(tarde, TARDE);
    const { chromium } = await import('playwright');
    navegador = await chromium.launch();
  });

  after(async () => {
    await navegador?.close();
    borrar(tmp);
  });

  test('HTML local: PNG de ancho·escala x alto·escala con los colores reales de la página', async () => {
    const r = await capturar(pagina, ['--salida', 'Capturas ñ/entera.png', '--ancho', '800', '--alto', '600']);
    assert.equal(r.salida, path.join(tmp, 'Capturas ñ', 'entera.png'));
    // --escala 2 por defecto: el doble de píxeles para poder hacer zoom en el vídeo sin que se emborrone.
    assert.deepEqual([r.ancho, r.alto, r.img.ancho, r.img.alto], [1600, 1200, 1600, 1200]);
    assert.deepEqual(r.avisos, []);
    const en = (x, y) => colorEn(r.img, x * 2, y * 2);
    assert.ok(parecido(en(20, 20), FONDO, 2), `fondo ${en(20, 20)}`);
    assert.ok(parecido(en(110, 110), PANEL, 2), `panel ${en(110, 110)}`);
    assert.ok(parecido(en(250, 200), VERDE, 2), `tarjeta ${en(250, 200)}`);
    assert.ok(parecido(en(400, 560), ROJO, 2), `banner ${en(400, 560)}`);
  });

  test('--ocultar esconde el banner sin mover nada; un selector inválido no anula a los demás', async () => {
    const r = await capturar(pagina, [
      ...['--salida', 'Capturas ñ/sin banner', '--ancho', '800', '--alto', '600', '--escala', '1'],
      ...['--ocultar', '#cookies, :::esto-no-es-css'],
    ]);
    assert.equal(r.salida, path.join(tmp, 'Capturas ñ', 'sin banner.png'));
    assert.ok(parecido(colorEn(r.img, 400, 560), FONDO, 2), `donde estaba el banner: ${colorEn(r.img, 400, 560)}`);
    assert.ok(parecido(colorEn(r.img, 250, 200), VERDE, 2), 'la tarjeta sigue en su sitio');
  });

  test('--oscuro: la página se pinta con su tema oscuro', async () => {
    const r = await capturar(pagina, [
      ...['--salida', 'Capturas ñ/oscura.png', '--ancho', '800', '--alto', '600', '--escala', '1', '--oscuro'],
    ]);
    assert.ok(parecido(colorEn(r.img, 20, 20), OSCURO, 2), `fondo ${colorEn(r.img, 20, 20)}`);
  });

  test('--selector con --transparente: recorte del elemento con transparencia alrededor', async () => {
    const recorte = await capturar(pagina, [
      '--salida',
      'Capturas ñ/tarjeta.png',
      '--selector',
      '#tarjeta',
      '--transparente',
    ]);
    // 200 x 100 px CSS a escala 2.
    assert.deepEqual([recorte.ancho, recorte.alto, recorte.img.ancho, recorte.img.alto], [400, 200, 400, 200]);
    assert.equal(recorte.img.canales, 4, 'PNG con canal alfa');
    assert.equal(alfaEn(recorte.img, 1, 1), 0, 'la esquina redondeada es transparente, sin el gris del panel');
    assert.equal(alfaEn(recorte.img, 200, 100), 255);
    assert.ok(parecido(colorEn(recorte.img, 200, 100), VERDE, 2));

    // Sin --transparente, por la esquina se ve el panel que hay detrás.
    const opaco = await capturar(pagina, ['--salida', 'Capturas ñ/tarjeta opaca.png', '--selector', '#tarjeta']);
    assert.deepEqual([opaco.img.ancho, opaco.img.alto], [400, 200]);
    assert.equal(alfaEn(opaco.img, 1, 1), 255);
    assert.ok(parecido(colorEn(opaco.img, 1, 1), PANEL, 2), `esquina ${colorEn(opaco.img, 1, 1)}`);
  });

  test('--transparente sin selector: desaparece el fondo de la página y lo demás queda opaco', async () => {
    const r = await capturar(pagina, [
      ...['--salida', 'Capturas ñ/sin fondo.png', '--ancho', '800', '--alto', '600', '--escala', '1'],
      '--transparente',
    ]);
    assert.equal(alfaEn(r.img, 20, 20), 0);
    assert.equal(alfaEn(r.img, 110, 110), 255);
    assert.ok(parecido(colorEn(r.img, 110, 110), PANEL, 2));
  });

  test('--completa: la página entera, con lo que solo aparece al hacer scroll', async () => {
    const r = await capturar(larga, [
      ...['--salida', 'Capturas ñ/larga.png', '--ancho', '800', '--alto', '600', '--escala', '1', '--completa'],
    ]);
    assert.deepEqual([r.img.ancho, r.img.alto], [800, 2000]);
    assert.ok(parecido(colorEn(r.img, 400, 1950), VERDE, 2), `final de la página: ${colorEn(r.img, 400, 1950)}`);

    const ventana = await capturar(larga, [
      '--salida',
      'Capturas ñ/larga ventana.png',
      '--ancho',
      '800',
      '--alto',
      '600',
    ]);
    assert.deepEqual([ventana.img.ancho, ventana.img.alto], [1600, 1200], 'sin --completa, solo la ventana');
  });

  test('--esperar-a: espera a lo que la página pinta tarde', async () => {
    const r = await capturar(tarde, [
      ...['--salida', 'Capturas ñ/tarde.png', '--ancho', '400', '--alto', '300', '--escala', '1'],
      ...['--esperar-a', '#listo'],
    ]);
    assert.ok(parecido(colorEn(r.img, 50, 50), VERDE, 2), `color ${colorEn(r.img, 50, 50)}`);
  });

  test('app en un servidor local: localhost sin http://, una ruta con 404 y la app apagada', async () => {
    const app = await servidorLocal((req, res) => {
      const ok = req.url === '/';
      res.writeHead(ok ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok ? PAGINA : '<h1>No encontrado</h1>');
    });
    try {
      const r = await capturar(`localhost:${app.puerto}`, [
        '--salida',
        'Capturas ñ/',
        '--ancho',
        '800',
        '--alto',
        '600',
      ]);
      assert.equal(r.url, `http://localhost:${app.puerto}/`);
      assert.equal(r.salida, path.join(tmp, 'Capturas ñ', `localhost-${app.puerto}.png`));
      assert.ok(parecido(colorEn(r.img, 500, 400), VERDE, 2), 'la tarjeta de la app');

      // Una página de error no es el producto: falla en vez de guardarla.
      await assert.rejects(capturar(`${app.url}/nada`, ['--salida', 'Capturas ñ/nada.png']), /respondió HTTP 404/);
      assert.ok(!fs.existsSync(path.join(tmp, 'Capturas ñ', 'nada.png')));
    } finally {
      await app.cerrar();
    }
    await assert.rejects(
      capturar(`${app.url}/`, ['--salida', 'Capturas ñ/apagada.png']),
      /No hay nada escuchando en http:\/\/127\.0\.0\.1:\d+\/: ¿está arrancada la app/,
    );
  });

  test('línea de comandos: captura suelta, --lista con un fallo que no para las demás, --ayuda y errores', async () => {
    const destino = path.join(tmp, 'CLI ñ', 'captura');
    const suelta = await ejecutarNode([
      'tools/capturar.mjs',
      pagina,
      '--salida',
      destino,
      '--ancho',
      '640',
      '--alto',
      '360',
    ]);
    assert.equal(suelta.codigo, 0, suelta.stderr);
    assert.equal(suelta.stdout.trim(), `✅ ${destino}.png (1280 x 720 px)`);

    // JSON con BOM (como lo deja PowerShell), rutas relativas al JSON y una captura de una app apagada.
    const dirLista = path.join(tmp, 'Lista ñ');
    fs.mkdirSync(dirLista);
    const lista = path.join(dirLista, 'trabajos.json');
    const apagada = `http://127.0.0.1:${await puertoCerrado()}/`;
    const trabajos = [
      { url: '../página de prueba.html', salida: 'capturas/entera.png', ancho: 400, alto: 300, escala: 1 },
      { _nota: 'la app no está arrancada', url: apagada, salida: 'capturas/apagada.png' },
      { url: '../página de prueba.html', salida: 'capturas/', selector: '#tarjeta', transparente: true },
    ];
    fs.writeFileSync(lista, `\uFEFF${JSON.stringify(trabajos, null, 2)}`);
    const r = await ejecutarNode(['tools/capturar.mjs', '--lista', lista]);
    assert.equal(r.codigo, 1, 'una captura falló');
    const capturas = path.join(dirLista, 'capturas');
    assert.ok(r.stdout.includes(`✅ ${path.join(capturas, 'entera.png')} (400 x 300 px)`), r.stdout);
    assert.ok(r.stdout.includes(`✅ ${path.join(capturas, 'pagina-de-prueba.png')} (400 x 200 px)`), r.stdout);
    assert.ok(r.stderr.includes(`❌ ${apagada}: No hay nada escuchando`), r.stderr);
    assert.match(r.stderr, /❌ Fallaron 1 de 3 capturas\./);
    assert.deepEqual(fs.readdirSync(capturas).sort(), ['entera.png', 'pagina-de-prueba.png']);

    const ayuda = await ejecutarNode(['tools/capturar.mjs', '--ayuda']);
    assert.equal(ayuda.codigo, 0);
    assert.match(ayuda.stdout, /^Uso: node tools\/capturar\.mjs/);

    const falta = await ejecutarNode([
      ...['tools/capturar.mjs', path.join(tmp, 'no existe.html'), '--salida', path.join(tmp, 'x.png')],
    ]);
    assert.equal(falta.codigo, 1);
    assert.match(falta.stderr, /^❌ No existe el archivo .*no existe\.html/);
    const mal = await ejecutarNode([
      'tools/capturar.mjs',
      pagina,
      '--salida',
      path.join(tmp, 'x.png'),
      '--escala',
      '9',
    ]);
    assert.equal(mal.codigo, 1);
    assert.match(mal.stderr, /^❌ --escala debe ser un número entre 0\.25 y 4/);
    assert.ok(!fs.existsSync(path.join(tmp, 'x.png')));
  });
});

describe('referencia.mjs con ffmpeg', { skip: sinFfmpeg || false, timeout: 300_000 }, () => {
  let tmp;
  let rojoAzul;

  before(async () => {
    tmp = carpetaTemporal('referencia ñ');
    fs.mkdirSync(path.join(tmp, 'Vídeos ñ'));
    // 2,5 s a 30 fps: rojo hasta 1,2 s y azul después. Un corte en un instante conocido que, además, cae entre
    // dos fotogramas de la hoja: el de 1,0 s tiene que ser rojo (con el redondeo por defecto de fps saldría
    // el azul de 1,23 s).
    rojoAzul = path.join(tmp, 'Vídeos ñ', 'rojo y azul.mp4');
    await ffmpeg([
      ...['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1.2'],
      ...['-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=1.3'],
      ...['-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', rojoAzul],
    ]);
  });

  after(() => borrar(tmp));

  test(
    'smoke.mp4 (3 s): un fotograma cada 0,5 s, hoja de contactos e info.json',
    { skip: !fs.existsSync(SMOKE) && `falta ${SMOKE}: créalo con npm run smoke` },
    async () => {
      // Sobre una copia: la prueba de humo puede estar reescribiendo smoke.mp4 a la vez.
      const copia = path.join(tmp, 'Vídeos ñ', 'smoke copia.mp4');
      fs.copyFileSync(SMOKE, copia);
      const dir = path.join(tmp, 'Referencia smoke ñ');
      const r = await prepararReferencia({ entrada: copia, salida: dir, cada: 0.5, ancho: 480 }, { log: () => {} });

      assert.equal(r.n, 6, '3 s / 0,5 s');
      assert.deepEqual(fotogramasDe(dir), nombres(6));
      for (const f of fotogramasDe(dir)) {
        const img = leerImagen(path.join(dir, 'fotogramas', f));
        assert.deepEqual([img.ancho, img.alto], [480, 270], f);
      }
      const hoja = leerImagen(path.join(dir, 'contacto.png'));
      const plan = planHoja(6, { w: 480, h: 270 });
      assert.deepEqual([hoja.ancho, hoja.alto], tamHoja(plan, 180));
      assert.deepEqual(fs.readdirSync(dir).sort(), ['contacto.png', 'fotogramas', 'info.json', 'video.mp4']);

      const { carpeta, ...datos } = r;
      assert.equal(carpeta, dir);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8')), datos);
      assert.equal(datos.fuente, copia);
      cerca(datos.duracion, 3, 0.05, 'duración');
      assert.deepEqual([datos.w, datos.h, datos.fps, datos.cada], [1920, 1080, 60, 0.5]);
      assert.deepEqual(datos.contacto, { archivo: 'contacto.png', cada: 0.5, miniaturas: 6 });
    },
  );

  test('cada fotograma es el de su instante exacto; corte, planos y paleta medidos', async () => {
    const dir = path.join(tmp, 'Referencia rojo y azul');
    const r = await prepararReferencia({ entrada: rojoAzul, salida: dir }, { log: () => {} });
    assert.equal(r.n, 5, 't = 0; 0,5; 1; 1,5; 2');
    const colores = fotogramasDe(dir).map((f) => {
      const img = leerImagen(path.join(dir, 'fotogramas', f));
      assert.deepEqual([img.ancho, img.alto], [320, 180], `${f}: un vídeo más pequeño que --ancho no se amplía`);
      return colorEn(img, 160, 90);
    });
    const esperado = [ROJO, ROJO, ROJO, AZUL, AZUL];
    colores.forEach((c, i) => assert.ok(parecido(c, esperado[i], 20), `f_000${i + 1}: ${c}`));

    assert.deepEqual(r.cortes, [1.2]);
    assert.deepEqual(r.planos, { n: 2, media: 1.25, min: 1.2, max: 1.3 });
    // La paleta sale de 2 fotogramas por segundo: 3 rojos (0; 0,5; 1) y 2 azules (1,5; 2).
    assert.equal(r.paleta.length, 2, JSON.stringify(r.paleta));
    assert.ok(parecido(hexARgb(r.paleta[0].hex), ROJO, 20), r.paleta[0].hex);
    assert.ok(parecido(hexARgb(r.paleta[1].hex), AZUL, 20), r.paleta[1].hex);
    assert.deepEqual(
      r.paleta.map((c) => c.peso),
      [0.6, 0.4],
    );
    const hoja = leerImagen(path.join(dir, 'contacto.png'));
    assert.deepEqual([hoja.ancho, hoja.alto], tamHoja(planHoja(5, { w: 320, h: 180 }), 180));
  });

  test('un GIF se pasa a MP4 (H.264); repetir con otro --cada limpia los fotogramas y respeta estilo.md', async () => {
    const gif = path.join(tmp, 'Vídeos ñ', 'animación.gif');
    await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10:duration=2', gif]);
    const dir = path.join(tmp, 'Referencia del GIF');
    const r = await prepararReferencia({ entrada: gif, salida: dir }, { log: () => {} });
    assert.equal(r.n, 4);
    const video = path.join(dir, 'video.mp4');
    const codec = await ejecutar(resolverBinario('ffprobe'), [
      ...['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video],
    ]);
    assert.equal(codec.stdout.toString().trim(), 'h264');
    const meta = await info(video);
    assert.deepEqual([meta.w, meta.h], [160, 90]);
    cerca(meta.duracion, 2, 0.15, 'duración del MP4');

    // estilo.md lo escribe el agente después: volver a preparar la referencia no puede borrarlo.
    fs.writeFileSync(path.join(dir, 'estilo.md'), '# Estilo\n');
    const otra = await prepararReferencia({ entrada: video, salida: dir, cada: 1 }, { log: () => {} });
    assert.equal(otra.n, 2);
    assert.deepEqual(fotogramasDe(dir), nombres(2), 'los f_0003 y f_0004 de la pasada anterior ya no tocan');
    assert.equal(otra.fuente, video);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['contacto.png', 'estilo.md', 'fotogramas', 'info.json', 'video.mp4']);
  });

  test('descargas sin internet: un servidor local hace de api.fxtwitter.com y de CDN de vídeo', async () => {
    const mp4 = fs.readFileSync(rojoAzul);
    let base = '';
    const foto = () => ({ type: 'photo', url: `${base}/media/foto.jpg`, width: 1200, height: 675 });
    // Con la forma de la respuesta real: una lista HLS, una variante pequeña y la buena (en url y en variants).
    const videoDelPost = () => ({
      type: 'video',
      url: `${base}/vid/avc1/320x180/clip.mp4`,
      width: 320,
      height: 180,
      variants: [
        { url: `${base}/pl/lista.m3u8`, bitrate: 0, content_type: 'application/x-mpegURL' },
        { url: `${base}/vid/avc1/160x90/pequeno.mp4`, bitrate: 100000, content_type: 'video/mp4' },
        { url: `${base}/vid/avc1/320x180/clip.mp4`, bitrate: 800000, content_type: 'video/mp4' },
      ],
    });
    const srv = await servidorLocal((req, res) => {
      const json = (codigo, cuerpo) =>
        res.writeHead(codigo, { 'Content-Type': 'application/json' }).end(JSON.stringify(cuerpo));
      const ruta = new URL(req.url, base).pathname;
      if (ruta === '/status/123') {
        json(200, {
          code: 200,
          tweet: { author: { screen_name: 'estudio_prueba' }, media: { all: [foto(), videoDelPost()] } },
        });
      } else if (ruta === '/status/77') {
        json(200, {
          code: 200,
          tweet: {
            author: { screen_name: 'quien_cita' },
            media: { all: [foto()] },
            quote: { author: { screen_name: 'autor_del_video' }, media: { all: [videoDelPost()] } },
          },
        });
      } else if (ruta === '/status/88') {
        json(200, { code: 200, tweet: { author: { screen_name: 'sin_video' }, media: { all: [foto()] } } });
      } else if (ruta === '/status/404') {
        json(404, { code: 404, message: 'NOT_FOUND' });
      } else if (ruta === '/vid/avc1/320x180/clip.mp4' || ruta === '/descargar') {
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': mp4.length }).end(mp4);
      } else if (ruta === '/pagina') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>Una página, no un vídeo</h1>');
      } else {
        res.writeHead(404).end();
      }
    });
    base = srv.url;
    const api = `${srv.url}/status/`;
    const preparar = (entrada, nombre, log = () => {}) =>
      prepararReferencia({ entrada, salida: path.join(tmp, nombre), cada: 1 }, { log, api });
    try {
      const log = [];
      const post = 'https://x.com/estudio_prueba/status/123?s=20';
      const r = await preparar(post, 'Desde X ñ', (m) => log.push(m));
      assert.equal(r.fuente, post);
      assert.equal(r.autor, '@estudio_prueba');
      assert.equal(r.urlVideo, `${srv.url}/vid/avc1/320x180/clip.mp4`);
      assert.equal(r.n, 3);
      assert.deepEqual(r.cortes, [1.2]);
      assert.match(log.join('\n'), /⬇ Descargando el vídeo de @estudio_prueba \(320x180\)…/);
      assert.ok(fs.readFileSync(path.join(tmp, 'Desde X ñ', 'video.mp4')).equals(mp4), 'el vídeo llega sin tocar');
      assert.deepEqual(
        srv.peticiones.filter((p) => !p.startsWith('/status/')),
        ['/vid/avc1/320x180/clip.mp4'],
        'solo se descarga la variante elegida (ni la pequeña ni la lista HLS)',
      );

      const cita = await preparar('https://twitter.com/quien_cita/status/77', 'Desde una cita');
      assert.equal(cita.autor, '@autor_del_video', 'el vídeo es del post citado');
      assert.equal(cita.urlVideo, `${srv.url}/vid/avc1/320x180/clip.mp4`);

      await assert.rejects(
        preparar('https://x.com/sin_video/status/88', 'Sin vídeo'),
        /Ese post no tiene ningún vídeo/,
      );
      await assert.rejects(preparar('https://x.com/nadie/status/404', 'No existe'), /No encuentro ese post/);

      const directa = await preparar(`${srv.url}/vid/avc1/320x180/clip.mp4`, 'URL directa');
      assert.deepEqual(
        [directa.n, directa.urlVideo, directa.autor],
        [3, `${srv.url}/vid/avc1/320x180/clip.mp4`, undefined],
      );
      const descarga = await preparar(`${srv.url}/descargar?id=3`, 'URL que responde un vídeo');
      assert.equal(descarga.n, 3);

      await assert.rejects(preparar(`${srv.url}/pagina`, 'Una página'), /no es un vídeo \(responde text\/html/);
      assert.deepEqual(fs.readdirSync(path.join(tmp, 'Una página')), [], 'sin restos de la descarga');
    } finally {
      await srv.cerrar();
    }
  });

  test('línea de comandos: rutas con espacios y tildes, resumen, siguiente paso, --ayuda y errores', async () => {
    const dir = path.join(tmp, 'Referencia por CLI ñ');
    const r = await ejecutarNode(['tools/referencia.mjs', rojoAzul, '--salida', dir, '--cada', '1', '--ancho', '160']);
    assert.equal(r.codigo, 0, r.stderr);
    assert.ok(r.stdout.startsWith(`✅ ${dir}\n`), r.stdout);
    assert.match(r.stdout, /video\.mp4 · 2\.5 s · 320x180 · 30 fps\n/);
    assert.match(r.stdout, /fotogramas\/ · 3 \(uno cada 1 s, 160x90 px\)/);
    assert.match(r.stdout, /cortes aprox\.: 1 \(1\.2 s\) · plano medio de 1\.25 s/);
    assert.ok(r.stdout.includes(`Siguiente paso: escribe ${path.join(dir, 'estilo.md')}`), r.stdout);
    assert.match(r.stdout, /Toma la GRAMÁTICA, nunca el contenido/);
    assert.deepEqual(fotogramasDe(dir), nombres(3));

    const ayuda = await ejecutarNode(['tools/referencia.mjs', '--ayuda']);
    assert.equal(ayuda.codigo, 0);
    assert.match(ayuda.stdout, /^Uso: node tools\/referencia\.mjs/);

    const falta = await ejecutarNode(['tools/referencia.mjs', path.join(tmp, 'no existe.mp4'), '-o', dir]);
    assert.equal(falta.codigo, 1);
    assert.match(falta.stderr, /^❌ No existe el archivo .*no existe\.mp4/);
    const sinSalida = await ejecutarNode(['tools/referencia.mjs', rojoAzul]);
    assert.equal(sinSalida.codigo, 1);
    assert.match(sinSalida.stderr, /^❌ Falta --salida <carpeta>/);
  });
});
