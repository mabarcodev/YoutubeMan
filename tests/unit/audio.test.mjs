// Tests de tools/lib/audio.mjs: voces sintetizadas, WAV, medición de picos, filtro de mezcla (puro)
// y una mezcla real con ffmpeg sobre un vídeo mudo generado con lavfi (se salta si no hay ffmpeg).

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SR,
  VOCES,
  aWav,
  construirMezcla,
  medirArchivo,
  medirMuestras,
  mezclar,
  sintetizar,
} from '../../tools/lib/audio.mjs';
import { decodificarPCM, info } from '../../tools/lib/ffmpeg.mjs';
import { borrar, carpetaTemporal, cerca, motivoSinFfmpeg } from '../helpers/entorno.mjs';
import { crearTono, crearVideoMudo } from '../helpers/medios.mjs';

const sinFfmpeg = motivoSinFfmpeg();

describe('sintetizar', () => {
  test('todas las voces: longitud exacta, valores finitos y sin saturar', () => {
    for (const [tipo, [dur]] of Object.entries(VOCES)) {
      const m = sintetizar(tipo);
      assert.ok(m instanceof Float32Array, tipo);
      assert.equal(m.length, Math.ceil(dur * SR), tipo);
      let pico = 0;
      for (const v of m) {
        assert.ok(Number.isFinite(v), `${tipo}: valor no finito`);
        pico = Math.max(pico, Math.abs(v));
      }
      assert.ok(pico > 0.05 && pico <= 1, `${tipo}: pico ${pico}`);
    }
  });

  test('admite otra frecuencia de muestreo', () => {
    assert.equal(sintetizar('click', 8000).length, Math.ceil(VOCES.click[0] * 8000));
  });

  test('es determinista, incluso las voces con ruido', () => {
    assert.deepEqual(sintetizar('whoosh'), sintetizar('whoosh'));
    assert.deepEqual(sintetizar('ding'), sintetizar('ding'));
  });

  test('el pico del pitido de prueba cae en los primeros milisegundos', () => {
    const { picoMs, duracionMs } = medirMuestras(sintetizar('beep'));
    assert.ok(picoMs < 2, `pico en ${picoMs} ms`);
    assert.equal(duracionMs, 80);
  });

  test('un tipo desconocido lanza un error que dice cuáles hay', () => {
    assert.throws(() => sintetizar('trompeta'), {
      message: /Sonido sintetizado desconocido: "trompeta"\. Disponibles: click, tick, pop, thump, whoosh, ding, beep/,
    });
  });
});

describe('aWav', () => {
  test('cabecera RIFF/WAVE PCM 16 bits mono correcta, leída de vuelta', () => {
    const muestras = new Float32Array([0, 1, -1, 0.5, 2, -2]);
    const b = aWav(muestras, 44100);
    assert.equal(b.length, 44 + muestras.length * 2);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.equal(b.readUInt32LE(4), 36 + muestras.length * 2);
    assert.equal(b.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(b.readUInt32LE(16), 16); // tamaño del bloque fmt
    assert.equal(b.readUInt16LE(20), 1); // PCM
    assert.equal(b.readUInt16LE(22), 1); // mono
    assert.equal(b.readUInt32LE(24), 44100);
    assert.equal(b.readUInt32LE(28), 44100 * 2); // bytes por segundo
    assert.equal(b.readUInt16LE(32), 2); // bytes por muestra
    assert.equal(b.readUInt16LE(34), 16); // bits
    assert.equal(b.toString('ascii', 36, 40), 'data');
    assert.equal(b.readUInt32LE(40), muestras.length * 2);
  });

  test('muestras a enteros de 16 bits, recortando lo que pasa de ±1', () => {
    const b = aWav(new Float32Array([0, 1, -1, 0.5, 2, -2]));
    const leidas = Array.from({ length: 6 }, (_, i) => b.readInt16LE(44 + i * 2));
    assert.deepEqual(leidas, [0, 32767, -32767, 16384, 32767, -32767]);
    assert.equal(b.readUInt32LE(24), SR);
  });

  test('sin muestras: solo la cabecera', () => {
    const b = aWav(new Float32Array(0));
    assert.equal(b.length, 44);
    assert.equal(b.readUInt32LE(40), 0);
  });
});

describe('medirMuestras', () => {
  test('impulso: posición del pico, nivel en dB y duración', () => {
    const m = new Float32Array(SR); // 1 s
    m[4800] = -0.5; // pico negativo a los 100 ms
    const r = medirMuestras(m);
    assert.equal(r.duracionMs, 1000);
    assert.equal(r.picoMs, 100);
    assert.equal(r.picoDb, -6); // 20·log10(0.5) = −6.02 → redondeado a 1 decimal
    cerca(r.rmsDb, Math.round(10 * 20 * Math.log10(0.5 / Math.sqrt(SR))) / 10, 1e-9);
  });

  test('un seno a escala completa tiene RMS de unos −3 dB', () => {
    const m = Float32Array.from({ length: SR }, (_, i) => Math.sin((2 * Math.PI * 1000 * i) / SR));
    const r = medirMuestras(m);
    cerca(r.rmsDb, -3, 0.1);
    cerca(r.picoDb, 0, 0.1);
  });

  test('silencio y señal vacía no dan -Infinity ni NaN', () => {
    for (const m of [new Float32Array(100), new Float32Array(0)]) {
      const r = medirMuestras(m, 8000);
      assert.equal(r.picoMs, 0);
      assert.equal(r.picoDb, -180);
      assert.equal(r.rmsDb, -180);
    }
    assert.equal(medirMuestras(new Float32Array(0)).duracionMs, 0);
  });

  test('con otra frecuencia de muestreo', () => {
    const m = new Float32Array(8000);
    m[2000] = 1;
    const r = medirMuestras(m, 8000);
    assert.equal(r.picoMs, 250);
    assert.equal(r.duracionMs, 1000);
  });
});

describe('construirMezcla (filtro puro)', () => {
  const COMUN = 'aresample=48000,aformat=channel_layouts=stereo';

  test('sin pistas ni música no hay nada que mezclar', () => {
    assert.equal(construirMezcla({ duracion: 3 }), null);
    assert.equal(construirMezcla({ duracion: 3, pistas: [], musica: null }), null);
  });

  test('una pista se adelanta según su pico para que el pico caiga en t', () => {
    const r = construirMezcla({ duracion: 3, pistas: [{ archivo: 'a.wav', t: 1, picoMs: 100 }] });
    assert.deepEqual(r.entradas, ['a.wav']);
    const [pista, salida] = r.filtro.split(';');
    assert.equal(pista, `[1:a]${COMUN},volume=1,adelay=900:all=1[s0]`);
    assert.equal(
      salida,
      '[s0]amix=inputs=1:normalize=0:dropout_transition=0,apad=whole_dur=3.0000,atrim=0:3.0000,' +
        'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]',
    );
  });

  test('si el pico cae antes del segundo 0, recorta el principio del sonido en vez de retrasarlo', () => {
    const r = construirMezcla({ duracion: 2, pistas: [{ archivo: 'w.wav', t: 0.05, picoMs: 100, volumen: 0.5 }] });
    assert.equal(
      r.filtro.split(';')[0],
      `[1:a]${COMUN},atrim=start=0.0500,asetpts=PTS-STARTPTS,volume=0.5,adelay=0:all=1[s0]`,
    );
  });

  test('picoMs por defecto 0 y retraso redondeado a milisegundos enteros', () => {
    const r = construirMezcla({ duracion: 2, pistas: [{ archivo: 'a.wav', t: 1.0004 }] });
    assert.match(r.filtro, /adelay=1000:all=1\[s0\]/);
  });

  test('música: desde, volumen, retraso de inicio y fundido que acaba con el vídeo', () => {
    const r = construirMezcla({
      duracion: 10,
      musica: { archivo: 'm.wav', desde: 2, inicio: 0.5, volumen: 0.8, fundido: 2 },
    });
    assert.deepEqual(r.entradas, ['m.wav']);
    assert.equal(
      r.filtro.split(';')[0],
      `[1:a]${COMUN},atrim=start=2,asetpts=PTS-STARTPTS,volume=0.8,afade=t=out:st=7.500:d=2,adelay=500:all=1[mus]`,
    );
  });

  test('música con valores por defecto y un vídeo más corto que el fundido', () => {
    const r = construirMezcla({ duracion: 0.5, musica: { archivo: 'm.wav' } });
    assert.match(
      r.filtro,
      /atrim=start=0,asetpts=PTS-STARTPTS,volume=1,afade=t=out:st=0\.000:d=1,adelay=0:all=1\[mus\]/,
    );
  });

  test('número de entradas y etiquetas: pistas en orden y la música al final', () => {
    const r = construirMezcla({
      duracion: 4,
      pistas: [
        { archivo: 'a.wav', t: 1 },
        { archivo: 'b.wav', t: 2, picoMs: 20 },
      ],
      musica: { archivo: 'm.wav' },
      lufs: -16,
    });
    assert.deepEqual(r.entradas, ['a.wav', 'b.wav', 'm.wav']);
    const partes = r.filtro.split(';');
    assert.equal(partes.length, 4);
    assert.ok(partes[0].startsWith('[1:a]') && partes[1].startsWith('[2:a]') && partes[2].startsWith('[3:a]'));
    assert.ok(partes[3].startsWith('[s0][s1][mus]amix=inputs=3:'));
    assert.match(partes[3], /loudnorm=I=-16:/);
  });
});

describe('mezclar y medirArchivo (ffmpeg real)', { skip: sinFfmpeg || false }, () => {
  let tmp;
  let proyecto;
  let video;

  before(async () => {
    tmp = carpetaTemporal('audio');
    // Carpeta con espacios y tildes: ffmpeg recibe las rutas como argumentos, sin shell.
    proyecto = path.join(tmp, 'Vídeos con espacios', 'Proyecto ñ');
    fs.mkdirSync(path.join(proyecto, 'kit', 'audio'), { recursive: true });
    video = await crearVideoMudo(path.join(proyecto, 'mudo de prueba.mp4'), { duracion: 2 });
  });

  after(() => borrar(tmp));

  test('medirArchivo encuentra el pico de un WAV escrito con aWav', async () => {
    const wav = path.join(proyecto, 'kit', 'audio', 'pitido.wav');
    fs.writeFileSync(wav, aWav(sintetizar('beep')));
    const r = await medirArchivo(wav);
    cerca(r.duracionMs, 80, 1);
    assert.ok(r.picoMs < 2, `pico en ${r.picoMs} ms`);
    cerca(r.picoDb, 20 * Math.log10(0.8), 0.2);
  });

  test('sintetizado: el resultado tiene audio, dura lo mismo que el vídeo y el pico cae en su sitio', async () => {
    const salida = path.join(proyecto, 'con audio.mp4');
    const r = await mezclar({
      video,
      salida,
      duracion: 2,
      sonidos: [{ t: 0.5, tipo: 'beep' }],
      proyecto,
      tmp: path.join(proyecto, '.render-tmp'),
    });
    assert.deepEqual(r, { conAudio: true, pistas: 1, musica: false });
    assert.ok(fs.existsSync(path.join(proyecto, '.render-tmp', 'sfx-beep.wav')));
    const meta = await info(salida);
    assert.equal(meta.tieneAudio, true);
    cerca(meta.duracion, 2, 0.1, 'duración');
    const { picoMs } = medirMuestras(await decodificarPCM(salida));
    cerca(picoMs, 500, 30, 'pico del pitido');
  });

  test('archivo del kit (con / inicial) y música con fundido', async () => {
    fs.writeFileSync(path.join(proyecto, 'kit', 'audio', 'clic.wav'), aWav(sintetizar('click')));
    await crearTono(path.join(proyecto, 'kit', 'audio', 'música.wav'), { duracion: 3 });
    const salida = path.join(proyecto, 'con música.mp4');
    const r = await mezclar({
      video,
      salida,
      duracion: 2,
      sonidos: [{ t: 1, archivo: '/kit/audio/clic.wav', volumen: 0.7 }],
      musica: { archivo: 'kit/audio/música.wav', volumen: 0.3, fundido: 0.5 },
      proyecto,
      tmp: path.join(proyecto, '.render-tmp'),
      lufs: -16,
    });
    assert.deepEqual(r, { conAudio: true, pistas: 1, musica: true });
    const meta = await info(salida);
    assert.equal(meta.tieneAudio, true);
    cerca(meta.duracion, 2, 0.1);
  });

  test('sin sonidos ni música copia el vídeo mudo tal cual', async () => {
    const salida = path.join(proyecto, 'copia.mp4');
    const r = await mezclar({ video, salida, duracion: 2, proyecto, tmp: path.join(proyecto, '.render-tmp') });
    assert.deepEqual(r, { conAudio: false });
    assert.deepEqual(fs.readFileSync(salida), fs.readFileSync(video));
    assert.equal((await info(salida)).tieneAudio, false);
  });

  test('errores claros: archivo que falta, sonido sin tipo ni archivo y música que falta', async () => {
    const base = { video, salida: path.join(proyecto, 'x.mp4'), duracion: 2, proyecto, tmp: path.join(tmp, 'tmp') };
    await assert.rejects(mezclar({ ...base, sonidos: [{ t: 1, archivo: 'kit/audio/no-existe.wav' }] }), {
      message: /Sonido no encontrado: kit\/audio\/no-existe\.wav/,
    });
    await assert.rejects(mezclar({ ...base, sonidos: [{ t: 1.25 }] }), {
      message: /Sonido sin "tipo" ni "archivo" en t=1\.25/,
    });
    await assert.rejects(mezclar({ ...base, musica: { archivo: 'kit/audio/no-hay.wav' } }), {
      message: /Música no encontrada: kit\/audio\/no-hay\.wav/,
    });
    assert.ok(!fs.existsSync(base.salida));
  });
});
