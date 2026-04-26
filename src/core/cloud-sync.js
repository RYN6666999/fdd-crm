/**
 * core/cloud-sync.js
 * 瀏覽器 ↔ Cloudflare KV 雙向同步
 *
 * 策略：
 *   - loadAll()：啟動時從 KV 拉最新，比 localStorage 新則覆蓋
 *   - push(key, data)：寫 localStorage 後 fire-and-forget 同步到 KV
 *
 * Token 讀取：localStorage 'crm-cloud-token'
 * API base：同源 /api/store
 *
 * FORBIDDEN: no DOM, no state dispatch
 */

const BASE = '/api/store';
const TOKEN_KEY = 'crm-cloud-token';

const KEY_MAP = {
  nodes:               'nodes',
  events:              'events',
  sales:               'sales',
  dailyReports:        'daily-reports',
  monthlyGoals:        'monthly-goals',
  monthlySalesTargets: 'monthly-sales-targets',
  docs:                'docs',
  students:            'students',
  memories:            'ai-memories',
};

/** 裝置識別（首次生成後持久化），用於多裝置衝突識別 */
function getDeviceId() {
  let id = localStorage.getItem('crm-device-id');
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('crm-device-id', id);
  }
  return id;
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

/** 啟動時批次拉取 KV 資料，回傳 { storeKey: data } */
export async function cloudLoadAll() {
  const token = getToken();
  if (!token) return {};
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ keys: Object.values(KEY_MAP) }),
    });
    if (!res.ok) return {};
    const { data } = await res.json();
    // 反轉 key map（KV key → store key）
    const out = {};
    for (const [storeKey, kvKey] of Object.entries(KEY_MAP)) {
      const raw = data[kvKey];
      if (raw == null) continue;
      // 相容新舊格式：新寫入帶 wrapper { data, ts, device }，舊格式直接是資料本體
      out[storeKey] = (raw && typeof raw === 'object' && raw.ts && raw.data !== undefined)
        ? raw.data
        : raw;
    }
    return out;
  } catch {
    return {};
  }
}

/** 非同步推送單一 key 到 KV（fire-and-forget），包 wrapper 帶 ts/device */
export function cloudPush(storeKey, data) {
  const kvKey = KEY_MAP[storeKey];
  const token = getToken();
  if (!kvKey || !token) return;

  const wrapper = {
    data,
    ts: Date.now(),
    device: getDeviceId(),
  };

  fetch(`${BASE}?key=${kvKey}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(wrapper),
  }).catch(() => {}); // 靜默失敗，不影響本地操作
}

/** 設定 token（CRM 設定頁用） */
export function setCloudToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getCloudToken() {
  return getToken();
}

/** 測試連線，回傳 { ok, error? } */
export async function testCloudConnection() {
  const token = getToken();
  if (!token) return { ok: false, error: '未設定 token' };
  try {
    const res = await fetch(`${BASE}?key=nodes`, { headers: authHeaders() });
    if (res.status === 401) return { ok: false, error: 'Token 不正確' };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
