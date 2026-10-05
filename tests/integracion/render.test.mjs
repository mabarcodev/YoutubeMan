// Integración: render de verdad (Chromium + ffmpeg) de la escena smoke copiada a una carpeta temporal con
// espacios y tildes: fotos (--fotos), borrador de un tramo (--borrador --desde --hasta), revisar() sobre el MP4,
// los dos CLI, y qué pasa con escenas rotas (al cargar y a mitad del render).
// Trabajar sobre una copia evita pisar smoke/ (que usa la prueba de humo) y prueba rutas de Windows reales.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { leerOpciones, render } from '../../tools/render.mjs';
import { resumenMarkdown, revisar } from '../../tools/revisar.mjs';
import { decodificarPCM, ffmpeg, info } from '../../tools/lib/ffmpeg.mjs';
import { medirMuestras } from '../../tools/lib/audio.mjs';
import {
  ESTUDIO,
  borrar,
  carpetaTemporal,
  cerca,
  ejecutarNode,
  motivoSinChromium,
  motivoSinFfmpeg,
} from '../helpers/entorno.mjs';
import { colorEn, contarColor, hexARgb, leerPNG, parecido } from '../helpers/png.mjs';

const motivo = motivoSinFfmpeg() ?? (await motivoSinChromium());
const FONDO = hexARgb('#F7F8F6');
const VERDE = hexARgb('#0B8F63');
const BLANCO = [255, 255, 255];

// Escenas rotas de los errores más probables al escribir una: un fallo al montar (p. ej. falta una captura),
// olvidar dibujar() o la duración, y una que se rompe a mitad del vídeo.
const ROTAS = {
  'rota-al-montar.js':
    "export default { duracion: 1, dibujar() {}, montar() { throw new Error('falta kit/capturas/inicio.png'); } };",
  'sin-dibujar.js': 'export default { duracion: 1 };',
  'sin-duracion.js': 'export default { dibujar() {} };',
  'rota-a-mitad.js':
    "export default { duracion: 2, fondo: '#000', dibujar(t) { if (t > 0.5) throw new Error('se rompe en t = ' + t.toFixed(2)); } };",
};

// Render de la escena que se rompe a mitad en OTRO proceso de Node: si render() dejara algo vivo (un ffmpeg
// esperando fotogramas), este proceso no terminaría solo; así lo podemos medir sin colgar los tests.
const GUION_ROTA_A_MITAD = `
import { leerOpciones, render } from ${JSON.stringify(pathToFileURL(path.join(ESTUDIO, 'tools', 'render.mjs')).href)};
const [proyecto, salida] = process.argv.slice(1);
const op = leerOpciones(['--proyecto', proyecto, '--modulo', 'rota-a-mitad.js', '--borrador', '--hilos', '1', '--salida', salida]);
try {
  await render(op, () => {});
  console.log('SIN ERROR');
} catch (e) {
  console.log('ERROR ' + JSON.stringify(e.message));
}
await new Promise((r) => setTimeout(r, 1000));
console.log('RECURSOS ' + JSON.stringify(process.getActiveResourcesInfo()));
process.exit(0);
`;

/** Alto en px de una hoja de contactos de `filas` filas de miniaturas de 384 px de ancho de un vídeo 16:9. */
const altoHoja = (filas) => filas * 216 + (filas - 1) * 4;

describe('render y revisar de punta a punta', { skip: motivo || false, timeout: 600_000 }, () => {
  let tmp;
  let proyecto;
  let borradorMp4;

  before(() => {
    tmp = carpetaTemporal('render-integracion');
    proyecto = path.join(tmp, 'Vídeos de prueba', 'Proyecto ñ con espacios');
    fs.mkdirSync(proyecto, { recursive: true });
    for (const f of ['escena.js', 'proyecto.json']) {
      fs.copyFileSync(path.join(ESTUDIO, 'smoke', f), path.join(proyecto, f));
    }
    for (const [archivo, codigo] of Object.entries(ROTAS)) fs.writeFileSync(path.join(proyecto, archivo), codigo);
  });

  after(() => borrar(tmp));

  test('--fotos: un PNG por instante, al tamaño del formato y con lo que pasa en cada instante', async () => {
    const salida = path.join(tmp, 'Fotos de revisión');
    const op = leerOpciones([
      ...['--proyecto', proyecto, '--modulo', 'escena.js'],
      ...['--fotos', '0,1.5,3', '--salida', salida],
    ]);
    const log = [];
    const [r] = await render(op, (m) => log.push(m));
    assert.equal(r.formato, '16:9');
    assert.deepEqual(
      r.salidas.map((f) => [path.dirname(f), path.basename(f).replace(/^.*?(-16x9-)/, '$1')]),
      [
        [salida, '-16x9-0_00s.png'],
        [salida, '-16x9-1_50s.png'],
        [salida, '-16x9-3_00s.png'],
      ],
    );
    assert.ok(!log.some((l) => l.includes('⚠')), `errores de la página:\n${log.join('\n')}`);

    const [f0, f15, f3] = r.salidas.map((f) => leerPNG(fs.readFileSync(f)));
    assert.deepEqual([f0.ancho, f0.alto], [1920, 1080]);
    // t = 0: el punto aún tiene escala 0 y el texto está bajo su máscara: todo es fondo.
    assert.equal(contarColor(f0, FONDO, { tolerancia: 3 }), 1920 * 1080);
    // t = 1.5: la píldora verde ya está estirada (va de x = 640 a 1280).
    assert.ok(parecido(colorEn(f15, 700, 540), VERDE), `color ${colorEn(f15, 700, 540)}`);
    assert.ok(parecido(colorEn(f15, 1260, 540), VERDE));
    assert.ok(parecido(colorEn(f15, 600, 540), FONDO), 'fuera de la píldora');
    // t = 3: el texto blanco ha subido desde su máscara encima de la píldora.
    const blancos = contarColor(f3, BLANCO, { tolerancia: 20, x0: 640, x1: 1280, y0: 480, y1: 600 });
    assert.ok(blancos > 1500, `píxeles de texto: ${blancos}`);
  });

  test('el lector de PNG de los tests coincide byte a byte con ffmpeg', async () => {
    const png = fs.readdirSync(path.join(tmp, 'Fotos de revisión')).find((f) => f.endsWith('1_50s.png'));
    const archivo = path.join(tmp, 'Fotos de revisión', png);
    const nuestro = leerPNG(fs.readFileSync(archivo));
    const r = await ffmpeg([
      '-i',
      archivo,
      '-f',
      'rawvideo',
      '-pix_fmt',
      nuestro.canales === 4 ? 'rgba' : 'rgb24',
      '-',
    ]);
    assert.equal(r.stdout.length, nuestro.datos.length);
    assert.ok(r.stdout.equals(Buffer.from(nuestro.datos)), 'los píxeles no coinciden');
  });

  test('--borrador de un tramo: MP4 a mitad de resolución y 30 fps, con el audio del tramo en su sitio', async () => {
    const salida = path.join(tmp, 'Vídeos de revisión');
    const op = leerOpciones([
      ...['--proyecto', proyecto, '--modulo', 'escena.js', '--borrador'],
      ...['--desde', '0.5', '--hasta', '2', '--salida', salida, '--hilos', '2'],
    ]);
    const [r] = await render(op, () => {});
    assert.equal(path.dirname(r.salida), salida);
    assert.ok(r.salida.endsWith('-16x9-borrador-0.5-2s.mp4'), r.salida);
    assert.deepEqual([r.fotogramas, r.segundos, r.conAudio], [45, 1.5, true]);

    const meta = await info(r.salida);
    cerca(meta.duracion, 1.5, 0.1, 'duración');
    assert.deepEqual([meta.w, meta.h, meta.fps, meta.tieneAudio], [960, 540, 30, true]);
    // El pitido de la escena está en t = 1.0: en un tramo que empieza en 0.5 debe sonar a los 0.5 s.
    const { picoMs } = medirMuestras(await decodificarPCM(r.salida));
    cerca(picoMs, 500, 30, 'pico del pitido');
    // Render por etapas: no quedan temporales y el sonido sintetizado se guarda en el proyecto.
    assert.deepEqual(
      fs.readdirSync(salida).filter((f) => f.includes('.tmp.')),
      [],
    );
    assert.ok(fs.existsSync(path.join(proyecto, '.render-tmp', 'sfx-beep.wav')));
    borradorMp4 = r.salida;
  });

  test('revisar() del borrador: hojas de contactos, móvil, primero/último, tiras y resumen', async () => {
    assert.ok(borradorMp4, 'necesita el MP4 del test anterior');
    const dir = path.join(tmp, 'Revisión automática');
    const r = await revisar(borradorMp4, { salida: dir, tiras: [1] });
    cerca(r.duracion, 1.5, 0.1);
    assert.deepEqual([r.tamano, r.fps, r.audio], ['960x540', 30, true]);
    assert.deepEqual(r.saltos, [], 'la escena smoke se mueve con muelles: no debe tener saltos');
    assert.equal(typeof r.diferenciaBucle, 'number');
    assert.equal(r.archivos.contacto.length, 1);

    const imagenes = [
      ...r.archivos.contacto,
      r.archivos.movil,
      r.archivos.primero,
      r.archivos.ultimo,
      ...r.archivos.tiras,
    ];
    assert.equal(r.archivos.tiras.length, 1);
    for (const f of imagenes) {
      assert.ok(fs.existsSync(f), `falta ${f}`);
      assert.ok(leerPNG(fs.readFileSync(f)).ancho > 0);
    }
    // 5 columnas de 384 px con 4 px entre ellas; 1.5 s a 2 miniaturas por segundo caben en una fila.
    const hoja = leerPNG(fs.readFileSync(r.archivos.contacto[0]));
    assert.deepEqual([hoja.ancho, hoja.alto], [5 * 384 + 4 * 4, altoHoja(1)]);
    const primero = leerPNG(fs.readFileSync(r.archivos.primero));
    assert.deepEqual([primero.ancho, primero.alto], [960, 540]);
    assert.ok(leerPNG(fs.readFileSync(r.archivos.tiras[0])).ancho >= 12 * 320, 'tira de 12 fotogramas');

    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'resumen.json'), 'utf8')), r);
    assert.equal(fs.readFileSync(path.join(dir, 'resumen.md'), 'utf8'), resumenMarkdown(r));
  });

  test('los CLI funcionan con rutas con espacios y tildes (argumentos sin shell)', async () => {
    const fotos = path.join(tmp, 'Fotos por CLI ñ');
    const r = await ejecutarNode([
      'tools/render.mjs',
      ...['--proyecto', proyecto, '--modulo', 'escena.js', '--fotos', '2', '--salida', fotos],
    ]);
    assert.equal(r.codigo, 0, r.stderr);
    assert.match(r.stdout, /✅ 16:9: 1 fotos/);
    assert.equal(fs.readdirSync(fotos).length, 1);

    // Vídeo por CLI y sin audio: el resumen de una línea es lo que lee el agente para saber dónde está el MP4.
    const videos = path.join(tmp, 'Vídeo por CLI ñ');
    const v = await ejecutarNode([
      'tools/render.mjs',
      ...['--proyecto', proyecto, '--modulo', 'escena.js', '--borrador', '--hasta', '0.5'],
      ...['--sin-audio', '--salida', videos],
    ]);
    assert.equal(v.codigo, 0, v.stderr);
    const mp4 = /^✅ 16:9: (.+\.mp4) \(15 fotogramas, audio: no, [\d.]+ s\)$/m.exec(v.stdout)?.[1];
    assert.ok(mp4 && path.dirname(mp4) === videos, v.stdout);
    const meta = await info(mp4);
    assert.deepEqual([meta.w, meta.h, meta.tieneAudio], [960, 540, false]);
    assert.deepEqual(fs.readdirSync(videos), [path.basename(mp4)], 'sin temporales');

    const dirCli = path.join(tmp, 'Revisión por CLI');
    const rev = await ejecutarNode([
      'tools/revisar.mjs',
      ...[borradorMp4, '--salida', dirCli, '--bpm', '600', '--tiras', '0.5,1', '--umbral', '5'],
    ]);
    assert.equal(rev.codigo, 0, rev.stderr);
    assert.match(rev.stdout, /^# Revisión automática/);
    const resumen = JSON.parse(fs.readFileSync(path.join(dirCli, 'resumen.json'), 'utf8'));
    assert.deepEqual(
      resumen.archivos.tiras.map((f) => path.basename(f)),
      ['tira-0_5s.png', 'tira-1s.png'],
    );
    // --bpm 600 = 10 miniaturas por segundo: 15 en 1.5 s, en 3 filas de 5.
    assert.equal(leerPNG(fs.readFileSync(resumen.archivos.contacto[0])).alto, altoHoja(3));
  });

  test('revisar() sin salida deja la revisión en una carpeta junto al vídeo', async () => {
    assert.ok(borradorMp4, 'necesita el MP4 del test del borrador');
    const r = await revisar(borradorMp4);
    const dir = path.join(path.dirname(borradorMp4), `revision-${path.basename(borradorMp4, '.mp4')}`);
    assert.deepEqual(
      [r.archivos.contacto[0], r.archivos.movil],
      [path.join(dir, 'contacto-1.png'), path.join(dir, 'movil.png')],
    );
    assert.ok(fs.existsSync(path.join(dir, 'resumen.json')) && fs.existsSync(path.join(dir, 'resumen.md')));
  });

  test('revisar() encuentra un fotograma suelto (un salto) y dice en qué segundo está', async () => {
    // 2 s de gris a 30 fps con un único fotograma blanco, el 15: el salto que el crítico tiene que ver.
    const video = path.join(tmp, 'Un salto ñ.mp4');
    await ffmpeg([
      ...['-f', 'lavfi', '-i', 'color=c=gray:size=320x180:rate=30:duration=2'],
      ...['-vf', "drawbox=x=0:y=0:w=320:h=180:color=white:t=fill:enable='eq(n,15)'"],
      ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', video],
    ]);
    const r = await revisar(video, { salida: path.join(tmp, 'Revisión del salto') });
    assert.equal(r.saltos.length, 1, JSON.stringify(r.saltos));
    const [s] = r.saltos;
    assert.deepEqual([s.indice, s.segundo], [15, 0.5]);
    assert.ok(s.puntuacion > 50, `puntuación ${s.puntuacion}`);
    // Gris de principio a fin: el bucle se cierra limpio.
    assert.deepEqual([r.diferenciaBucle, r.bucleLimpio], [0, true]);
    assert.match(resumenMarkdown(r), /Saltos de un fotograma: 0\.5 s \(fotograma 15, [\d.]+\)/);
  });

  test('revisar (CLI): un --umbral, --bpm o --tiras que no es un número sale con 1 y un mensaje claro', async () => {
    assert.ok(borradorMp4, 'necesita el MP4 del test del borrador');
    for (const extra of [
      ['--umbral', 'abc'],
      ['--bpm', 'abc'],
      ['--tiras', '1,x'],
    ]) {
      const r = await ejecutarNode([
        'tools/revisar.mjs',
        ...[borradorMp4, '--salida', path.join(tmp, 'Revisión con números malos'), ...extra],
      ]);
      assert.equal(r.codigo, 1, `${extra.join(' ')}: sale con ${r.codigo}`);
      assert.match(r.stderr, new RegExp(`^❌ ${extra[0]} `), `${extra.join(' ')}: ${r.stderr}`);
    }
  });

  test('una escena que no carga falla con un mensaje claro y no deja nada a medias', async () => {
    for (const [modulo, mensaje] of [
      ['rota-al-montar.js', /falta kit\/capturas\/inicio\.png/],
      ['sin-dibujar.js', /debe exportar por defecto un objeto con dibujar\(t, ctx\)/],
      ['sin-duracion.js', /necesita una duracion/],
      ['no-existe.js', /no-existe\.js[\s\S]*404/], // una errata en --modulo: el servidor dice que no la encuentra
    ]) {
      const salida = path.join(tmp, `Fallo ${modulo}`);
      const op = leerOpciones(['--proyecto', proyecto, '--modulo', modulo, '--fotos', '0', '--salida', salida]);
      await assert.rejects(
        render(op, () => {}),
        (e) => {
          assert.match(e.message, /^La escena falló al cargar/, modulo);
          assert.match(e.message, mensaje, modulo);
          return true;
        },
      );
      assert.ok(!fs.existsSync(salida), `${modulo}: ha creado ${salida}`);
    }
  });

  describe('una escena que se rompe a mitad del render', () => {
    let salida;
    let resultado;

    before(async () => {
      salida = path.join(tmp, 'Rota a mitad');
      const r = await ejecutarNode(['--input-type=module', '-e', GUION_ROTA_A_MITAD, proyecto, salida]);
      assert.equal(r.codigo, 0, r.stderr);
      const linea = (clave) => new RegExp(`^${clave} (.*)$`, 'm').exec(r.stdout)?.[1];
      resultado = {
        error: linea('ERROR') ? JSON.parse(linea('ERROR')) : null,
        recursos: linea('RECURSOS') ? JSON.parse(linea('RECURSOS')) : null,
      };
    });

    test('render() falla con el error de la escena, que dice en qué instante se rompe', () => {
      // Borrador a 30 fps: la primera muestra después de t = 0.5 es la 16 (0.533 s).
      assert.match(resultado.error ?? 'no falló', /se rompe en t = 0\.53/);
    });

    test('y no deja ningún ffmpeg vivo (si no, el proceso que llama a render() no termina nunca)', () => {
      assert.ok(resultado.recursos, 'el subproceso no informó de sus recursos');
      assert.ok(!resultado.recursos.includes('ProcessWrap'), `sigue vivo: ${resultado.recursos.join(', ')}`);
      assert.deepEqual(fs.existsSync(salida) ? fs.readdirSync(salida) : [], []);
    });
  });
});
