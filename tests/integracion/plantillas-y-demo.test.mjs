// Pruebas de aceptación: lo que copia el usuario (plantillas) y el proyecto de ejemplo tienen que funcionar tal cual.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESTUDIO } from '../../tools/lib/rutas.mjs';
import { leerOpciones, render } from '../../tools/render.mjs';
import { revisar } from '../../tools/revisar.mjs';
import { resolverBinario } from '../../tools/lib/ffmpeg.mjs';

let falta = null;
try {
  resolverBinario('ffmpeg');
} catch (e) {
  falta = e.message;
}

describe('plantillas copiadas en un proyecto nuevo', { skip: falta ?? false }, () => {
  let tmp;
  let proyecto;
  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plantillas-'));
    proyecto = path.join(tmp, 'Proyecto de prueba ñ');
    fs.cpSync(path.join(ESTUDIO, 'templates', 'proyecto'), proyecto, { recursive: true });
    for (const n of ['01-gancho', '02-demo', '03-cierre']) {
      fs.mkdirSync(path.join(proyecto, 'escenas', n), { recursive: true });
      fs.copyFileSync(
        path.join(ESTUDIO, 'templates', 'escena', 'escena.js'),
        path.join(proyecto, 'escenas', n, 'escena.js'),
      );
    }
    fs.copyFileSync(path.join(ESTUDIO, 'templates', 'pelicula.js'), path.join(proyecto, 'pelicula.js'));
    // proyecto.json de la plantilla lleva marcadores: lo dejamos con un tempo válido como haría nuevo-proyecto.
    fs.writeFileSync(path.join(proyecto, 'proyecto.json'), JSON.stringify({ nombre: 'prueba', tempo: { bpm: 120 } }));
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('la película de la plantilla se renderiza en 16:9 y 9:16 y cambia con el tiempo', async () => {
    const salida = path.join(tmp, 'fotos');
    const op = leerOpciones([
      ...['--proyecto', proyecto, '--modulo', 'pelicula.js'],
      ...['--formato', '16:9,9:16', '--fotos', '0,1.6,3', '--salida', salida],
    ]);
    const r = await render(op, () => {});
    const fotos = r.flatMap((x) => x.salidas);
    assert.equal(fotos.length, 6);
    for (const f of fotos) assert.ok(fs.statSync(f).size > 3000, `${f} parece vacía`);
    const [a, b] = [fotos[0], fotos[1]].map((f) => fs.readFileSync(f));
    assert.ok(!a.equals(b), 'el fotograma 0 y el de 1,6 s son iguales: la escena no se mueve');
  });
});

describe('proyecto de ejemplo (ejemplos/demo)', { skip: falta ?? false }, () => {
  let tmp;
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'));
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('el borrador de la película hace un bucle limpio, sin saltos y con sonido', async () => {
    const mp4 = path.join(tmp, 'demo.mp4');
    const op = leerOpciones([
      ...['--proyecto', path.join(ESTUDIO, 'ejemplos', 'demo'), '--modulo', 'pelicula.js'],
      ...['--borrador', '--salida', mp4],
    ]);
    const [r] = await render(op, () => {});
    assert.equal(r.conAudio, true);
    const rev = await revisar(mp4, { salida: path.join(tmp, 'revision'), bpm: 120 });
    assert.ok(Math.abs(rev.duracion - 12) < 0.05, `dura ${rev.duracion} s`);
    assert.deepEqual(rev.saltos, []);
    assert.equal(rev.bucleLimpio, true, `diferencia del bucle ${rev.diferenciaBucle}`);
  });
});
