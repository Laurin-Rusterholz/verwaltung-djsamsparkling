import { DEFAULT_SITE_URL } from "./config.js";
import { S } from "./store.js";

const EDITOR_SECTIONS = new Set([
  "design", "seo", "about", "shows",
  "references", "gallery", "booking", "follow", "contact"
]);

const SECTION_HASH = {
  design: "top",
  seo: "top",
  about: "about",
  shows: "shows",
  references: "references",
  gallery: "gallery",
  booking: "booking",
  follow: "follow",
  contact: "contact",
};

const getEditorId = () => location.hash.replace(/^#/, "") || "dashboard";
const baseUrl = () => String(S.config?.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");

function controlValue(control) {
  if (!control) return "";
  if (control.type === "checkbox") return control.checked ? "Aktiviert" : "Deaktiviert";
  const value = String(control.value || "").trim();
  return value || "(leer)";
}

function fieldLabel(control) {
  const field = control?.closest?.(".field");
  return (
    field?.querySelector?.(".field-label")?.textContent?.trim() ||
    control?.getAttribute?.("aria-label") ||
    control?.name ||
    "Textfeld"
  );
}

function buildPanel(section) {
  const aside = document.createElement("aside");
  aside.className = "editor-live-preview";

  const head = document.createElement("div");
  head.className = "editor-live-preview-head";
  head.innerHTML = `
    <div>
      <span class="editor-live-kicker">Live-Vorschau</span>
      <strong>Website rechts mitverfolgen</strong>
    </div>
    <a class="editor-live-open" target="_blank" rel="noopener">Öffnen ↗</a>
  `;

  const active = document.createElement("div");
  active.className = "editor-active-field";
  active.innerHTML = `
    <span class="editor-active-label">Noch kein Feld gewählt</span>
    <p class="editor-active-value">Tippe links in ein Textfeld. Hier siehst du sofort, welchen Inhalt du gerade bearbeitest.</p>
  `;

  const frameWrap = document.createElement("div");
  frameWrap.className = "editor-preview-device";
  const frame = document.createElement("iframe");
  frame.className = "editor-preview-frame";
  frame.title = "Website-Vorschau zum aktuell bearbeiteten Abschnitt";
  frame.loading = "lazy";
  frameWrap.appendChild(frame);

  const note = document.createElement("p");
  note.className = "editor-preview-note";
  note.textContent = "Die Website zeigt den zuletzt publizierten Stand. Der aktuell bearbeitete Text wird direkt darüber eingeblendet.";

  aside.append(head, active, frameWrap, note);

  const target = `${baseUrl()}/#${SECTION_HASH[section] || "top"}`;
  frame.src = target;
  head.querySelector("a").href = target;

  let timer = 0;
  const update = (control) => {
    if (!control?.matches?.("input, textarea, select")) return;
    active.classList.add("is-active");
    active.querySelector(".editor-active-label").textContent = fieldLabel(control);
    active.querySelector(".editor-active-value").textContent = controlValue(control);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const hash = SECTION_HASH[section] || "top";
      try {
        frame.contentWindow?.postMessage({ ns: "samsparking-editor-preview", type: "focus", section: hash }, "*");
      } catch (_) {}
    }, 80);
  };

  return { aside, update };
}

function enhanceCurrentView() {
  const section = getEditorId();
  const main = document.querySelector("#main");
  const view = main?.querySelector?.(":scope > .view");
  if (!view || !EDITOR_SECTIONS.has(section) || view.dataset.livePreview === "1") return;

  view.dataset.livePreview = "1";
  view.classList.add("editor-with-preview");
  const { aside, update } = buildPanel(section);
  view.appendChild(aside);

  view.addEventListener("focusin", (event) => update(event.target));
  view.addEventListener("input", (event) => update(event.target));
  view.addEventListener("change", (event) => update(event.target));
}

const observer = new MutationObserver(() => requestAnimationFrame(enhanceCurrentView));
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("hashchange", () => requestAnimationFrame(enhanceCurrentView));
requestAnimationFrame(enhanceCurrentView);
