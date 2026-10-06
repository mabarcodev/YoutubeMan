// Tests de tools/doctor.mjs con dependencias falsas: cada comprobación (Node, ffmpeg/ffprobe, Chromium, Python,
// git, fuente) en sus casos buenos y malos, el límite de tiempo de Chromium, el código de salida y el informe.
// Nada de esto ejecuta ffmpeg, Python ni Chromium de verdad (eso lo hace el doctor a mano).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NODE_MINIMO,
  REQUISITOS_FFMPEG,
  codigoSalida,
  comprobarBinario,
  comprobarChromium,
  comprobarFuente,
  comprobarGit,
  comprobarNode,
  comprobarPython,
  diagnosticar,
  ejecutarComando,
  informe,
  leerOpciones,
  nombresTabla,
} from '../../tools/doctor.mjs';
import { INSTRUCCIONES_VENV } from '../../tools/medir-audio.mjs';

const ENCODERS = `Encoders:
 V..... = Video
 A..... = Audio
 .F.... = Frame-level multithreading
 ------
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V....D libx264rgb           libx264 H.264 RGB (codec h264)
 A....D aac                  AAC (Advanced Audio Coding)
 A....D pcm_s16le            PCM signed 16-bit little-endian`;

const FILTROS = `Filters:
  T.. = Timeline support
  A = Audio input/output
  | = Source or sink filter
 ... acopy             A->A       Copy the input audio unchanged to the output.
 ..C adelay            A->A       Delay one or more audio channels.
 ..C amix              N->A       Audio mixing.
 ... loudnorm          A->A       EBU R128 loudness normalization
 TS. tmix              N->V       Mix successive video frames.
 ... nullsrc           |->V       Null video source, return unprocessed video frames.`;

const VERSION_FFMPEG = 'ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers\n';

/** Un ffmpeg falso: responde a -version, -encoders y -filters con las salidas de arriba (o las que se den). */
function ffmpegFalso({ encoders = ENCODERS, filtros = FILTROS, version = VERSION_FFMPEG } = {}) {
  const llamadas = [];
  const ejecutar = (bin, args) => {
    llamadas.push([bin, args]);
    if (args.includes('-encoders')) return { codigo: 0, salida: encoders, error: null };
    if (args.includes('-filters')) return { codigo: 0, salida: filtros, error: null };
    return { codigo: 0, salida: version, error: null };
  };
  return { ejecutar, llamadas };
}

describe('ejecutarComando', () => {
  test('junta stdout y stderr y nunca lanza', () => {
    const r = ejecutarComando(process.execPath, ['-e', 'console.log("hola"); console.error("ñ")']);
    assert.equal(r.codigo, 0);
    assert.match(r.salida, /hola\r?\nñ/);
    assert.equal(r.error, null);
  });

  test('un programa que no existe: código null y el motivo', () => {
    const r = ejecutarComando('programa-que-no-existe-xyz', ['--version']);
    assert.equal(r.codigo, null);
    assert.ok(r.error);
  });
});

describe('comprobarNode', () => {
  test(`>= ${NODE_MINIMO}: ok`, () => {
    assert.deepEqual(comprobarNode('24.14.1'), {
      id: 'node',
      nombre: 'Node.js',
      obligatorio: true,
      estado: 'ok',
      detalle: 'v24.14.1',
    });
    assert.equal(comprobarNode(`${NODE_MINIMO}.0.0`).estado, 'ok');
  });

  test('más antiguo: error con cómo instalarlo', () => {
    const r = comprobarNode('20.11.0');
    assert.equal(r.estado, 'error');
    assert.match(r.detalle, /hace falta 22 o más/);
    assert.match(r.arreglo, /winget install OpenJS\.NodeJS\.LTS/);
  });
});

describe('nombresTabla', () => {
  test('saca los nombres de la segunda columna de -encoders y -filters', () => {
    const enc = nombresTabla(ENCODERS);
    for (const n of ['libx264', 'libx264rgb', 'aac', 'pcm_s16le']) assert.ok(enc.has(n), n);
    const fil = nombresTabla(FILTROS.replace(/\n/g, '\r\n'));
    for (const n of ['acopy', 'adelay', 'amix', 'loudnorm', 'tmix', 'nullsrc']) assert.ok(fil.has(n), n);
    assert.equal(fil.has('Audio'), false);
  });

  test('salida vacía o rara: conjunto vacío', () => {
    assert.equal(nombresTabla('').size, 0);
    assert.equal(nombresTabla(undefined).size, 0);
  });
});

describe('comprobarBinario', () => {
  test('no encontrado: error con la instrucción de winget', () => {
    const r = comprobarBinario('ffmpeg', {
      resolver: () => {
        throw new Error('No encuentro ffmpeg');
      },
    });
    assert.equal(r.estado, 'error');
    assert.equal(r.obligatorio, true);
    assert.equal(r.detalle, 'no encontrado');
    assert.match(r.arreglo, /winget install --id Gyan\.FFmpeg -e --source winget/);
  });

  test('en el PATH: la versión, sin más', () => {
    const { ejecutar } = ffmpegFalso();
    const r = comprobarBinario('ffprobe', { resolver: (n) => n, ejecutar });
    assert.equal(r.estado, 'ok');
    assert.equal(r.detalle, '9.0.2-full_build-www.gyan.dev');
  });

  test('fuera del PATH (carpeta de winget): ok, y dice dónde está', () => {
    const exe = 'C:\\Users\\Ana María\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg\\bin\\ffmpeg.exe';
    const { ejecutar, llamadas } = ffmpegFalso();
    const r = comprobarBinario('ffmpeg', { resolver: () => exe, ejecutar, requisitos: REQUISITOS_FFMPEG });
    assert.equal(r.estado, 'ok');
    assert.ok(r.detalle.includes(exe));
    assert.match(r.detalle, /fuera del PATH/);
    assert.ok(
      llamadas.every(([bin]) => bin === exe),
      'usa el ejecutable encontrado, no el nombre',
    );
    assert.deepEqual(
      llamadas.map(([, args]) => args.at(-1)),
      ['-version', '-encoders', '-filters'],
    );
  });

  test('una compilación sin lo que usa el render: error que dice qué falta', () => {
    const { ejecutar } = ffmpegFalso({
      encoders: ENCODERS.replace(/.*libx264 .*\n/, ''),
      filtros: FILTROS.replace(/.*loudnorm.*\n/, ''),
    });
    const r = comprobarBinario('ffmpeg', { resolver: (n) => n, ejecutar, requisitos: REQUISITOS_FFMPEG });
    assert.equal(r.estado, 'error');
    assert.match(r.detalle, /le falta: libx264, loudnorm$/);
    assert.match(r.arreglo, /compilación completa/);
  });

  test('versión ilegible: no es un fallo', () => {
    const r = comprobarBinario('ffprobe', {
      resolver: (n) => n,
      ejecutar: () => ({ codigo: 0, salida: 'algo raro', error: null }),
    });
    assert.equal(r.estado, 'ok');
    assert.equal(r.detalle, 'versión desconocida');
  });
});

describe('comprobarChromium', () => {
  test('arranca: ok con versión y tiempo', async () => {
    const r = await comprobarChromium({ lanzar: async () => '140.0.7339.16', limiteMs: 1000 });
    assert.equal(r.estado, 'ok');
    assert.match(r.detalle, /^versión 140\.0\.7339\.16, arranca en \d+\.\d s$/);
  });

  test('el límite de tiempo se pasa al lanzador', async () => {
    let recibido;
    await comprobarChromium({ lanzar: async (ms) => ((recibido = ms), '1'), limiteMs: 1234 });
    assert.equal(recibido, 1234);
  });

  test('no arranca: error con la primera línea del motivo y cómo instalarlo', async () => {
    const r = await comprobarChromium({
      lanzar: async () => {
        throw new Error("browserType.launch: Executable doesn't exist at C:\\x\\chrome.exe\n╔═══ mucho texto ═══╗");
      },
    });
    assert.equal(r.estado, 'error');
    assert.equal(r.detalle, "browserType.launch: Executable doesn't exist at C:\\x\\chrome.exe");
    assert.match(r.arreglo, /npx playwright install chromium/);
  });

  test('sin el paquete playwright: pide npm run instalar', async () => {
    const r = await comprobarChromium({
      lanzar: async () => {
        throw Object.assign(new Error("Cannot find package 'playwright'"), { code: 'ERR_MODULE_NOT_FOUND' });
      },
    });
    assert.equal(r.detalle, 'falta el paquete playwright');
    assert.equal(r.arreglo, 'En la carpeta del estudio: npm run instalar.');
  });

  test('se queda colgado: error al pasar el límite, sin esperar más', async () => {
    const t0 = Date.now();
    const r = await comprobarChromium({ lanzar: () => new Promise(() => {}), limiteMs: 40 });
    assert.equal(r.estado, 'error');
    assert.equal(r.detalle, 'no arrancó en 0.04 s');
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe('comprobarPython', () => {
  test('sin entorno: error (es obligatorio) con cómo crearlo', () => {
    const r = comprobarPython({ python: 'C:\\e\\.venv\\Scripts\\python.exe', existe: () => false });
    assert.equal(r.obligatorio, true);
    assert.equal(r.estado, 'error');
    assert.match(r.detalle, /no hay entorno en C:\\e\\\.venv/);
    assert.equal(r.arreglo, INSTRUCCIONES_VENV);
  });

  test('el entorno no carga librosa: error y se arregla con npm run instalar', () => {
    const r = comprobarPython({
      python: 'C:\\Vídeos\\youtubeman\\.venv\\Scripts\\python.exe',
      existe: () => true,
      ejecutar: () => ({ codigo: 1, salida: "ModuleNotFoundError: No module named 'librosa'", error: null }),
    });
    assert.equal(r.estado, 'error');
    assert.equal(r.arreglo, INSTRUCCIONES_VENV);
  });

  test('con librosa: ok y su versión (aunque antes salgan avisos)', () => {
    let llamada;
    const r = comprobarPython({
      python: 'py',
      existe: () => true,
      ejecutar: (bin, args, op) => {
        llamada = { bin, args, op };
        return { codigo: 0, salida: 'UserWarning: algo\n1.0.0\n', error: null };
      },
    });
    assert.equal(r.estado, 'ok');
    assert.equal(r.detalle, 'librosa 1.0.0');
    assert.equal(llamada.bin, 'py');
    assert.equal(llamada.args[0], '-c');
    assert.match(llamada.args[1], /import librosa, soundfile/);
    assert.ok(llamada.op.timeout >= 60_000, 'librosa tarda en cargar la primera vez');
  });
});

describe('comprobarGit y comprobarFuente', () => {
  test('git presente o ausente (opcional)', () => {
    const ok = comprobarGit({ ejecutar: () => ({ codigo: 0, salida: 'git version 2.47.1.windows.2\n' }) });
    assert.deepEqual([ok.estado, ok.detalle, ok.obligatorio], ['ok', '2.47.1.windows.2', false]);
    const falta = comprobarGit({ ejecutar: () => ({ codigo: null, salida: '', error: 'ENOENT' }) });
    assert.equal(falta.estado, 'aviso');
    assert.match(falta.arreglo, /winget install --id Git\.Git/);
  });

  test('fuente: la primera que existe de la lista de revisar.mjs', () => {
    const ok = comprobarFuente({ existe: (f) => f.toLowerCase().includes('segoeui') });
    assert.equal(ok.estado, 'ok');
    assert.equal(ok.detalle, 'C:/Windows/Fonts/segoeui.ttf');
    const ninguna = comprobarFuente({ existe: () => false });
    assert.equal(ninguna.estado, 'aviso');
    assert.match(ninguna.arreglo, /sin marca de tiempo/);
  });
});

describe('diagnosticar, codigoSalida e informe', () => {
  const todoBien = () => {
    const { ejecutar } = ffmpegFalso();
    return {
      versionNode: '24.0.0',
      resolver: (n) => n,
      ejecutar: (bin, args, op) => {
        if (bin === 'git') return { codigo: 0, salida: 'git version 2.47.0' };
        if (bin === 'python-falso') return { codigo: 0, salida: '1.0.0' };
        return ejecutar(bin, args, op);
      },
      lanzar: async () => '140.0',
      python: 'python-falso',
      existe: () => true,
      limiteMs: 1000,
    };
  };

  test('todas las comprobaciones, en orden, con las dependencias inyectadas', async () => {
    const r = await diagnosticar(todoBien());
    assert.deepEqual(
      r.map((x) => x.id),
      ['node', 'ffmpeg', 'ffprobe', 'chromium', 'python', 'git', 'fuente'],
    );
    assert.ok(
      r.every((x) => x.estado === 'ok'),
      JSON.stringify(r, null, 2),
    );
    assert.equal(codigoSalida(r), 0);
    assert.match(informe(r, 'D:\\Vídeos\\_estudio'), /✅ Todo listo\.$/);
  });

  test('lo opcional que falla solo avisa: código 0', async () => {
    // Solo existe el Python del estudio: la fuente del sistema (opcional) falta.
    const dep = { ...todoBien(), existe: (p) => p === 'python-falso' };
    const r = await diagnosticar(dep);
    assert.equal(r.find((x) => x.id === 'python').estado, 'ok');
    assert.equal(r.find((x) => x.id === 'fuente').estado, 'aviso');
    assert.equal(codigoSalida(r), 0);
    const texto = informe(r);
    assert.match(texto, /⚠ Fuente para las marcas de tiempo \(opcional\)/);
    assert.match(texto, /✅ Lo obligatorio está listo \(hay avisos en lo opcional\)\.$/);
  });

  test('lo obligatorio que falla: código 1, y el informe dice cómo arreglarlo', async () => {
    const dep = {
      ...todoBien(),
      resolver: (n) => {
        if (n === 'ffmpeg') throw new Error('no');
        return n;
      },
      lanzar: async () => {
        throw new Error('sin Chromium');
      },
    };
    const r = await diagnosticar(dep);
    assert.equal(codigoSalida(r), 1);
    const texto = informe(r, 'D:\\estudio');
    assert.ok(texto.startsWith('Diagnóstico del estudio youtubeman (D:\\estudio)'));
    assert.match(texto, /❌ ffmpeg: no encontrado\n {3}→ Instálalo: winget install/);
    assert.match(
      texto,
      /❌ Chromium \(Playwright\): sin Chromium\n {3}→ En la carpeta del estudio: npx playwright install chromium/,
    );
    assert.match(texto, /✅ ffprobe: 9\.0\.2/);
    assert.match(texto, /❌ Falta algo obligatorio/);
  });

  test('codigoSalida solo mira lo obligatorio', () => {
    assert.equal(codigoSalida([{ obligatorio: false, estado: 'error' }]), 0);
    assert.equal(codigoSalida([{ obligatorio: true, estado: 'aviso' }]), 0);
    assert.equal(codigoSalida([{ obligatorio: true, estado: 'error' }]), 1);
    assert.equal(codigoSalida([]), 0);
  });
});

describe('leerOpciones', () => {
  test('por defecto: texto y 30 s', () => {
    assert.deepEqual(leerOpciones([]), { json: false, limiteMs: 30_000 });
  });

  test('--json y --limite', () => {
    assert.deepEqual(leerOpciones(['--json', '--limite', '7.5']), { json: true, limiteMs: 7500 });
  });

  test('--limite inválido, --ayuda y opción desconocida', () => {
    for (const v of ['0', '-3', 'abc', '']) {
      assert.throws(() => leerOpciones([`--limite=${v}`]), /--limite debe ser un número de segundos/, v);
    }
    assert.deepEqual(leerOpciones(['--ayuda']), { ayuda: true });
    assert.throws(() => leerOpciones(['--rapido']), /Opción desconocida: --rapido/);
  });
});
