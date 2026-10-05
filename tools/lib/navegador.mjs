import { chromium } from 'playwright';
import { iniciarServidor } from './servidor.mjs';
import { ESTUDIO, rutaURLModulo } from './rutas.mjs';
import { formato as resolverFormato } from '../../engine/layout.js';

/**
 * Abre una escena en Chromium sin ventana, al tamaño exacto del formato, y espera a que
 * el runtime esté listo. Devuelve la página, los metadatos (duración, sonidos...) y cerrar().
 */
export async function abrirEscena({ proyecto, modulo, formato = '16:9', escala = 1, navegador }) {
  const fmt = resolverFormato(formato);
  const servidor = await iniciarServidor({ proyecto, estudio: ESTUDIO });
  const propio = !navegador;
  const browser = navegador ?? (await chromium.launch());
  const errores = [];
  try {
    const pagina = await browser.newPage({ viewport: { width: fmt.w, height: fmt.h }, deviceScaleFactor: escala });
    pagina.on('pageerror', (e) => errores.push(e.message));
    pagina.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
    const q = new URLSearchParams({ modulo: rutaURLModulo(proyecto, modulo), formato: fmt.clave, render: '1' });
    await pagina.goto(`${servidor.url}/estudio/engine/pagina.html?${q}`);
    await pagina.waitForFunction(() => window.__estudio && (window.__estudio.listo || window.__estudio.error), null, {
      timeout: 120_000,
    });
    const meta = await pagina.evaluate(() => window.__estudio);
    if (meta.error) throw new Error(`La escena falló al cargar:\n${meta.error}`);
    return {
      pagina,
      meta,
      errores,
      cerrar: async () => {
        await pagina.close();
        if (propio) await browser.close();
        await servidor.cerrar();
      },
    };
  } catch (e) {
    if (propio) await browser.close();
    await servidor.cerrar();
    if (errores.length) e.message += `\nErrores de la página:\n- ${errores.join('\n- ')}`;
    throw e;
  }
}

/**
 * Pinta el instante t y devuelve la imagen del escenario.
 * PNG (sin pérdida) para fotos y publicaciones; el vídeo usa JPEG 95, un 55 % más rápido de capturar
 * y sin diferencia visible porque el MP4 final es yuv420p igualmente.
 */
export async function fotograma(pagina, t, { tipo = 'png', calidad = 95 } = {}) {
  // Esperamos un requestAnimationFrame para que el navegador aplique el DOM antes de la captura.
  await pagina.evaluate(
    (tt) =>
      new Promise((ok) => {
        window.seek(tt);
        requestAnimationFrame(() => ok(true));
      }),
    t,
  );
  return pagina.screenshot({
    type: tipo,
    ...(tipo === 'jpeg' ? { quality: calidad } : {}),
    animations: 'disabled',
    caret: 'hide',
  });
}
