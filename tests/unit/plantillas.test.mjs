import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ESTUDIO } from '../../tools/lib/rutas.mjs';

// Un formateador de Markdown convierte "__NOMBRE__" en negrita ("**NOMBRE**") y nuevo-proyecto deja de
// sustituirlo. Ya pasó una vez: este test lo vigila.
const DIR = path.join(ESTUDIO, 'templates', 'proyecto');

test('las plantillas de proyecto conservan sus marcadores intactos', () => {
  const md = fs.readdirSync(DIR).filter((f) => f.endsWith('.md'));
  assert.ok(md.length >= 4, `plantillas encontradas: ${md.join(', ')}`);
  for (const f of md) {
    const texto = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.match(texto, /__NOMBRE__/, `${f} ha perdido el marcador __NOMBRE__`);
    assert.doesNotMatch(texto, /\*\*(NOMBRE|REPO|URL|FECHA)\*\*/, `${f}: un marcador se ha convertido en negrita`);
  }
  const json = JSON.parse(fs.readFileSync(path.join(DIR, 'proyecto.json'), 'utf8'));
  assert.deepEqual([json.nombre, json.repo, json.url, json.creado], ['__NOMBRE__', '__REPO__', '__URL__', '__FECHA__']);
});
