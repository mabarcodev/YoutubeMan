// Tests de tools/instalar-agentes.mjs. Nunca tocan el ~/.claude real: el origen es una copia temporal de
// _estudio/claude y el destino, una carpeta temporal con agentes y skills "del usuario" (investigador, vigilante,
// skills/synced) que la instalación no debe tocar jamás. Se comprueba: crear, igual, actualizar con copia .bak,
// que nunca borra nada, --comprobar sin escribir, conflictos y la herramienta desde la consola.

import { after, afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DESTINO,
  ORIGEN,
  informe,
  instalar,
  leerOpciones,
  listarOrigen,
  marcaTiempo,
  planificarInstalacion,
  rellenarRutas,
  rutaCopia,
} from '../../tools/instalar-agentes.mjs';
import { ESTUDIO, borrar, carpetaTemporal, ejecutarNode } from '../helpers/entorno.mjs';

const NUESTROS = [
  'agents/youtubeman-animador.md',
  'agents/youtubeman-critico.md',
  'agents/youtubeman-explorador.md',
  'skills/youtubeman/SKILL.md',
  'skills/youtubeman/encargos.md',
];
/** Lo que el usuario ya tenía en su ~/.claude (los nombres reales que hay que respetar). */
const DEL_USUARIO = {
  'agents/investigador.md': '# investigador\n',
  'agents/vigilante.md': '# vigilante\n',
  'skills/synced/SKILL.md': '# synced\n',
  'skills/synced/datos/x.json': '{"a":1}',
  'settings.json': '{"theme":"dark"}',
  'CLAUDE.md': '# mis reglas\n',
};

/** Todos los archivos de una carpeta con su contenido (rutas con /), para comparar antes y después. */
function foto(dir) {
  const out = {};
  const visitar = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) visitar(r);
      else out[r] = fs.readFileSync(path.join(dir, r), 'utf8');
    }
  };
  if (fs.existsSync(dir)) visitar('');
  return out;
}

function escribir(base, rel, contenido) {
  const abs = path.join(base, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contenido);
}

/**
 * Copia recursiva a mano. No se usa fs.cpSync: en Node 24 sobre Windows no copia nada (y no da error) si la
 * ruta de destino tiene caracteres no ASCII, y aquí el destino lleva "ñ" a propósito.
 */
function copiarCarpeta(de, a) {
  fs.mkdirSync(a, { recursive: true });
  for (const e of fs.readdirSync(de, { withFileTypes: true })) {
    if (e.isDirectory()) copiarCarpeta(path.join(de, e.name), path.join(a, e.name));
    else fs.copyFileSync(path.join(de, e.name), path.join(a, e.name));
  }
}

let tmp;
let origen;
let destino;

/** Lo que debe quedar instalado: el archivo del origen con {{ESTUDIO}} y {{VIDEOS}} sustituidos. */
const instalado = (rel) => rellenarRutas(fs.readFileSync(path.join(origen, rel), 'utf8'));

beforeEach(() => {
  tmp = carpetaTemporal('instalar-agentes');
  origen = path.join(tmp, 'origen con espacios ñ', 'claude');
  destino = path.join(tmp, 'Usuario Ñ', '.claude');
  copiarCarpeta(ORIGEN, origen);
  for (const [rel, contenido] of Object.entries(DEL_USUARIO)) escribir(destino, rel, contenido);
});
afterEach(() => borrar(tmp));
after(() => assert.equal(ORIGEN, path.join(ESTUDIO, 'claude')));

describe('utilidades', () => {
  test('marcaTiempo: AAAAMMDDHHmmss en hora local', () => {
    assert.equal(marcaTiempo(new Date(2026, 9, 2, 9, 5, 7)), '20261002090507');
    assert.match(marcaTiempo(), /^\d{14}$/);
  });

  test('rutaCopia: si ya hay una copia de ese segundo, numera -2, -3…', () => {
    const ocupadas = new Set(['a.md.bak-20260101000000', 'a.md.bak-20260101000000-2']);
    assert.equal(
      rutaCopia('a.md', '20260101000001', (r) => ocupadas.has(r)),
      'a.md.bak-20260101000001',
    );
    assert.equal(
      rutaCopia('a.md', '20260101000000', (r) => ocupadas.has(r)),
      'a.md.bak-20260101000000-3',
    );
  });

  test('leerOpciones: por defecto _estudio/claude → ~/.claude (solo se calcula, no se toca)', () => {
    assert.deepEqual(leerOpciones([]), { origen: ORIGEN, destino: DESTINO, comprobar: false });
    assert.equal(DESTINO, path.join(os.homedir(), '.claude'));
    const op = leerOpciones(['--origen', 'o', '--destino', 'd', '--comprobar']);
    assert.deepEqual(op, { origen: path.resolve('o'), destino: path.resolve('d'), comprobar: true });
    assert.deepEqual(leerOpciones(['--ayuda']), { ayuda: true });
    assert.throws(() => leerOpciones(['--borrar']), /Opción desconocida: --borrar/);
  });
});

describe('rutas', () => {
  test('rellenarRutas: cambia los dos marcadores por las rutas dadas, con barras normales', () => {
    const texto = 'E = {{ESTUDIO}} · proyecto: {{VIDEOS}}/<Proyecto> · otra vez {{ESTUDIO}}/tools';
    const rutas = { estudio: 'C:\\Vídeos Ñ\\_estudio', videos: 'C:\\Vídeos Ñ' };
    assert.equal(
      rellenarRutas(texto, rutas),
      'E = C:/Vídeos Ñ/_estudio · proyecto: C:/Vídeos Ñ/<Proyecto> · otra vez C:/Vídeos Ñ/_estudio/tools',
    );
    assert.equal(rellenarRutas('sin marcadores', rutas), 'sin marcadores');
  });

  test('el origen versionado no lleva rutas de ningún ordenador, solo marcadores', () => {
    for (const rel of NUESTROS) {
      const texto = fs.readFileSync(path.join(ORIGEN, rel), 'utf8');
      assert.doesNotMatch(texto, /[A-Z]:[\\/](?:Users|Desktop)/i, rel);
    }
    assert.match(fs.readFileSync(path.join(ORIGEN, 'skills/youtubeman/SKILL.md'), 'utf8'), /\{\{ESTUDIO\}\}/);
  });

  test('lo instalado no conserva ningún marcador', () => {
    const r = instalar({
      origen,
      destino,
      rutas: { estudio: '/home/ana/videos/_estudio', videos: '/home/ana/videos' },
    });
    assert.equal(r.conflictos, 0);
    for (const rel of NUESTROS) {
      const texto = fs.readFileSync(path.join(destino, rel), 'utf8');
      assert.doesNotMatch(texto, /\{\{(?:ESTUDIO|VIDEOS)\}\}/, rel);
    }
    const skill = fs.readFileSync(path.join(destino, 'skills/youtubeman/SKILL.md'), 'utf8');
    assert.match(skill, /\/home\/ana\/videos\/_estudio/);
  });
});

describe('listarOrigen', () => {
  test('el origen real: los tres agentes y la skill youtubeman', () => {
    const { archivos, skills, avisos } = listarOrigen(origen);
    assert.deepEqual(archivos, NUESTROS);
    assert.deepEqual(skills, ['youtubeman']);
    assert.deepEqual(avisos, []);
  });

  test('ignora copias .bak, basura del sistema y lo que no es .md en agents/; avisa de lo mal colocado', () => {
    escribir(origen, 'agents/notas.txt', 'x');
    escribir(origen, 'agents/youtubeman-critico.md.bak-20260101000000', 'viejo');
    escribir(origen, 'skills/youtubeman/Thumbs.db', 'x');
    escribir(origen, 'skills/youtubeman/plantillas/escena.md', 'sub');
    escribir(origen, 'skills/suelto.md', 'x');
    escribir(origen, 'skills/rota/leeme.md', 'x');
    const { archivos, skills, avisos } = listarOrigen(origen);
    assert.ok(archivos.includes('skills/youtubeman/plantillas/escena.md'), 'las subcarpetas de una skill también');
    assert.ok(archivos.includes('skills/rota/leeme.md'));
    for (const no of ['agents/notas.txt', 'skills/youtubeman/Thumbs.db', 'skills/suelto.md']) {
      assert.ok(!archivos.includes(no), no);
    }
    assert.ok(!archivos.some((a) => a.includes('.bak-')));
    assert.deepEqual(skills.sort(), ['rota', 'youtubeman']);
    assert.ok(avisos.some((a) => a.includes('skills/suelto.md no está dentro de la carpeta de una skill')));
    assert.ok(avisos.some((a) => a.includes('La skill rota no tiene SKILL.md')));
  });

  test('origen inexistente o vacío: error claro', () => {
    assert.throws(() => listarOrigen(path.join(tmp, 'no-existe')), /No existe la carpeta de origen/);
    const vacio = path.join(tmp, 'vacío');
    fs.mkdirSync(path.join(vacio, 'agents'), { recursive: true });
    assert.throws(() => listarOrigen(vacio), /No hay nada que instalar/);
  });
});

describe('instalar', () => {
  test('primera vez: crea lo nuestro y no toca nada del usuario', () => {
    const antes = foto(destino);
    const r = instalar({ origen, destino, marca: '20261002120000' });
    assert.deepEqual(
      r.resultados.map((x) => [x.rel, x.resultado]),
      NUESTROS.map((n) => [n, 'creado']),
    );
    assert.equal(r.diferencias, NUESTROS.length);
    assert.equal(r.conflictos, 0);
    const despues = foto(destino);
    for (const [rel, contenido] of Object.entries(antes)) assert.equal(despues[rel], contenido, `tocó ${rel}`);
    for (const rel of NUESTROS) assert.equal(despues[rel], instalado(rel), rel);
    assert.deepEqual(Object.keys(despues).sort(), [...Object.keys(antes), ...NUESTROS].sort());
  });

  test('segunda vez: todo igual, sin copias', () => {
    instalar({ origen, destino });
    const antes = foto(destino);
    const r = instalar({ origen, destino });
    assert.ok(r.resultados.every((x) => x.resultado === 'igual'));
    assert.equal(r.diferencias, 0);
    assert.deepEqual(foto(destino), antes);
  });

  test('un archivo distinto se actualiza guardando antes la versión instalada en .bak-AAAAMMDDHHmmss', () => {
    instalar({ origen, destino });
    escribir(destino, 'skills/youtubeman/SKILL.md', 'EDITADO A MANO');
    escribir(origen, 'agents/youtubeman-critico.md', 'CRÍTICO NUEVO');
    const r = instalar({ origen, destino, marca: '20261002123456' });
    const porRel = Object.fromEntries(r.resultados.map((x) => [x.rel, x]));
    assert.equal(porRel['skills/youtubeman/SKILL.md'].resultado, 'actualizado');
    assert.equal(porRel['agents/youtubeman-critico.md'].resultado, 'actualizado');
    assert.equal(porRel['agents/youtubeman-animador.md'].resultado, 'igual');

    const skill = path.join(destino, 'skills', 'youtubeman', 'SKILL.md');
    assert.equal(porRel['skills/youtubeman/SKILL.md'].copia, `${skill}.bak-20261002123456`);
    assert.equal(
      fs.readFileSync(`${skill}.bak-20261002123456`, 'utf8'),
      'EDITADO A MANO',
      'el trabajo a mano se salva',
    );
    assert.equal(fs.readFileSync(skill, 'utf8'), instalado('skills/youtubeman/SKILL.md'));
    assert.equal(fs.readFileSync(path.join(destino, 'agents', 'youtubeman-critico.md'), 'utf8'), 'CRÍTICO NUEVO');

    // Otra actualización en el mismo segundo no pisa la copia anterior.
    escribir(destino, 'skills/youtubeman/SKILL.md', 'OTRA EDICIÓN');
    const r2 = instalar({ origen, destino, marca: '20261002123456' });
    const copia2 = r2.resultados.find((x) => x.rel === 'skills/youtubeman/SKILL.md').copia;
    assert.equal(copia2, `${skill}.bak-20261002123456-2`);
    assert.equal(fs.readFileSync(`${skill}.bak-20261002123456`, 'utf8'), 'EDITADO A MANO');
    assert.equal(fs.readFileSync(copia2, 'utf8'), 'OTRA EDICIÓN');
  });

  test('nunca borra: lo que ya no está en el origen se queda (y se informa como "sobra")', () => {
    instalar({ origen, destino });
    escribir(destino, 'skills/youtubeman/mio.md', 'nota propia');
    fs.rmSync(path.join(origen, 'skills', 'youtubeman', 'encargos.md'));
    const r = instalar({ origen, destino });
    assert.deepEqual(r.sobran.sort(), ['skills/youtubeman/encargos.md', 'skills/youtubeman/mio.md']);
    assert.ok(fs.existsSync(path.join(destino, 'skills', 'youtubeman', 'encargos.md')));
    assert.equal(fs.readFileSync(path.join(destino, 'skills', 'youtubeman', 'mio.md'), 'utf8'), 'nota propia');
    assert.match(informe(r), /sobra {8}skills\/youtubeman\/mio\.md {2}\(ya no está en el origen; no se borra\)/);
  });

  test('las copias .bak del destino no cuentan como "sobra"', () => {
    instalar({ origen, destino });
    escribir(destino, 'skills/youtubeman/SKILL.md', 'editado');
    instalar({ origen, destino });
    assert.deepEqual(instalar({ origen, destino }).sobran, []);
  });

  test('--comprobar: dice qué falta o es distinto sin escribir nada', () => {
    const antes = foto(destino);
    const r = instalar({ origen, destino, comprobar: true });
    assert.ok(r.resultados.every((x) => x.resultado === 'falta'));
    assert.equal(r.diferencias, NUESTROS.length);
    assert.deepEqual(foto(destino), antes);
    assert.match(informe(r), /❌ 5 archivo\(s\) faltan o son distintos en .*: ejecuta npm run instalar-agentes\./);

    instalar({ origen, destino });
    escribir(origen, 'agents/youtubeman-explorador.md', 'cambio');
    const instalado = foto(destino);
    const r2 = instalar({ origen, destino, comprobar: true });
    assert.equal(r2.diferencias, 1);
    assert.equal(r2.resultados.find((x) => x.rel === 'agents/youtubeman-explorador.md').resultado, 'distinto');
    assert.deepEqual(foto(destino), instalado);

    instalar({ origen, destino });
    const r3 = instalar({ origen, destino, comprobar: true });
    assert.equal(r3.diferencias, 0);
    assert.match(informe(r3), /✅ .* está al día \(5 archivos iguales\)\./);
  });

  test('si en el destino hay una carpeta donde va un archivo: conflicto, no se toca y lo demás se instala', () => {
    fs.mkdirSync(path.join(destino, 'agents', 'youtubeman-critico.md', 'dentro'), { recursive: true });
    const r = instalar({ origen, destino });
    assert.equal(r.conflictos, 1);
    assert.equal(r.resultados.find((x) => x.rel === 'agents/youtubeman-critico.md').resultado, 'conflicto');
    assert.ok(fs.statSync(path.join(destino, 'agents', 'youtubeman-critico.md')).isDirectory());
    assert.ok(fs.existsSync(path.join(destino, 'agents', 'youtubeman-animador.md')));
    assert.match(informe(r), /❌ 1 conflicto\(s\)/);
  });

  test('el destino no puede ser el origen ni estar dentro de él', () => {
    assert.throws(() => instalar({ origen, destino: origen }), /no puede ser el origen ni estar dentro de él/);
    assert.throws(() => planificarInstalacion({ origen, destino: path.join(origen, 'x') }), /no puede ser el origen/);
  });

  test('informe de una instalación: cada acción y el resumen', () => {
    const r = instalar({ origen, destino, marca: '20261002120000' });
    const texto = informe(r);
    for (const rel of NUESTROS) assert.ok(texto.includes(`  creado       ${rel}`), rel);
    assert.match(texto, /✅ 5 creado\(s\) · 0 actualizado\(s\) · 0 igual\(es\) en /);
    assert.match(texto, /Abre una sesión nueva de Claude Code/);
    escribir(destino, 'agents/youtubeman-animador.md', 'x');
    const t2 = informe(instalar({ origen, destino, marca: '20261002120001' }));
    assert.match(
      t2,
      /actualizado {2}agents\/youtubeman-animador\.md {2}\(copia: youtubeman-animador\.md\.bak-20261002120001\)/,
    );
  });
});

describe('la herramienta desde la consola (siempre con --origen y --destino temporales)', () => {
  const correr = (...args) => ejecutarNode(['tools/instalar-agentes.mjs', ...args], { cwd: ESTUDIO });

  test('instala, comprueba (0 al día, 1 con diferencias) y falla con ❌ si no hay origen', async () => {
    const pre = await correr('--origen', origen, '--destino', destino, '--comprobar');
    assert.equal(pre.codigo, 1, pre.stdout + pre.stderr);
    assert.match(pre.stdout, /^Comparando /);

    const ins = await correr('--origen', origen, '--destino', destino);
    assert.equal(ins.codigo, 0, ins.stderr);
    assert.match(ins.stdout, /^Instalando /);
    assert.match(ins.stdout, /✅ 5 creado\(s\)/);
    assert.equal(
      fs.readFileSync(path.join(destino, 'agents', 'investigador.md'), 'utf8'),
      DEL_USUARIO['agents/investigador.md'],
    );

    const post = await correr('--origen', origen, '--destino', destino, '--comprobar');
    assert.equal(post.codigo, 0, post.stdout);
    assert.match(post.stdout, /está al día/);

    const mal = await correr('--origen', path.join(tmp, 'nada'), '--destino', destino);
    assert.equal(mal.codigo, 1);
    assert.match(mal.stderr, /^❌ No existe la carpeta de origen/);
  });

  test('--ayuda sale con 0', async () => {
    const r = await correr('--ayuda');
    assert.equal(r.codigo, 0);
    assert.match(r.stdout, /^Uso: node tools\/instalar-agentes\.mjs/);
  });
});
