#!/usr/bin/env python3
"""Ritmo de una pista de música para youtubeman.

    python tools/beats.py <audio>   ->  JSON por stdout (código 0)

Lo llama tools/medir-audio.mjs con el Python de _estudio/.venv (librosa 1.0). Campos del JSON, todos los
tiempos en segundos desde el inicio del archivo:

  duracion     duración de la pista.
  bpm          tempo medio: pendiente de una recta ajustada a todos los pulsos. La estimación de librosa va a
               saltos (con hop 512 un metrónomo de 120 sale 117,45); la recta da centésimas.
  primerPulso  primer tiempo fuerte (el "1" del primer compás). Es el valor de tempo.primerPulso en
               proyecto.json si la música empieza en el segundo 0 del vídeo.
  pulsos       todos los pulsos, afinados al ataque real (±2 ms en un metrónomo).
  compases     cada 4 pulsos desde primerPulso.
  golpes       ataques fuertes: picos de la fuerza de ataque que superan la mitad del máximo.
  subida       segundo del mayor salto sostenido de energía después del primer 15 % de la pista, ajustado al
               pulso más cercano; null si ningún salto llega a 3 dB.
  subidaDb     tamaño de ese salto (dB).
  aviso        (opcional) lo que es dudoso o por qué faltan datos.

Si no hay pulsos (silencio, ruido, voz…): bpm 0, listas vacías y aviso, con código 0: no es un error, es
un resultado. Si el archivo no se puede leer: mensaje a stderr y código 2.

Métodos (ver cada función):
  - Pulsos: librosa.beat.beat_track sobre la fuerza de ataque (mediana de bandas mel, hop 256 = 11,6 ms).
    Ese cuadro llega tarde 10–20 ms, así que cada pulso se afina al máximo de una envolvente fina
    (n_fft 512, hop 32 = 1,45 ms) justo antes o después. beat_track recorta los primeros y últimos pulsos
    si son flojos: se recuperan siguiendo la rejilla mientras haya un ataque donde toca.
  - Tiempo fuerte: heurística (librosa no detecta compases). Cada una de las 4 fases candidatas puntúa con
    la fuerza del ataque, la energía grave (bombo) y el cambio de acorde (croma) en sus pulsos; gana la
    mayor. Si gana por poco, se avisa: Claude no oye, la persona lo confirma escuchando.
  - Subida: energía RMS en dB; en cada instante, media de los W segundos siguientes menos media de los W
    anteriores (W = 10 % de la pista, entre 0,5 y 2 s, redondeado a compases enteros si hay pulsos).
    Comparar medias, y no picos, es lo que hace que el salto sea sostenido: un golpe suelto no cuenta. Medir
    compases enteros evita que un patrón que se repite parezca un salto.
"""

import json
import os
import sys
import warnings

# numpy y librosa se importan dentro de las funciones: --ayuda y los errores de uso responden al instante
# (librosa tarda segundos en cargar) y, si falta librosa, main() lo explica en vez de soltar una traza.

SR = 22050
HOP = 256
HOP_FINO = 32
N_FFT_FINO = 512
N_MELS_FINO = 40  # con más bandas, n_fft = 512 deja filtros mel vacíos
MARGEN = 0.25  # s de silencio a cada lado: un pulso en el segundo 0 también tiene un ataque que detectar
ANTES, DESPUES = 0.06, 0.03  # ventana (s) donde se busca el ataque real alrededor de cada pulso
PULSOS_POR_COMPAS = 4
SUBIDA_MINIMA_DB = 3.0


def _redondear(valores, decimales=3):
    return [round(float(v), decimales) for v in valores]


def sin_pulsos(duracion, aviso, subida=None, subida_db=None):
    """Resultado cuando no hay ritmo que medir: bpm 0 y listas vacías (no es un error)."""
    return {
        "duracion": round(float(duracion), 3),
        "bpm": 0,
        "primerPulso": None,
        "pulsos": [],
        "compases": [],
        "golpes": [],
        "subida": subida,
        "subidaDb": subida_db,
        "aviso": aviso,
    }


def afinar(tiempos, fina, tf, antes=ANTES, despues=DESPUES):
    """Mueve cada tiempo al máximo de la envolvente fina dentro de [t - antes, t + despues].

    La ventana es asimétrica porque el seguidor de pulsos llega tarde, nunca pronto.
    """
    import numpy as np

    out = []
    for t in tiempos:
        idx = np.flatnonzero((tf >= t - antes) & (tf <= t + despues))
        out.append(tf[idx[np.argmax(fina[idx])]] if len(idx) else t)
    return np.asarray(out, dtype=float)


def fuerza_en(tiempos, fina, tf, radio=0.005):
    """Fuerza de ataque (envolvente fina) en cada tiempo: el máximo a ±radio."""
    import numpy as np

    out = []
    for t in tiempos:
        idx = np.flatnonzero(np.abs(tf - t) <= radio)
        out.append(float(np.max(fina[idx])) if len(idx) else 0.0)
    return np.asarray(out, dtype=float)


def ajustar_rejilla(tiempos):
    """Recta t = origen + k·periodo por mínimos cuadrados.

    k cuenta los pulsos desde el primero redondeando con el periodo mediano, así que un pulso que falta en
    medio no tuerce la recta. Devuelve (periodo, origen).
    """
    import numpy as np

    tiempos = np.asarray(tiempos, dtype=float)
    periodo0 = float(np.median(np.diff(tiempos)))
    k = np.round((tiempos - tiempos[0]) / periodo0)
    periodo, origen = np.polyfit(k, tiempos, 1)
    return float(periodo), float(origen)


def extender(tiempos, periodo, fina, tf, umbral, desde, hasta):
    """Recupera los pulsos que beat_track recorta (trim) al principio y al final.

    Sigue la rejilla hacia fuera mientras haya un ataque de al menos `umbral` donde toca el siguiente
    pulso. Así un primer tiempo fuerte en el segundo 0,3 no se pierde, y una intro sin ritmo no se llena
    de pulsos inventados.
    """
    import numpy as np

    lista = list(tiempos)
    for direccion in (-1, 1):
        while True:
            borde = lista[0] if direccion < 0 else lista[-1]
            candidato = borde + direccion * periodo
            if candidato < desde - ANTES or candidato > hasta + DESPUES:
                break
            afinado = float(afinar([candidato], fina, tf)[0])
            if fuerza_en([afinado], fina, tf)[0] < umbral or abs(afinado - borde) < periodo / 2:
                break
            if direccion < 0:
                lista.insert(0, afinado)
            else:
                lista.append(afinado)
    return np.asarray(lista, dtype=float)


def _z(valores):
    import numpy as np

    v = np.asarray(valores, dtype=float)
    d = float(np.std(v))
    return (v - float(np.mean(v))) / d if d > 1e-12 else np.zeros_like(v)


def fase_fuerte(acentos, por_compas=PULSOS_POR_COMPAS):
    """Fase (0..por_compas-1) del primer tiempo fuerte a partir de un acento por pulso.

    Puntúa cada fase con la media de los acentos de sus pulsos. Un empate se resuelve a favor de la fase
    más temprana: la música suele empezar en un tiempo fuerte. Devuelve (fase, dudoso).
    """
    import numpy as np

    acentos = np.asarray(acentos, dtype=float)
    fases = min(por_compas, len(acentos))
    if fases < 2:
        return 0, True
    puntos = np.array([float(np.mean(acentos[f::por_compas])) for f in range(fases)])
    orden = np.argsort(-puntos, kind="stable")
    mejor, segunda = puntos[orden[0]], puntos[orden[1]]
    escala = float(np.std(acentos)) or 1.0
    return int(orden[0]), bool((mejor - segunda) / escala < 0.5)


def acentos_de(yp, sr, pulsos, fina, tf):
    """Acento de cada pulso: suma de puntuaciones z de ataque, bombo y cambio de acorde.

    Cada señal solo cuenta si de verdad varía (un metrónomo no tiene graves ni acordes); si no, sumaría
    ruido.
    """
    import librosa
    import numpy as np

    ataque = fuerza_en(pulsos, fina, tf)
    total = _z(ataque)

    graves_env = librosa.onset.onset_strength(y=yp, sr=sr, hop_length=HOP, fmax=200, n_mels=16)
    tg = librosa.times_like(graves_env, sr=sr, hop_length=HOP)
    graves = np.array([float(np.max(graves_env[np.abs(tg - t) <= 0.025], initial=0.0)) for t in pulsos])
    if np.mean(graves) > 0.1 * max(float(np.mean(ataque)), 1e-9):
        total = total + _z(graves)

    croma = librosa.feature.chroma_stft(y=yp, sr=sr, hop_length=HOP)
    cuadros = np.clip(np.round(np.asarray(pulsos) * sr / HOP).astype(int), 0, croma.shape[1] - 1)
    limites = list(cuadros) + [croma.shape[1]]
    por_pulso = np.array(
        [croma[:, a:b].mean(axis=1) if b > a else croma[:, a] for a, b in zip(limites[:-1], limites[1:])]
    )
    cambio = np.zeros(len(pulsos))
    for i in range(1, len(pulsos)):
        antes = por_pulso[max(0, i - 2) : i].mean(axis=0)
        despues = por_pulso[i : i + 2].mean(axis=0)
        norma = float(np.linalg.norm(antes) * np.linalg.norm(despues))
        cambio[i] = 1 - float(np.dot(antes, despues)) / norma if norma > 1e-12 else 0.0
    if np.max(cambio) > 0.05:
        total = total + _z(cambio)
    return total


def ventanas_subida(duracion, periodo=None):
    """Anchos de ventana (s) a probar para la subida, de preferido a reserva.

    El objetivo es el 10 % de la pista (entre 0,5 y 2 s). Con el tempo conocido se redondea a compases
    enteros: una media sobre un compás completo no cambia con la fase de un patrón que se repite (bombo en
    el 1, caja en el 2 y el 4). Con 2 s fijos, a 128 BPM una ventana pilla un acento y la siguiente dos, y un
    metrónomo uniforme daba una subida falsa de casi 4 dB. Si los compases no caben en la pista, el objetivo.
    """
    objetivo = min(2.0, max(0.5, 0.1 * duracion))
    if not periodo or periodo <= 0:
        return [objetivo]
    compas = PULSOS_POR_COMPAS * periodo
    return [max(1, round(objetivo / compas)) * compas, objetivo]


def calcular_subida(yp, sr, desplazamiento, duracion, periodo=None):
    """Mayor salto sostenido de energía después del primer 15 % de la pista.

    Devuelve (segundo, dB), (None, dB) si el salto no llega a SUBIDA_MINIMA_DB o (None, None) si la pista
    es tan corta que no caben dos ventanas.
    """
    import librosa
    import numpy as np

    rms = librosa.feature.rms(y=yp, frame_length=2048, hop_length=HOP)[0]
    db = 20 * np.log10(np.maximum(rms, 1e-10))
    db = np.maximum(db, float(np.max(db)) - 60)  # el silencio total no debe pesar más que un pasaje suave
    t = librosa.times_like(rms, sr=sr, hop_length=HOP) - desplazamiento
    acumulada = np.concatenate([[0.0], np.cumsum(db)])
    candidatos = np.flatnonzero((t >= 0.15 * duracion) & (t <= duracion))
    for segundos in ventanas_subida(duracion, periodo):
        w = max(1, int(round(segundos * sr / HOP)))
        mejor_i, mejor_salto = None, -np.inf
        for i in candidatos:
            # Las dos ventanas tienen que caer dentro del audio real, no en el silencio añadido.
            if i - w < 0 or i + w > len(db) or t[i - w] < 0 or t[i + w - 1] > duracion:
                continue
            salto = (acumulada[i + w] - acumulada[i]) / w - (acumulada[i] - acumulada[i - w]) / w
            if salto > mejor_salto:
                mejor_i, mejor_salto = i, salto
        if mejor_i is not None:
            break
    if mejor_i is None:
        return None, None
    salto_db = round(float(mejor_salto), 1)
    if mejor_salto < SUBIDA_MINIMA_DB:
        return None, salto_db
    return float(t[mejor_i]), salto_db


def aviso_sin_subida(subida_db):
    if subida_db is None:
        return "Sin subida: la pista es demasiado corta para comparar dos tramos de energía."
    return f"Sin subida clara (el mayor salto de energía es de {subida_db} dB)."


def analizar(y, sr=SR):
    """Analiza una señal mono (numpy float) y devuelve el diccionario del JSON."""
    import librosa
    import numpy as np

    duracion = len(y) / sr
    if duracion < 1.0 or float(np.max(np.abs(y), initial=0.0)) < 1e-4:
        return sin_pulsos(duracion, "Pista demasiado corta o en silencio: no hay pulsos que medir.")

    margen = np.zeros(int(MARGEN * sr), dtype=y.dtype)
    yp = np.concatenate([margen, y, margen])
    desplazamiento = len(margen) / sr
    avisos = []

    env = librosa.onset.onset_strength(y=yp, sr=sr, hop_length=HOP, aggregate=np.median)
    _tempo, cuadros = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP, units="frames")
    if len(cuadros) < 4:
        subida, subida_db = calcular_subida(yp, sr, desplazamiento, duracion)
        return sin_pulsos(
            duracion,
            "No se detectan pulsos (¿ruido, voz o música sin ritmo marcado?). Elige el tempo a mano.",
            subida,
            subida_db,
        )

    fina = librosa.onset.onset_strength(
        y=yp, sr=sr, hop_length=HOP_FINO, n_fft=N_FFT_FINO, n_mels=N_MELS_FINO, aggregate=np.mean
    )
    tf = librosa.times_like(fina, sr=sr, hop_length=HOP_FINO)

    pulsos = afinar(librosa.frames_to_time(cuadros, sr=sr, hop_length=HOP), fina, tf)
    periodo, _ = ajustar_rejilla(pulsos)
    umbral = 0.3 * float(np.median(fuerza_en(pulsos, fina, tf)))
    pulsos = extender(pulsos, periodo, fina, tf, umbral, desplazamiento, desplazamiento + duracion)
    # Solo los que caen dentro del audio real (no en el silencio añadido), antes de numerar fases.
    pulsos = np.unique(np.round([t for t in pulsos if -ANTES <= t - desplazamiento <= duracion], 4))
    periodo, _ = ajustar_rejilla(pulsos)
    subida, subida_db = calcular_subida(yp, sr, desplazamiento, duracion, periodo)

    fase, dudoso = fase_fuerte(acentos_de(yp, sr, pulsos, fina, tf))
    if dudoso:
        avisos.append("Tiempo fuerte dudoso: escucha y, si hace falta, mueve primerPulso uno o dos pulsos.")

    envm = librosa.onset.onset_strength(y=yp, sr=sr, hop_length=HOP, aggregate=np.mean)
    envn = envm / max(float(np.percentile(envm, 99.5)), 1e-9)
    picos = librosa.util.peak_pick(envn, pre_max=3, post_max=4, pre_avg=12, post_avg=13, delta=0.1, wait=8)
    picos = picos[envn[picos] >= 0.5]
    golpes = afinar(librosa.frames_to_time(picos, sr=sr, hop_length=HOP), fina, tf) if len(picos) else []

    def al_archivo(tiempos):
        # Quita el silencio añadido; lo que el afinado deja a un pelo antes del 0 es el 0.
        dentro = [t - desplazamiento for t in tiempos if -ANTES <= t - desplazamiento <= duracion]
        return [min(max(t, 0.0), duracion) for t in dentro]

    pulsos_archivo = al_archivo(pulsos)
    if subida is not None and pulsos_archivo:
        cercano = min(pulsos_archivo, key=lambda p: abs(p - subida))
        if abs(cercano - subida) <= periodo / 2:
            subida = cercano
    if subida is None:
        avisos.append(aviso_sin_subida(subida_db))

    resultado = {
        "duracion": round(float(duracion), 3),
        "bpm": round(60.0 / periodo, 2),
        "primerPulso": round(float(pulsos_archivo[fase]), 3) if len(pulsos_archivo) > fase else None,
        "pulsos": _redondear(pulsos_archivo),
        "compases": _redondear(pulsos_archivo[fase::PULSOS_POR_COMPAS]),
        "golpes": _redondear(al_archivo(golpes)),
        "subida": round(float(subida), 3) if subida is not None else None,
        "subidaDb": subida_db,
    }
    if avisos:
        resultado["aviso"] = " ".join(avisos)
    return resultado


def main(argv):
    # Mensajes con tildes: sin esto, una consola de Windows los escribe en cp1252 y Node lee basura.
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    uso = "Uso: python tools/beats.py <audio>  ->  JSON con bpm, pulsos, compases, golpes y subida"
    if len(argv) == 1 and argv[0] in ("-h", "--help", "--ayuda"):
        print(uso)
        return 0
    if len(argv) != 1:
        print(uso, file=sys.stderr)
        return 2
    # librosa avisa de detalles (n_fft largo en pistas cortas) que no cambian el resultado.
    warnings.filterwarnings("ignore")
    try:
        import librosa
    except ImportError as e:
        print(f"No encuentro librosa ({e}). Instálalo en _estudio/.venv: pip install librosa", file=sys.stderr)
        return 2
    ruta = argv[0]
    if not os.path.isfile(ruta):
        print(f"No existe el archivo {ruta}", file=sys.stderr)
        return 2
    try:
        y, sr = librosa.load(ruta, sr=SR, mono=True)
    except Exception as e:  # cualquier fallo de lectura (formato, permisos, archivo roto) se explica igual
        motivo = str(e).rstrip(". ")
        print(
            f"No puedo leer {ruta} ({motivo}). Conviértelo a WAV: node tools/medir-audio.mjs <archivo> --convertir",
            file=sys.stderr,
        )
        return 2
    # ensure_ascii (por defecto): el JSON viaja en ASCII puro y sobrevive a cualquier codificación de consola.
    print(json.dumps(analizar(y, sr)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
