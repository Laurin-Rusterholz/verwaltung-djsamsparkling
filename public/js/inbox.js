/* ==========================================================================
   Booking-Anfragen — kommen vom Formular der Website in die RTDB
   ========================================================================== */

import { el, formatDate, relativeTime, toast, confirmDialog } from "./util.js";
import { S, updateInquiry, deleteInquiry } from "./store.js";

const STATUS = {
  new: "neu",
  open: "in Abklärung",
  confirmed: "bestätigt",
  declined: "abgelehnt",
};

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
    "— Sam Sparking",
  ].join("\n");
  return `mailto:${encodeURIComponent(q.email || "")}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
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
