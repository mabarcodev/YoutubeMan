// Tests de tools/nuevo-proyecto.mjs: relleno de plantillas (texto y JSON), valores por defecto, dónde se crea
// la carpeta y la creación real con las plantillas del estudio en una carpeta temporal. Nunca se pasa un nombre
// suelto a la herramienta de verdad: eso crearía el proyecto en la carpeta de vídeos del usuario.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARPETAS,
  PLANTILLAS,
  VACIOS,
  contenidoRellenado,
  crearProyecto,
  fechaISO,
  leerOpciones,
  listarPlantillas,
  rellenarPlantilla,
  rellenarProyecto,
  resolverCarpeta,
  resumen,
  valoresProyecto,
} from '../../tools/nuevo-proyecto.mjs';
import { ESTUDIO, borrar, carpetaTemporal, ejecutarNode } from '../helpers/entorno.mjs';

const VALORES = { NOMBRE: 'MiProducto', REPO: null, URL: null, FECHA: '2026-10-02' };
const FECHA = new Date(2026, 9, 2, 23, 30); // 23:30 hora local: en UTC ya podría ser otro día

describe('rellenarPlantilla', () => {
  test('sustituye cada marcador, también repetido; null se escribe como "(sin …)"', () => {
    const texto = '# __NOMBRE__ · repo __REPO__ · __URL__ · __FECHA__ · __NOMBRE__';
    assert.equal(
      rellenarPlantilla(texto, VALORES),
      '# MiProducto · repo (sin repo) · (sin URL) · 2026-10-02 · MiProducto',
    );
    assert.equal(VACIOS.REPO, '(sin repo)');
    assert.equal(VACIOS.URL, '(sin URL)');
  });

  test('deja tal cual los marcadores que no conoce y lo que no es un marcador', () => {
    assert.equal(rellenarPlantilla('__OTRO__ __init__ __ __NOMBRE__', VALORES), '__OTRO__ __init__ __ MiProducto');
  });

  test('un valor con $& o $1 (rutas, URLs) se copia literal', () => {
    const repo = 'C:\\repos\\$&\\$1\\miproducto $$';
    assert.equal(rellenarPlantilla('repo: __REPO__', { ...VALORES, REPO: repo }), `repo: ${repo}`);
  });

  test('sin valor y sin texto de "vacío" conocido: cadena vacía', () => {
    assert.equal(rellenarPlantilla('[__NOTA__]', { NOTA: null }), '[]');
  });
});

describe('rellenarProyecto', () => {
  const plantilla = () => JSON.parse(fs.readFileSync(path.join(PLANTILLAS, 'proyecto.json'), 'utf8'));

  test('con la plantilla real: repo y url quedan null (JSON válido) y el resto intacto', () => {
    const original = plantilla();
    const copia = structuredClone(original);
    const r = rellenarProyecto(original, VALORES);
    assert.deepEqual(original, copia, 'no modifica el objeto de entrada');
    assert.equal(r.nombre, 'MiProducto');
    assert.equal(r.repo, null);
    assert.equal(r.url, null);
    assert.equal(r.creado, '2026-10-02');
    assert.deepEqual(r.formatos, original.formatos);
    assert.deepEqual(r.tempo, original.tempo);
    assert.equal(r.fps, original.fps);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  });

  test('con repo y URL: las cadenas tal cual', () => {
    const r = rellenarProyecto(plantilla(), { ...VALORES, REPO: 'D:\\DEV\\MiProducto', URL: 'https://miproducto.app' });
    assert.equal(r.repo, 'D:\\DEV\\MiProducto');
    assert.equal(r.url, 'https://miproducto.app');
  });

  test('un marcador dentro de un texto más largo usa el texto de "vacío"; recorre listas y objetos', () => {
    const r = rellenarProyecto({ a: ['__NOMBRE__', 'repo: __REPO__', 3, true, null], b: { c: '__URL__' } }, VALORES);
    assert.deepEqual(r, { a: ['MiProducto', 'repo: (sin repo)', 3, true, null], b: { c: null } });
  });
});

describe('valoresProyecto y fechaISO', () => {
  test('fechaISO usa la fecha local', () => {
    assert.equal(fechaISO(FECHA), '2026-10-02');
    assert.equal(fechaISO(new Date(2026, 0, 5)), '2026-01-05');
  });

  test('por defecto el nombre es el de la carpeta y repo/url quedan null', () => {
    const v = valoresProyecto({ carpeta: path.resolve('/videos/Mi App ñ'), fecha: FECHA });
    assert.deepEqual(v, { NOMBRE: 'Mi App ñ', REPO: null, URL: null, FECHA: '2026-10-02' });
  });

  test('recorta espacios, ignora valores en blanco y resuelve el repo desde cwd', () => {
    const cwd = path.resolve('/trabajo');
    const v = valoresProyecto({
      carpeta: path.resolve('/videos/x'),
      nombre: '  Mi Producto  ',
      repo: ' ../repos/miproducto ',
      url: '   ',
      fecha: FECHA,
      cwd,
    });
    assert.equal(v.NOMBRE, 'Mi Producto');
    assert.equal(v.REPO, path.resolve(cwd, '../repos/miproducto'));
    assert.equal(v.URL, null);
  });
});

describe('resolverCarpeta', () => {
  const videos = path.resolve('/Vídeos');
  const cwd = path.resolve('/Vídeos/_estudio');

  test('un nombre suelto va a la carpeta de vídeos (no dentro de _estudio)', () => {
    assert.equal(resolverCarpeta('MiProducto', { cwd, videos }), path.join(videos, 'MiProducto'));
    assert.equal(resolverCarpeta('  Mi App ñ ', { cwd, videos }), path.join(videos, 'Mi App ñ'));
  });

  test('una ruta (con barras o absoluta) se resuelve normal', () => {
    assert.equal(resolverCarpeta('../Otra', { cwd, videos }), path.resolve(cwd, '../Otra'));
    assert.equal(resolverCarpeta('sub\\x', { cwd, videos }), path.resolve(cwd, 'sub\\x'));
    assert.equal(resolverCarpeta(path.resolve('/abs/p'), { cwd, videos }), path.resolve('/abs/p'));
    assert.equal(resolverCarpeta('.', { cwd, videos }), cwd);
  });

  test('vacía: error', () => {
    assert.throws(() => resolverCarpeta('   ', { cwd, videos }), /está vacía/);
  });
});

describe('leerOpciones', () => {
  test('carpeta y opciones', () => {
    assert.deepEqual(leerOpciones(['MiApp', '--nombre', 'Mi App', '--repo', 'D:/r', '--url', 'https://x']), {
      carpeta: 'MiApp',
      nombre: 'Mi App',
      repo: 'D:/r',
      url: 'https://x',
    });
  });

  test('--ayuda, sin carpeta y opción desconocida', () => {
    assert.deepEqual(leerOpciones(['--ayuda']), { ayuda: true });
    assert.throws(() => leerOpciones([]), /Indica la carpeta del proyecto/);
    assert.throws(() => leerOpciones(['a', 'b']), /Indica la carpeta del proyecto/);
    assert.throws(() => leerOpciones(['a', '--nombr', 'x']), /Opción desconocida: --nombr/);
  });
});

describe('plantillas y contenido', () => {
  let tmp;
  before(() => (tmp = carpetaTemporal('nuevo-plantillas')));
  after(() => borrar(tmp));

  test('las plantillas reales del estudio están todas', () => {
    assert.deepEqual(listarPlantillas(PLANTILLAS), ['LOOK.md', 'README.md', 'brief.md', 'guion.md', 'proyecto.json']);
  });

  test('listarPlantillas recorre subcarpetas con rutas /', () => {
    fs.mkdirSync(path.join(tmp, 'escenas', '01'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'escenas', '01', 'escena.js'), '');
    fs.writeFileSync(path.join(tmp, 'a.md'), '');
    assert.deepEqual(listarPlantillas(tmp), ['a.md', 'escenas/01/escena.js']);
  });

  test('contenidoRellenado: JSON como objeto, texto con marcadores y binario intacto', () => {
    const json = contenidoRellenado('proyecto.json', Buffer.from('{"repo":"__REPO__","n":"__NOMBRE__"}'), VALORES);
    assert.deepEqual(JSON.parse(json), { repo: null, n: 'MiProducto' });
    assert.ok(json.endsWith('\n'));
    assert.equal(contenidoRellenado('a.md', Buffer.from('# __NOMBRE__'), VALORES), '# MiProducto');
    const binario = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x5f, 0x5f, 0x4e, 0x5f, 0x5f]);
    assert.equal(contenidoRellenado('logo.png', binario, VALORES), binario);
  });

  test('una plantilla JSON rota se rellena como texto (y crearProyecto avisará)', () => {
    assert.equal(contenidoRellenado('x.json', Buffer.from('{"a": __NOMBRE__'), VALORES), '{"a": MiProducto');
  });
});

describe('crearProyecto con las plantillas reales', () => {
  let tmp;
  let estudio;
  before(() => {
    tmp = carpetaTemporal('nuevo-proyecto');
    estudio = path.join(tmp, '_estudio');
    fs.mkdirSync(estudio);
  });
  after(() => borrar(tmp));

  test('crea los archivos rellenados y todas las carpetas de trabajo', () => {
    const carpeta = path.join(tmp, 'Vídeos', 'Mi App ñ');
    const r = crearProyecto({ carpeta, fecha: FECHA, estudio });
    assert.equal(r.carpeta, carpeta);
    assert.deepEqual(
      r.archivos.map((a) => [a.ruta, a.estado]),
      listarPlantillas(PLANTILLAS).map((f) => [f, 'creado']),
    );
    assert.deepEqual(r.avisos, []);
    for (const c of CARPETAS) assert.ok(fs.statSync(path.join(carpeta, c)).isDirectory(), c);
    assert.deepEqual(r.carpetas[0], { ruta: '.', estado: 'creado' });

    const proyecto = JSON.parse(fs.readFileSync(path.join(carpeta, 'proyecto.json'), 'utf8'));
    assert.equal(proyecto.nombre, 'Mi App ñ');
    assert.equal(proyecto.repo, null);
    assert.equal(proyecto.url, null);
    assert.equal(proyecto.creado, '2026-10-02');

    const brief = fs.readFileSync(path.join(carpeta, 'brief.md'), 'utf8');
    assert.ok(brief.startsWith('# Brief · Mi App ñ'));
    assert.ok(brief.includes('**Repo (solo lectura):** (sin repo)'));
    assert.ok(brief.includes('**Web o app para capturas reales:** (sin URL)'));
    for (const f of listarPlantillas(PLANTILLAS)) {
      const texto = fs.readFileSync(path.join(carpeta, f), 'utf8');
      assert.doesNotMatch(texto, /__[A-Z]+__/, `${f} tiene marcadores sin rellenar`);
    }
  });

  test('volver a ejecutarlo nunca sobrescribe: dice "ya existía" y completa lo que falte', () => {
    const carpeta = path.join(tmp, 'Vídeos', 'Mi App ñ');
    fs.writeFileSync(path.join(carpeta, 'brief.md'), 'MI BRIEF');
    fs.rmSync(path.join(carpeta, 'guion.md'));
    fs.rmSync(path.join(carpeta, 'kit', 'audio'), { recursive: true });
    const r = crearProyecto({ carpeta, nombre: 'Otro nombre', fecha: FECHA, estudio });
    const estado = Object.fromEntries(r.archivos.map((a) => [a.ruta, a.estado]));
    assert.equal(estado['brief.md'], 'ya existía');
    assert.equal(estado['proyecto.json'], 'ya existía');
    assert.equal(estado['guion.md'], 'creado');
    assert.equal(fs.readFileSync(path.join(carpeta, 'brief.md'), 'utf8'), 'MI BRIEF');
    assert.equal(JSON.parse(fs.readFileSync(path.join(carpeta, 'proyecto.json'), 'utf8')).nombre, 'Mi App ñ');
    assert.ok(fs.existsSync(path.join(carpeta, 'kit', 'audio')));
    const carpetas = Object.fromEntries(r.carpetas.map((c) => [c.ruta, c.estado]));
    assert.equal(carpetas['kit/audio'], 'creado');
    assert.equal(carpetas['escenas'], 'ya existía');
  });

  test('con repo que existe y URL: quedan en proyecto.json y en el brief', () => {
    const repo = path.join(tmp, 'repos', 'Mi Producto');
    fs.mkdirSync(repo, { recursive: true });
    const carpeta = path.join(tmp, 'Vídeos', 'Con repo');
    const r = crearProyecto({
      carpeta,
      nombre: 'MiProducto',
      repo,
      url: 'https://miproducto.app',
      fecha: FECHA,
      estudio,
    });
    assert.deepEqual(r.avisos, []);
    const texto = fs.readFileSync(path.join(carpeta, 'proyecto.json'), 'utf8');
    const proyecto = JSON.parse(texto);
    assert.equal(proyecto.repo, repo, 'las barras invertidas de Windows quedan bien escapadas');
    assert.equal(proyecto.url, 'https://miproducto.app');
    assert.match(texto, /^ {2}"formatos": \["16:9", "9:16"\],$/m, 'las listas cortas en una línea, como la plantilla');
    assert.ok(texto.endsWith('}\n'));
    const brief = fs.readFileSync(path.join(carpeta, 'brief.md'), 'utf8');
    assert.ok(brief.includes(repo));
    assert.ok(brief.includes('https://miproducto.app'));
  });

  test('avisa si el repo no existe o la URL no empieza por http(s), pero crea el proyecto', () => {
    const carpeta = path.join(tmp, 'Vídeos', 'Con avisos');
    const r = crearProyecto({
      carpeta,
      repo: path.join(tmp, 'no-existe'),
      url: 'miproducto.app',
      fecha: FECHA,
      estudio,
    });
    assert.equal(r.avisos.length, 2);
    assert.match(r.avisos[0], /no existe \(¿ruta mal escrita\?\)/);
    assert.match(r.avisos[1], /no empieza por http/);
    assert.ok(fs.existsSync(path.join(carpeta, 'proyecto.json')));
  });

  test('se niega a crear el proyecto dentro del estudio o alrededor de él', () => {
    assert.throws(() => crearProyecto({ carpeta: path.join(estudio, 'x'), estudio }), /dentro de _estudio/);
    assert.throws(() => crearProyecto({ carpeta: tmp, estudio }), /dentro de _estudio ni contenerlo/);
    assert.equal(fs.existsSync(path.join(estudio, 'x')), false);
  });

  test('si la ruta es un archivo o faltan las plantillas, error claro', () => {
    const archivo = path.join(tmp, 'soy-un-archivo');
    fs.writeFileSync(archivo, '');
    assert.throws(() => crearProyecto({ carpeta: archivo, estudio }), /no es una carpeta/);
    assert.throws(
      () => crearProyecto({ carpeta: path.join(tmp, 'p2'), estudio, plantillas: path.join(tmp, 'no-hay') }),
      /No encuentro las plantillas/,
    );
  });

  test('plantillas propias: binarios byte a byte, aviso de marcadores desconocidos y de JSON roto', () => {
    const plantillas = path.join(tmp, 'plantillas');
    fs.mkdirSync(path.join(plantillas, 'kit', 'marca'), { recursive: true });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
    fs.writeFileSync(path.join(plantillas, 'kit', 'marca', 'logo.png'), png);
    fs.writeFileSync(path.join(plantillas, 'notas.md'), '__NOMBRE__ y __DESCONOCIDO__');
    fs.writeFileSync(path.join(plantillas, 'roto.json'), '{"a": "__NOMBRE__"');
    const carpeta = path.join(tmp, 'Vídeos', 'Propias');
    const r = crearProyecto({ carpeta, plantillas, fecha: FECHA, estudio });
    assert.deepEqual(fs.readFileSync(path.join(carpeta, 'kit', 'marca', 'logo.png')), png);
    assert.equal(fs.readFileSync(path.join(carpeta, 'notas.md'), 'utf8'), 'Propias y __DESCONOCIDO__');
    assert.ok(r.avisos.some((a) => a === 'notas.md: marcadores sin rellenar __DESCONOCIDO__.'));
    assert.ok(r.avisos.some((a) => a.startsWith('roto.json no es JSON válido')));
  });
});

describe('resumen', () => {
  test('estado de cada archivo, carpetas, datos, avisos y siguientes pasos con rutas entre comillas', () => {
    const texto = resumen(
      {
        carpeta: path.resolve('/Vídeos/Mi App'),
        valores: VALORES,
        archivos: [
          { ruta: 'brief.md', estado: 'creado' },
          { ruta: 'LOOK.md', estado: 'ya existía' },
        ],
        carpetas: [
          { ruta: '.', estado: 'creado' },
          { ruta: 'kit/audio', estado: 'creado' },
          { ruta: 'escenas', estado: 'ya existía' },
        ],
        avisos: ['El repo X no existe.'],
      },
      path.resolve('/Vídeos/_estudio'),
    );
    assert.ok(texto.startsWith('✅ Proyecto "MiProducto" en '));
    assert.match(texto, /creado {6}brief\.md/);
    assert.match(texto, /ya existía {2}LOOK\.md/);
    assert.ok(texto.includes('carpetas    creadas: kit/audio'));
    assert.ok(texto.includes('repo: (sin repo) · URL: (sin URL) · fecha: 2026-10-02'));
    assert.ok(texto.includes('⚠ El repo X no existe.'));
    assert.ok(texto.includes('Siguientes pasos:'));
    assert.match(texto, /node ".*\/_estudio\/tools\/medir-audio\.mjs" ".*\/Mi App\/kit\/audio" --ritmo --convertir/);
    assert.match(texto, /vista-previa\.mjs" --proyecto ".*\/Mi App" --modulo/);
  });

  test('si ya existían todas las carpetas lo dice', () => {
    const texto = resumen({
      carpeta: path.resolve('/p'),
      valores: VALORES,
      archivos: [],
      carpetas: [{ ruta: '.', estado: 'ya existía' }],
      avisos: [],
    });
    assert.ok(texto.includes('ya existían todas'));
  });
});

describe('la herramienta desde la consola', () => {
  let tmp;
  before(() => (tmp = carpetaTemporal('nuevo-cli')));
  after(() => borrar(tmp));

  test('crea el proyecto, y la segunda vez no toca nada', async () => {
    const carpeta = path.join(tmp, 'Vídeos con espacios', 'App ñ');
    const args = ['tools/nuevo-proyecto.mjs', carpeta, '--nombre', 'App Ñ', '--url', 'https://app.example'];
    const r1 = await ejecutarNode(args, { cwd: ESTUDIO });
    assert.equal(r1.codigo, 0, r1.stderr);
    assert.ok(r1.stdout.includes('✅ Proyecto "App Ñ"'));
    const proyecto = JSON.parse(fs.readFileSync(path.join(carpeta, 'proyecto.json'), 'utf8'));
    assert.equal(proyecto.url, 'https://app.example');
    assert.equal(proyecto.repo, null);
    const r2 = await ejecutarNode(args, { cwd: ESTUDIO });
    assert.equal(r2.codigo, 0, r2.stderr);
    assert.match(r2.stdout, /ya existía {2}proyecto\.json/);
  });

  test('--ayuda sale con 0 y un error con ❌ y 1', async () => {
    const ayuda = await ejecutarNode(['tools/nuevo-proyecto.mjs', '--ayuda'], { cwd: ESTUDIO });
    assert.equal(ayuda.codigo, 0);
    assert.ok(ayuda.stdout.startsWith('Uso: node tools/nuevo-proyecto.mjs'));
    const archivo = path.join(tmp, 'archivo.txt');
    fs.writeFileSync(archivo, '');
    const mal = await ejecutarNode(['tools/nuevo-proyecto.mjs', archivo], { cwd: ESTUDIO });
    assert.equal(mal.codigo, 1);
    assert.match(mal.stderr, /^❌ .*no es una carpeta/);
  });
});
