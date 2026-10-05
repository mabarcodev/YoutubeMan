// Tests de tools/lib/ffmpeg.mjs: localización de binarios (con un entorno falso, sin tocar el real),
// ejecución de procesos y lectura de medios. Lo que necesita ffmpeg se salta si no está instalado.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  decodificarFotogramasGris,
  decodificarPCM,
  ejecutar,
  ffmpeg,
  info,
  resolverBinario,
} from '../../tools/lib/ffmpeg.mjs';
import { diferenciaMedia } from '../../tools/lib/saltos.mjs';
import { ESTUDIO, borrar, carpetaTemporal, cerca, motivoSinFfmpeg } from '../helpers/entorno.mjs';
import { crearTono, crearVideoMudo } from '../helpers/medios.mjs';

const sinFfmpeg = motivoSinFfmpeg();

describe('resolverBinario (entorno falso)', () => {
  let tmp;
  before(() => {
    tmp = carpetaTemporal('ffmpeg-binario');
  });
  after(() => borrar(tmp));

  test('si no lo encuentra, explica cómo instalarlo y qué variable definir', () => {
    assert.throws(() => resolverBinario('binario-que-no-existe', { entorno: {}, buscarWinget: false }), {
      message:
        /No encuentro binario-que-no-existe\. Instálalo con: winget install --id Gyan\.FFmpeg.*BINARIO-QUE-NO-EXISTE_PATH/,
    });
  });

  test('una variable <NOMBRE>_PATH que apunta a un archivo que no existe no sirve', () => {
    const entorno = { 'OTRO-BINARIO_PATH': path.join(tmp, 'no-existe.exe') };
    assert.throws(() => resolverBinario('otro-binario', { entorno, buscarWinget: false }), /No encuentro otro-binario/);
  });

  test('sin LOCALAPPDATA o sin carpeta de winget, la búsqueda en winget no encuentra nada', () => {
    assert.throws(() => resolverBinario('sin-winget', { entorno: {} }), /No encuentro sin-winget/);
    assert.throws(() => resolverBinario('sin-winget', { entorno: { LOCALAPPDATA: tmp } }), /No encuentro sin-winget/);
  });

  test('la variable <NOMBRE>_PATH tiene prioridad', { skip: sinFfmpeg || false }, () => {
    const real = resolverBinario('ffmpeg');
    const entorno = { 'FFMPEG-PROPIO_PATH': real };
    assert.equal(resolverBinario('ffmpeg-propio', { entorno, buscarWinget: false }), real);
  });

  test('busca en la carpeta de paquetes de winget (Gyan.FFmpeg*/*/bin)', { skip: sinFfmpeg || false }, (t) => {
    const real = resolverBinario('ffmpeg');
    if (!path.isAbsolute(real)) return t.skip('ffmpeg está en el PATH: no hay un .exe que enlazar');
    const paquetes = path.join(tmp, 'Microsoft', 'WinGet', 'Packages');
    const bin = path.join(paquetes, 'Gyan.FFmpeg_Prueba', 'ffmpeg-9.9-full_build', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(path.join(paquetes, 'Otro.Paquete', 'x', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(paquetes, 'Gyan.FFmpeg_Prueba', 'indice.db'), ''); // winget deja archivos sueltos
    const exe = path.join(bin, `ffmpeg-de-winget${path.extname(real)}`);
    try {
      fs.linkSync(real, exe); // enlace duro: no copia los ~200 MB de ffmpeg
    } catch (e) {
      return t.skip(`no se puede crear un enlace duro a ffmpeg en la carpeta temporal (${e.code})`);
    }
    assert.equal(resolverBinario('ffmpeg-de-winget', { entorno: { LOCALAPPDATA: tmp } }), exe);
  });
});

describe('ejecutar', () => {
  test('pasa la entrada por stdin y devuelve stdout como Buffer', async () => {
    const r = await ejecutar(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { entrada: 'hola ñ' });
    assert.equal(r.codigo, 0);
    assert.ok(Buffer.isBuffer(r.stdout));
    assert.equal(r.stdout.toString('utf8'), 'hola ñ');
  });

  test('devuelve el código de salida y stderr como texto', async () => {
    const r = await ejecutar(process.execPath, ['-e', 'console.error("fallo"); process.exit(3)']);
    assert.equal(r.codigo, 3);
    assert.equal(r.stderr.trim(), 'fallo');
    assert.equal(r.stdout.length, 0);
  });

  test('si el binario no existe, la promesa se rechaza', async () => {
    await assert.rejects(ejecutar(path.join(ESTUDIO, 'no-existe-este-binario.exe'), []), { code: 'ENOENT' });
  });
});

describe('ffmpeg, info y decodificación (ffmpeg real)', { skip: sinFfmpeg || false }, () => {
  let tmp;
  let video;
  let quieto;
  let tono;

  before(async () => {
    tmp = carpetaTemporal('ffmpeg-medios');
    const carpeta = path.join(tmp, 'Vídeos con espacios');
    fs.mkdirSync(carpeta);
    video = await crearVideoMudo(path.join(carpeta, 'prueba ñ.mp4'), { duracion: 1, w: 320, h: 180, fps: 10 });
    quieto = await crearVideoMudo(path.join(carpeta, 'quieto.mp4'), { duracion: 1, fps: 10, tipo: 'quieto' });
    tono = await crearTono(path.join(carpeta, 'tono.wav'), { duracion: 1 });
  });

  after(() => borrar(tmp));

  test('ffmpeg() con argumentos malos lanza un error legible con los argumentos', async () => {
    await assert.rejects(ffmpeg(['-i', path.join(tmp, 'no-existe.mp4'), path.join(tmp, 'x.mp4')]), {
      message: /^ffmpeg falló \(código -?\d+\):[\s\S]*Argumentos: -i .*no-existe\.mp4/,
    });
  });

  test('info() de un vídeo: duración, tamaño, fps y sin audio', async () => {
    const r = await info(video);
    cerca(r.duracion, 1, 0.05);
    assert.equal(r.w, 320);
    assert.equal(r.h, 180);
    assert.equal(r.fps, 10);
    assert.equal(r.tieneAudio, false);
  });

  test('info() de un audio: duración, sin tamaño y con audio', async () => {
    const r = await info(tono);
    cerca(r.duracion, 1, 0.01);
    assert.deepEqual([r.w, r.h, r.tieneAudio], [null, null, true]);
  });

  test('info() de un audio: sin vídeo tampoco hay fps (null, como w y h)', async () => {
    assert.equal((await info(tono)).fps, null);
  });

  test('info() de algo que no es un medio lanza un error con la ruta', async () => {
    const falso = path.join(tmp, 'no-es-video.mp4');
    fs.writeFileSync(falso, 'esto no es un vídeo');
    await assert.rejects(info(falso), { message: /ffprobe no pudo leer .*no-es-video\.mp4/ });
  });

  test('info() de la prueba de humo (smoke/salida/smoke.mp4), si existe', async (t) => {
    const smoke = path.join(ESTUDIO, 'smoke', 'salida', 'smoke.mp4');
    if (!fs.existsSync(smoke)) return t.skip('aún no se ha ejecutado npm run smoke');
    // Se lee una copia: la prueba de humo de integración puede estar reescribiendo el original a la vez.
    const copia = path.join(tmp, 'smoke.mp4');
    fs.writeFileSync(copia, fs.readFileSync(smoke));
    const r = await info(copia);
    cerca(r.duracion, 3, 0.05);
    assert.deepEqual([r.w, r.h, r.fps, r.tieneAudio], [1920, 1080, 60, true]);
  });

  test('decodificarPCM: audio mono float32 a la frecuencia pedida', async () => {
    const pcm = await decodificarPCM(tono);
    assert.ok(pcm instanceof Float32Array);
    cerca(pcm.length, 48000, 100);
    const pico = pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    assert.ok(pico > 0.05 && pico <= 1, `pico ${pico}`);
    cerca((await decodificarPCM(tono, 16000)).length, 16000, 50);
  });

  test('decodificarFotogramasGris: un buffer por fotograma al tamaño pedido', async () => {
    const fotos = await decodificarFotogramasGris(video);
    assert.equal(fotos.length, 10);
    for (const f of fotos) assert.equal(f.length, 160 * 90);
    assert.ok(diferenciaMedia(fotos[0], fotos[9]) > 1, 'testsrc2 se mueve');
    const pequenas = await decodificarFotogramasGris(quieto, { w: 32, h: 18 });
    assert.equal(pequenas.length, 10);
    assert.equal(pequenas[0].length, 32 * 18);
    assert.ok(diferenciaMedia(pequenas[0], pequenas[9]) < 1, 'un vídeo quieto no cambia');
  });
});
