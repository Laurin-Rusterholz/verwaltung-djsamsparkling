/**
 * Ein kleines, STRENGES DOM — gerade genug, um die Ansichten der Verwaltung
 * wirklich zu zeichnen, ohne Browser und ohne fremde Pakete.
 *
 * ANLASS (17.09.2026): die Shows-Maske blieb nach einem harten Neuladen leer.
 *
 *     Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.
 *
 * Ein Feld bekam ein Objekt, wo eine Zeichenkette hingehoert — `el()` reicht
 * so etwas ungeprueft an `appendChild` weiter, und der Browser bricht ab. Kein
 * Textmuster-Test haette das gesehen: im Quelltext stand nichts Auffaelliges.
 * Also wird hier wirklich gezeichnet.
 *
 * Streng ist dieses DOM genau dort, wo es darauf ankommt:
 *
 *   - `appendChild` und `insertBefore` nehmen NUR Knoten und werfen sonst mit
 *     derselben Meldung wie der Browser.
 *   - `append` ist nachsichtig und macht Text daraus — auch das wie im
 *     Browser. Deshalb faellt ein falscher Parameter DORT nicht auf.
 *
 * Alles andere ist bewusst klein gehalten: keine Layout-Rechnung, keine
 * Vererbung von Stilen, kein echtes Ereignis-System. Was die Ansichten
 * brauchen, steht hier — mehr nicht.
 */
export class Knoten {
  constructor(tag) {
    this.tagName = String(tag || "").toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.parentNode = null;
    this._text = "";
    this.className = "";
    this.classList = {
      _n: this,
      add: (...c) => { const s = new Set(String(this.className).split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); this.className = [...s].join(" "); },
      remove: (...c) => { const s = new Set(String(this.className).split(/\s+/).filter(Boolean)); c.forEach((x) => s.delete(x)); this.className = [...s].join(" "); },
      toggle: (c, an) => { an ? this.classList.add(c) : this.classList.remove(c); },
      contains: (c) => String(this.className).split(/\s+/).includes(c),
    };
    this._listeners = {};
  }
  get children() { return this.childNodes.filter((k) => k instanceof Knoten); }
  get firstChild() { return this.childNodes[0] || null; }
  get textContent() {
    if (this.childNodes.length) return this.childNodes.map((k) => k.textContent).join("");
    return this._text;
  }
  set textContent(v) { this.childNodes = []; this._text = String(v); }
  set innerHTML(v) { this.childNodes = []; this._text = String(v); }
  get innerHTML() { return this._text; }
  appendChild(k) {
    if (!(k instanceof Knoten)) {
      throw new TypeError(
        "Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'."
      );
    }
    k.parentNode = this;
    this.childNodes.push(k);
    return k;
  }
  insertBefore(k, davor) {
    if (!(k instanceof Knoten)) {
      throw new TypeError(
        "Failed to execute 'insertBefore' on 'Node': parameter 1 is not of type 'Node'."
      );
    }
    const i = this.childNodes.indexOf(davor);
    k.parentNode = this;
    if (i < 0) this.childNodes.push(k); else this.childNodes.splice(i, 0, k);
    return k;
  }
  /* `append` ist nachsichtiger als `appendChild` — genau wie im Browser:
     was kein Knoten ist, wird zu Text. Deshalb faellt ein falscher Parameter
     dort NICHT auf; die Shows-Maske ist an `appendChild` gescheitert. */
  append(...teile) {
    teile.forEach((t) => this.appendChild(t instanceof Knoten ? t : dokument.createTextNode(String(t))));
  }
  prepend(...teile) {
    teile.reverse().forEach((t) => this.insertBefore(t instanceof Knoten ? t : dokument.createTextNode(String(t)), this.childNodes[0]));
  }
  removeChild(k) { const i = this.childNodes.indexOf(k); if (i >= 0) this.childNodes.splice(i, 1); return k; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceChildren(...k) { this.childNodes = []; k.forEach((x) => this.appendChild(x)); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  addEventListener(art, fn) { (this._listeners[art] ||= []).push(fn); }
  removeEventListener() {}
  dispatchEvent(ev) { (this._listeners[ev?.type] || []).forEach((fn) => fn(ev)); return true; }
  click() { this.dispatchEvent({ type: "click", target: this, preventDefault() {}, stopPropagation() {} }); }
  focus() {}
  blur() {}
  scrollIntoView() {}
  closest(sel) { let n = this; while (n) { if (n._passt(sel)) return n; n = n.parentNode; } return null; }
  _passt(sel) {
    const s = String(sel).trim();
    if (s.startsWith(".")) return this.classList.contains(s.slice(1));
    if (s.startsWith("#")) return this.attributes.id === s.slice(1);
    const attr = s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2];
    const tagAttr = s.match(/^([a-z0-9]+)\[([^=\]]+)(?:="([^"]*)")?\]$/i);
    if (tagAttr) return this.tagName === tagAttr[1].toUpperCase() &&
      (tagAttr[3] === undefined ? tagAttr[2] in this.attributes : this.attributes[tagAttr[2]] === tagAttr[3]);
    if (s === "*") return true;
    return this.tagName === s.toUpperCase();
  }
  alleKnoten() { const raus = []; const geh = (n) => n.children.forEach((k) => { raus.push(k); geh(k); }); geh(this); return raus; }
  querySelectorAll(sel) {
    const teile = String(sel).split(",").map((s) => s.trim()).filter(Boolean);
    return this.alleKnoten().filter((k) => teile.some((t) => k._passt(t.split(/\s+/).pop())));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

let dokument = null;

export function baueDokument() {
  const doc = new Knoten("#document");
  doc.createElement = (tag) => new Knoten(tag);
  doc.createTextNode = (t) => { const n = new Knoten("#text"); n._text = String(t); return n; };
  doc.createDocumentFragment = () => new Knoten("#fragment");
  doc.body = new Knoten("body");
  doc.head = new Knoten("head");
  doc.documentElement = new Knoten("html");
  doc.appendChild(doc.documentElement);
  doc.getElementById = (id) => doc.body.querySelectorAll("*").find((k) => k.attributes.id === id) || null;
  dokument = doc;
  return doc;
}

/**
 * Die Umgebung setzen, die die Module der Verwaltung beim Laden erwarten.
 *
 * MUSS laufen, BEVOR eines dieser Module importiert wird — deshalb in den
 * Tests `await import(...)` statt einer Import-Zeile oben.
 */
export function weltAufbauen() {
  const doc = baueDokument();
  globalThis.document = doc;
  globalThis.window = {
    location: { href: "http://localhost/", hash: "", pathname: "/", search: "" },
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({}),
    scrollTo() {},
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.sessionStorage = globalThis.localStorage;
  /* `navigator` hat in Node nur einen Getter — deshalb nicht zuweisen. */
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "node", language: "de" },
    configurable: true,
  });
  globalThis.getComputedStyle = () => ({});
  globalThis.matchMedia = globalThis.window.matchMedia;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  return doc;
}
