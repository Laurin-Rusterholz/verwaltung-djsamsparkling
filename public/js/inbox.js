/* ==========================================================================
   Booking-Anfragen — kommen vom Formular der Website in die RTDB
   ========================================================================== */

import { el, formatDate, relativeTime, toast, confirmDialog, getPath, setPath } from "./util.js";
import { S, updateInquiry, deleteInquiry, markDirty, saveContent } from "./store.js";

const STATUS = {
  new: "neu",
  open: "in Abklärung",
  confirmed: "bestätigt",
  declined: "abgelehnt",
};

/* ------------------------------------------------- bestätigt → Kalender

   Wird eine Anfrage bestätigt, wandert sie als Termin mit dem Status
   „gebucht“ in die Show-Liste. Der Website-Build zeichnet solche Tage im
   Kalender ein (blau, Beschriftung „Gebucht“) — ohne Ticket-Knopf, denn
   gebucht heisst noch nicht, dass es Tickets gibt.
*/

function showItems() {
  let items = getPath(S.content, "sections.shows.items");
  if (!Array.isArray(items)) {
    items = [];
    setPath(S.content, "sections.shows.items", items);
  }
  return items;
}

/** Steht diese Anfrage schon im Kalender? */
export const inCalendar = (q) => showItems().some((s) => s.inquiryId === q.id);

/** Anfrage als gebuchten Termin eintragen. */
export async function addToCalendar(q) {
  if (!q.date) {
    const err = new Error("Diese Anfrage hat kein Datum — Termin bitte unter Shows von Hand eintragen.");
    err.noDate = true;
    throw err;
  }
  if (inCalendar(q)) return false;

  const items = showItems();
  items.push({
    date: q.date,
    name: q.event || q.name || "Booking",
    venue: q.venue || "",
    city: q.city || "",
    country: "CH",
    status: "booked",
    ticketUrl: "",
    ticketLabel: "",
    inquiryId: q.id,
  });
  items.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  markDirty();
  await saveContent();
  await updateInquiry(q.id, { inCalendar: true });
  return true;
}

/** Termin wieder aus dem Kalender nehmen (z. B. nach einer Absage). */
export async function removeFromCalendar(q) {
  const items = showItems();
  const before = items.length;
  for (let i = items.length - 1; i >= 0; i--) if (items[i].inquiryId === q.id) items.splice(i, 1);
  if (items.length === before) return false;
  markDirty();
  await saveContent();
  await updateInquiry(q.id, { inCalendar: false });
  return true;
}

export function inquiryList() {
  return Object.entries(S.inquiries || {})
    .map(([id, q]) => ({ id, status: "new", ...q }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export const openCount = () => inquiryList().filter((q) => (q.status || "new") === "new").length;

function mailtoLink(q) {
  const subject = `Re: Booking-Anfrage${q.event ? " — " + q.event : ""}`;
  const body = [
    `Hoi ${String(q.name || "").split(" ")[0] || ""}`,
    "",
    "Danke für die Anfrage!",
    "",
    "— Sam Sparkling",
  ].join("\n");
  return `mailto:${encodeURIComponent(q.email || "")}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

/** Knopf „in den Kalender“ / „aus dem Kalender“ — zeigt zugleich den Stand. */
function calendarBtn(q, refresh) {
  const listed = inCalendar(q);
  if (!q.date && !listed) return null;
  return el(
    "button",
    {
      class: "btn ghost sm" + (listed ? " on" : ""),
      title: listed
        ? "Steht als gebuchter Termin auf der Website"
        : "Als gebuchten Termin in den Website-Kalender eintragen",
      onclick: async (e) => {
        e.target.disabled = true;
        try {
          if (listed) {
            await removeFromCalendar(q);
            toast("Termin aus dem Kalender entfernt");
          } else {
            await addToCalendar(q);
            toast("Als gebuchter Termin im Kalender eingetragen");
          }
          refresh && refresh();
        } catch (err) {
          toast(err.noDate ? err.message : "Nicht möglich: " + err.message, "err");
        } finally {
          e.target.disabled = false;
        }
      },
    },
    listed ? "✓ im Kalender" : "in den Kalender"
  );
}

function card(q, refresh) {
  const status = q.status || "new";
  const rows = [
    ["Event", q.event],
    ["Ort", q.city],
    ["Datum", q.date ? formatDate(q.date) : ""],
    ["Set-Länge", q.setLength],
    ["Von", q.source],
  ].filter(([, v]) => v);

  const select = el(
    "select",
    {
      onchange: async (e) => {
        const value = e.target.value;
        try {
          await updateInquiry(q.id, { status: value, statusAt: new Date().toISOString() });
          toast("Status: " + STATUS[value]);
          // Bestätigt heisst gebucht: Termin automatisch in den Kalender.
          if (value === "confirmed" && !inCalendar(q)) {
            try {
              await addToCalendar(q);
              toast("Als gebuchter Termin im Kalender eingetragen — beim nächsten Publizieren ist er auf der Website.");
            } catch (err2) {
              toast(err2.noDate ? err2.message : "Termin nicht eingetragen: " + err2.message, "err");
            }
          }
          refresh && refresh();
        } catch (err) {
          toast("Status nicht gespeichert: " + err.message, "err");
        }
      },
    },
    Object.entries(STATUS).map(([val, text]) => {
      const o = el("option", { value: val }, text);
      if (val === status) o.selected = true;
      return o;
    })
  );

  return el("article", { class: "inq status-" + status }, [
    el("div", { class: "inq-head" }, [
      el("div", {}, [
        el("strong", { class: "inq-name" }, q.name || "(ohne Name)"),
        el("a", { class: "inq-mail", href: `mailto:${q.email}` }, q.email || ""),
      ]),
      el("div", { class: "inq-when" }, [
        el("span", { class: "badge b-" + status }, STATUS[status] || status),
        el("span", { class: "muted", title: q.createdAt }, relativeTime(q.createdAt)),
      ]),
    ]),
    rows.length
      ? el(
          "dl",
          { class: "inq-meta" },
          rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, String(v))])
        )
      : null,
    q.message ? el("p", { class: "inq-msg" }, q.message) : null,
    el("div", { class: "inq-foot" }, [
      el("a", { class: "btn ghost sm", href: mailtoLink(q) }, "Antworten"),
      select,
      calendarBtn(q, refresh),
      el(
        "button",
        {
          class: "btn danger sm",
          onclick: async () => {
            if (!(await confirmDialog("Anfrage löschen?", q.name || "", "Löschen"))) return;
            await deleteInquiry(q.id);
            toast("Anfrage gelöscht");
            refresh && refresh();
          },
        },
        "Löschen"
      ),
    ]),
  ]);
}

export function renderInbox() {
  let filter = "all";
  const listHost = el("div", { class: "inq-list" });
  const countLine = el("p", { class: "muted" });

  const render = () => {
    const all = inquiryList();
    const items = filter === "all" ? all : all.filter((q) => (q.status || "new") === filter);
    listHost.innerHTML = "";
    if (!items.length) {
      listHost.appendChild(
        el(
          "p",
          { class: "empty" },
          all.length
            ? "Keine Anfrage in diesem Filter."
            : "Noch keine Anfragen. Sie landen hier, sobald jemand das Formular auf der Website abschickt."
        )
      );
    }
    items.forEach((q) => listHost.appendChild(card(q, render)));
    const open = all.filter((q) => (q.status || "new") === "new").length;
    countLine.textContent = `${all.length} Anfrage${all.length === 1 ? "" : "n"}${
      open ? ` · ${open} neu` : ""
    }`;
  };

  const tabs = el(
    "div",
    { class: "tabs" },
    [["all", "alle"], ...Object.entries(STATUS)].map(([val, text]) => {
      const b = el(
        "button",
        {
          class: "tab" + (val === filter ? " on" : ""),
          onclick: () => {
            filter = val;
            Array.from(tabs.children).forEach((c) => c.classList.remove("on"));
            b.classList.add("on");
            render();
          },
        },
        text
      );
      return b;
    })
  );

  render();

  const v = el("div", { class: "view" }, [
    el("div", { class: "view-head" }, [el("div", {}, [el("h2", {}, "Anfragen"), countLine])]),
    tabs,
    listHost,
  ]);
  v._refresh = render;
  return v;
}
