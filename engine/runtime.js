// Runtime del navegador. Carga una escena o película (módulo ES), prepara el escenario
// al tamaño exacto del formato y expone window.seek(t) para el render.
// Fuera del render (navegador normal) añade una vista previa con barra de tiempo.

import { formato as resolverFormato, unidad, zonaSegura, orientacion } from './layout.js';
import { crearTempo } from './tempo.js';
import { valor, imagenesDe } from './composicion.js';

const params = new URLSearchParams(location.search);
const MODO_RENDER = navigator.webdriver === true || params.get('render') === '1';

export async function iniciar() {
  window.__estudio = { listo: false };
  try {
    const rutaModulo = params.get('modulo');
    if (!rutaModulo) throw new Error('Falta el parámetro ?modulo=/ruta/a/escena.js');
    const fmt = resolverFormato(params.get('formato') || '16:9');
    const proyecto = await cargarJSON('/proyecto.json');
    const modulo = (await import(rutaModulo)).default;
    if (!modulo || typeof modulo.dibujar !== 'function') {
      throw new Error(`${rutaModulo} debe exportar por defecto un objeto con dibujar(t, ctx).`);
    }

    const ctx = {
      W: fmt.w,
      H: fmt.h,
      formato: fmt.clave,
      orientacion: orientacion(fmt),
      u: unidad(fmt),
      zona: zonaSegura(fmt.clave),
      proyecto,
      tempo: crearTempo(proyecto?.tempo ?? {}),
      render: MODO_RENDER,
      cache: new Map(),
      img: {},
    };

    await cargarFuentes(modulo.fuentes ?? []);
    await cargarImagenes(Object.values(modulo.imagenes ?? {}), ctx.cache);
    ctx.img = imagenesDe(modulo, ctx.cache);

    const escenario = crearEscenario(fmt, modulo.fondo);
    await modulo.montar?.(escenario, ctx);
    const duracion = valor(modulo.duracion, ctx);
    if (!(duracion >= 0)) throw new Error('La escena necesita una duracion (segundos, o función del contexto).');

    window.seek = (t) => {
      modulo.dibujar(t, ctx);
      return true;
    };
    window.seek(0);
    await document.fonts.ready;

    window.__estudio = {
      listo: true,
      nombre: modulo.nombre ?? rutaModulo,
      duracion,
      formato: fmt.clave,
      W: fmt.w,
      H: fmt.h,
      fondo: modulo.fondo ?? null,
      sonidos: valor(modulo.sonidos, ctx) ?? [],
      musica: valor(modulo.musica, ctx) ?? null,
    };
    if (!MODO_RENDER) montarVistaPrevia(escenario, fmt, duracion, ctx);
  } catch (err) {
    window.__estudio = { listo: false, error: err?.stack || String(err) };
    mostrarError(err);
  }
}

async function cargarJSON(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function cargarFuentes(fuentes) {
  for (const f of fuentes) {
    const cara = new FontFace(f.familia, `url("${f.url}")`, {
      weight: String(f.peso ?? 400),
      style: f.estilo ?? 'normal',
    });
    try {
      document.fonts.add(await cara.load());
    } catch (e) {
      throw new Error(`No se pudo cargar la fuente ${f.familia} (${f.url}): ${e.message}`, { cause: e });
    }
  }
}

async function cargarImagenes(urls, cache) {
  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch (e) {
        throw new Error(`No se pudo cargar la imagen ${url}`, { cause: e });
      }
      cache.set(url, img);
    }),
  );
}

function crearEscenario(fmt, fondo) {
  document.documentElement.style.background = MODO_RENDER ? (fondo ?? '#000') : '#1b1b1a';
  document.body.style.margin = '0';
  const escenario = document.createElement('div');
  escenario.id = 'escenario';
  Object.assign(escenario.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${fmt.w}px`,
    height: `${fmt.h}px`,
    overflow: 'hidden',
    background: fondo ?? '#000',
    transformOrigin: '0 0',
  });
  document.body.appendChild(escenario);
  return escenario;
}

function mostrarError(err) {
  if (MODO_RENDER) return;
  const pre = document.createElement('pre');
  pre.textContent = `Error en la escena:\n\n${err?.stack || err}`;
  Object.assign(pre.style, {
    color: '#ffb4a8',
    background: '#2a1210',
    padding: '24px',
    margin: '0',
    font: '14px/1.5 monospace',
    whiteSpace: 'pre-wrap',
  });
  document.body.appendChild(pre);
}

// ---------- Vista previa (solo en navegador normal, nunca en el render) ----------

function montarVistaPrevia(escenario, fmt, duracion, ctx) {
  const BARRA = 56;
  const barra = document.createElement('div');
  Object.assign(barra.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    height: `${BARRA}px`,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 16px',
    background: '#111',
    color: '#eee',
    font: '13px system-ui, sans-serif',
    zIndex: '99999',
  });
  barra.innerHTML = `
    <button id="vp-play" style="width:72px;height:32px">▶ Play</button>
    <input id="vp-t" type="range" min="0" max="${duracion}" step="${1 / 60}" value="0" style="flex:1">
    <span id="vp-info" style="min-width:180px;font-variant-numeric:tabular-nums"></span>
    <select id="vp-fmt">${['16:9', '9:16', '1:1', '4:5'].map((f) => `<option ${f === fmt.clave ? 'selected' : ''}>${f}</option>`).join('')}</select>
    <label><input id="vp-loop" type="checkbox" checked> bucle</label>`;
  document.body.appendChild(barra);

  const ajustar = () => {
    const s = Math.min(innerWidth / fmt.w, (innerHeight - BARRA) / fmt.h);
    escenario.style.transform = `translate(${(innerWidth - fmt.w * s) / 2}px, ${(innerHeight - BARRA - fmt.h * s) / 2}px) scale(${s})`;
  };
  addEventListener('resize', ajustar);
  ajustar();

  const $ = (id) => barra.querySelector(id);
  let t = Number(params.get('t') ?? 0);
  let reproduciendo = false;
  let ultimo = 0;
  const pintar = () => {
    window.seek(t);
    $('#vp-t').value = String(t);
    $('#vp-info').textContent = `${t.toFixed(2)} s / ${duracion.toFixed(2)} s · pulso ${ctx.tempo.aBeat(t).toFixed(1)}`;
    $('#vp-play').textContent = reproduciendo ? '❚❚ Pausa' : '▶ Play';
  };
  const bucle = (ahora) => {
    if (!reproduciendo) return;
    t += (ahora - ultimo) / 1000;
    ultimo = ahora;
    if (t > duracion) {
      if ($('#vp-loop').checked) t = 0;
      else {
        t = duracion;
        reproduciendo = false;
      }
    }
    pintar();
    requestAnimationFrame(bucle);
  };
  const alternar = () => {
    reproduciendo = !reproduciendo;
    ultimo = performance.now();
    if (reproduciendo) requestAnimationFrame(bucle);
    pintar();
  };
  $('#vp-play').onclick = alternar;
  $('#vp-t').oninput = (e) => {
    reproduciendo = false;
    t = Number(e.target.value);
    pintar();
  };
  $('#vp-fmt').onchange = (e) => {
    params.set('formato', e.target.value);
    params.set('t', t.toFixed(3));
    location.search = params.toString();
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      alternar();
    } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      reproduciendo = false;
      t = Math.min(duracion, Math.max(0, t + (e.code === 'ArrowRight' ? 1 : -1) / 60));
      pintar();
    }
  });
  pintar();
}
