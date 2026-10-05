#!/usr/bin/env node
// Añade los agentes y la skill de youtubeman, que viven versionados en _estudio/claude/, a la configuración de
// Claude Code del usuario (~/.claude por defecto):
//   claude/agents/*.md          → <destino>/agents/
//   claude/skills/<skill>/**    → <destino>/skills/<skill>/**
//
//   node tools/instalar-agentes.mjs [--destino <dir>] [--origen <dir>] [--comprobar]
//
// Los .md llevan los marcadores {{ESTUDIO}} y {{VIDEOS}} en lugar de rutas fijas: al copiarlos se sustituyen por
// las rutas reales de quien instala (las de tools/lib/rutas.mjs). Así el mismo repo vale en cualquier ordenador.
//
// Solo añade o actualiza. Nunca borra nada del destino ni toca otros agentes o skills (el usuario tiene los
// suyos). Antes de sobrescribir un archivo distinto guarda una copia <archivo>.bak-AAAAMMDDHHmmss: si alguien
// editó a mano la versión instalada, su trabajo no se pierde.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leerArgs } from './lib/args.mjs';
import { ESTUDIO, VIDEOS, esPrincipal } from './lib/rutas.mjs';

export const ORIGEN = path.join(ESTUDIO, 'claude');
export const DESTINO = path.join(os.homedir(), '.claude');

export const AYUDA = `Uso: node tools/instalar-agentes.mjs [opciones]
  --destino <dir>  configuración de Claude Code (por defecto ${DESTINO})
  --origen <dir>   agentes y skills versionados (por defecto ${ORIGEN})
  --comprobar      solo dice qué es distinto o falta; sale con código 1 si hay diferencias
  --ayuda          esta ayuda

Copia agents/*.md y skills/<skill>/** sustituyendo {{ESTUDIO}} y {{VIDEOS}} por las rutas de este
ordenador. Nunca borra nada ni toca otros agentes o skills; antes de sobrescribir un archivo distinto
guarda <archivo>.bak-AAAAMMDDHHmmss.`;

/** Rutas con barras normales: valen igual en PowerShell, Bash y dentro de Markdown. */
const conBarras = (ruta) => ruta.replaceAll('\\', '/');

/** Sustituye los marcadores de ruta de un texto de agente o skill. */
export function rellenarRutas(texto, { estudio = ESTUDIO, videos = VIDEOS } = {}) {
  return texto.replaceAll('{{ESTUDIO}}', conBarras(estudio)).replaceAll('{{VIDEOS}}', conBarras(videos));
}

/** Lo que se escribe en el destino: los .md con los marcadores sustituidos; el resto, tal cual. */
export function contenidoInstalado(archivo, rutas) {
  const datos = fs.readFileSync(archivo);
  if (!archivo.toLowerCase().endsWith('.md')) return datos;
  return Buffer.from(rellenarRutas(datos.toString('utf8'), rutas), 'utf8');
}

/** Copias de seguridad propias y basura del sistema: nunca se instalan. */
const IGNORAR = (nombre) =>
  /\.bak-\d{14}(-\d+)?$/.test(nombre) || ['Thumbs.db', 'desktop.ini', '.DS_Store'].includes(nombre);

export function leerOpciones(argv) {
  const { values } = leerArgs({
    args: argv,
    strict: true,
    options: {
      destino: { type: 'string' },
      origen: { type: 'string' },
      comprobar: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.ayuda) return { ayuda: true };
  return {
    origen: path.resolve(values.origen ?? ORIGEN),
    destino: path.resolve(values.destino ?? DESTINO),
    comprobar: values.comprobar,
  };
}

/** AAAAMMDDHHmmss en hora local: la misma marca para todas las copias de una ejecución. */
export function marcaTiempo(fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}` +
    `${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`
  );
}

/** Ruta libre para la copia de `archivo`; si dos ejecuciones caen en el mismo segundo, añade -2, -3… */
export function rutaCopia(archivo, marca, existe = fs.existsSync) {
  let ruta = `${archivo}.bak-${marca}`;
  for (let i = 2; existe(ruta); i++) ruta = `${archivo}.bak-${marca}-${i}`;
  return ruta;
}

function archivosDe(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (IGNORAR(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...archivosDe(dir, r));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/** Qué hay que instalar: { archivos: ['agents/x.md', 'skills/youtubeman/SKILL.md'…], skills, avisos }. */
export function listarOrigen(origen) {
  if (!fs.existsSync(origen) || !fs.statSync(origen).isDirectory()) {
    throw new Error(
      `No existe la carpeta de origen ${origen}. Ahí viven los agentes (agents/*.md) y las skills ` +
        '(skills/<skill>/) de youtubeman; cuando estén escritos, vuelve a ejecutar esto.',
    );
  }
  const archivos = [];
  const skills = [];
  const avisos = [];
  const dirAgentes = path.join(origen, 'agents');
  if (fs.existsSync(dirAgentes)) {
    for (const e of fs.readdirSync(dirAgentes, { withFileTypes: true })) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.md') && !IGNORAR(e.name)) archivos.push(`agents/${e.name}`);
    }
  }
  const dirSkills = path.join(origen, 'skills');
  if (fs.existsSync(dirSkills)) {
    for (const e of fs.readdirSync(dirSkills, { withFileTypes: true })) {
      if (IGNORAR(e.name)) continue;
      if (!e.isDirectory()) {
        avisos.push(`skills/${e.name} no está dentro de la carpeta de una skill: no se instala.`);
        continue;
      }
      skills.push(e.name);
      const propios = archivosDe(path.join(dirSkills, e.name));
      if (!propios.includes('SKILL.md')) avisos.push(`La skill ${e.name} no tiene SKILL.md: Claude Code no la verá.`);
      archivos.push(...propios.map((r) => `skills/${e.name}/${r}`));
    }
  }
  if (!archivos.length) throw new Error(`No hay nada que instalar en ${origen} (ni agents/*.md ni skills/<skill>/).`);
  return { archivos: archivos.sort(), skills, avisos };
}

const mismoContenido = (contenido, archivo) =>
  fs.statSync(archivo).size === contenido.length && fs.readFileSync(archivo).equals(contenido);

/**
 * Compara origen y destino sin tocar nada. Cada archivo: crear | actualizar | igual | conflicto (en el
 * destino hay una carpeta con ese nombre). `sobran`: archivos de nuestras skills que ya no están en el
 * origen (solo se informa: nunca se borran).
 */
export function planificarInstalacion({ origen, destino, rutas }) {
  const absOrigen = path.resolve(origen);
  const absDestino = path.resolve(destino);
  const rel = path.relative(absOrigen, absDestino);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(`El destino (${absDestino}) no puede ser el origen ni estar dentro de él.`);
  }
  const { archivos, skills, avisos } = listarOrigen(absOrigen);
  const plan = archivos.map((r) => {
    const de = path.join(absOrigen, ...r.split('/'));
    const a = path.join(absDestino, ...r.split('/'));
    const contenido = contenidoInstalado(de, rutas);
    let accion = 'crear';
    if (fs.existsSync(a))
      accion = !fs.statSync(a).isFile() ? 'conflicto' : mismoContenido(contenido, a) ? 'igual' : 'actualizar';
    return { rel: r, de, a, accion, contenido };
  });
  const enPlan = new Set(archivos);
  const sobran = [];
  for (const skill of skills) {
    const dir = path.join(absDestino, 'skills', skill);
    if (!fs.existsSync(dir)) continue;
    for (const r of archivosDe(dir)) if (!enPlan.has(`skills/${skill}/${r}`)) sobran.push(`skills/${skill}/${r}`);
  }
  return { plan, sobran, avisos };
}

/** Aplica un plan: crea lo nuevo y actualiza lo distinto guardando antes la copia. Nunca borra. */
export function aplicarPlan(plan, { marca = marcaTiempo() } = {}) {
  return plan.map((p) => {
    if (p.accion === 'crear') {
      fs.mkdirSync(path.dirname(p.a), { recursive: true });
      // 'wx': si el archivo apareció entre el plan y la copia, falla en vez de pisarlo sin copia.
      fs.writeFileSync(p.a, p.contenido, { flag: 'wx' });
      return { ...p, resultado: 'creado' };
    }
    if (p.accion === 'actualizar') {
      const copia = rutaCopia(p.a, marca);
      fs.copyFileSync(p.a, copia, fs.constants.COPYFILE_EXCL);
      fs.writeFileSync(p.a, p.contenido);
      return { ...p, resultado: 'actualizado', copia };
    }
    return { ...p, resultado: p.accion === 'igual' ? 'igual' : 'conflicto' };
  });
}

/**
 * Instala (o, con comprobar, solo compara). Devuelve { origen, destino, comprobar, resultados, sobran, avisos,
 * diferencias, conflictos }.
 */
export function instalar({ origen = ORIGEN, destino = DESTINO, comprobar = false, marca, rutas } = {}) {
  const { plan, sobran, avisos } = planificarInstalacion({ origen, destino, rutas });
  const resultados = comprobar
    ? plan.map((p) => ({ ...p, resultado: { crear: 'falta', actualizar: 'distinto' }[p.accion] ?? p.accion }))
    : aplicarPlan(plan, { marca });
  return {
    origen: path.resolve(origen),
    destino: path.resolve(destino),
    comprobar,
    resultados,
    sobran,
    avisos,
    diferencias: plan.filter((p) => p.accion === 'crear' || p.accion === 'actualizar').length,
    conflictos: plan.filter((p) => p.accion === 'conflicto').length,
  };
}

export function informe(r) {
  const lineas = r.resultados.map((x) => {
    const copia = x.copia ? `  (copia: ${path.basename(x.copia)})` : '';
    const conflicto = x.resultado === 'conflicto' ? '  (en el destino es una carpeta: no se toca)' : '';
    return `  ${x.resultado.padEnd(11)}  ${x.rel}${copia}${conflicto}`;
  });
  for (const s of r.sobran) lineas.push(`  ${'sobra'.padEnd(11)}  ${s}  (ya no está en el origen; no se borra)`);
  for (const a of r.avisos) lineas.push(`⚠ ${a}`);
  const cuenta = (k) => r.resultados.filter((x) => x.resultado === k).length;
  if (r.comprobar) {
    lineas.push(
      r.diferencias
        ? `❌ ${r.diferencias} archivo(s) faltan o son distintos en ${r.destino}: ejecuta npm run instalar-agentes.`
        : `✅ ${r.destino} está al día (${cuenta('igual')} archivos iguales).`,
    );
  } else {
    lineas.push(
      `✅ ${cuenta('creado')} creado(s) · ${cuenta('actualizado')} actualizado(s) · ${cuenta('igual')} igual(es) en ${r.destino}`,
    );
    if (cuenta('creado') + cuenta('actualizado'))
      lineas.push('   Abre una sesión nueva de Claude Code para que cargue los cambios.');
  }
  if (r.conflictos) lineas.push(`❌ ${r.conflictos} conflicto(s): en el destino hay carpetas donde van archivos.`);
  return lineas.join('\n');
}

if (esPrincipal(import.meta.url)) {
  try {
    const op = leerOpciones(process.argv.slice(2));
    if (op.ayuda) console.log(AYUDA);
    else {
      console.log(`${op.comprobar ? 'Comparando' : 'Instalando'} ${op.origen} → ${op.destino}`);
      const r = instalar(op);
      console.log(informe(r));
      process.exit((op.comprobar && r.diferencias) || r.conflictos ? 1 : 0);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
