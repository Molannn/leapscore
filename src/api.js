import { API_BASE_URL } from './deployment.js';

export function reviewApiBase(location, configured = API_BASE_URL) {
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return location.origin;
  if (configured.trim()) {
    const url = new URL(configured.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('出題服務網址設定有誤，請聯絡管理者。');
    }
    return url.origin;
  }
  if (location.hostname.endsWith('.github.io')) throw new Error('線上 AI 出題服務尚未啟用，可以先使用內建情境題。');
  return location.origin;
}

export async function requestReview(body, { signal, onConnecting = () => {}, location = globalThis.location, configured = API_BASE_URL, fetchImpl = fetch } = {}) {
  const base = reviewApiBase(location, configured);
  if (base !== location.origin) {
    onConnecting();
    // 先用不呼叫 Gemini 的健康檢查喚醒服務；不重送付費出題請求。
    const health = await fetchImpl(`${base}/api/health`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(90000)].filter(Boolean)),
      credentials: 'omit',
    });
    if (!health.ok) throw new Error('出題服務尚未就緒，請稍後重試或使用內建情境題。');
  }
  const response = await fetchImpl(`${base}/api/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'omit', body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(35000)].filter(Boolean)),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('無法連線到出題服務，請稍後重試或使用內建情境題。'); }
  if (!response.ok) throw new Error(result.error || 'AI 出題暫時無法使用。');
  return result.item;
}
