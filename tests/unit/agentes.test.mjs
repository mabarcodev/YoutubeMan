// Tests de la skill y los agentes de .claude/ (y de AGENTS.md y CLAUDE.md). Se usan tal cual, sin instalador:
// por eso no pueden llevar rutas de ningún ordenador y todo lo que citan del estudio tiene que existir. También
// comprueba que git ignora los vídeos de videos/ (los de cada persona nunca se suben).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ESTUDIO } from '../helpers/entorno.mjs';

const leer = (rel) => fs.readFileSync(path.join(ESTUDIO, ...rel.split('/')), 'utf8');

/** Campos de un frontmatter sencillo (una «clave: valor» por línea), o null si no hay. */
function frontmatter(texto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  if (!m) return null;
  const pares = m[1].split(/\r?\n/).map((l) => /^([\w-]+):\s*(.*)$/.exec(l));
  return Object.fromEntries(pares.filter(Boolean).map((p) => [p[1], p[2].trim()]));
}

const SKILL = '.claude/skills/youtubeman/SKILL.md';
const AGENTES = ['youtubeman-explorador', 'youtubeman-animador', 'youtubeman-critico'];
const INSTRUCCIONES = [
  SKILL,
  '.claude/skills/youtubeman/encargos.md',
  ...AGENTES.map((a) => `.claude/agents/${a}.md`),
  'AGENTS.md',
  'CLAUDE.md',
];

/** Rutas del estudio citadas en un texto: `docs/…`, `$E/REGLAS.md`, `<estudio>/ejemplos/demo/`, `node tools/x.mjs`. */
function rutasCitadas(texto) {
  const patron =
    /(?:^|[\s`(]|\$E\/|<estudio>\/)((?:docs|tools|templates|ejemplos|engine|\.claude)\/(?:[\w./-]*[\w/])?|(?:REGLAS|AGENTS)\.md)/g;
  return [...new Set([...texto.matchAll(patron)].map((m) => m[1]))];
}

describe('skill y agentes de .claude/', () => {
  test('la skill /youtubeman tiene nombre y descripción', () => {
    const fm = frontmatter(leer(SKILL));
    assert.equal(fm?.name, 'youtubeman');
    assert.ok(fm.description.length > 50, 'la descripción decide cuándo se usa la skill');
  });

  test('los tres agentes existen, con descripción y el name igual al nombre del archivo', () => {
    for (const a of AGENTES) {
      const fm = frontmatter(leer(`.claude/agents/${a}.md`));
      assert.equal(fm?.name, a, a);
      assert.ok(fm.description.length > 50, a);
    }
  });

  test('sin marcadores ni rutas de ningún ordenador', () => {
    for (const rel of INSTRUCCIONES) {
      const texto = leer(rel);
      assert.doesNotMatch(texto, /\{\{[A-Z_]+\}\}/, `${rel}: marcador sin sustituir`);
      assert.doesNotMatch(texto, /\b[A-Za-z]:[\\/]|\/Users\/|\/home\//, `${rel}: ruta absoluta`);
      assert.doesNotMatch(texto, /_estudio\//, `${rel}: nombre de carpeta antiguo`);
    }
  });

  test('todo lo que citan del estudio existe', () => {
    const faltan = [];
    for (const rel of INSTRUCCIONES) {
      for (const ruta of rutasCitadas(leer(rel))) {
        if (!fs.existsSync(path.join(ESTUDIO, ...ruta.split('/').filter(Boolean)))) faltan.push(`${rel} → ${ruta}`);
      }
    }
    assert.deepEqual(faltan, []);
  });

  test('rutasCitadas: encuentra las rutas con sus prefijos y se para en los huecos <…>', () => {
    const texto =
      'Lee `$E/REGLAS.md` y `<estudio>/docs/CONTRATO-ESCENA.md`. node tools/render.mjs --proyecto <dir>; ' +
      '`node $E/tools/<herramienta>.mjs`, `ejemplos/demo/` y escenas/<NN>/escena.js.';
    assert.deepEqual(rutasCitadas(texto), [
      'REGLAS.md',
      'docs/CONTRATO-ESCENA.md',
      'tools/render.mjs',
      'tools/',
      'ejemplos/demo/',
    ]);
  });
});

describe('videos/ en git', () => {
  /** 0 = git lo ignora, 1 = no lo ignora; null si no hay git o no es un repo (p. ej. descargado en zip). */
  const ignorado = (ruta) => {
    const r = spawnSync('git', ['check-ignore', '-q', '--no-index', ruta], { cwd: ESTUDIO });
    return r.error || r.status > 1 ? null : r.status === 0;
  };

  test('los vídeos y los permisos locales se ignoran; el README de videos/ y la skill, no', (t) => {
    if (ignorado('videos/README.md') === null) return t.skip('sin git o fuera de un repo');
    assert.equal(ignorado('videos/MiApp/salida/MiApp-v1.mp4'), true);
    assert.equal(ignorado('videos/MiApp/proyecto.json'), true);
    assert.equal(ignorado('.claude/settings.local.json'), true);
    assert.equal(ignorado('videos/README.md'), false);
    assert.equal(ignorado(SKILL), false);
  });
});
