// lib/smartMail/expressShim.js
// Pengganti kecil Express + multer supaya server.js & mdi.js asli Smart Mail
// Sumatera bisa dipakai APA ADANYA di route handler Next.js
// (app/api/smart-mail/[...path]/route.js). Hanya fitur yang dipakai kode asli:
// app.get/post/delete/use, req.body/query/params/headers/file,
// res.status/json/send/sendFile/setHeader, upload.single().
import fs from "fs";
import path from "path";

const MIME = { ".pdf": "application/pdf", ".html": "text/html; charset=utf-8", ".json": "application/json" };

function compile(pattern) {
  const keys = [];
  const re = new RegExp(
    "^" + pattern.replace(/\/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return "/([^/]+)"; }) + "/?$"
  );
  return { re, keys };
}

export default function express() {
  const routes = [];
  const uses = [];
  const app = {};
  ["get", "post", "delete", "put"].forEach((m) => {
    app[m] = (pattern, ...handlers) => {
      const { re, keys } = compile(pattern);
      routes.push({ method: m.toUpperCase(), pattern, re, keys, handlers });
    };
  });
  // app.use(fn) untuk parser body diabaikan; app.use('/prefix', fn) dijalankan sebagai middleware.
  app.use = (prefix, fn) => { if (typeof prefix === "string" && fn) uses.push({ prefix, fn }); };
  app.listen = () => {};

  /** Cari route yang cocok untuk method + path. */
  app.match = (method, p) => {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = p.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
    }
    return null;
  };

  /** Jalankan handler untuk Request Next.js, hasilnya Response. */
  app.handle = async (request, p) => {
    const found = app.match(request.method, p);
    if (!found) return new Response("Not found", { status: 404 });
    const url = new URL(request.url);
    const headers = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    const req = { method: request.method, path: p, query: Object.fromEntries(url.searchParams), params: found.params, headers, body: {}, file: null };

    const ct = headers["content-type"] || "";
    if (request.method !== "GET" && request.method !== "HEAD") {
      if (ct.includes("application/json")) {
        const t = await request.text();
        req.body = t ? JSON.parse(t) : {};
      } else if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
        const form = await request.formData();
        for (const [k, v] of form.entries()) {
          if (typeof v === "object" && v && typeof v.arrayBuffer === "function") {
            req.file = { fieldname: k, originalname: v.name, mimetype: v.type, size: v.size, buffer: Buffer.from(await v.arrayBuffer()) };
          } else {
            req.body[k] = v;
          }
        }
      }
    }

    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });
    const res = {
      statusCode: 200,
      headers: {},
      finished: false,
      status(code) { this.statusCode = code; return this; },
      setHeader(k, v) { this.headers[k] = v; return this; },
      json(obj) { this._end(JSON.stringify(obj), "application/json"); return this; },
      send(body) {
        if (Buffer.isBuffer(body)) this._end(body, "application/octet-stream");
        else this._end(String(body), "text/html; charset=utf-8");
        return this;
      },
      sendFile(file) {
        try {
          const buf = fs.readFileSync(file);
          this._end(buf, MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
        } catch (e) {
          this.statusCode = 404;
          this._end("Not found", "text/plain");
        }
        return this;
      },
      redirect(loc) { this.statusCode = 302; this.headers.Location = loc; this._end("", "text/plain"); return this; },
      _end(body, type) {
        if (this.finished) return;
        this.finished = true;
        const h = { "Content-Type": type, ...this.headers };
        resolveDone(new Response(body, { status: this.statusCode, headers: h }));
      },
    };

    const chain = [...uses.filter((u) => p.startsWith(u.prefix)).map((u) => u.fn), ...found.route.handlers];
    const run = async (i) => {
      if (i >= chain.length || res.finished) return;
      let nextCalled = false;
      await chain[i](req, res, () => { nextCalled = true; });
      if (nextCalled) await run(i + 1);
    };
    try {
      await run(0);
    } catch (e) {
      if (!res.finished) res.status(500).json({ success: false, error: e.message });
    }
    if (!res.finished) res.status(500).json({ success: false, error: "Tidak ada respons dari handler." });
    return done;
  };

  return app;
}

express.json = () => () => {};
express.urlencoded = () => () => {};

/** Pengganti multer: file diambil dari multipart oleh app.handle, middleware ini cukup lanjut. */
export function multer() {
  return { single: () => (req, res, next) => next() };
}
multer.memoryStorage = () => ({});
