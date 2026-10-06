import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** true si el módulo con esta import.meta.url es el script que se ha ejecutado con node. */
export const esPrincipal = (metaUrl) =>
  !!process.argv[1] && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;

/** Carpeta raíz del estudio (este repo). */
export const ESTUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/**
 * Carpeta de los vídeos: una subcarpeta por proyecto, dentro del estudio para que todo viva en la carpeta donde se
 * abre la IA. git la ignora (salvo su README), así que los vídeos de cada persona nunca se suben.
 */
export const VIDEOS = path.join(ESTUDIO, 'videos');

/**
 * Convierte la ruta de un módulo de escena (absoluta o relativa al proyecto) en la ruta URL
 * que sirve el servidor local (relativa a la raíz del proyecto, con barras /).
 */
export function rutaURLModulo(proyecto, modulo) {
  const abs = path.isAbsolute(modulo) ? modulo : path.resolve(proyecto, modulo);
  const rel = path.relative(proyecto, abs);
  // Fuera del proyecto es ".." o "../algo"; un archivo llamado "..borrador.js" sí está dentro.
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`El módulo ${abs} no está dentro del proyecto ${proyecto}.`);
  }
  return '/' + rel.split(path.sep).join('/');
}

/** Nombre seguro para archivos: minúsculas, sin tildes ni espacios. */
export function slug(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita las tildes que NFD ha separado de su letra
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
