// DOM mínimo para probar en Node la lógica que solo crea nodos y asigna estilos (p. ej. secuencia().montar
// y dibujar). Lo que depende de cómo pinta de verdad el navegador se prueba con Chromium en tests/integracion.

export class ElementoFalso {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.atributos = {};
    this.textContent = '';
    this.parentNode = null;
  }

  appendChild(hijo) {
    this.children.push(hijo);
    hijo.parentNode = this;
    return hijo;
  }

  setAttribute(k, v) {
    this.atributos[k] = String(v);
  }
}

/** Instala un `document` falso en globalThis. Devuelve la función que deja todo como estaba. */
export function instalarDomFalso() {
  const habia = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const previo = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new ElementoFalso(tag),
    createTextNode: (texto) => ({ nodeType: 3, textContent: String(texto) }),
  };
  return () => {
    if (habia) globalThis.document = previo;
    else delete globalThis.document;
  };
}
