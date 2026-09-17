// Local development server for the Sona site.
//
// Production runs on Vercel (static `public/` + serverless functions in `api/`).
// `vercel dev` needs a Vercel login, which isn't available in every dev/CI box,
// so this is a zero-dependency stand-in that mirrors the two things vercel.json
// configures: static hosting of the output directory and the `/api/*` rewrites.
//
// It is intentionally NOT used in production — Vercel serves the real thing.
//
//   node scripts/dev-server.mjs            # http://localhost:3000
//   PORT=8080 node scripts/dev-server.mjs
//
// Serverless functions degrade gracefully without Supabase/Stripe/Resend env
// vars (in-memory fallbacks, `configured:false`), so the whole app runs end to
// end locally with no secrets. Set the same env vars Vercel would to go live.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const STATIC_DIR = path.join(ROOT, vercel.outputDirectory || 'public');
const API_DIR = path.join(ROOT, 'api');
const PORT = Number(process.env.PORT) || 3000;

// Split the rewrites into the two shapes vercel.json uses: /api/* → a function
// file, and clean-URL page aliases like /app → /app.html.
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Recreate the request object Vercel hands a serverless function: a readable
// stream (so webhooks that read the raw body still work) plus the parsed
// `.query`, `.body`, and `.cookies` helpers the other handlers rely on.
function makeReq(rawReq, raw, query) {
  const shim = Readable.from(raw.length ? [raw] : []);
  shim.headers = rawReq.headers;
  shim.method = rawReq.method;
  shim.url = rawReq.url;
  shim.httpVersion = rawReq.httpVersion;
  shim.socket = rawReq.socket;
  shim.query = query;
  shim.cookies = parseCookies(rawReq.headers.cookie);

  const type = String(rawReq.headers['content-type'] || '');
  if (raw.length) {
    const text = raw.toString('utf8');
    if (type.includes('application/json')) {
      try { shim.body = JSON.parse(text); } catch { shim.body = text; }
    } else if (type.includes('application/x-www-form-urlencoded')) {
      shim.body = Object.fromEntries(new URLSearchParams(text));
    } else {
      shim.body = text;
    }
  }
  return shim;
}

// Augment the native response with the Express-ish helpers Vercel adds.
function decorateRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.headersSent && !res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (data) => {
    if (data == null) return res.end();
    if (Buffer.isBuffer(data) || typeof data === 'string') return res.end(data);
    return res.json(data);
  };
  res.redirect = (a, b) => {
    const [code, url] = typeof a === 'number' ? [a, b] : [302, a];
    res.statusCode = code;
    res.setHeader('Location', url);
    res.end();
    return res;
  };
  return res;
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function matchApiRewrite(pathname) {
  const rw = rewrites.find((r) => r.source === pathname);
  if (rw && rw.destination.startsWith('/api/')) {
    return path.join(ROOT, rw.destination.replace(/^\//, ''));
  }
  // Fall back to /api/<name> → api/<name>.js even without an explicit rewrite.
  if (pathname.startsWith('/api/')) {
    const candidate = path.join(API_DIR, pathname.slice('/api/'.length) + '.js');
    if (candidate.startsWith(API_DIR) && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveStatic(pathname) {
  // Page-level rewrites (clean URLs) such as /app → /app.html.
  const rw = rewrites.find((r) => r.source === pathname && !r.destination.startsWith('/api/'));
  if (rw) pathname = rw.destination;

  const rel = decodeURIComponent(pathname.replace(/^\/+/, ''));
  const candidates = [];
  if (rel === '' || pathname.endsWith('/')) {
    candidates.push(path.join(STATIC_DIR, rel, 'index.html'));
  } else {
    candidates.push(path.join(STATIC_DIR, rel));
    if (!path.extname(rel)) candidates.push(path.join(STATIC_DIR, rel + '.html'));
  }
  for (const file of candidates) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(STATIC_DIR)) continue; // no path traversal
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  return null;
}

const server = http.createServer(async (rawReq, res) => {
  decorateRes(res);
  const url = new URL(rawReq.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  const apiFile = matchApiRewrite(pathname);
  if (apiFile) {
    try {
      const raw = await readRaw(rawReq);
      const query = Object.fromEntries(url.searchParams);
      const mod = await import(pathToFileURL(apiFile).href);
      const handler = mod.default;
      if (typeof handler !== 'function') {
        res.status(500).json({ error: `No default export in ${path.basename(apiFile)}` });
        return;
      }
      const req = makeReq(rawReq, raw, query);
      await handler(req, res);
    } catch (err) {
      console.error(`[api] ${pathname} threw:`, err);
      if (!res.headersSent) res.status(500).json({ error: 'Function crashed', detail: String(err && err.message || err) });
    }
    console.log(`${rawReq.method} ${pathname} → api ${res.statusCode}`);
    return;
  }

  if (rawReq.method !== 'GET' && rawReq.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const file = resolveStatic(pathname);
  if (!file) {
    applySecurityHeaders(res);
    res.status(404);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>404 — Not Found</h1>');
    console.log(`GET ${pathname} → 404`);
    return;
  }

  applySecurityHeaders(res);
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  if (rawReq.method === 'HEAD') { res.status(200).end(); return; }
  fs.createReadStream(file).pipe(res);
  console.log(`GET ${pathname} → ${path.relative(ROOT, file)}`);
});

server.listen(PORT, () => {
  console.log(`\n  Sona dev server\n  ─────────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Static:  ${path.relative(ROOT, STATIC_DIR)}/`);
  console.log(`  API:     ${rewrites.filter(r => r.destination.startsWith('/api/')).length} routes from vercel.json\n`);
});
