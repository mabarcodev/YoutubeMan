// Integración: medir-audio.mjs con ffmpeg y beats.py (Python del estudio con librosa) de verdad, sobre audios
// generados aquí con aWav/sintetizar en una carpeta temporal con espacios y tildes:
//   - un metrónomo de 20 s a 120 BPM (acento cada 4): bpm 120 ± 1,5 y primerPulso en el primer clic;
//   - el mismo con anacrusa (dos clics antes del primer acento): primerPulso en el primer acento;
//   - un WAV con un golpe en un instante conocido: picoMs exacto ± 2 ms;
//   - ese WAV pasado a MP3 y convertido con --convertir: el pico no se desplaza (el retardo del MP3 no se cuela).
// Sin ffmpeg se salta todo; sin el Python del estudio (o sin librosa), solo lo del ritmo.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SR, aWav, medirMuestras, sintetizar } from '../../tools/lib/audio.mjs';
import { ffmpeg } from '../../tools/lib/ffmpeg.mjs';
import { NOMBRE_JSON, medirAudio, rutaPython } from '../../tools/medir-audio.mjs';
import { ESTUDIO, borrar, carpetaTemporal, cerca, ejecutarNode, motivoSinFfmpeg } from '../helpers/entorno.mjs';

const BPM = 120;
const PERIODO = 60 / BPM;
const PRIMER_CLIC = 0.25; // s: no en el 0, para que acertar el primer pulso no sea casualidad
const T_GOLPE = 1.234; // s: dónde cae el golpe del WAV de pico conocido

function motivoSinPython() {
  const python = rutaPython();
  if (!fs.existsSync(python)) return `falta el Python del estudio (${python}): ejecuta npm run instalar`;
  // find_spec no importa librosa (que tarda segundos): solo mira si está instalada.
  const r = spawnSync(python, ['-c', 'import importlib.util as u, sys; sys.exit(0 if u.find_spec("librosa") else 1)'], {
    windowsHide: true,
    timeout: 60_000,
  });
  return r.status === 0 ? null : `el Python del estudio no tiene librosa (${python} -m pip install librosa soundfile)`;
}

const sinFfmpeg = motivoSinFfmpeg();
const sinRitmo = sinFfmpeg ?? motivoSinPython();

/** Suma `voz` × `ganancia` a `y` empezando en el segundo `t`. */
function pegar(y, voz, t, ganancia = 1) {
  const i0 = Math.round(t * SR);
  for (let i = 0; i < voz.length && i0 + i < y.length; i++) y[i0 + i] += voz[i] * ganancia;
}

/** Metrónomo: clic fuerte en los acentos (cada 4 desde `primerAcento`) y tic suave en el resto. */
function metronomo({ duracion = 20, inicio = PRIMER_CLIC, primerAcento = 0 } = {}) {
  const y = new Float32Array(Math.round(duracion * SR));
  const clic = sintetizar('click');
  const tic = sintetizar('tick');
  for (let k = 0; inicio + k * PERIODO < duracion - 0.1; k++) {
    const acento = k >= primerAcento && (k - primerAcento) % 4 === 0;
    pegar(y, acento ? clic : tic, inicio + k * PERIODO, acento ? 1.6 : 1.2);
  }
  return y;
}

/** 2 s de ruido suave con un único golpe fuerte en T_GOLPE. Devuelve { muestras, picoEsperadoMs }. */
function golpeConocido() {
  const y = new Float32Array(2 * SR);
  let s = 12345;
  for (let i = 0; i < y.length; i++) y[i] = ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 0.04;
  const clic = sintetizar('click');
  pegar(y, clic, T_GOLPE, 1.8);
  // El pico del clic no está en su primera muestra: se suma dónde lo tiene él mismo.
  return { muestras: y, picoEsperadoMs: T_GOLPE * 1000 + medirMuestras(clic).picoMs };
}

describe('medir-audio de verdad: pico y conversión (ffmpeg)', { skip: sinFfmpeg || false, timeout: 120_000 }, () => {
  let tmp;
  let audio;
  let pico;
  before(async () => {
    tmp = carpetaTemporal('audio-pico');
    const proyecto = path.join(tmp, 'Vídeos de prueba', 'Proyecto ñ');
    audio = path.join(proyecto, 'kit', 'audio');
    fs.mkdirSync(audio, { recursive: true });
    fs.writeFileSync(path.join(proyecto, 'proyecto.json'), '{}');
    pico = golpeConocido();
    fs.writeFileSync(path.join(audio, 'golpe conocido.wav'), aWav(pico.muestras));
    await ffmpeg([
      ...['-i', path.join(audio, 'golpe conocido.wav')],
      ...['-c:a', 'libmp3lame', '-b:a', '192k', path.join(audio, 'golpe en mp3.mp3')],
    ]);
  });
  after(() => borrar(tmp));

  test('picoMs de un WAV con un golpe conocido, ± 2 ms; y el MP3 convertido a WAV no lo desplaza', async () => {
    const r = await medirAudio(audio, { convertir: true, log: () => {}, fecha: 'prueba' });
    assert.deepEqual(r.fallos, []);
    const json = JSON.parse(fs.readFileSync(path.join(audio, NOMBRE_JSON), 'utf8'));

    const wav = json.archivos['golpe conocido.wav'];
    cerca(wav.picoMs, pico.picoEsperadoMs, 2, 'picoMs del WAV');
    cerca(wav.duracionMs, 2000, 1, 'duración del WAV');
    assert.equal(wav.archivo, 'kit/audio/golpe conocido.wav');

    const convertido = json.archivos['golpe en mp3.wav'];
    assert.ok(convertido, `no está la conversión del MP3: ${Object.keys(json.archivos)}`);
    assert.equal(convertido.original, 'golpe en mp3.mp3');
    assert.equal(json.archivos['golpe en mp3.mp3'], undefined, 'el MP3 queda absorbido por su WAV');
    cerca(convertido.picoMs, pico.picoEsperadoMs, 2, 'picoMs del MP3 convertido');
    cerca(convertido.duracionMs, 2000, 2, 'duración del MP3 convertido');

    const cabecera = fs.readFileSync(path.join(audio, 'golpe en mp3.wav')).subarray(0, 44);
    assert.equal(cabecera.toString('ascii', 0, 4), 'RIFF');
    assert.equal(cabecera.readUInt16LE(20), 1, 'PCM');
    assert.equal(cabecera.readUInt32LE(24), 48000, '48 kHz');
    assert.equal(cabecera.readUInt16LE(34), 16, '16 bits');
  });
});

describe(
  'medir-audio --ritmo de verdad (ffmpeg + Python del estudio con librosa)',
  { skip: sinRitmo || false, timeout: 300_000 },
  () => {
    let tmp;
    let audio;
    before(async () => {
      tmp = carpetaTemporal('audio-ritmo');
      audio = path.join(tmp, 'Vídeos de prueba', 'Música ñ');
      fs.mkdirSync(audio, { recursive: true });
      fs.writeFileSync(path.join(audio, 'metrónomo 120.wav'), aWav(metronomo()));
      fs.writeFileSync(path.join(audio, 'anacrusa 120.wav'), aWav(metronomo({ primerAcento: 2 })));
      await ffmpeg([
        ...['-i', path.join(audio, 'metrónomo 120.wav')],
        ...['-c:a', 'libmp3lame', '-b:a', '192k', path.join(audio, 'metrónomo en mp3.mp3')],
      ]);
    });
    after(() => borrar(tmp));

    /** Ejecuta la herramienta como el usuario (sin shell) y devuelve el JSON escrito. */
    async function medir(nombre) {
      const destino = path.join(tmp, `${nombre}.json`);
      const r = await ejecutarNode(['tools/medir-audio.mjs', path.join(audio, nombre), '--ritmo', '--json', destino], {
        cwd: ESTUDIO,
      });
      assert.equal(r.codigo, 0, `${r.stdout}\n${r.stderr}`);
      const json = JSON.parse(fs.readFileSync(destino, 'utf8'));
      return { salida: r.stdout, entrada: Object.values(json.archivos)[0] };
    }

    test('metrónomo de 120 BPM: bpm 120 ± 1,5, primerPulso en el primer clic y compases cada 2 s', async () => {
      const { salida, entrada } = await medir('metrónomo 120.wav');
      cerca(entrada.bpm, BPM, 1.5, 'bpm');
      cerca(entrada.primerPulso, PRIMER_CLIC, 0.02, 'primerPulso');
      const esperados = Math.floor((20 - 0.1 - PRIMER_CLIC) / PERIODO) + 1;
      assert.ok(Math.abs(entrada.pulsos.length - esperados) <= 1, `${entrada.pulsos.length} pulsos (${esperados})`);
      entrada.pulsos.forEach((p, k) => cerca(p, PRIMER_CLIC + k * PERIODO, 0.02, `pulso ${k}`));
      assert.equal(entrada.compases[0], entrada.primerPulso);
      for (let i = 1; i < entrada.compases.length; i++) {
        cerca(entrada.compases[i] - entrada.compases[i - 1], 4 * PERIODO, 0.02, `compás ${i}`);
      }
      assert.equal(entrada.subida, null, 'un metrónomo uniforme no tiene subida');
      assert.match(salida, /120\.00\s+0\.25\d s/, 'la tabla enseña el BPM y el primer pulso');
      assert.match(salida, /"tempo": \{ "bpm": 120, "primerPulso": 0\.25\d \}/);
    });

    test('con anacrusa: primerPulso es el primer clic acentuado, no el primero que suena', async () => {
      const { entrada } = await medir('anacrusa 120.wav');
      cerca(entrada.bpm, BPM, 1.5, 'bpm');
      cerca(entrada.pulsos[0], PRIMER_CLIC, 0.02, 'el primer pulso sí es el primer clic');
      cerca(entrada.primerPulso, PRIMER_CLIC + 2 * PERIODO, 0.02, 'primerPulso');
    });

    test('un MP3 sin convertir: el ritmo sale igual (se decodifica con ffmpeg) y se avisa de convertirlo', async () => {
      const { entrada } = await medir('metrónomo en mp3.mp3');
      cerca(entrada.bpm, BPM, 1.5, 'bpm');
      cerca(entrada.primerPulso, PRIMER_CLIC, 0.02, 'primerPulso');
      assert.match(entrada.aviso, /MP3 sin convertir: usa --convertir/);
    });
  },
);
