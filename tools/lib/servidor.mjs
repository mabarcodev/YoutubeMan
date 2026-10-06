import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Servidor estático local. Los módulos ES no se pueden importar desde file:// en Chromium,
// así que el render y la vista previa sirven el proyecto por HTTP:
//   /estudio/...  → carpeta del estudio (motor, plantillas)
//   /...          → carpeta del proyecto (escenas, kit, proyecto.json)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

export const tipoMime = (archivo) => MIME[path.extname(archivo).toLowerCase()] ?? 'application/octet-stream';

/**
 * Traduce una ruta URL a un archivo del disco. Devuelve null si intenta salir de su raíz.
 */
export function resolverRuta(rutaURL, { proyecto, estudio }) {
  let p;
  try {
    p = decodeURIComponent(rutaURL.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const enEstudio = p === '/estudio' || p.startsWith('/estudio/');
  const base = path.resolve(enEstudio ? estudio : proyecto);
  const rel = enEstudio ? p.slice('/estudio'.length) : p;
  const abs = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  // La raíz de una unidad ("D:\" o "/") ya acaba en separador: no hay que añadir otro.
  const raiz = base.endsWith(path.sep) ? base : base + path.sep;
  if (abs !== base && !abs.startsWith(raiz)) return null;
  return abs;
}

export function iniciarServidor({ proyecto, estudio, puerto = 0, host = '127.0.0.1' }) {
  const servidor = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const archivo = resolverRuta(req.url, { proyecto, estudio });
    if (!archivo || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`No encontrado: ${req.url}`);
      return;
    }
    // no-store: en la vista previa, recargar debe mostrar siempre la última versión de la escena.
    res.writeHead(200, { 'Content-Type': tipoMime(archivo), 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(archivo).pipe(res);
  });
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(puerto, host, () => {
      const { port } = servidor.address();
      resolve({
        url: `http://${host}:${port}`,
        cerrar: () => new Promise((r) => servidor.close(() => r())),
      });
    });
  });
}
