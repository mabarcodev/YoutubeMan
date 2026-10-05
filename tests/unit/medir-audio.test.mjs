// Tests de tools/medir-audio.mjs sin ffmpeg ni Python: qué se mide y qué se convierte, la fusión de
// AUDIO.json (lo escrito por una persona nunca se pierde), el JSON legible, la tabla y el flujo completo con
// la medición, la conversión y el ritmo inyectados. Lo real (ffmpeg + librosa) va en tests/integracion.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BEATS,
  EXTENSIONES,
  INSTRUCCIONES_VENV,
  NOMBRE_JSON,
  UMBRAL_RITMO_MS,
  analizarRitmo,
  argsConversion,
  buscarAudios,
  buscarProyecto,
  consejos,
  entradaAudio,
  esAudio,
  esWav,
  fusionarAudioJSON,
  jsonLegible,
  leerAudioJSON,
  leerOpciones,
  medirAudio,
  necesitaRitmo,
  planificarMedidas,
  rutaPython,
  rutaRelativa,
  tablaMedidas,
} from '../../tools/medir-audio.mjs';
import { ESTUDIO, borrar, carpetaTemporal } from '../helpers/entorno.mjs';

const BOM = String.fromCharCode(0xfeff);
const medida = (duracionMs, picoMs = 10) => ({ duracionMs, picoMs, picoDb: -3, rmsDb: -20 });
const RITMO = {
  duracion: 20,
  bpm: 120,
  primerPulso: 0.5,
  pulsos: [0.5, 1, 1.5, 2, 2.5],
  compases: [0.5, 2.5],
  golpes: [0.5, 2.5],
  subida: 2,
  subidaDb: 6.1,
};

describe('leerOpciones', () => {
  test('una entrada y las opciones', () => {
    const op = leerOpciones(['kit/audio', '--ritmo', '--convertir', '--json', 'salida/AUDIO.json']);
    assert.equal(op.entrada, path.resolve('kit/audio'));
    assert.equal(op.json, path.resolve('salida/AUDIO.json'));
    assert.equal(op.ritmo, true);
    assert.equal(op.convertir, true);
  });

  test('por defecto: sin JSON, sin ritmo forzado y sin convertir', () => {
    assert.deepEqual(leerOpciones(['a.wav']), {
      entrada: path.resolve('a.wav'),
      json: null,
      ritmo: false,
      convertir: false,
    });
  });

  test('--ayuda y -h', () => {
    assert.deepEqual(leerOpciones(['--ayuda']), { ayuda: true });
    assert.deepEqual(leerOpciones(['-h']), { ayuda: true });
  });

  test('sin entrada o con dos, explica el uso', () => {
    assert.throws(() => leerOpciones([]), /Indica un archivo de audio o una carpeta/);
    assert.throws(() => leerOpciones(['a.wav', 'b.wav']), /Indica un archivo de audio o una carpeta/);
  });

  test('una opción desconocida se explica en español', () => {
    assert.throws(() => leerOpciones(['a.wav', '--bpm']), /Opción desconocida: --bpm/);
  });
});

describe('tipos de archivo', () => {
  test('esAudio reconoce los formatos sin distinguir mayúsculas', () => {
    for (const ext of EXTENSIONES) assert.ok(esAudio(`x${ext.toUpperCase()}`), ext);
    assert.equal(esAudio('notas.txt'), false);
    assert.equal(esAudio('AUDIO.json'), false);
    assert.equal(esAudio('sin-extension'), false);
  });

  test('esWav', () => {
    assert.equal(esWav('a.WAV'), true);
    assert.equal(esWav('a.mp3'), false);
  });

  test('necesitaRitmo: a partir del umbral o si se pide', () => {
    assert.equal(necesitaRitmo(medida(UMBRAL_RITMO_MS)), false);
    assert.equal(necesitaRitmo(medida(UMBRAL_RITMO_MS + 1)), true);
    assert.equal(necesitaRitmo(medida(500), { ritmo: true }), true);
  });

  test('rutaPython según la plataforma', () => {
    assert.equal(rutaPython('/e', 'win32'), path.join('/e', '.venv', 'Scripts', 'python.exe'));
    assert.equal(rutaPython('/e', 'linux'), path.join('/e', '.venv', 'bin', 'python'));
    assert.equal(rutaPython('/e', 'darwin'), path.join('/e', '.venv', 'bin', 'python'));
  });

  test('beats.py está junto a la herramienta', () => {
    assert.equal(BEATS, path.join(ESTUDIO, 'tools', 'beats.py'));
    assert.ok(fs.existsSync(BEATS));
  });

  test('argsConversion: WAV 48 kHz 16 bits, rutas como argumentos sueltos (sin comillas ni shell)', () => {
    const origen = 'C:\\Vídeos con espacios\\kit\\audio\\música "final".mp3';
    const destino = 'C:\\Vídeos con espacios\\kit\\audio\\música "final".wav.tmp';
    const args = argsConversion(origen, destino);
    assert.equal(args[args.indexOf('-i') + 1], origen);
    assert.equal(args.at(-1), destino);
    assert.equal(args[args.indexOf('-ar') + 1], '48000');
    assert.equal(args[args.indexOf('-c:a') + 1], 'pcm_s16le');
    assert.equal(args[args.indexOf('-f') + 1], 'wav');
  });

  test('rutaRelativa usa barras / (la ruta que se escribe en las escenas)', () => {
    assert.equal(rutaRelativa(path.resolve('/p'), path.resolve('/p/kit/audio/clic ñ.wav')), 'kit/audio/clic ñ.wav');
  });
});

describe('buscarAudios y buscarProyecto', () => {
  let tmp;
  before(() => {
    tmp = carpetaTemporal('medir-buscar');
    const audio = path.join(tmp, 'Mi proyecto ñ', 'kit', 'audio');
    for (const rel of ['b.wav', 'a.MP3', 'notas.txt', 'AUDIO.json', 'sub/c.ogg', '.render-tmp/x.wav', 'z/vacía/']) {
      const abs = path.join(audio, ...rel.split('/'));
      if (rel.endsWith('/')) fs.mkdirSync(abs, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, 'x');
      }
    }
    fs.writeFileSync(path.join(tmp, 'Mi proyecto ñ', 'proyecto.json'), '{}');
  });
  after(() => borrar(tmp));

  test('recorre subcarpetas en orden estable y salta las ocultas y lo que no es audio', () => {
    const audio = path.join(tmp, 'Mi proyecto ñ', 'kit', 'audio');
    const rels = buscarAudios(audio).map((f) => rutaRelativa(audio, f));
    assert.deepEqual(rels, ['a.MP3', 'b.wav', 'sub/c.ogg']);
  });

  test('buscarProyecto sube hasta la carpeta con proyecto.json', () => {
    const proyecto = path.join(tmp, 'Mi proyecto ñ');
    assert.equal(buscarProyecto(path.join(proyecto, 'kit', 'audio', 'sub')), proyecto);
    assert.equal(buscarProyecto(proyecto), proyecto);
  });

  test('buscarProyecto sin proyecto.json en ningún sitio: null', () => {
    assert.equal(
      buscarProyecto(path.join(tmp, 'Mi proyecto ñ', 'kit'), () => false),
      null,
    );
  });
});

describe('planificarMedidas', () => {
  const dir = path.resolve('/kit/audio');
  const p = (n) => path.join(dir, n);

  test('un MP3 sin WAV y sin --convertir se mide tal cual, con aviso', () => {
    const [item] = planificarMedidas([p('tema.mp3')], { existe: () => false });
    assert.equal(item.medir, p('tema.mp3'));
    assert.equal(item.original, null);
    assert.equal(item.convertir, false);
    assert.match(item.aviso, /MP3 sin convertir: usa --convertir/);
  });

  test('con --convertir, el MP3 se convierte y se mide el WAV', () => {
    const [item] = planificarMedidas([p('tema.mp3')], { convertir: true, existe: () => false });
    assert.deepEqual(item, { medir: p('tema.wav'), original: p('tema.mp3'), convertir: true, aviso: null });
  });

  test('un WAV con el mismo nombre es la conversión: se mide una sola vez', () => {
    const existe = (r) => r === p('tema.wav');
    const plan = planificarMedidas([p('tema.mp3'), p('tema.wav'), p('clic.wav')], { existe, mtime: () => 1 });
    assert.deepEqual(plan, [
      { medir: p('clic.wav'), original: null, convertir: false, aviso: null },
      { medir: p('tema.wav'), original: p('tema.mp3'), convertir: false, aviso: null },
    ]);
  });

  test('un WAV más antiguo que su original: se avisa o, con --convertir, se reconvierte', () => {
    const existe = (r) => r === p('tema.wav');
    const mtime = (r) => (r.endsWith('.wav') ? 1 : 2);
    const [sin] = planificarMedidas([p('tema.mp3')], { existe, mtime });
    assert.equal(sin.convertir, false);
    assert.match(sin.aviso, /más antiguo que tema\.mp3/);
    const [con] = planificarMedidas([p('tema.mp3')], { convertir: true, existe, mtime });
    assert.equal(con.convertir, true);
    assert.equal(con.aviso, null);
  });

  test('con el WAV al día, --convertir no vuelve a convertir', () => {
    const existe = (r) => r === p('tema.wav');
    const [item] = planificarMedidas([p('tema.mp3')], { convertir: true, existe, mtime: () => 5 });
    assert.equal(item.convertir, false);
  });

  test('dos originales con el mismo nombre (sin distinguir mayúsculas): el segundo no se convierte', () => {
    const plan = planificarMedidas([p('Tema.MP3'), p('tema.ogg')], { convertir: true, existe: () => false });
    const segundo = plan.find((x) => x.medir === p('tema.ogg'));
    assert.equal(segundo.convertir, false);
    assert.match(segundo.aviso, /Comparte nombre con otro audio/);
    assert.equal(plan.filter((x) => x.convertir).length, 1);
  });
});

describe('entradaAudio', () => {
  test('orden legible: rutas, campos de persona, medida, ritmo, aviso y listas al final', () => {
    const e = entradaAudio({ clave: 'm.wav', archivo: 'kit/audio/m.wav', medida: medida(20000), ritmo: RITMO });
    assert.deepEqual(Object.keys(e), [
      'archivo',
      'original',
      'licencia',
      'fuente',
      'notas',
      'duracionMs',
      'picoMs',
      'picoDb',
      'rmsDb',
      'bpm',
      'primerPulso',
      'subida',
      'subidaDb',
      'aviso',
      'pulsos',
      'compases',
      'golpes',
    ]);
    assert.equal(e.licencia, null);
    assert.equal(e.bpm, 120);
    assert.deepEqual(e.pulsos, RITMO.pulsos);
    assert.equal(e.aviso, undefined);
    assert.equal('duracion' in e && e.duracion !== undefined, false, 'la duración en segundos de beats.py sobra');
  });

  test('sin ritmo nuevo, conserva el anterior si el archivo es el mismo (misma duración)', () => {
    const vieja = entradaAudio({ clave: 'm.wav', medida: medida(20000), ritmo: RITMO });
    const igual = entradaAudio({ clave: 'm.wav', medida: medida(20000.5) }, vieja);
    assert.equal(igual.bpm, 120);
    assert.deepEqual(igual.compases, RITMO.compases);
    const otro = entradaAudio({ clave: 'm.wav', medida: medida(18000) }, vieja);
    assert.equal(otro.bpm, undefined, 'otra duración: es otro archivo y el ritmo viejo no vale');
  });

  test('los avisos de la medida y del ritmo se juntan', () => {
    const e = entradaAudio({ clave: 'm.wav', medida: medida(1), ritmo: { ...RITMO, aviso: 'B' }, aviso: 'A' });
    assert.equal(e.aviso, 'A B');
  });

  test('campos de persona: lo heredado del original y lo viejo; un hueco vacío nunca pisa un valor', () => {
    const e = entradaAudio(
      { clave: 'm.wav', original: 'm.mp3', medida: medida(1) },
      { licencia: null, notas: 'nota vieja', extra: '' },
      { licencia: 'Mixkit', fuente: 'https://mixkit.co', extra: 'del original' },
    );
    assert.equal(e.licencia, 'Mixkit');
    assert.equal(e.fuente, 'https://mixkit.co');
    assert.equal(e.notas, 'nota vieja');
    assert.equal(e.extra, 'del original');
    assert.equal(e.original, 'm.mp3');
  });
});

describe('fusionarAudioJSON', () => {
  const FECHA = '2026-01-01T00:00:00.000Z';
  const nueva = (clave, extra = {}) => ({ clave, archivo: `kit/audio/${clave}`, medida: medida(800), ...extra });

  test('sin anterior: leeme, fecha y entradas ordenadas por clave', () => {
    const r = fusionarAudioJSON(null, [nueva('b.wav'), nueva('a.wav')], { fecha: FECHA });
    assert.equal(r.actualizado, FECHA);
    assert.match(r.leeme, /medir-audio\.mjs/);
    assert.deepEqual(Object.keys(r.archivos), ['a.wav', 'b.wav']);
  });

  test('reescribe lo medido y conserva lo escrito a mano (licencia, fuente, notas y campos propios)', () => {
    const anterior = {
      miNota: 'arriba del todo',
      archivos: {
        'a.wav': { licencia: 'CC0', fuente: 'freesound', notas: 'clic suave', uso: 'cursor', picoMs: 999 },
      },
    };
    const r = fusionarAudioJSON(anterior, [nueva('a.wav')], { fecha: FECHA });
    assert.equal(r.miNota, 'arriba del todo');
    const a = r.archivos['a.wav'];
    assert.equal(a.licencia, 'CC0');
    assert.equal(a.fuente, 'freesound');
    assert.equal(a.notas, 'clic suave');
    assert.equal(a.uso, 'cursor');
    assert.equal(a.picoMs, 10, 'la medida nueva sustituye a la vieja');
  });

  test('un WAV recién convertido hereda lo escrito en su original, que desaparece', () => {
    const anterior = { archivos: { 'tema.mp3': { licencia: 'Mixkit', fuente: 'https://mixkit.co/x' } } };
    const r = fusionarAudioJSON(anterior, [nueva('tema.wav', { original: 'tema.mp3' })], { fecha: FECHA });
    assert.deepEqual(Object.keys(r.archivos), ['tema.wav']);
    assert.equal(r.archivos['tema.wav'].licencia, 'Mixkit');
    assert.equal(r.archivos['tema.wav'].original, 'tema.mp3');
  });

  test('carpeta completa: lo que ya no está se quita, salvo que tenga algo escrito a mano (queda "falta")', () => {
    const anterior = {
      archivos: {
        'borrado.wav': { licencia: null, picoMs: 1 },
        'con-licencia.wav': { licencia: 'CC-BY', picoMs: 1 },
      },
    };
    const r = fusionarAudioJSON(anterior, [nueva('a.wav')], { fecha: FECHA });
    assert.equal(r.archivos['borrado.wav'], undefined);
    assert.equal(r.archivos['con-licencia.wav'].falta, true);
    assert.equal(r.archivos['con-licencia.wav'].licencia, 'CC-BY');
  });

  test('si vuelve a aparecer, deja de faltar', () => {
    const anterior = { archivos: { 'a.wav': { licencia: 'CC0', falta: true } } };
    const r = fusionarAudioJSON(anterior, [nueva('a.wav')], { fecha: FECHA });
    assert.equal(r.archivos['a.wav'].falta, undefined);
    assert.equal(r.archivos['a.wav'].licencia, 'CC0');
  });

  test('lo que no se pudo medir esta vez se deja como estaba', () => {
    const anterior = { archivos: { 'roto.wav': { picoMs: 5, licencia: null } } };
    const r = fusionarAudioJSON(anterior, [nueva('a.wav')], { fecha: FECHA, conservar: ['roto.wav'] });
    assert.deepEqual(r.archivos['roto.wav'], { picoMs: 5, licencia: null });
  });

  test('un archivo suelto (no completo) no quita las demás entradas', () => {
    const anterior = { archivos: { 'otro.wav': { picoMs: 5 } } };
    const r = fusionarAudioJSON(anterior, [nueva('a.wav')], { fecha: FECHA, completo: false });
    assert.deepEqual(r.archivos['otro.wav'], { picoMs: 5 });
  });

  test('un anterior con forma rara (lista, sin archivos) no rompe nada', () => {
    for (const anterior of [[], 'texto', { archivos: 'no' }, { archivos: null }]) {
      const r = fusionarAudioJSON(anterior, [nueva('a.wav')], { fecha: FECHA });
      assert.deepEqual(Object.keys(r.archivos), ['a.wav']);
    }
  });
});

describe('jsonLegible', () => {
  test('listas de valores simples en una línea; objetos con sangría; undefined fuera', () => {
    const texto = jsonLegible({ a: [1, 2.5, null], b: { c: 'x', d: undefined }, e: [] });
    assert.equal(texto, '{\n  "a": [1, 2.5, null],\n  "b": {\n    "c": "x"\n  },\n  "e": []\n}');
  });

  test('es JSON válido y equivale a JSON.stringify', () => {
    const valor = {
      archivos: { 'música ñ.wav': { pulsos: [0.1, 0.6], texto: 'comillas "dobles" y \\ barra', vacio: {} } },
      lista: [{ x: 1 }, { y: [true, false] }],
      fecha: new Date(0),
      nada: null,
    };
    assert.deepEqual(JSON.parse(jsonLegible(valor)), JSON.parse(JSON.stringify(valor)));
  });
});

describe('leerAudioJSON', () => {
  let tmp;
  before(() => (tmp = carpetaTemporal('medir-leer')));
  after(() => borrar(tmp));

  test('no existe: null', () => {
    assert.equal(leerAudioJSON(path.join(tmp, 'no-existe.json')), null);
  });

  test('acepta el BOM que añade el Bloc de notas', () => {
    const f = path.join(tmp, 'bom.json');
    fs.writeFileSync(f, `${BOM}{"archivos": {}}`);
    assert.deepEqual(leerAudioJSON(f), { archivos: {} });
  });

  test('un JSON roto para todo con un mensaje claro (nunca se pisa a ciegas)', () => {
    const f = path.join(tmp, 'roto.json');
    fs.writeFileSync(f, '{"archivos": ');
    assert.throws(
      () => leerAudioJSON(f),
      (e) => /no es un JSON válido/.test(e.message) && e.message.includes(f) && e.cause instanceof SyntaxError,
    );
  });
});

describe('tablaMedidas y consejos', () => {
  test('tabla con cabecera, separador y columnas alineadas; vacío donde no hay dato', () => {
    const tabla = tablaMedidas([
      { nombre: 'clic.wav', ...medida(600, 0.1) },
      { nombre: 'música larga.wav', ...medida(32000, 21095.5), bpm: 128.05, primerPulso: 0.004, subida: 15.003 },
    ]);
    const lineas = tabla.split('\n');
    assert.equal(lineas.length, 4);
    assert.match(lineas[0], /^Archivo\s+Duración\s+Pico\s+Pico dB\s+RMS dB\s+BPM\s+1\.er pulso\s+Subida$/);
    assert.match(lineas[1], /^─+( {2}─+)+$/);
    assert.match(lineas[2], /^clic\.wav\s+0\.60 s\s+0\.1 ms\s+-3\.0\s+-20\.0$/);
    assert.match(lineas[3], /32\.00 s\s+21095\.5 ms.*128\.05\s+0\.004 s\s+15\.003 s$/);
    // Todas las filas miden lo mismo hasta la última columna con dato: las columnas están alineadas.
    assert.equal(lineas[0].indexOf('Duración') + 'Duración'.length, lineas[2].indexOf(' s') + 2);
  });

  test('consejos: avisos, fallos, licencias por rellenar, lo que falta y el tempo para proyecto.json', () => {
    const filas = [
      { nombre: 'tema.wav', aviso: 'Tiempo fuerte dudoso.', bpm: 120, primerPulso: 0.5, subida: 8 },
      { nombre: 'clic.wav' },
    ];
    const resultado = {
      archivos: {
        'tema.wav': { licencia: 'Mixkit' },
        'clic.wav': { licencia: null },
        'viejo.wav': { licencia: 'CC0', falta: true },
      },
    };
    const lineas = consejos({ filas, fallos: [{ clave: 'roto.wav', error: 'ffmpeg falló' }], resultado });
    assert.ok(lineas.includes('⚠ tema.wav: Tiempo fuerte dudoso.'));
    assert.ok(lineas.includes('❌ roto.wav: ffmpeg falló'));
    assert.ok(lineas.some((l) => /Sin licencia anotada .*: clic\.wav$/.test(l)));
    assert.ok(lineas.some((l) => /Ya no están en la carpeta .*: viejo\.wav$/.test(l)));
    assert.ok(
      lineas.some((l) => l.includes('"tempo": { "bpm": 120, "primerPulso": 0.5 }') && l.includes('subida en 8 s')),
    );
  });

  test('sin JSON (archivo suelto) no hay consejos de licencia', () => {
    assert.deepEqual(consejos({ filas: [{ nombre: 'a.wav' }], fallos: [], resultado: null }), []);
  });
});

describe('analizarRitmo con un Python falso', () => {
  test('pasa el script y el WAV como argumentos y devuelve el JSON de beats.py', async () => {
    const llamadas = [];
    const correr = async (bin, args) => {
      llamadas.push([bin, args]);
      return { codigo: 0, stdout: Buffer.from(JSON.stringify(RITMO)), stderr: '' };
    };
    const r = await analizarRitmo('C:\\kit\\audio\\tema ñ.wav', { python: 'py.exe', script: 'beats.py', correr });
    assert.deepEqual(r, RITMO);
    assert.deepEqual(llamadas, [['py.exe', ['beats.py', 'C:\\kit\\audio\\tema ñ.wav']]]);
  });

  test('si beats.py falla, el error es su mensaje de stderr', async () => {
    const correr = async () => ({ codigo: 2, stdout: Buffer.alloc(0), stderr: 'No puedo leer x.wav\n' });
    await assert.rejects(analizarRitmo('x.wav', { correr }), { message: 'No puedo leer x.wav' });
  });

  test('si Python no arranca, explica cómo crear el entorno', async () => {
    const correr = async () => {
      throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    };
    await assert.rejects(analizarRitmo('x.wav', { python: 'falta.exe', correr }), (e) => {
      assert.ok(e.message.includes('No pude ejecutar falta.exe'));
      assert.ok(e.message.includes(INSTRUCCIONES_VENV));
      assert.equal(e.cause.code, 'ENOENT');
      return true;
    });
  });
});

describe('medirAudio de punta a punta (medición, conversión y ritmo inyectados)', () => {
  let tmp;
  let proyecto;
  let audio;
  let python;

  // Duraciones falsas por nombre: tema.* es música (pasa del umbral del ritmo); el resto, efectos.
  const DURACIONES = { 'tema.wav': 20000, 'clic.wav': 600, 'b.wav': 300, 'roto.wav': 100 };
  const medir = async (archivo) => {
    const nombre = path.basename(archivo);
    if (nombre === 'roto.wav') throw new Error('ffmpeg no puede leerlo');
    return medida(DURACIONES[nombre] ?? 1000);
  };
  const convertidos = [];
  const convertirArchivo = async (origen, destino) => {
    convertidos.push([path.basename(origen), path.basename(destino)]);
    fs.writeFileSync(destino, 'wav');
  };
  const analizados = [];
  const analizar = async (archivo) => {
    analizados.push(path.basename(archivo));
    return RITMO;
  };
  const silencio = () => {};

  before(() => {
    tmp = carpetaTemporal('medir-flujo');
    proyecto = path.join(tmp, 'Vídeos', 'Mi proyecto ñ');
    audio = path.join(proyecto, 'kit', 'audio');
    fs.mkdirSync(path.join(audio, 'efectos'), { recursive: true });
    fs.writeFileSync(path.join(proyecto, 'proyecto.json'), '{}');
    for (const f of ['tema.mp3', 'clic.wav', 'efectos/b.wav', 'léeme.txt']) fs.writeFileSync(path.join(audio, f), 'x');
    python = path.join(tmp, 'python-falso.exe');
    fs.writeFileSync(python, '');
  });
  after(() => borrar(tmp));

  test('primera medición de la carpeta: convierte, mide, analiza el ritmo de la música y escribe AUDIO.json', async () => {
    const log = [];
    const r = await medirAudio(audio, {
      convertir: true,
      log: (m) => log.push(m),
      medir,
      analizar,
      convertirArchivo,
      python,
      fecha: 'F1',
    });
    assert.equal(r.destinoJSON, path.join(audio, NOMBRE_JSON));
    assert.deepEqual(convertidos, [['tema.mp3', 'tema.wav']]);
    assert.deepEqual(analizados, ['tema.wav'], 'solo la música pasa del umbral');
    assert.deepEqual(r.fallos, []);
    assert.deepEqual(
      r.filas.map((f) => f.nombre),
      ['clic.wav', 'efectos/b.wav', 'tema.wav'],
    );
    const json = JSON.parse(fs.readFileSync(r.destinoJSON, 'utf8'));
    assert.equal(json.actualizado, 'F1');
    const tema = json.archivos['tema.wav'];
    assert.equal(tema.archivo, 'kit/audio/tema.wav');
    assert.equal(tema.original, 'tema.mp3');
    assert.equal(tema.bpm, 120);
    assert.deepEqual(tema.compases, RITMO.compases);
    assert.equal(json.archivos['efectos/b.wav'].archivo, 'kit/audio/efectos/b.wav');
    assert.ok(log.some((l) => l.includes('convirtiendo tema.mp3 → tema.wav')));
  });

  test('segunda medición: conserva lo escrito a mano y lo que esta vez falla', async () => {
    const ruta = path.join(audio, NOMBRE_JSON);
    const json = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    json.archivos['tema.wav'].licencia = 'Mixkit Free License';
    json.archivos['clic.wav'].notas = 'el del cursor';
    json.archivos['roto.wav'] = { licencia: 'CC0', picoMs: 3 };
    fs.writeFileSync(ruta, BOM + JSON.stringify(json));
    fs.writeFileSync(path.join(audio, 'roto.wav'), 'x');
    convertidos.length = 0;

    const r = await medirAudio(audio, { log: silencio, medir, analizar, convertirArchivo, python, fecha: 'F2' });
    assert.deepEqual(convertidos, [], 'el WAV ya existe y está al día');
    assert.deepEqual(r.fallos, [{ clave: 'roto.wav', error: 'ffmpeg no puede leerlo' }]);
    const nuevo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    assert.equal(nuevo.actualizado, 'F2');
    assert.equal(nuevo.archivos['tema.wav'].licencia, 'Mixkit Free License');
    assert.equal(nuevo.archivos['clic.wav'].notas, 'el del cursor');
    assert.deepEqual(nuevo.archivos['roto.wav'], { licencia: 'CC0', picoMs: 3 });
    fs.rmSync(path.join(audio, 'roto.wav'));
  });

  test('un archivo suelto sin --json no escribe nada', async () => {
    const antes = fs.readFileSync(path.join(audio, NOMBRE_JSON), 'utf8');
    const r = await medirAudio(path.join(audio, 'clic.wav'), { log: silencio, medir, python });
    assert.equal(r.destinoJSON, null);
    assert.equal(r.resultado, null);
    assert.equal(r.filas[0].nombre, 'clic.wav');
    assert.equal(r.filas[0].archivo, 'kit/audio/clic.wav');
    assert.equal(fs.readFileSync(path.join(audio, NOMBRE_JSON), 'utf8'), antes);
  });

  test('un archivo suelto con --json fuera del proyecto: "archivo" sigue siendo la ruta desde el proyecto', async () => {
    const destino = path.join(tmp, 'fuera', 'medida.json');
    const r = await medirAudio(path.join(audio, 'clic.wav'), { json: destino, log: silencio, medir, python });
    const json = JSON.parse(fs.readFileSync(destino, 'utf8'));
    const [clave] = Object.keys(json.archivos);
    assert.equal(clave, rutaRelativa(path.dirname(destino), path.join(audio, 'clic.wav')));
    assert.equal(json.archivos[clave].archivo, 'kit/audio/clic.wav');
    assert.equal(r.filas.length, 1);
  });

  test('--json con una carpeta que existe: el AUDIO.json va dentro', async () => {
    const carpeta = path.join(tmp, 'medidas ñ');
    fs.mkdirSync(carpeta);
    const r = await medirAudio(path.join(audio, 'clic.wav'), { json: carpeta, log: silencio, medir, python });
    assert.equal(r.destinoJSON, path.join(carpeta, NOMBRE_JSON));
    assert.ok(fs.statSync(r.destinoJSON).isFile());
  });

  test('--ritmo sin el Python del estudio para antes de medir', async () => {
    let medidos = 0;
    const contar = async () => (medidos++, medida(1));
    await assert.rejects(
      medirAudio(audio, { ritmo: true, medir: contar, python: path.join(tmp, 'no-hay.exe'), log: silencio }),
      /Falta el Python del estudio/,
    );
    assert.equal(medidos, 0);
  });

  test('música sin Python (sin --ritmo): se mide igual y se avisa', async () => {
    const r = await medirAudio(path.join(audio, 'tema.wav'), {
      medir,
      python: path.join(tmp, 'no-hay.exe'),
      log: silencio,
    });
    assert.match(r.filas[0].aviso, /Sin ritmo: falta el Python del estudio/);
  });

  test('si el ritmo falla, la medida se guarda con el motivo', async () => {
    const r = await medirAudio(path.join(audio, 'tema.wav'), {
      medir,
      python,
      log: silencio,
      analizar: async () => {
        throw new Error('beats.py explotó');
      },
    });
    assert.match(r.filas[0].aviso, /No se pudo medir el ritmo: beats\.py explotó/);
    assert.equal(r.filas[0].picoMs, 10);
  });

  test('un AUDIO.json roto para todo antes de medir', async () => {
    const otra = path.join(tmp, 'otra');
    fs.mkdirSync(otra);
    fs.writeFileSync(path.join(otra, 'a.wav'), 'x');
    fs.writeFileSync(path.join(otra, NOMBRE_JSON), '{ roto');
    let medidos = 0;
    await assert.rejects(
      medirAudio(otra, { medir: async () => (medidos++, medida(1)), python, log: silencio }),
      /no es un JSON válido/,
    );
    assert.equal(medidos, 0);
    assert.equal(fs.readFileSync(path.join(otra, NOMBRE_JSON), 'utf8'), '{ roto', 'no se toca');
  });

  test('errores de entrada: no existe, carpeta sin audios, archivo que no es audio', async () => {
    await assert.rejects(medirAudio(path.join(tmp, 'nada'), { log: silencio }), /No existe/);
    const vacia = path.join(tmp, 'vacía');
    fs.mkdirSync(vacia);
    await assert.rejects(medirAudio(vacia, { log: silencio }), /No hay audios/);
    await assert.rejects(medirAudio(path.join(audio, 'léeme.txt'), { log: silencio }), /no es un audio/);
  });
});
