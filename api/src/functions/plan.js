// Family trip planner API. One JSON document in Blob Storage holds the whole plan.
// Writes use the blob ETag so two people editing at once never clobber each other.

const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = process.env.PLAN_CONTAINER || "plan";
const BLOB = process.env.PLAN_BLOB || "state.json";
const COLLECTIONS = ["items", "comments", "people", "packing"];
const LIMITS = { items: 400, comments: 1000, people: 60, packing: 300 };
const MAXLEN = { title: 120, time: 30, note: 200, text: 600, name: 40, when: 60, emoji: 8 };

function emptyState() {
  return { version: 0, items: {}, comments: {}, people: {}, packing: {}, meals: {} };
}

function blobClient() {
  const conn = process.env.STORAGE_CONNECTION || process.env.AzureWebJobsStorage;
  if (!conn) throw new Error("STORAGE_CONNECTION app setting is missing");
  const svc = BlobServiceClient.fromConnectionString(conn);
  return svc.getContainerClient(CONTAINER).getBlockBlobClient(BLOB);
}

async function readState(client) {
  try {
    const dl = await client.download();
    const text = await streamToString(dl.readableStreamBody);
    const state = Object.assign(emptyState(), JSON.parse(text || "{}"));
    return { state, etag: dl.etag };
  } catch (e) {
    if (e.statusCode === 404) {
      await client.getContainerClient().createIfNotExists();
      return { state: emptyState(), etag: null };
    }
    throw e;
  }
}

async function writeState(client, state, etag) {
  const body = JSON.stringify(state);
  const conditions = etag ? { ifMatch: etag } : { ifNoneMatch: "*" };
  await client.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json" },
    conditions,
  });
}

function streamToString(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    readable.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    readable.on("error", reject);
  });
}

function clean(obj, allowed) {
  const out = {};
  for (const k of allowed) {
    if (!(k in obj)) continue;
    let v = obj[k];
    if (typeof v === "string") { v = v.trim(); if (MAXLEN[k]) v = v.slice(0, MAXLEN[k]); }
    out[k] = v;
  }
  return out;
}

const FIELDS = {
  items: ["title", "day", "order", "time", "note", "emoji", "in", "by"],
  comments: ["day", "text", "name"],
  people: ["name", "when"],
  packing: ["text", "done", "by"],
};

function validate(collection, data) {
  const d = clean(data || {}, FIELDS[collection]);
  if (collection === "items") {
    if ("in" in d) d.in = Array.isArray(d.in) ? d.in.map((s) => String(s).trim().slice(0, 40)).filter(Boolean).slice(0, 40) : [];
    if ("order" in d) d.order = Number(d.order) || 0;
    if ("day" in d && !/^(\d{4}-\d{2}-\d{2})?$/.test(d.day)) throw badRequest("bad day");
  }
  if (collection === "packing" && "done" in d) d.done = !!d.done;
  return d;
}

function badRequest(msg) { const e = new Error(msg); e.status = 400; return e; }
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function applyMutation(state, m) {
  const { op, collection, id, data } = m;
  if (op === "meal") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.day)) throw badRequest("bad day");
    const cur = Object.assign({}, state.meals[m.day] || {});
    for (const k of ["breakfast", "lunch", "dinner"]) if (k in (data || {})) cur[k] = String(data[k] || "").trim().slice(0, 60);
    state.meals[m.day] = cur;
    return { ok: true };
  }
  if (!COLLECTIONS.includes(collection)) throw badRequest("unknown collection");
  const col = state[collection];
  if (op === "add") {
    if (Object.keys(col).length >= LIMITS[collection]) throw badRequest("full");
    const doc = validate(collection, data);
    if (collection === "items" && !doc.title) throw badRequest("title required");
    if (collection === "comments" && !doc.text) throw badRequest("text required");
    if (collection === "people" && !doc.name) throw badRequest("name required");
    if (collection === "packing" && !doc.text) throw badRequest("text required");
    const nid = newId();
    col[nid] = Object.assign({ at: new Date().toISOString() }, doc, { id: nid });
    return { ok: true, id: nid };
  }
  if (op === "update") {
    if (!id || !col[id]) throw badRequest("not found");
    Object.assign(col[id], validate(collection, data));
    return { ok: true };
  }
  if (op === "delete") {
    if (id) delete col[id];
    return { ok: true };
  }
  throw badRequest("unknown op");
}

const json = (status, body, extra) => ({ status, jsonBody: body, headers: Object.assign({ "Cache-Control": "no-store" }, extra || {}) });

app.http("getPlan", {
  methods: ["GET"],
  route: "plan",
  authLevel: "anonymous",
  handler: async (req) => {
    const client = blobClient();
    const { state } = await readState(client);
    const since = Number(req.query.get("since") || -1);
    if (since === state.version) return { status: 304, headers: { "Cache-Control": "no-store" } };
    return json(200, state);
  },
});

app.http("mutatePlan", {
  methods: ["POST"],
  route: "plan/mutate",
  authLevel: "anonymous",
  handler: async (req, ctx) => {
    let body;
    try { body = await req.json(); } catch (e) { return json(400, { error: "bad json" }); }
    const muts = Array.isArray(body) ? body : [body];
    if (!muts.length || muts.length > 50) return json(400, { error: "1 to 50 mutations" });
    const client = blobClient();
    for (let attempt = 0; attempt < 6; attempt++) {
      const { state, etag } = await readState(client);
      const results = [];
      try { for (const m of muts) results.push(applyMutation(state, m)); }
      catch (e) { return json(e.status || 500, { error: e.message }); }
      state.version = (state.version || 0) + 1;
      state.updatedAt = new Date().toISOString();
      try {
        await writeState(client, state, etag);
        return json(200, { results, state });
      } catch (e) {
        if (e.statusCode === 412 || e.statusCode === 409) { await new Promise((r) => setTimeout(r, 40 + Math.random() * 120)); continue; }
        ctx.error(e);
        return json(500, { error: "storage write failed" });
      }
    }
    return json(503, { error: "busy, try again" });
  },
});
