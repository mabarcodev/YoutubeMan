#!/usr/bin/env node
// Capturas REALES del producto con Playwright. La interfaz nunca se redibuja (REGLAS.md, «Verdad del
// producto»): cuando una escena necesita un estado de la app, se captura de la app de verdad.
//
//   node tools/capturar.mjs http://localhost:3000/ventas --salida "<proyecto>\kit\capturas\ventas.png"
//   node tools/capturar.mjs https://mi-producto.com --salida kit/capturas/ --completa --ocultar "#cookies,.chat"
//   node tools/capturar.mjs pantalla.html --salida boton.png --selector "#pagar" --transparente
//   node tools/capturar.mjs --lista kit/capturas/trabajos.json
//
// Ver AYUDA más abajo (o --ayuda) para todas las opciones.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { leerArgs } from './lib/args.mjs';
import { esPrincipal, slug } from './lib/rutas.mjs';

export const AYUDA = `Uso: node tools/capturar.mjs <url|archivo.html> --salida <captura.png> [opciones]
     node tools/capturar.mjs --lista trabajos.json [opciones comunes]

Captura la interfaz REAL del producto: webs (https://…), la app en desarrollo (http://localhost:3000)
o archivos .html locales.

  --salida <png>          archivo PNG; si es una carpeta (acaba en / o ya existe), el nombre sale de la URL
  --ancho 1440 --alto 900 tamaño de la ventana del navegador (px CSS)
  --escala 2              densidad de píxeles: 2 = PNG al doble, nítido para hacer zoom en el vídeo
  --completa              la página entera (antes la recorre para que carguen las imágenes perezosas)
  --selector "css"        solo ese elemento (el primero si hay varios; vale también text=Pagar)
  --transparente          sin fondo: recorte de interfaz con transparencia alrededor
  --oscuro                modo oscuro (prefers-color-scheme: dark)
  --ocultar "css1,css2"   oculta banners de cookies, chats… (visibility: hidden)
  --esperar-a "css"       espera a que ese elemento sea visible
  --esperar 500           y después espera estos milisegundos (animaciones de entrada)
  --idioma es-ES          idioma del navegador (las apps traducidas lo usan)
  --lista <json>          varias capturas con un solo navegador: [{ "url": …, "salida": …, …opciones }]
                          Las rutas relativas del JSON son relativas al propio JSON; las opciones de la
                          línea de comandos valen para todas las capturas que no digan otra cosa.
                          En el JSON, "esperar-a" puede escribirse "esperarA"; las claves con _ son comentarios.
  --ayuda                 esta ayuda

Espera a que la página cargue y a que la red se calme (máx. 10 s; si no se calma, captura igualmente).`;

/** Valores de cada captura que no fijan ni la línea de comandos ni su entrada de --lista. */
export const PREDETERMINADAS = Object.freeze({
  ancho: 1440,
  alto: 900,
  escala: 2,
  completa: false,
  selector: null,
  transparente: false,
  esperar: 0,
  esperarA: null,
  oscuro: false,
  ocultar: [],
  idioma: 'es-ES',
});

// Un servidor de desarrollo puede tardar bastante en compilar la primera visita a una ruta.
const LIMITE_CARGA = 60_000;
// Las webs con analítica, chats o sondeos nunca dejan la red quieta: pasado esto se captura igualmente.
const LIMITE_RED = 10_000;
const LIMITE_SELECTOR = 30_000;
// omitBackground solo quita el blanco por defecto del navegador: si la web pinta html o body, también hay
// que quitarlo o el recorte sale sobre un rectángulo de color.
const CSS_SIN_FONDO = 'html, body { background: transparent !important; }';
const OTRAS_IMAGENES = /\.(jpe?g|webp|gif|avif|bmp|tiff?)$/i;

const OPCIONES = {
  salida: { type: 'string', short: 'o' },
  ancho: { type: 'string' },
  alto: { type: 'string' },
  escala: { type: 'string' },
  completa: { type: 'boolean' },
  selector: { type: 'string' },
  transparente: { type: 'boolean' },
  esperar: { type: 'string' },
  'esperar-a': { type: 'string' },
  oscuro: { type: 'boolean' },
  ocultar: { type: 'string', multiple: true },
  idioma: { type: 'string' },
  lista: { type: 'string' },
  ayuda: { type: 'boolean', short: 'h' },
};

/**
 * Mensaje para un error de leerArgs. tools/lib/args.mjs ya lo traduce, pero nombra el alias corto (-o en vez de
 * --salida) y a un interruptor con valor (--completa=si) le dice que le falta el valor; el error original de
 * parseArgs, que leerArgs guarda en e.cause, permite decir lo que ha pasado de verdad.
 */
export function traducirErrorArgs(e) {
  const original = e?.cause?.code ? e.cause : e;
  const mensaje = String(original?.message ?? original);
  // "Option '-o, --salida <value>' argument missing": nos quedamos con el nombre largo.
  const opcion = mensaje.match(/'(?:-\w, )?(-{1,2}[^'\s,]+)/)?.[1] ?? '';
  if (original?.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') return `Opción desconocida: ${opcion}.`;
  if (original?.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
    if (/does not take an argument/i.test(mensaje)) return `${opcion} no lleva valor.`;
    // «ambiguous»: lo que venía detrás empieza por "-": otra opción (se olvidó el valor) o un valor como -5.
    if (/ambiguous/i.test(mensaje)) {
      return `Falta el valor de ${opcion} (si empieza por "-", escríbelo pegado: ${opcion}=<valor>).`;
    }
    return `Falta el valor de ${opcion}.`;
  }
  return String(e?.message ?? e);
}

/** Número escrito por el usuario. Acepta la coma decimal española («1,5») además del punto. */
export function aNumero(valor) {
  if (typeof valor === 'number') return valor;
  const texto = String(valor ?? '').trim();
  return texto ? Number(texto.replace(',', '.')) : NaN;
}

function numero(valor, nombre, donde, { min, max, entero = false }) {
  const n = aNumero(valor);
  if (!Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) {
    throw new Error(
      `${nombre} debe ser un ${entero ? 'entero' : 'número'} entre ${min} y ${max} (en ${donde} pone "${valor}").`,
    );
  }
  return n;
}

/**
 * Valida y convierte las opciones de una captura (de la línea de comandos o de una entrada de --lista)
 * a su forma interna. Una clave desconocida es un error: en un JSON, una errata callada da una captura mala.
 */
export function normalizarOpciones(crudas = {}, donde = 'la línea de comandos') {
  const out = {};
  for (const [clave, valor] of Object.entries(crudas)) {
    if (valor === undefined || clave.startsWith('_')) continue;
    const k = clave === 'esperar-a' ? 'esperarA' : clave;
    const nombre = k === 'esperarA' ? '--esperar-a' : `--${k}`;
    switch (k) {
      case 'ancho':
      case 'alto':
        out[k] = numero(valor, nombre, donde, { min: 16, max: 7680, entero: true });
        break;
      case 'escala':
        out[k] = numero(valor, nombre, donde, { min: 0.25, max: 4 });
        break;
      case 'esperar':
        out[k] = numero(valor, nombre, donde, { min: 0, max: 120_000, entero: true });
        break;
      case 'completa':
      case 'transparente':
      case 'oscuro':
        if (typeof valor !== 'boolean') {
          throw new Error(`${nombre} es true o false (en ${donde} pone ${JSON.stringify(valor)}).`);
        }
        out[k] = valor;
        break;
      case 'ocultar':
        out[k] = (Array.isArray(valor) ? valor : [valor]).flatMap((s) => separarSelectores(String(s)));
        for (const s of out[k]) {
          if (/[{}]/.test(s)) throw new Error(`Selector no válido en --ocultar (${donde}): "${s}".`);
        }
        break;
      case 'selector':
      case 'esperarA':
      case 'salida':
      case 'idioma':
        if (typeof valor !== 'string' || !valor.trim()) throw new Error(`${nombre} necesita un texto (en ${donde}).`);
        out[k] = valor.trim();
        break;
      default:
        throw new Error(`Opción desconocida en ${donde}: "${clave}". Usa --ayuda para ver las opciones.`);
    }
  }
  if (out.idioma && !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(out.idioma)) {
    throw new Error(`--idioma debe ser un código como es-ES o en-US (en ${donde} pone "${out.idioma}").`);
  }
  return out;
}

export function leerOpciones(argv) {
  let leidos;
  try {
    leidos = leerArgs({ args: argv, options: OPCIONES, allowPositionals: true, strict: true });
  } catch (e) {
    throw new Error(`${traducirErrorArgs(e)} Usa --ayuda para ver las opciones.`, { cause: e });
  }
  const { values, positionals } = leidos;
  if (values.ayuda) return { ayuda: true };
  if (positionals.length > 1) {
    throw new Error(
      `Sobran argumentos: ${positionals.slice(1).join(' ')}. Si una ruta lleva espacios, ponla entre comillas.`,
    );
  }
  const { lista = null, ...resto } = values;
  if (lista && positionals.length)
    throw new Error('Con --lista, las URL van dentro del JSON: no pases ninguna suelta.');
  return { entrada: positionals[0] ?? null, lista, opciones: normalizarOpciones(resto) };
}

/**
 * Separa "a, b" por las comas de primer nivel. Dentro de :is(a, b), [title="a,b"] o .a\,b la coma es parte
 * del selector, así que un split(',') ingenuo rompería selectores válidos.
 */
export function separarSelectores(texto) {
  const partes = [];
  let actual = '';
  let profundidad = 0;
  let comilla = null;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '\\' && i + 1 < texto.length) {
      actual += c + texto[++i];
      continue;
    }
    if (comilla) {
      if (c === comilla) comilla = null;
    } else if (c === '"' || c === "'") comilla = c;
    else if (c === '(' || c === '[') profundidad++;
    else if ((c === ')' || c === ']') && profundidad > 0) profundidad--;
    else if (c === ',' && profundidad === 0) {
      partes.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  partes.push(actual);
  return partes.map((s) => s.trim()).filter(Boolean);
}

/**
 * CSS que oculta los selectores dados. Una regla por selector: si uno no es válido, el navegador descarta
 * solo esa regla y no la lista entera.
 */
export function cssOcultar(selectores) {
  const lista = (Array.isArray(selectores) ? selectores : [selectores]).flatMap((s) =>
    s == null ? [] : separarSelectores(String(s)),
  );
  return lista.map((s) => `${s} { visibility: hidden !important; }`).join('\n');
}

/**
 * Convierte lo que escribe el usuario en una URL que Playwright pueda abrir: https://…, localhost:3000
 * (sin http://), un archivo .html local (a file://, con espacios y tildes codificados) o un dominio suelto.
 */
export function aURL(entrada, { base = process.cwd(), existe = fs.existsSync } = {}) {
  const e = String(entrada ?? '').trim();
  if (!e) throw new Error('Falta la URL o el archivo HTML que capturar.');
  const comoURL = (texto) => {
    try {
      return new URL(texto).href;
    } catch {
      throw new Error(`"${e}" no es una URL válida.`);
    }
  };
  if (/^(https?|file|data|about):/i.test(e)) return comoURL(e);
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?([/?#]|$)/i.test(e)) return comoURL(`http://${e}`);
  const ruta = path.resolve(base, e);
  if (existe(ruta)) return pathToFileURL(ruta).href;
  // «mi-producto.com/precios» sin https://; una unidad de Windows (C:) o una ruta relativa nunca lo son.
  const pareceDominio =
    !/^([a-z]:|[.\\/~])/i.test(e) &&
    /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/i.test(e) &&
    !/\.(x?html?|svg|png|json)$/i.test(e.split(/[?#]/)[0]);
  if (pareceDominio) return comoURL(`https://${e}`);
  throw new Error(`No existe el archivo ${ruta} (y "${e}" no parece una URL: pon http:// o https:// delante).`);
}

/** Nombre de archivo para una captura cuya salida es una carpeta: localhost-3000-ventas, example-com… */
export function nombreDesdeURL(url) {
  const u = new URL(url);
  if (u.protocol === 'file:') return slug(path.basename(fileURLToPath(u)).replace(/\.[^.]+$/, '')) || 'captura';
  if (u.protocol === 'http:' || u.protocol === 'https:') return slug(`${u.host}${u.pathname}`) || 'captura';
  return 'captura';
}

const esCarpetaExistente = (ruta) => {
  try {
    return fs.statSync(ruta).isDirectory();
  } catch {
    return false;
  }
};

/** Ruta final del PNG: añade .png si falta y, si la salida es una carpeta, pone el nombre a partir de la URL. */
export function rutaPNG(salida, url, { base = process.cwd(), esCarpeta = esCarpetaExistente } = {}) {
  const abs = path.resolve(base, salida);
  if (/[\\/]$/.test(salida) || esCarpeta(abs)) return path.join(abs, `${nombreDesdeURL(url)}.png`);
  if (/\.png$/i.test(abs)) return abs;
  if (OTRAS_IMAGENES.test(abs)) {
    throw new Error(`Las capturas se guardan en PNG, sin pérdida: cambia "${salida}" por un .png.`);
  }
  return `${abs}.png`;
}

/**
 * Lista de capturas a hacer, ya validadas y con rutas absolutas. Sin --lista, una sola (op.entrada).
 * Con --lista, `lista` es el JSON leído y `base` su carpeta: sus rutas relativas cuelgan de ahí, mientras que
 * las de la línea de comandos cuelgan de `cwd`. Las opciones de la línea de comandos son los valores por
 * defecto de cada entrada; --ocultar se suma al de cada entrada.
 */
export function construirTrabajos(
  op,
  {
    lista = null,
    base = process.cwd(),
    cwd = process.cwd(),
    existe = fs.existsSync,
    esCarpeta = esCarpetaExistente,
  } = {},
) {
  const comunes = op.opciones ?? {};
  let entradas;
  if (op.lista) {
    if (!Array.isArray(lista) || !lista.length) {
      throw new Error(`La lista debe ser un array JSON con al menos una captura: [{ "url": "…", "salida": "…" }].`);
    }
    entradas = lista.map((e, i) => {
      const donde = `la captura ${i + 1} de la lista`;
      if (!e || typeof e !== 'object' || Array.isArray(e)) {
        throw new Error(`${donde[0].toUpperCase()}${donde.slice(1)} no es un objeto { "url": …, "salida": … }.`);
      }
      const { url, ...resto } = e;
      return { donde, url, base, opciones: normalizarOpciones(resto, donde) };
    });
  } else {
    if (!op.entrada) {
      throw new Error(
        'Falta qué capturar: una URL (https://…, http://localhost:3000) o un archivo .html. Usa --ayuda.',
      );
    }
    entradas = [{ donde: 'la captura', url: op.entrada, base: cwd, opciones: {} }];
  }

  const trabajos = entradas.map(({ donde, url: cruda, base: suBase, opciones }) => {
    if (typeof cruda !== 'string' || !cruda.trim()) throw new Error(`Falta "url" en ${donde}.`);
    const url = aURL(cruda, { base: suBase, existe });
    const propia = opciones.salida !== undefined;
    const salida = propia ? opciones.salida : comunes.salida;
    if (!salida) throw new Error(`Falta la salida de ${donde} (--salida captura.png).`);
    return {
      ...PREDETERMINADAS,
      ...comunes,
      ...opciones,
      url,
      salida: rutaPNG(salida, url, { base: propia ? suBase : cwd, esCarpeta }),
      ocultar: [...new Set([...(comunes.ocultar ?? []), ...(opciones.ocultar ?? [])])],
    };
  });

  // En Windows «Captura.png» y «captura.png» son el mismo archivo.
  const clave = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const vistas = new Set();
  const repetidas = new Set();
  for (const t of trabajos) {
    if (vistas.has(clave(t.salida))) repetidas.add(t.salida);
    vistas.add(clave(t.salida));
  }
  if (repetidas.size) {
    throw new Error(`Varias capturas irían al mismo archivo (ponles "salida" distinta): ${[...repetidas].join(', ')}`);
  }
  return trabajos;
}

/** Lee el JSON de --lista. Quita el BOM que deja PowerShell (Out-File) y que JSON.parse no acepta. */
export function leerLista(ruta) {
  const abs = path.resolve(ruta);
  let texto;
  try {
    texto = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    throw new Error(`No puedo leer la lista ${abs}.`, { cause: e });
  }
  try {
    // trimStart() quita también el BOM: para JavaScript, U+FEFF es un espacio en blanco.
    return { lista: JSON.parse(texto.trimStart()), base: path.dirname(abs) };
  } catch (e) {
    throw new Error(`La lista ${abs} no es JSON válido: ${e.message}`, { cause: e });
  }
}

/** Ancho y alto en píxeles de un PNG, leídos de su cabecera (IHDR). */
export function tamanoPNG(buffer) {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    !buffer ||
    buffer.length < 24 ||
    firma.some((b, i) => buffer[i] !== b) ||
    buffer.toString('latin1', 12, 16) !== 'IHDR'
  ) {
    throw new Error('No es un PNG válido.');
  }
  return { ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) };
}

/** Explica en castellano por qué no se pudo abrir una página (los errores de Chromium son códigos net::ERR_…). */
export function explicarErrorCarga(e, url) {
  const m = String(e?.message ?? e);
  if (/ERR_CONNECTION_REFUSED/.test(m)) {
    return `No hay nada escuchando en ${url}: ¿está arrancada la app (por ejemplo, con npm run dev)?`;
  }
  if (/ERR_NAME_NOT_RESOLVED/.test(m)) return `No encuentro el dominio de ${url}: ¿está bien escrito y hay internet?`;
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION_(RESET|CLOSED|TIMED_OUT)|ERR_TIMED_OUT/.test(m)) {
    return `Se cortó la conexión al abrir ${url}: revisa internet y vuelve a probar.`;
  }
  if (/ERR_FILE_NOT_FOUND/.test(m)) return `No existe el archivo ${url}.`;
  if (e?.name === 'TimeoutError') return `${url} no respondió en ${LIMITE_CARGA / 1000} s.`;
  return `No pude abrir ${url}: ${m.split('\n')[0]}`;
}

// ---------- Navegador ----------

async function lanzarNavegador() {
  // Import diferido: quien solo usa las funciones puras (tests, referencia.mjs) no carga Playwright.
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(e.message)) {
      throw new Error('Falta el Chromium de Playwright. Instálalo con: npx playwright install chromium', { cause: e });
    }
    throw e;
  }
}

async function abrir(pagina, url, avisos) {
  let respuesta;
  try {
    respuesta = await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: LIMITE_CARGA });
  } catch (e) {
    throw new Error(explicarErrorCarga(e, url), { cause: e });
  }
  // Una página de error 404/500 no es el producto: mejor fallar que meterla en un vídeo.
  if (respuesta && respuesta.status() >= 400) {
    throw new Error(`${url} respondió HTTP ${respuesta.status()}: ¿la dirección es correcta?`);
  }
  try {
    await pagina.waitForLoadState('load', { timeout: LIMITE_CARGA });
  } catch {
    avisos.push(`la página no terminó de cargar en ${LIMITE_CARGA / 1000} s: capturo lo que hay`);
  }
  try {
    await pagina.waitForLoadState('networkidle', { timeout: LIMITE_RED });
  } catch {
    avisos.push(`la red no llegó a calmarse en ${LIMITE_RED / 1000} s: capturo con la página cargada`);
  }
}

async function esperarVisible(pagina, selector, opcion) {
  try {
    await pagina.locator(selector).first().waitFor({ state: 'visible', timeout: LIMITE_SELECTOR });
  } catch (e) {
    if (e.name === 'TimeoutError') {
      throw new Error(
        `No aparece ningún elemento visible con ${opcion} "${selector}" en ${LIMITE_SELECTOR / 1000} s.`,
        {
          cause: e,
        },
      );
    }
    throw new Error(`Selector no válido en ${opcion}: "${selector}" (${e.message.split('\n')[0]})`, { cause: e });
  }
}

async function desplazarParaCargar(pagina) {
  // Las imágenes con loading="lazy" y los bloques que aparecen al hacer scroll solo se cargan al acercarse a
  // la ventana: se recorre la página una vez para que la captura completa no salga con huecos.
  await pagina.evaluate(async () => {
    const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const alto = () => window.document.documentElement.scrollHeight;
    for (let y = 0; y < alto() && y < 40_000; y += window.innerHeight) {
      window.scrollTo(0, y);
      await espera(120);
    }
    window.scrollTo(0, 0);
  });
  await pagina.waitForLoadState('networkidle', { timeout: LIMITE_RED }).catch(() => {});
}

/** Hace una captura con un navegador ya abierto. Cada captura va en su propio contexto (tamaño, escala, tema). */
export async function capturarUno(navegador, t) {
  const avisos = [];
  const contexto = await navegador.newContext({
    viewport: { width: t.ancho, height: t.alto },
    deviceScaleFactor: t.escala,
    colorScheme: t.oscuro ? 'dark' : 'light',
    locale: t.idioma,
    // Las apps en desarrollo suelen usar certificados propios; para mirar y capturar no importa.
    ignoreHTTPSErrors: true,
  });
  try {
    const pagina = await contexto.newPage();
    await abrir(pagina, t.url, avisos);
    if (t.esperarA) await esperarVisible(pagina, t.esperarA, '--esperar-a');
    if (t.esperar > 0) await pagina.waitForTimeout(t.esperar);
    if (t.completa && !t.selector) await desplazarParaCargar(pagina);
    await pagina.evaluate(() => window.document.fonts.ready.then(() => true));

    const estilo = [cssOcultar(t.ocultar), t.transparente ? CSS_SIN_FONDO : ''].filter(Boolean).join('\n');
    // animations: 'disabled' adelanta al final las transiciones CSS a medias: la captura no sale a mitad de un fundido.
    const opciones = {
      type: 'png',
      omitBackground: t.transparente,
      animations: 'disabled',
      ...(estilo && { style: estilo }),
    };
    let png;
    if (t.selector) {
      if (t.completa) avisos.push('--completa no se usa con --selector: capturo solo el elemento');
      await esperarVisible(pagina, t.selector, '--selector');
      const elementos = pagina.locator(t.selector);
      const n = await elementos.count();
      if (n > 1) avisos.push(`"${t.selector}" coincide con ${n} elementos: capturo el primero`);
      const elemento = elementos.first();
      if (t.transparente) {
        // El fondo de sus contenedores (una tarjeta sobre un panel gris) también saldría en el recorte.
        await elemento.evaluate((nodo) => {
          for (let p = nodo.parentElement; p; p = p.parentElement)
            p.style.setProperty('background', 'transparent', 'important');
        });
      }
      png = await elemento.screenshot(opciones);
    } else {
      png = await pagina.screenshot({ ...opciones, fullPage: t.completa });
    }
    fs.mkdirSync(path.dirname(t.salida), { recursive: true });
    fs.writeFileSync(t.salida, png);
    return { url: t.url, salida: t.salida, ...tamanoPNG(png), avisos };
  } finally {
    await contexto.close();
  }
}

/** Hace todas las capturas con un solo navegador. Un fallo no para las demás: se informa y se sigue. */
export async function capturarTrabajos(trabajos, { log = console.log, error = console.error } = {}) {
  const navegador = await lanzarNavegador();
  const resultados = [];
  try {
    for (const t of trabajos) {
      try {
        const r = await capturarUno(navegador, t);
        log(`✅ ${r.salida} (${r.ancho} x ${r.alto} px)`);
        for (const a of r.avisos) log(`   ⚠ ${a}`);
        resultados.push({ ok: true, ...r });
      } catch (e) {
        error(`❌ ${trabajos.length > 1 ? `${t.url}: ` : ''}${e.message}`);
        resultados.push({ ok: false, url: t.url, salida: t.salida, error: e.message });
      }
    }
  } finally {
    await navegador.close();
  }
  return resultados;
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      const { lista, base } = op.lista ? leerLista(op.lista) : {};
      const trabajos = construirTrabajos(op, { lista, base });
      const fallos = (await capturarTrabajos(trabajos)).filter((r) => !r.ok).length;
      if (fallos) {
        if (trabajos.length > 1) console.error(`❌ Fallaron ${fallos} de ${trabajos.length} capturas.`);
        process.exit(1);
      }
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
