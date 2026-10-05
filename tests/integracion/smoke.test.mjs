// Integración: la prueba de humo del estudio de punta a punta (Chromium + ffmpeg): determinismo,
// desenfoque de movimiento y sincronía del audio. Si falta ffmpeg o Chromium, se salta con el motivo.
// Ojo: escribe en smoke/salida (es lo que hace npm run smoke).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { anchoBorde, ejecutarSmoke } from '../../tools/smoke.mjs';
import { ESTUDIO, motivoSinChromium, motivoSinFfmpeg } from '../helpers/entorno.mjs';

const motivo = motivoSinFfmpeg() ?? (await motivoSinChromium());

test('anchoBorde cuenta los píxeles que no son ni fondo ni relleno', () => {
  const fila = Uint8Array.from([247, 247, 200, 150, 98, 98, 120, 247]);
  assert.equal(anchoBorde(fila, { fondo: 247, relleno: 98 }), 3);
  assert.equal(anchoBorde(fila, { fondo: 247, relleno: 98, tolerancia: 60 }), 0);
  assert.equal(anchoBorde(new Uint8Array(0), { fondo: 0, relleno: 255 }), 0);
});

test(
  'la prueba de humo pasa: determinismo, desenfoque de movimiento y audio sincronizado',
  { skip: motivo || false, timeout: 600_000 },
  async () => {
    const r = await ejecutarSmoke(() => {});
    for (const k of ['determinismo', 'desenfoque', 'audio']) {
      assert.equal(r[k].ok, true, `${k}: ${r[k].detalle}`);
    }
    assert.equal(r.ok, true);
    const salida = path.join(ESTUDIO, 'smoke', 'salida');
    for (const f of ['smoke.mp4', 'test.png', 'nitido-63.png', 'resultado.json']) {
      assert.ok(fs.existsSync(path.join(salida, f)), `falta ${f}`);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(salida, 'resultado.json'), 'utf8')), r);
  },
);
