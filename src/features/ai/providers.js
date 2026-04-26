/**
 * features/ai/providers.js
 * AI 供應商設定：AI_PROVIDERS, getAiSettings, saveAiSettings, UI 控制
 * 依賴：core/store.js, core/toast.js
 * FORBIDDEN: no state.js writes
 */

import { K, loadJSON } from '../../core/store.js';
import { toast } from '../../core/toast.js';

// ── Provider definitions ──────────────────────────────────────────────────────

export const AI_PROVIDERS = {
  claude: {
    label: 'Claude (Anthropic)',
    models: [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    keyPlaceholder: 'sk-ant-…',
  },
  openai: {
    label: 'GPT (OpenAI)',
    models: ['o3', 'o3-mini', 'o1', 'o1-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    keyPlaceholder: 'sk-…',
  },
  gemini: {
    label: 'Gemini (Google)',
    models: [
      'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview',
      'gemini-2.5-pro-preview-05-06', 'gemini-2.5-flash-preview-04-17',
      'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-pro-exp',
      'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b',
    ],
    keyPlaceholder: 'AIza…',
  },
  grok: {
    label: 'Grok (xAI)',
    models: [
      'grok-4.20-0309-reasoning', 'grok-4.20-0309-non-reasoning',
      'grok-3-beta', 'grok-3-mini-beta', 'grok-2-1212',
    ],
    keyPlaceholder: 'xai-…',
  },
  openrouter: {
    label: 'OpenRouter',
    models: [],
    keyPlaceholder: 'sk-or-…',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    dynamic: true,
  },
  custom: {
    label: '自定義',
    models: [],
    keyPlaceholder: 'API Key…',
  },
};

// ── Settings read / write ─────────────────────────────────────────────────────

/** @returns {{ provider, model, apiKey, endpoint }} */
export function getAiSettings() {
  return {
    provider: localStorage.getItem(K.aiProvider)  || 'openrouter',
    model:    localStorage.getItem(K.aiModel)     || 'deepseek/deepseek-chat',
    apiKey:   localStorage.getItem(K.apiKey)      || '',
    endpoint: localStorage.getItem(K.aiEndpoint)  || 'https://openrouter.ai/api/v1/chat/completions',
  };
}

export function saveAiSettings() {
  const provider = document.getElementById('ai-provider-select')?.value || 'claude';
  const model    = document.getElementById('ai-model-select')?.value    || '';
  const apiKey   = document.getElementById('ai-apikey-input')?.value    || '';
  const endpoint = document.getElementById('ai-custom-endpoint')?.value || '';
  localStorage.setItem(K.aiProvider,  provider);
  localStorage.setItem(K.aiModel,     model);
  localStorage.setItem(K.apiKey,      apiKey);
  localStorage.setItem(K.aiEndpoint,  endpoint);
  updateAiModelBadge();
}

// ── Model select UI ───────────────────────────────────────────────────────────

export function onAiProviderChange() {
  const provider  = document.getElementById('ai-provider-select')?.value || 'openrouter';
  const ms        = document.getElementById('ai-model-select');
  if (!ms) return;
  const p = AI_PROVIDERS[provider];
  const savedModel = localStorage.getItem(K.aiModel) || '';

  if (provider === 'custom') {
    ms.innerHTML = '<option value="">自定義模型名稱</option>';
    ms.style.display = 'none';
    let mi = document.getElementById('ai-custom-model-input');
    if (!mi) {
      mi = document.createElement('input');
      mi.className = 'field-input'; mi.id = 'ai-custom-model-input';
      mi.placeholder = '模型名稱（如 gpt-4o）'; mi.style.flex = '1'; mi.style.minWidth = '160px';
      mi.oninput = saveAiSettings;
      ms.parentNode.insertBefore(mi, ms.nextSibling);
    } else { mi.style.display = ''; }
    if (savedModel) mi.value = savedModel;
    document.getElementById('ai-custom-endpoint-row').style.display = 'flex';
  } else if (provider === 'openrouter') {
    ms.style.display = '';
    const mi = document.getElementById('ai-custom-model-input');
    if (mi) mi.style.display = 'none';
    document.getElementById('ai-custom-endpoint-row').style.display = 'flex';
    const ep = document.getElementById('ai-custom-endpoint');
    if (ep && !ep.value) ep.value = p.endpoint;
    const cached = loadJSON('crm-openrouter-models', []);
    if (cached.length) {
      ms.innerHTML = cached.map(m => `<option value="${m}">${m}</option>`).join('');
      // Restore saved model before any save, so save doesn't clobber it
      if (savedModel && cached.includes(savedModel)) ms.value = savedModel;
    } else {
      // Keep saved model as an option even without fetched list, so value persists
      ms.innerHTML = savedModel
        ? `<option value="${savedModel}">${savedModel}</option>`
        : '<option value="">— 請點「載入模型」—</option>';
      if (savedModel) ms.value = savedModel;
    }
    let fetchBtn = document.getElementById('ai-fetch-models-btn');
    if (!fetchBtn) {
      fetchBtn = document.createElement('button');
      fetchBtn.id = 'ai-fetch-models-btn'; fetchBtn.className = 'btn btn-sm';
      fetchBtn.style.whiteSpace = 'nowrap'; fetchBtn.textContent = '🔄 載入模型';
      fetchBtn.onclick = fetchDynamicModels;
      ms.parentNode.insertBefore(fetchBtn, ms.nextSibling);
    } else { fetchBtn.style.display = ''; }
  } else {
    ms.style.display = '';
    const mi = document.getElementById('ai-custom-model-input');
    if (mi) mi.style.display = 'none';
    const fetchBtn = document.getElementById('ai-fetch-models-btn');
    if (fetchBtn) fetchBtn.style.display = 'none';
    ms.innerHTML = p.models.map(m => `<option value="${m}">${m}</option>`).join('');
    if (savedModel && p.models.includes(savedModel)) ms.value = savedModel;
    document.getElementById('ai-custom-endpoint-row').style.display = 'none';
  }
  const ki = document.getElementById('ai-apikey-input');
  if (ki) ki.placeholder = p.keyPlaceholder || 'API Key…';
  saveAiSettings();
}

export async function fetchDynamicModels() {
  const provider = document.getElementById('ai-provider-select')?.value || '';
  const p = AI_PROVIDERS[provider];
  if (!p?.modelsUrl) { toast('此供應商不支援動態模型'); return; }
  const apiKey = document.getElementById('ai-apikey-input')?.value || '';
  const btn = document.getElementById('ai-fetch-models-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 載入中…'; }
  try {
    const res = await fetch(p.modelsUrl, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://fdd-crm.pages.dev' } : {},
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const ids = (data.data || data.models || []).map(m => m.id || m.name || m).filter(Boolean).sort();
    if (!ids.length) throw new Error('無模型資料');
    localStorage.setItem('crm-openrouter-models', JSON.stringify(ids));
    const ms = document.getElementById('ai-model-select');
    if (ms) {
      const saved = localStorage.getItem(K.aiModel);
      // If saved model is not in fetched list, prepend it so it remains selectable
      const list = saved && !ids.includes(saved) ? [saved, ...ids] : ids;
      ms.innerHTML = list.map(m => `<option value="${m}">${m}</option>`).join('');
      if (saved && list.includes(saved)) ms.value = saved;
    }
    toast(`✅ 已載入 ${ids.length} 個模型`);
  } catch (e) {
    toast('載入失敗：' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 載入模型'; }
  }
}

export function renderAiSettingsCard() {
  const s  = getAiSettings();
  const ps = document.getElementById('ai-provider-select');
  if (ps) ps.value = s.provider;
  const p  = AI_PROVIDERS[s.provider] || AI_PROVIDERS.openrouter;
  const ms = document.getElementById('ai-model-select');
  if (ms) {
    if (s.provider === 'custom') {
      ms.style.display = 'none';
      const mi = document.getElementById('ai-custom-model-input');
      if (mi) { mi.style.display = ''; mi.value = s.model; }
      document.getElementById('ai-custom-endpoint-row').style.display = 'flex';
      const ep = document.getElementById('ai-custom-endpoint');
      if (ep) ep.value = s.endpoint;
    } else if (s.provider === 'openrouter') {
      ms.style.display = '';
      document.getElementById('ai-custom-endpoint-row').style.display = 'flex';
      const ep = document.getElementById('ai-custom-endpoint');
      if (ep && !ep.value) ep.value = p.endpoint;
      const cached = loadJSON('crm-openrouter-models', []);
      if (cached.length) {
        ms.innerHTML = cached.map(m => `<option value="${m}">${m}</option>`).join('');
        if (s.model && cached.includes(s.model)) ms.value = s.model;
      } else {
        // Preserve saved model as an option so value persists before fetch
        ms.innerHTML = s.model
          ? `<option value="${s.model}">${s.model}</option>`
          : '<option value="">— 請點「載入模型」—</option>';
        if (s.model) ms.value = s.model;
      }
    } else {
      ms.style.display = '';
      const fetchBtn = document.getElementById('ai-fetch-models-btn');
      if (fetchBtn) fetchBtn.style.display = 'none';
      ms.innerHTML = p.models.map(m => `<option value="${m}">${m}</option>`).join('');
      if (s.model) ms.value = s.model;
      document.getElementById('ai-custom-endpoint-row').style.display = 'none';
    }
  }
  const ki = document.getElementById('ai-apikey-input');
  if (ki) { ki.value = s.apiKey; ki.placeholder = p.keyPlaceholder || 'API Key…'; }
  const st = document.getElementById('ai-settings-status');
  if (st) st.textContent = s.apiKey ? '✅ API Key 已設定' : '⚠ 尚未設定 API Key';
  updateAiModelBadge();
}

export function updateAiModelBadge() {
  const s = getAiSettings();
  const badge = document.getElementById('ai-model-badge');
  if (badge) {
    const p = AI_PROVIDERS[s.provider] || { label: s.provider };
    badge.textContent = `模型：${p.label} / ${s.model || '未設定'}`;
  }
}
