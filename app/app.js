(function () {
  const API = "/api/plan";
  const DAYS = [
    { key: "2026-10-25", label: "Vasárnap", date: "okt. 25." },
    { key: "2026-10-26", label: "Hétfő", date: "okt. 26." },
    { key: "2026-10-27", label: "Kedd", date: "okt. 27." },
    { key: "2026-10-28", label: "Szerda", date: "okt. 28." },
    { key: "2026-10-29", label: "Csütörtök", date: "okt. 29." },
    { key: "2026-10-30", label: "Péntek", date: "okt. 30." },
    { key: "2026-10-31", label: "Szombat", date: "okt. 31.", tag: "Halloween 🎃" },
    { key: "2026-11-01", label: "Vasárnap", date: "nov. 1." },
    { key: "2026-11-02", label: "Hétfő", date: "nov. 2.", tag: "Indulás haza" },
  ];
  const MEALS = [["breakfast", "Reggeli"], ["lunch", "Ebéd"], ["dinner", "Vacsora"]];
  const EMOJIS = ["📍","🏖️","🌊","🐬","🎢","🧱","🥾","🌮","🍦","🚤","🎃","🦁","🛶","⛵","🍕","☕","🎡","🌅","🛍️","🏛️"];
  const AUTO = [["seaworld","🐬"],["legoland","🧱"],["beach","🏖️"],["strand","🏖️"],["canyon","🥾"],["hike","🥾"],["túra","🥾"],["taco","🌮"],["coronado","⛵"],["seaport","🛍️"],["zoo","🦁"],["állatkert","🦁"],["balboa","🏛️"],["surf","🏄"],["kayak","🛶"],["kajak","🛶"],["sunset","🌅"],["naplemente","🌅"],["pizza","🍕"],["halloween","🎃"],["ice cream","🍦"],["fagyi","🍦"],["coffee","☕"],["kávé","☕"],["fair","🎡"],["boat","🚤"],["hajó","🚤"],["la jolla","🌊"]];
  const COLORS = ["#FF6B4A","#0E7FA6","#2A9D8F","#E05780","#5B7CDB","#F28C28","#C95E2C"];
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  let state = { version: -1, items: {}, comments: {}, people: {}, packing: {}, meals: {} };
  let items = [], comments = [], people = [], packing = [], meals = {};
  let dragging = false, pendingRender = false, editing = null, online = true, pollTimer = null;
  const sortables = []; const openThreads = new Set(); const seenItems = new Set(); let firstItemsRender = true;

  const nameInput = $("#myname");
  try { nameInput.value = localStorage.getItem("szabados-name") || ""; } catch (e) {}
  nameInput.addEventListener("input", () => { try { localStorage.setItem("szabados-name", nameInput.value); } catch (e) {} renderItems(); });
  const myName = () => nameInput.value.trim();
  const needName = () => { if (myName()) return false; toast("Előbb írd be a neved fent."); nameInput.focus(); return true; };

  function toast(msg) { const t = el("div", "toast", msg); document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
  function setStatus(text, live) { $("#statustext").textContent = text; $("#status").classList.toggle("live", !!live); }
  function colorFor(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
  function autoEmoji(title) { const t = title.toLowerCase(); for (const [k, e] of AUTO) if (t.includes(k)) return e; return "📍"; }

  // ---- API ----
  function adopt(s) {
    if (!s || typeof s.version !== "number") return;
    if (s.version < state.version) return;
    state = s;
    const toArr = (m) => Object.values(m || {});
    items = toArr(s.items); comments = toArr(s.comments); people = toArr(s.people); packing = toArr(s.packing); meals = s.meals || {};
    renderItems(); renderComments(); renderPeople(); renderPacking(); renderMeals();
  }
  async function refresh() {
    try {
      const r = await fetch(API + "?since=" + state.version, { cache: "no-store" });
      if (r.status === 304) { markOnline(true); return; }
      if (!r.ok) throw new Error(r.status);
      adopt(await r.json()); markOnline(true);
    } catch (e) { markOnline(false); }
  }
  async function mutate(m) {
    try {
      const r = await fetch(API + "/mutate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { toast(body.error === "full" ? "A tábla megtelt. Törölj valamit előbb." : "Nem sikerült menteni. Próbáld újra."); return null; }
      adopt(body.state); markOnline(true); return body;
    } catch (e) { markOnline(false); toast("Nincs kapcsolat. Próbáld újra."); return null; }
  }
  function markOnline(ok) {
    if (ok === online && state.version >= 0) return;
    online = ok;
    setStatus(ok ? "Élő · mindenki látja a változásokat" : "Nincs kapcsolat, újrapróbálom…", ok);
  }
  function schedulePoll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden && !dragging && !editing) refresh(); }, 4000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  // ---- Build day cards ----
  const daysEl = $("#days");
  DAYS.forEach(d => {
    const card = el("section", "day"); card.dataset.day = d.key;
    const head = el("div", "day-head");
    head.appendChild(el("h2", null, d.label));
    const date = el("span", "date"); date.appendChild(el("b", null, d.date)); if (d.tag) date.appendChild(document.createTextNode(" · " + d.tag)); head.appendChild(date);
    card.appendChild(head);
    const body = el("div", "day-body");
    const hc = el("div", "headcount"); hc.id = "hc-" + d.key; body.appendChild(hc);
    const list = el("div", "list"); list.id = "list-" + d.key; list.dataset.day = d.key; body.appendChild(list);
    const add = el("div", "add");
    const inp = el("input"); inp.type = "text"; inp.id = "add-" + d.key; inp.placeholder = "Program hozzáadása"; inp.maxLength = 120;
    const btn = el("button", "btn", "Hozzáad"); btn.dataset.add = d.key;
    add.appendChild(inp); add.appendChild(btn); body.appendChild(add);
    const mealsEl = el("div", "meals");
    MEALS.forEach(([m, lbl]) => {
      const box = el("div", "meal"); const lab = el("label", null, lbl); lab.htmlFor = "meal-" + d.key + "-" + m; box.appendChild(lab);
      const mi = el("input"); mi.type = "text"; mi.id = "meal-" + d.key + "-" + m; mi.placeholder = "?"; mi.maxLength = 60; mi.dataset.meal = m; mi.dataset.day = d.key;
      box.appendChild(mi); mealsEl.appendChild(box);
    });
    body.appendChild(mealsEl);
    const cm = el("div", "comments");
    const tog = el("button", "btn quiet toggle", "Jegyzetek"); tog.dataset.toggle = d.key;
    const thread = el("div"); thread.id = "cmts-" + d.key; thread.hidden = true;
    const form = el("div", "cform"); form.hidden = true; form.id = "cform-" + d.key;
    const ta = el("textarea"); ta.id = "ct-" + d.key; ta.placeholder = "Jegyzet – " + d.label; ta.maxLength = 600;
    const post = el("button", "btn", "Küldés"); post.dataset.comment = d.key;
    form.appendChild(ta); form.appendChild(post);
    cm.appendChild(tog); cm.appendChild(thread); cm.appendChild(form);
    body.appendChild(cm); card.appendChild(body); daysEl.appendChild(card);
  });

  document.addEventListener("change", async (e) => {
    const t = e.target; if (!t.dataset) return;
    if (t.dataset.meal) { const data = {}; data[t.dataset.meal] = t.value.trim(); await mutate({ op: "meal", day: t.dataset.day, data }); return; }
    if (t.dataset.pack) { await mutate({ op: "update", collection: "packing", id: t.dataset.pack, data: { done: t.checked } }); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input[type=text]")) {
      if (e.target.dataset.meal) { e.target.blur(); return; }
      const btn = e.target.parentElement && e.target.parentElement.querySelector("button"); if (btn) btn.click();
    }
  });

  function renderMeals() {
    DAYS.forEach(d => { const m = meals[d.key] || {}; MEALS.forEach(([k]) => { const inp = $("#meal-" + d.key + "-" + k); if (inp && document.activeElement !== inp) inp.value = m[k] || ""; }); });
  }

  function renderItems() {
    if (dragging) { pendingRender = true; return; }
    const me = myName();
    const byDay = {};
    items.forEach(it => { (byDay[it.day || ""] = byDay[it.day || ""] || []).push(it); });
    Object.values(byDay).forEach(a => a.sort((x, y) => (x.order ?? 0) - (y.order ?? 0)));
    ["", ...DAYS.map(d => d.key)].forEach(key => {
      const list = $("#list-" + (key || "ideas")); list.textContent = "";
      const arr = byDay[key] || [];
      if (!arr.length) list.appendChild(el("div", "empty", key ? "Szabad nap. Húzz ide valamit." : "A polc üres. Adj hozzá egy ötletet lent."));
      arr.forEach(it => {
        const c = el("div", "chip" + (!firstItemsRender && !seenItems.has(it.id) ? " pop" : "")); c.dataset.id = it.id; seenItems.add(it.id);
        c.appendChild(el("span", "grip", "⋮⋮"));
        c.appendChild(el("span", "em", it.emoji || autoEmoji(it.title || "")));
        const txt = el("div", "txt"); txt.dataset.edit = it.id;
        const t = el("div", "t"); if (it.time) t.appendChild(el("span", "time", it.time)); t.appendChild(document.createTextNode(it.title || "")); txt.appendChild(t);
        if (it.note) txt.appendChild(el("div", "n", it.note));
        c.appendChild(txt);
        const ins = Array.isArray(it.in) ? it.in : [];
        const mine = !!me && ins.includes(me);
        const inBtn = el("button", "in" + (mine ? " me" : ""), mine ? "Benne vagyok ✓" : (ins.length ? "Benne vagyok · " + ins.length : "Benne vagyok")); inBtn.dataset.in = it.id; c.appendChild(inBtn);
        if (ins.length) c.appendChild(el("div", "names", ins.join(", ")));
        if (editing === it.id) c.appendChild(buildEditor(it));
        list.appendChild(c);
      });
      if (key) {
        const names = new Set(); arr.forEach(it => (Array.isArray(it.in) ? it.in : []).forEach(n => names.add(n)));
        $("#hc-" + key).textContent = arr.length ? (arr.length + " program" + (names.size ? " · " + names.size + " fő" : "")) : "";
      }
    });
    if (items.length) firstItemsRender = false;
  }

  function buildEditor(it) {
    const ed = el("div", "editor");
    const row = el("div", "row");
    const title = el("input"); title.type = "text"; title.value = it.title || ""; title.placeholder = "Program"; title.maxLength = 120; title.id = "ed-title";
    const time = el("input"); time.type = "text"; time.value = it.time || ""; time.placeholder = "Időpont (10:00, ebéd után…)"; time.maxLength = 30; time.id = "ed-time"; time.style.flex = "0 1 190px";
    row.appendChild(title); row.appendChild(time); ed.appendChild(row);
    const note = el("input"); note.type = "text"; note.value = it.note || ""; note.placeholder = "Részletek: cím, jegyek, ki vezet…"; note.maxLength = 200; note.id = "ed-note"; ed.appendChild(note);
    const em = el("div", "emojis"); let chosen = it.emoji || autoEmoji(it.title || "");
    EMOJIS.forEach(e => { const b = el("button", e === chosen ? "on" : "", e); b.type = "button"; b.addEventListener("click", () => { chosen = e; em.querySelectorAll("button").forEach(x => x.classList.toggle("on", x.textContent === e)); }); em.appendChild(b); });
    ed.appendChild(em);
    const act = el("div", "actions");
    const del = el("button", "btn ghost", "Törlés"); del.type = "button";
    del.addEventListener("click", async () => { if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Biztos törlöd?"; return; } editing = null; await mutate({ op: "delete", collection: "items", id: it.id }); });
    const right = el("div"); right.style.display = "flex"; right.style.gap = "6px";
    const cancel = el("button", "btn ghost", "Mégse"); cancel.type = "button"; cancel.addEventListener("click", () => { editing = null; renderItems(); });
    const save = el("button", "btn", "Mentés"); save.type = "button";
    save.addEventListener("click", async () => {
      const data = { title: title.value.trim() || it.title, time: time.value.trim(), note: note.value.trim(), emoji: chosen };
      save.disabled = true; editing = null;
      const ok = await mutate({ op: "update", collection: "items", id: it.id, data });
      if (!ok) { editing = it.id; renderItems(); }
    });
    right.appendChild(cancel); right.appendChild(save); act.appendChild(del); act.appendChild(right); ed.appendChild(act);
    setTimeout(() => title.focus(), 0);
    return ed;
  }

  function fmtTime(iso) { const d = new Date(iso); if (isNaN(d)) return ""; return d.toLocaleString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  function renderComments() {
    const groups = {};
    comments.forEach(c => { (groups[c.day || "general"] = groups[c.day || "general"] || []).push(c); });
    Object.values(groups).forEach(a => a.sort((x, y) => String(x.at).localeCompare(String(y.at))));
    const draw = (container, arr) => {
      container.textContent = "";
      if (!arr.length) { container.appendChild(el("div", "empty", "Még nincs jegyzet")); return; }
      arr.forEach(c => { const row = el("div", "cmt"); const meta = el("div", "meta"); meta.appendChild(el("b", null, c.name || "Valaki")); meta.appendChild(el("span", null, fmtTime(c.at))); row.appendChild(meta); row.appendChild(el("div", null, c.text)); container.appendChild(row); });
    };
    draw($("#general-comments"), groups.general || []);
    DAYS.forEach(d => { const n = (groups[d.key] || []).length; $('[data-toggle="' + d.key + '"]').textContent = n ? "Jegyzetek (" + n + ")" : "Jegyzetek"; draw($("#cmts-" + d.key), groups[d.key] || []); });
  }
  function renderPeople() {
    const r = $("#roster"); r.textContent = "";
    if (!people.length) { r.appendChild(el("div", "empty", "Még senki sincs a listán. Add hozzá magad.")); return; }
    people.slice().sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach(p => {
      const chip = el("div", "person"); const ava = el("span", "ava", (p.name || "?").trim().slice(0, 1).toUpperCase()); ava.style.background = colorFor(p.name || "?"); chip.appendChild(ava);
      chip.appendChild(document.createTextNode(p.name || "Valaki")); if (p.when) chip.appendChild(el("small", null, " · " + p.when));
      const d = el("button", "del", "×"); d.title = "Eltávolítás"; d.dataset.delperson = p.id; chip.appendChild(d); r.appendChild(chip);
    });
  }
  function renderPacking() {
    const r = $("#pack"); r.textContent = "";
    if (!packing.length) { r.appendChild(el("div", "empty", "Még üres a lista.")); return; }
    packing.slice().sort((a, b) => (a.done === b.done ? String(a.at).localeCompare(String(b.at)) : (a.done ? 1 : -1))).forEach(p => {
      const lab = el("label"); const cb = el("input"); cb.type = "checkbox"; cb.checked = !!p.done; cb.dataset.pack = p.id; cb.id = "pk-" + p.id; lab.htmlFor = cb.id;
      lab.appendChild(cb); lab.appendChild(el("span", "t" + (p.done ? " done" : ""), p.text)); const d = el("button", "del", "×"); d.type = "button"; d.title = "Eltávolítás"; d.dataset.delpack = p.id; lab.appendChild(d); r.appendChild(lab);
    });
  }

  document.addEventListener("click", async (e) => {
    const txt = e.target.closest(".txt[data-edit]");
    if (txt) { editing = editing === txt.dataset.edit ? null : txt.dataset.edit; renderItems(); return; }
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.toggle != null) { const k = t.dataset.toggle; const open = !openThreads.has(k); open ? openThreads.add(k) : openThreads.delete(k); $("#cmts-" + k).hidden = !open; $("#cform-" + k).hidden = !open; return; }
    if (t.dataset.add != null) {
      const key = t.dataset.add; const inp = $("#add-" + (key || "ideas")); const title = inp.value.trim(); if (!title) return;
      const order = items.filter(i => (i.day || "") === key).length; t.disabled = true;
      const ok = await mutate({ op: "add", collection: "items", data: { title, day: key, order, emoji: autoEmoji(title), time: "", note: "", in: [], by: myName() || "Valaki" } });
      if (ok) inp.value = ""; t.disabled = false; return;
    }
    if (t.dataset.in) {
      if (needName()) return; const it = items.find(i => i.id === t.dataset.in); if (!it) return;
      const me = myName(); const ins = Array.isArray(it.in) ? it.in.slice() : []; const idx = ins.indexOf(me); idx >= 0 ? ins.splice(idx, 1) : ins.push(me);
      await mutate({ op: "update", collection: "items", id: it.id, data: { in: ins } }); return;
    }
    if (t.dataset.comment != null) {
      if (needName()) return; const key = t.dataset.comment; const ta = key === "general" ? $("#gc-text") : $("#ct-" + key); const text = ta.value.trim(); if (!text) return;
      t.disabled = true;
      const ok = await mutate({ op: "add", collection: "comments", data: { day: key === "general" ? "" : key, text, name: myName() } });
      if (ok) ta.value = ""; t.disabled = false; return;
    }
    if (t.dataset.addperson) {
      const n = $("#p-name").value.trim(); const w = $("#p-when").value.trim(); if (!n) return; t.disabled = true;
      const ok = await mutate({ op: "add", collection: "people", data: { name: n, when: w } });
      if (ok) { $("#p-name").value = ""; $("#p-when").value = ""; if (!myName()) { nameInput.value = n; try { localStorage.setItem("szabados-name", n); } catch (e) {} } }
      t.disabled = false; return;
    }
    if (t.dataset.delperson) { await mutate({ op: "delete", collection: "people", id: t.dataset.delperson }); return; }
    if (t.dataset.addpack) {
      const v = $("#add-pack").value.trim(); if (!v) return; t.disabled = true;
      const ok = await mutate({ op: "add", collection: "packing", data: { text: v, done: false, by: myName() || "Valaki" } });
      if (ok) $("#add-pack").value = ""; t.disabled = false; return;
    }
    if (t.dataset.delpack) { e.preventDefault(); await mutate({ op: "delete", collection: "packing", id: t.dataset.delpack }); return; }
  });

  function setupSortables() {
    document.querySelectorAll(".list").forEach(list => {
      const s = Sortable.create(list, {
        group: "plan", handle: ".grip", animation: 140, draggable: ".chip", ghostClass: "sortable-ghost", chosenClass: "sortable-chosen", fallbackTolerance: 3,
        onStart() { dragging = true; editing = null; },
        onMove(evt) { document.querySelectorAll(".list.drop-over").forEach(l => { if (l !== evt.to) l.classList.remove("drop-over"); }); evt.to.classList.add("drop-over"); },
        onEnd: async (evt) => {
          dragging = false; document.querySelectorAll(".list.drop-over").forEach(l => l.classList.remove("drop-over"));
          const lists = new Set([evt.from, evt.to]); const writes = [];
          lists.forEach(l => { const day = l.dataset.day; [...l.querySelectorAll(".chip")].forEach((chip, idx) => { const it = items.find(i => i.id === chip.dataset.id); if (!it) return; if ((it.day || "") !== day || (it.order ?? 0) !== idx) { it.day = day; it.order = idx; writes.push({ op: "update", collection: "items", id: it.id, data: { day, order: idx } }); } }); });
          if (writes.length) await mutate(writes);
          if (pendingRender) { pendingRender = false; renderItems(); }
        },
      });
      sortables.push(s);
    });
  }

  async function start() {
    renderItems(); renderComments(); renderPeople(); renderPacking(); setupSortables();
    await refresh();
    if (state.version < 0) setStatus("Nem érem el a szervert. Töltsd újra kicsit később.", false);
    schedulePoll();
    if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(() => {}); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
