import { parseArgs } from 'node:util';

// parseArgs de Node da errores en inglés y poco claros para alguien que no programa
// ("argument is ambiguous" cuando se escribe --fps -30). Los traducimos y decimos cómo arreglarlo.

/** Mensaje en español para un error de parseArgs (o el mensaje original si no es de parseArgs). */
export function traducirErrorArgs(e) {
  // Con alias corto el mensaje es "Option '-o, --salida <value>'": nos quedamos con el nombre largo.
  const opcion = /'(?:-\w, )?(--?[\w-]+)/.exec(e?.message ?? '')?.[1];
  switch (e?.code) {
    case 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE':
      // El mismo código llega con "--borrador=si": un interruptor al que se le ha dado un valor.
      if (/does not take an argument/.test(e.message)) {
        return `${opcion} no lleva valor: es un interruptor (escribe solo ${opcion}).`;
      }
      return (
        `Falta el valor de ${opcion} o empieza por "-": el valor debe ser ${opcion}=<valor> ` +
        `(por ejemplo ${opcion}=-30), o va justo detrás de ${opcion}.`
      );
    case 'ERR_PARSE_ARGS_UNKNOWN_OPTION':
      return `Opción desconocida: ${opcion}. Usa --ayuda para ver las opciones.`;
    case 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL': {
      const arg = /argument '([^']*)'/.exec(e.message)?.[1];
      return `Argumento inesperado: "${arg}". Usa --ayuda para ver el uso.`;
    }
    default:
      return e?.message ?? String(e);
  }
}

/** parseArgs con errores en español. Mismos parámetros que node:util parseArgs. */
export function leerArgs(config) {
  try {
    return parseArgs(config);
  } catch (e) {
    const traducido = new Error(traducirErrorArgs(e), { cause: e });
    if (e?.code) traducido.code = e.code; // quien distinga errores por código sigue pudiendo hacerlo
    throw traducido;
  }
}
