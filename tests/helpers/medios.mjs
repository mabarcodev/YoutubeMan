// Medios sintéticos para los tests (vídeo mudo, tonos), generados con ffmpeg/lavfi en carpetas temporales.
// Así los tests no dependen de archivos del repo que otras herramientas pueden estar reescribiendo.

import { ffmpeg } from '../../tools/lib/ffmpeg.mjs';

/**
 * Vídeo H.264 sin audio. tipo 'movimiento' (testsrc2, cambia en cada fotograma) o 'quieto' (gris liso).
 */
export async function crearVideoMudo(ruta, { duracion = 2, w = 320, h = 180, fps = 30, tipo = 'movimiento' } = {}) {
  const fuente =
    tipo === 'quieto'
      ? `color=c=gray:size=${w}x${h}:rate=${fps}:duration=${duracion}`
      : `testsrc2=size=${w}x${h}:rate=${fps}:duration=${duracion}`;
  await ffmpeg(['-f', 'lavfi', '-i', fuente, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ruta]);
  return ruta;
}

/** Tono senoidal en WAV (mono, 48 kHz). */
export async function crearTono(ruta, { duracion = 1, frecuencia = 440 } = {}) {
  await ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${frecuencia}:sample_rate=48000:duration=${duracion}`, ruta]);
  return ruta;
}
