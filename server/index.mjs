import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { generateReview, ReviewError } from './generate.mjs';
import { canReview, normalizeInterests } from '../src/review.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const bank = JSON.parse(await readFile(new URL('../data/items.json', import.meta.url), 'utf8'));
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8' };
// 明確列出公開檔案，避免 .env、後端程式與 Git 資料外洩。
const publicFiles = new Set(['index.html', 'assets/css/style.css', 'data/items.json',
  'src/main.js', 'src/state.js', 'src/config.js', 'src/model.js', 'src/selector.js', 'src/review.js', 'src/ui/views.js']);

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

export function createApp({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-2.5-flash', fetchImpl = fetch, rateLimit = 20 } = {}) {
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
      if (path === '/api/review') {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(405, { error: '請使用 POST。' }); }
        // 此開發伺服器只提供 loopback，阻擋跨站與 DNS rebinding 存取付費 API。
        const host = req.headers.host || '';
        if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
          (req.headers.origin && req.headers.origin !== `http://${host}`)) return json(403, { error: '不允許跨來源出題請求。' });
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
        requests++; active++;
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
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`LeapScore: http://localhost:${port}`);
    console.log(process.env.GEMINI_API_KEY ? 'AI 出題已設定；首次出題時驗證服務連線。' : '尚未設定 GEMINI_API_KEY；可使用內建情境複習。');
  });
}
