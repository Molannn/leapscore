import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { generateReview, ReviewError } from './generate.mjs';
import { canReview, normalizeInterests } from '../src/review.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const bank = JSON.parse(await readFile(new URL('../data/items.json', import.meta.url), 'utf8'));
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', jpg: 'image/jpeg', json: 'application/json; charset=utf-8' };
// 明確列出公開檔案，避免 .env、後端程式與 Git 資料外洩。
const publicFiles = new Set(['index.html', 'assets/css/style.css', 'data/items.json',
  'src/bonus.js', 'assets/images/palace-bonus.jpg', 'src/main.js', 'src/api.js', 'src/deployment.js', 'src/state.js', 'src/config.js', 'src/model.js', 'src/selector.js', 'src/review.js', 'src/ui/views.js']);

async function readJSON(req) {
  let data = '';
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12000) throw new ReviewError('請求內容過大。', 413);
    data += chunk;
  }
  try { return JSON.parse(data); } catch { throw new ReviewError('請求格式錯誤。', 400); }
}

export function parseOrigins(value = '') {
  return value.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const url = new URL(value);
    if (url.origin !== value || !['https:', 'http:'].includes(url.protocol) ||
        (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('ALLOWED_ORIGINS 必須為完整 HTTPS origin，不含路徑或結尾斜線。');
    }
    return url.origin;
  });
}

export function createApp({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-2.5-flash', fetchImpl = fetch, rateLimit = 20,
  allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS),
  publicOrigin = process.env.RENDER_EXTERNAL_URL || '',
  dailyLimit = Number(process.env.REVIEW_DAILY_LIMIT || 100),
} = {}) {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) throw new Error('REVIEW_DAILY_LIMIT 必須為正整數。');
  const trustedOrigins = new Set([...allowedOrigins, ...parseOrigins(publicOrigin)]);
  let day = new Date().toISOString().slice(0, 10);
  let dailyRequests = 0;
  let windowStart = Date.now();
  let requests = 0;
  let active = 0;
  return http.createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': types.json, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (['/api/health', '/api/review'].includes(path)) {
        res.setHeader('Vary', 'Origin');
        const origin = req.headers.origin;
        const host = req.headers.host || '';
        const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
        const permitted = origin
          ? trustedOrigins.has(origin) || (local && origin === `http://${host}`)
          : local;
        // 健康檢查可供平台探測；出題只接受明確設定的瀏覽器來源。
        if (origin && !permitted) return json(403, { error: '不允許此網站使用出題服務。' });
        if (origin && permitted) res.setHeader('Access-Control-Allow-Origin', origin);
        if (path === '/api/health' && ['GET', 'HEAD'].includes(req.method)) {
          if (req.method === 'HEAD') { res.writeHead(200); return res.end(); }
          return json(200, { status: 'ok' });
        }
        if (path === '/api/review' && req.method === 'OPTIONS') {
          if (!permitted) return json(403, { error: '不允許此網站使用出題服務。' });
          if (req.headers['access-control-request-method'] !== 'POST') return json(405, { error: '請使用 POST。' });
          const requestedHeaders = (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
          if (requestedHeaders.some(header => header !== 'content-type')) return json(403, { error: '不支援的請求標頭。' });
          res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
          return res.end();
        }
        if (path === '/api/health' || req.method !== 'POST') { res.setHeader('Allow', path === '/api/health' ? 'GET, HEAD' : 'POST, OPTIONS'); return json(405, { error: '不支援的請求方式。' }); }
        if (!permitted) return json(403, { error: '不允許此來源使用出題服務。' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: '請使用 JSON。' });
        const body = await readJSON(req);
        if (!body || typeof body !== 'object') throw new ReviewError('請求格式錯誤。', 400);
        const item = bank.items.find(x => x.id === body.sourceItemId);
        const interests = normalizeInterests(body.interests);
        if (!canReview(item) || !interests.length) throw new ReviewError('請選擇支援的單字與至少一項興趣。', 400);
        if (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 30)) throw new ReviewError('複習紀錄格式錯誤。', 400);
        const history = (body.history || []).map(a => {
          if (!a || typeof a.correct !== 'boolean' || typeof a.question !== 'string' || a.question.length > 600 || !normalizeInterests([a.interest]).length) throw new ReviewError('複習紀錄格式錯誤。', 400);
          return { mode: 'interest-review', sourceItemId: item.id, correct: a.correct, question: a.question, interest: a.interest };
        });
        if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requests = 0; }
        if (requests >= rateLimit || active >= 2) return json(429, { error: '出題請求較多，請稍後再試。' });
        const today = new Date().toISOString().slice(0, 10);
        if (today !== day) { day = today; dailyRequests = 0; }
        if (dailyRequests >= dailyLimit) return json(429, { error: '今日 AI 出題額度已用完，請使用內建情境題，或明天再試。' });
        requests++; dailyRequests++; active++;
        try {
          const generated = await generateReview({ item, interests, history, apiKey, model, fetchImpl });
          return json(200, { item: generated });
        } finally { active--; }
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: '不支援的請求方式。' });
      const file = path === '/' ? 'index.html' : path.slice(1);
      if (!publicFiles.has(file)) return json(404, { error: '找不到頁面。' });
      const data = await readFile(resolve(root, file));
      res.writeHead(200, { 'Content-Type': types[file.split('.').at(-1)], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      json(error instanceof ReviewError ? error.status : 500,
        { error: error instanceof ReviewError ? error.message : '服務暫時無法使用，請稍後再試。' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8000);
  const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
  createApp().listen(port, host, () => {
    console.log(`LeapScore: http://localhost:${port}`);
    console.log(process.env.GEMINI_API_KEY ? 'AI 出題已設定；首次出題時驗證服務連線。' : '尚未設定 GEMINI_API_KEY；可使用內建情境複習。');
  });
}
