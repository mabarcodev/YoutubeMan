// Tests de tools/referencia.mjs sin red ni ffmpeg: opciones, enlaces de X/Twitter, elección de la variante de
// vídeo (con un extracto real de la respuesta de api.fxtwitter.com), filtros de ffmpeg, hoja de contactos,
// paleta, cortes de plano y textos. La preparación de una referencia de verdad está en
// tests/integracion/captura.test.mjs.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  API_FXTWITTER,
  causaRed,
  clasificarEntrada,
  detectarCortes,
  diferenciasSeguidas,
  elegirVariante,
  esURLVideoDirecto,
  filtroFotogramas,
  filtroHoja,
  idTweet,
  leerOpciones,
  paletaDominante,
  planHoja,
  resumenPlanos,
  resumenReferencia,
  siguientePaso,
  tamanoEnURL,
  tasaDeCada,
  videosDe,
} from '../../tools/referencia.mjs';

const VID = 'https://video.twimg.com/amplify_video/1234567890123456000';

/** Extracto de una respuesta real de api.fxtwitter.com (tweet.media), con los ids y el usuario inventados. */
const MEDIA_REAL = {
  all: [
    {
      id: '1234567890123456000',
      url: `${VID}/vid/avc1/1920x1080/wSfliKmtAnKlJgGs.mp4?tag=29`,
      thumbnail_url: 'https://pbs.twimg.com/amplify_video_thumb/1234567890123456000/img/miniatura.jpg',
      duration: 15,
      width: 1920,
      height: 1080,
      format: 'video/mp4',
      type: 'video',
      formats: [
        { url: `${VID}/pl/glm2_WlBkdJDDNxZ.m3u8?tag=29&v=cfc`, container: 'm3u8' },
        {
          url: `${VID}/vid/avc1/480x270/0X1WuSwiLMDXBcoO.mp4?tag=29`,
          bitrate: 256000,
          container: 'mp4',
          codec: 'h264',
        },
        {
          url: `${VID}/vid/avc1/1280x720/ZMyghUpG467wpjeB.mp4?tag=29`,
          bitrate: 2176000,
          container: 'mp4',
          codec: 'h264',
        },
      ],
      variants: [
        { url: `${VID}/pl/glm2_WlBkdJDDNxZ.m3u8?tag=29&v=cfc`, bitrate: 0, content_type: 'application/x-mpegURL' },
        { url: `${VID}/vid/avc1/480x270/0X1WuSwiLMDXBcoO.mp4?tag=29`, bitrate: 256000, content_type: 'video/mp4' },
        { url: `${VID}/vid/avc1/640x360/Vw43UTS7heSjn_lh.mp4?tag=29`, bitrate: 832000, content_type: 'video/mp4' },
        { url: `${VID}/vid/avc1/1920x1080/wSfliKmtAnKlJgGs.mp4?tag=29`, bitrate: 10368000, content_type: 'video/mp4' },
        { url: `${VID}/vid/avc1/1280x720/ZMyghUpG467wpjeB.mp4?tag=29`, bitrate: 2176000, content_type: 'video/mp4' },
      ],
    },
  ],
};
MEDIA_REAL.videos = MEDIA_REAL.all;

describe('leerOpciones', () => {
  test('valores por defecto y salida absoluta', () => {
    const op = leerOpciones(['https://x.com/a/status/1', '--salida', 'kit/referencias/a']);
    assert.deepEqual(op, {
      entrada: 'https://x.com/a/status/1',
      salida: path.resolve('kit/referencias/a'),
      cada: 0.5,
      ancho: 960,
      video: 1,
    });
  });

  test('--cada con coma decimal, --ancho, --video y -o', () => {
    const op = leerOpciones(['clip.mp4', '-o', 'ref', '--cada', '0,25', '--ancho', '640', '--video', '2']);
    assert.equal(op.cada, 0.25);
    assert.equal(op.ancho, 640);
    assert.equal(op.video, 2);
    assert.equal(op.salida, path.resolve('ref'));
  });

  test('--ayuda', () => {
    assert.deepEqual(leerOpciones(['--ayuda']), { ayuda: true });
    assert.deepEqual(leerOpciones(['-h']), { ayuda: true });
  });

  test('errores, en castellano', () => {
    assert.throws(() => leerOpciones([]), /Falta el vídeo: un archivo, una URL directa a un \.mp4 o un post de X/);
    assert.throws(() => leerOpciones(['clip.mp4']), /Falta --salida <carpeta>/);
    assert.throws(() => leerOpciones(['a.mp4', 'b.mp4', '--salida', 'x']), /Sobran argumentos: b\.mp4/);
    assert.throws(() => leerOpciones(['a.mp4', '--salida', 'x', '--fps', '2']), /Opción desconocida: --fps/);
    assert.throws(() => leerOpciones(['a.mp4', '-o']), /Falta el valor de --salida\. Usa --ayuda/);
    assert.throws(
      () => leerOpciones(['a.mp4', '-o', 'x', '--cada', '-1']),
      /Falta el valor de --cada .*--cada=<valor>/,
    );
    assert.throws(() => leerOpciones(['a.mp4', '-o', 'x', '--cada=-1']), /--cada son los segundos/);
    assert.throws(() => leerOpciones(['a.mp4', '-o', 'x', '--ayuda=si']), /--ayuda no lleva valor/);
    assert.throws(() => leerOpciones(['a.mp4', '--salida', 'x', '--cada', '0']), /--cada son los segundos/);
    assert.throws(() => leerOpciones(['a.mp4', '--salida', 'x', '--cada', 'medio']), /me llega "medio"/);
    assert.throws(() => leerOpciones(['a.mp4', '--salida', 'x', '--ancho', '10']), /--ancho es un entero/);
    assert.throws(() => leerOpciones(['a.mp4', '--salida', 'x', '--ancho', '960.5']), /--ancho es un entero/);
    assert.throws(() => leerOpciones(['a.mp4', '--salida', 'x', '--video', '0']), /--video es el número del vídeo/);
  });
});

describe('idTweet', () => {
  test('enlaces de post de x.com y twitter.com', () => {
    const esperado = { usuario: 'ejemplo', id: '1234567890123456789' };
    for (const url of [
      'https://x.com/ejemplo/status/1234567890123456789',
      'https://twitter.com/ejemplo/status/1234567890123456789',
      'https://www.x.com/ejemplo/status/1234567890123456789',
      'https://mobile.twitter.com/ejemplo/status/1234567890123456789',
      'https://X.COM/ejemplo/status/1234567890123456789',
      'x.com/ejemplo/status/1234567890123456789',
      'https://x.com/ejemplo/status/1234567890123456789?s=46&t=abc',
      'https://x.com/ejemplo/status/1234567890123456789/video/1',
      'https://fxtwitter.com/ejemplo/status/1234567890123456789',
      'https://vxtwitter.com/ejemplo/statuses/1234567890123456789',
    ]) {
      assert.deepEqual(idTweet(url), esperado, url);
    }
  });

  test('los enlaces /i/status/<id> no dicen el usuario', () => {
    assert.deepEqual(idTweet('https://x.com/i/status/123'), { usuario: null, id: '123' });
    assert.deepEqual(idTweet('https://twitter.com/i/web/status/456'), { usuario: null, id: '456' });
    // Un usuario que empieza por i no se confunde con /i/.
    assert.deepEqual(idTweet('https://x.com/ivan_99/status/789'), { usuario: 'ivan_99', id: '789' });
  });

  test('lo que no es un post de X da null', () => {
    for (const url of [
      'https://x.com/ejemplo',
      'https://x.com/home',
      'https://x.com/ejemplo/status/abc',
      'https://example.com/ejemplo/status/123',
      'https://x.com.evil.com/ejemplo/status/123',
      'ftp://x.com/ejemplo/status/123',
      'https://youtube.com/watch?v=abc',
      'D:\\videos\\clip.mp4',
      '',
      'no es una url',
    ]) {
      assert.equal(idTweet(url), null, url);
    }
  });
});

describe('esURLVideoDirecto', () => {
  test('URL de un archivo de vídeo, con o sin parámetros', () => {
    assert.equal(esURLVideoDirecto(`${VID}/vid/avc1/1920x1080/wSfliKmtAnKlJgGs.mp4?tag=29`), true);
    assert.equal(esURLVideoDirecto('https://cdn.example.com/clips/ANUNCIO.MP4'), true);
    assert.equal(esURLVideoDirecto('http://localhost:8080/ref.webm'), true);
    assert.equal(esURLVideoDirecto('https://example.com/a.mov#t=3'), true);
  });

  test('páginas, listas HLS, posts y rutas locales no lo son', () => {
    assert.equal(esURLVideoDirecto('https://example.com/video'), false);
    assert.equal(esURLVideoDirecto(`${VID}/pl/glm2_WlBkdJDDNxZ.m3u8?tag=29`), false);
    assert.equal(esURLVideoDirecto('https://example.com/mp4/pagina.html'), false);
    assert.equal(esURLVideoDirecto('https://x.com/ejemplo/status/1234567890123456789'), false);
    assert.equal(esURLVideoDirecto('D:\\videos\\clip.mp4'), false);
    assert.equal(esURLVideoDirecto('file:///D:/clip.mp4'), false);
    assert.equal(esURLVideoDirecto('no es una url'), false);
  });
});

describe('clasificarEntrada', () => {
  const nunca = () => false;
  const siempre = () => true;

  test('post de X, vídeo directo y otras URL', () => {
    assert.deepEqual(clasificarEntrada('https://x.com/ejemplo/status/1234567890123456789'), {
      tipo: 'tweet',
      usuario: 'ejemplo',
      id: '1234567890123456789',
    });
    assert.deepEqual(clasificarEntrada('https://cdn.example.com/a.mp4'), {
      tipo: 'url',
      url: 'https://cdn.example.com/a.mp4',
    });
    assert.deepEqual(clasificarEntrada(' https://example.com/descargar?id=3 '), {
      tipo: 'web',
      url: 'https://example.com/descargar?id=3',
    });
  });

  test('archivo local, resuelto desde la base', () => {
    const base = path.resolve('Mis vídeos');
    assert.deepEqual(clasificarEntrada('anuncio final.mov', { base, existe: siempre }), {
      tipo: 'archivo',
      ruta: path.join(base, 'anuncio final.mov'),
    });
  });

  test('un archivo que no existe o una entrada vacía', () => {
    assert.throws(() => clasificarEntrada('no-existe.mp4', { existe: nunca }), /No existe el archivo .*no-existe\.mp4/);
    assert.throws(() => clasificarEntrada('  '), /Falta el vídeo/);
  });
});

describe('videosDe y tamanoEnURL', () => {
  test('solo vídeos y GIF animados, en orden', () => {
    const media = {
      all: [
        { type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' },
        { type: 'video', url: 'https://video.twimg.com/a.mp4' },
        { type: 'gif', url: 'https://video.twimg.com/tweet_video/b.mp4' },
      ],
    };
    assert.deepEqual(
      videosDe(media).map((m) => m.type),
      ['video', 'gif'],
    );
    assert.equal(videosDe({ videos: [{ type: 'video', url: 'x' }] }).length, 1);
    assert.equal(videosDe([{ type: 'video', url: 'x' }]).length, 1);
    assert.equal(videosDe({ variants: [] }).length, 1, 'un medio suelto');
    assert.deepEqual(videosDe({ photos: [{ type: 'photo' }] }), []);
    assert.deepEqual(videosDe(null), []);
  });

  test('tamaño escrito en la ruta de la variante', () => {
    assert.deepEqual(tamanoEnURL(`${VID}/vid/avc1/1280x720/ZMyghUpG467wpjeB.mp4?tag=29`), [1280, 720]);
    assert.equal(tamanoEnURL('https://video.twimg.com/tweet_video/b.mp4'), null);
    assert.equal(tamanoEnURL(undefined), null);
  });
});

describe('elegirVariante', () => {
  test('con la respuesta real de fxtwitter elige el MP4 de 1920x1080', () => {
    assert.equal(elegirVariante(MEDIA_REAL), `${VID}/vid/avc1/1920x1080/wSfliKmtAnKlJgGs.mp4?tag=29`);
  });

  test('sin tamaño en la URL desempata por bitrate y nunca elige la lista HLS', () => {
    const media = {
      videos: [
        {
          type: 'video',
          width: 1280,
          height: 720,
          variants: [
            { url: 'https://cdn.example.com/lista.m3u8', content_type: 'application/x-mpegURL' },
            { url: 'https://cdn.example.com/bajo', bitrate: 500000, content_type: 'video/mp4' },
            { url: 'https://cdn.example.com/alto', bitrate: 4000000, content_type: 'video/mp4' },
          ],
        },
      ],
    };
    assert.equal(elegirVariante(media), 'https://cdn.example.com/alto');
  });

  test('solo `formats` (container) o solo `url`', () => {
    const formats = [
      { url: `${VID}/vid/avc1/480x270/a.mp4`, container: 'mp4', bitrate: 256000 },
      { url: `${VID}/vid/avc1/1280x720/b.mp4`, container: 'mp4', bitrate: 2176000 },
      { url: `${VID}/pl/c.m3u8`, container: 'm3u8' },
    ];
    assert.equal(elegirVariante([{ type: 'video', formats }]), `${VID}/vid/avc1/1280x720/b.mp4`);
    const gif = { type: 'gif', url: 'https://video.twimg.com/tweet_video/G1.mp4', width: 498, height: 280 };
    assert.equal(elegirVariante({ all: [gif] }), 'https://video.twimg.com/tweet_video/G1.mp4');
  });

  test('el segundo vídeo del post y los que no existen', () => {
    const media = {
      all: [
        { type: 'video', url: 'https://video.twimg.com/1/vid/avc1/640x360/a.mp4' },
        { type: 'photo', url: 'https://pbs.twimg.com/media/b.jpg' },
        { type: 'video', url: 'https://video.twimg.com/2/vid/avc1/1920x1080/c.mp4' },
      ],
    };
    assert.equal(elegirVariante(media, 0), 'https://video.twimg.com/1/vid/avc1/640x360/a.mp4');
    assert.equal(elegirVariante(media, 1), 'https://video.twimg.com/2/vid/avc1/1920x1080/c.mp4');
    assert.equal(elegirVariante(media, 2), null);
  });

  test('sin vídeo, o con solo HLS, no hay variante', () => {
    assert.equal(elegirVariante({ all: [{ type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' }] }), null);
    assert.equal(elegirVariante({ all: [{ type: 'video', variants: [{ url: `${VID}/pl/a.m3u8` }] }] }), null);
    assert.equal(elegirVariante(undefined), null);
  });
});

describe('tasaDeCada', () => {
  test('1/cada como fracción exacta', () => {
    assert.equal(tasaDeCada(0.5), '2');
    assert.equal(tasaDeCada(1), '1');
    assert.equal(tasaDeCada(0.25), '4');
    assert.equal(tasaDeCada(0.3), '10/3');
    assert.equal(tasaDeCada(2), '1/2');
    assert.equal(tasaDeCada(1.5), '2/3');
    assert.equal(tasaDeCada(0.04), '25');
    assert.equal(tasaDeCada(1 / 3), '3');
    assert.equal(tasaDeCada(0.333), '1000/333');
  });
});

describe('filtroFotogramas', () => {
  test('instante exacto (round=up), empieza en 0 y nunca amplía', () => {
    assert.equal(filtroFotogramas(0.5, 960), "setpts=PTS-STARTPTS,fps=fps=2:round=up,scale='min(960,iw)':-2");
    assert.match(filtroFotogramas(0.3, 640), /fps=fps=10\/3:round=up,scale='min\(640,iw\)':-2$/);
  });
});

describe('planHoja', () => {
  test('pocos fotogramas horizontales: todos, a 320 px, en una hoja apaisada', () => {
    assert.deepEqual(planHoja(6, { w: 1920, h: 1080 }), {
      paso: 1,
      miniaturas: 6,
      columnas: 2,
      filas: 3,
      anchoMiniatura: 320,
    });
    assert.deepEqual(planHoja(30, { w: 1920, h: 1080 }), {
      paso: 1,
      miniaturas: 30,
      columnas: 5,
      filas: 6,
      anchoMiniatura: 320,
    });
  });

  test('muchos fotogramas: se espacian para no pasar de 48 miniaturas', () => {
    const p = planHoja(121, { w: 1280, h: 720 });
    assert.equal(p.paso, 3);
    assert.equal(p.miniaturas, 41);
    assert.ok(p.miniaturas <= 48);
    assert.ok(p.columnas * p.filas >= p.miniaturas);
  });

  test('vertical: miniaturas más estrechas y como mucho 8 columnas', () => {
    const p = planHoja(31, { w: 1080, h: 1920 });
    assert.equal(p.anchoMiniatura, 240);
    assert.equal(p.columnas, 8);
    assert.equal(p.filas, 4);
  });

  test('un solo fotograma o un tamaño desconocido', () => {
    assert.deepEqual(planHoja(1, { w: 1920, h: 1080 }), {
      paso: 1,
      miniaturas: 1,
      columnas: 1,
      filas: 1,
      anchoMiniatura: 320,
    });
    assert.equal(planHoja(6, { w: null, h: null }).columnas, 2);
  });
});

describe('filtroHoja', () => {
  const plan = { paso: 1, columnas: 2, filas: 3, anchoMiniatura: 320 };

  test('miniaturas, marca de tiempo y cuadrícula, en ese orden', () => {
    assert.equal(filtroHoja(plan, 'drawtext=X'), 'scale=320:-2,drawtext=X,tile=2x3:padding=4:margin=4:color=white');
    assert.equal(filtroHoja(plan, null), 'scale=320:-2,tile=2x3:padding=4:margin=4:color=white');
  });

  test('si hay que espaciar, select con la coma escapada para el filtergraph', () => {
    assert.match(filtroHoja({ ...plan, paso: 3 }, null), /^select=not\(mod\(n\\,3\)\),scale=320:-2,/);
  });

  test('por defecto usa la marca de tiempo de revisar.mjs (empezando en 0)', () => {
    const f = filtroHoja(plan);
    // Sin fuente en el sistema no hay marca; con ella, drawtext con el pts en h:m:s.
    if (f.includes('drawtext')) assert.match(f, /drawtext=fontfile=.*%\{pts\\:hms\\:0\.000\}/);
    else assert.equal(f, filtroHoja(plan, null));
  });
});

describe('paletaDominante', () => {
  /** Buffer rgb24 con `n` píxeles de cada color [r, g, b]. */
  const pixeles = (...grupos) =>
    Uint8Array.from(grupos.flatMap(([color, n]) => Array.from({ length: n }, () => color).flat()));

  test('colores de más a menos abundante, con su peso', () => {
    const rgb = pixeles([[11, 143, 99], 700], [[247, 248, 246], 250], [[255, 0, 0], 50]);
    assert.deepEqual(paletaDominante(rgb), [
      { hex: '#0b8f63', peso: 0.7 },
      { hex: '#f7f8f6', peso: 0.25 },
      { hex: '#ff0000', peso: 0.05 },
    ]);
  });

  test('los tonos casi iguales (ruido de compresión, bordes) suman a su color', () => {
    const rgb = pixeles([[11, 143, 99], 600], [[16, 150, 104], 300], [[250, 250, 250], 100]);
    const p = paletaDominante(rgb);
    assert.equal(p.length, 2);
    assert.equal(p[0].hex, '#0b8f63');
    assert.equal(p[0].peso, 0.9);
  });

  test('límite de colores y peso mínimo', () => {
    const rgb = pixeles([[0, 0, 0], 900], [[255, 255, 255], 98], [[255, 0, 0], 2]);
    assert.deepEqual(
      paletaDominante(rgb, { minimo: 0.01 }).map((c) => c.hex),
      ['#000000', '#ffffff'],
    );
    assert.equal(paletaDominante(rgb, { n: 1 }).length, 1);
  });

  test('sin píxeles no hay paleta', () => {
    assert.deepEqual(paletaDominante(new Uint8Array(0)), []);
  });
});

describe('diferenciasSeguidas', () => {
  test('diferencia media de cada fotograma con el anterior; la primera es 0', () => {
    const gris = Uint8Array.from([0, 0, 10, 10, 10, 30]);
    assert.deepEqual(diferenciasSeguidas(gris, 2), [0, 10, 10]);
    assert.deepEqual(diferenciasSeguidas(new Uint8Array(0), 2), []);
  });
});

describe('detectarCortes', () => {
  /** n diferencias con ruido pequeño (0,2–0,8) y picos en {índice: valor}. */
  const difs = (n, picos = {}, base = 0.5) =>
    Array.from({ length: n }, (_, i) => (i === 0 ? 0 : (picos[i] ?? base + 0.3 * Math.sin(i))));

  test('un pico aislado es un corte, en el instante del primer fotograma del plano nuevo', () => {
    assert.deepEqual(detectarCortes(difs(90, { 30: 45 }), 30), [1]);
    assert.deepEqual(detectarCortes(difs(90, { 30: 45, 75: 25 }), 30), [1, 2.5]);
  });

  test('un barrido de cámara (muchas diferencias altas seguidas) no es un corte', () => {
    const barrido = Array.from({ length: 60 }, (_, i) => (i === 0 ? 0 : 20 + (i % 3)));
    assert.deepEqual(detectarCortes(barrido, 30), []);
  });

  test('un cambio pequeño (texto que entra) no llega al umbral', () => {
    assert.deepEqual(detectarCortes(difs(60, { 20: 9 }), 30), []);
  });

  test('dos picos seguidos (fotograma mezclado) cuentan como un corte: el más fuerte', () => {
    assert.deepEqual(detectarCortes(difs(90, { 30: 25, 31: 40 }), 30), [1.03]);
  });

  test('sin datos no hay cortes', () => {
    assert.deepEqual(detectarCortes([], 30), []);
    assert.deepEqual(detectarCortes([0], 30), []);
  });
});

describe('resumenPlanos', () => {
  test('cuántos planos y cuánto duran', () => {
    assert.deepEqual(resumenPlanos([1, 2.5], 4), { n: 3, media: 1.33, min: 1, max: 1.5 });
  });

  test('sin cortes es un solo plano; los cortes fuera del vídeo no cuentan', () => {
    assert.deepEqual(resumenPlanos([], 15), { n: 1, media: 15, min: 15, max: 15 });
    assert.deepEqual(resumenPlanos([0, 3, 20], 6), { n: 2, media: 3, min: 3, max: 3 });
  });
});

describe('textos', () => {
  test('el siguiente paso pide estilo.md con todo lo que hay que mirar y prohíbe copiar el contenido', () => {
    const carpeta = path.resolve('kit', 'referencias', 'ejemplo');
    const texto = siguientePaso(carpeta);
    assert.ok(texto.includes(path.join(carpeta, 'estilo.md')));
    for (const clave of [
      'paleta en hex',
      'tipografías',
      'duración de los planos',
      'transiciones',
      'cámara',
      'textura',
      'cómo entra y sale el texto',
      'GRAMÁTICA, nunca el contenido',
      'logos',
      'personajes',
    ]) {
      assert.ok(texto.includes(clave), clave);
    }
  });

  test('resumen con paleta y cortes', () => {
    const r = {
      carpeta: 'C:\\ref',
      duracion: 15,
      w: 1920,
      h: 1080,
      fps: 29.97,
      autor: '@ejemplo',
      n: 30,
      cada: 0.5,
      fotogramas: { w: 960, h: 540 },
      contacto: { cada: 0.5, miniaturas: 30 },
      paleta: [
        { hex: '#0b0b0c', peso: 0.62 },
        { hex: '#ffffff', peso: 0.004 },
      ],
      cortes: [2.1, 5.4],
      planos: { media: 5 },
    };
    const texto = resumenReferencia(r);
    assert.match(texto, /^✅ C:\\ref/);
    assert.match(texto, /video\.mp4 · 15\.0 s · 1920x1080 · 29\.97 fps · de @ejemplo/);
    assert.match(texto, /fotogramas\/ · 30 \(uno cada 0\.5 s, 960x540 px\)/);
    assert.match(texto, /contacto\.png · 30 miniaturas$/m);
    assert.match(texto, /paleta aprox\.: #0b0b0c 62 % · #ffffff <1 %/);
    assert.match(texto, /cortes aprox\.: 2 \(2\.1, 5\.4 s\) · plano medio de 5 s/);
  });

  test('resumen sin cortes y con la hoja espaciada', () => {
    const texto = resumenReferencia({
      carpeta: 'x',
      duracion: 60,
      w: 1080,
      h: 1920,
      fps: null,
      n: 120,
      cada: 0.5,
      fotogramas: { w: 540, h: 960 },
      contacto: { cada: 1.5, miniaturas: 40 },
      paleta: [],
      cortes: [],
      planos: { media: 60 },
    });
    assert.match(texto, /video\.mp4 · 60\.0 s · 1080x1920$/m);
    assert.match(texto, /40 miniaturas \(una cada 1\.5 s\)/);
    assert.match(texto, /cortes aprox\.: ninguno detectado/);
    assert.doesNotMatch(texto, /paleta/);
  });
});

describe('causaRed y API', () => {
  test('motivo legible de un fallo de fetch', () => {
    assert.equal(causaRed(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'no respondió a tiempo');
    assert.equal(causaRed(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })), 'ENOTFOUND');
    assert.equal(causaRed(new Error('otra cosa')), 'otra cosa');
  });

  test('la API de fxtwitter es la documentada', () => {
    assert.equal(API_FXTWITTER, 'https://api.fxtwitter.com/status/');
  });
});
