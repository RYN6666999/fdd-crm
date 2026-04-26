/**
 * features/ai/chat.js
 * AI 對話：sendChat, renderChat, clearChat, 記憶萃取 UI
 * 依賴：core/state.js, core/toast.js,
 *       features/ai/providers.js, features/ai/personas.js, features/ai/tools.js
 */

import { getChatHistory, dispatch } from '../../core/state.js';
import { toast } from '../../core/toast.js';
import { getAiSettings } from './providers.js';
import { getCurrentPersona, buildSystemPrompt, memoryService } from './personas.js';
import { CRM_TOOLS, executeToolCall } from './tools.js';
import { saveSession, renderSessionBar } from './session.js';
import { getAttachments, clearAttachments, buildContent } from './attachments.js';

// ── Markdown → HTML (minimal) ─────────────────────────────────────────────────

function mdToHtml(text) {
  if (!text) return '';
  // Extract <meta-timing> before HTML escaping
  let timingHtml = '';
  text = text.replace(/<meta-timing>([\s\S]*?)<\/meta-timing>/g, (_, t) => {
    timingHtml = `<div class="chat-timing">${t}</div>`;
    return '';
  }).trim();
  const body = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`([^`]+)`/g,     '<code>$1</code>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-•] (.+)$/gm,  '<li>$1</li>')
    .replace(/<\/li>\n<li>/g,  '</li><li>')
    .replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/👉 (https?:\/\/\S+)/g, '👉 <a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
  return timingHtml ? body + timingHtml : body;
}

// ── Render chat history ───────────────────────────────────────────────────────

export function renderChat() {
  const box = document.getElementById('chat-area');
  if (!box) return;
  const history = getChatHistory();
  if (!history.length) {
    box.innerHTML = '<div class="chat-empty">選擇上方 Persona，輸入問題開始對話 👆</div>';
    return;
  }
  box.innerHTML = history.map(m => {
    if (m.role === 'user') {
      const imgs = (m.images || []).map(src => `<img src="${src}" alt="附圖">`).join('');
      return `<div class="chat-msg user"><div class="chat-bubble user">${imgs}${mdToHtml(m.content)}</div></div>`;
    }
    if (m.role === 'assistant') {
      return `<div class="chat-msg assistant">
        <div class="chat-bubble assistant">${mdToHtml(m.content)}</div>
        <div class="chat-actions">
          <button class="chat-action-btn" onclick="window.__crmExtractMemories?.(${JSON.stringify(m.content).replace(/'/g, '&#39;')})">💾 存入記憶</button>
        </div>
      </div>`;
    }
    return '';
  }).join('');
  box.scrollTop = box.scrollHeight;
}

// ── Current contact context ───────────────────────────────────────────────────

let _currentContact = null;
export function setCurrentContact(node) { _currentContact = node; }
export function getCurrentContact()     { return _currentContact; }

// ── Token estimation ──────────────────────────────────────────────────────────

function roughTokens(text) { return Math.ceil((text || '').length / 1.5); }

function trimToTokenBudget(history, maxTokens = 3000) {
  const out = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = roughTokens(history[i].content);
    if (total + t > maxTokens) break;
    out.unshift(history[i]);
    total += t;
  }
  return out;
}

function renderContextWarning() {
  const box = document.getElementById('chat-area');
  if (!box) return;
  box.querySelector('.chat-ctx-warn')?.remove();
  const total = getChatHistory().reduce((s, m) => s + roughTokens(m.content), 0);
  if (total > 2500) {
    const el = document.createElement('div');
    el.className = 'chat-ctx-warn';
    el.textContent = '⚠ 對話脈絡快滿，清空時自動摘要存入記憶';
    box.prepend(el);
  }
}

// ── Smart clear（摘要→記憶→清空）────────────────────────────────────────────

export async function smartClearChat() {
  const history = getChatHistory();
  if (!history.length) { renderChat(); return; }

  const { provider, model, apiKey } = getAiSettings();
  if (apiKey || provider === 'claude') {
    toast('摘要對話中…');
    const convText = history.slice(-10)
      .map(m => `${m.role === 'user' ? '業務' : 'AI'}：${m.content.slice(0, 400)}`)
      .join('\n');
    const prompt = `從以下業務對話找出值得長期記住的客戶資訊或洞察（最多3條）。
格式：[{"subject":"對象姓名","type":"insight|preference|fact","content":"具體內容"}]
只輸出 JSON array，無其他文字。\n\n${convText}`;
    try {
      const url     = getEndpoint(provider, model, '');
      const headers = getHeaders(provider, apiKey);
      const body    = provider === 'claude'
        ? { model, system: '你是記憶萃取助理', messages: [{ role: 'user', content: prompt }], max_tokens: 400 }
        : { model, messages: [{ role: 'system', content: '你是記憶萃取助理' }, { role: 'user', content: prompt }], max_tokens: 400 };
      const res  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      const raw  = extractContent(provider, data).trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
      const arr  = JSON.parse(raw);
      let saved  = 0;
      for (const m of (Array.isArray(arr) ? arr : []).slice(0, 3)) {
        if (m.subject && m.content) { await memoryService.create({ subject: m.subject, type: m.type || 'insight', content: m.content }); saved++; }
      }
      toast(saved ? `已摘要 ${saved} 條記憶，對話清空` : '對話已清空');
    } catch { toast('對話已清空'); }
  }
  dispatch({ type: 'CHAT_CLEAR' });
  _currentContact = null;
  renderChat();
}

export function clearChat() {
  dispatch({ type: 'CHAT_CLEAR' });
  renderChat();
}

// ── Build API request body ────────────────────────────────────────────────────

function supportsStreaming(provider) {
  return provider === 'openai' || provider === 'openrouter' || provider === 'grok' || provider === 'custom';
}

function toOpenAITools(crmTools) {
  return crmTools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

function buildRequestBody(provider, model, systemPrompt, messages, stream = false) {
  if (provider === 'openai' || provider === 'openrouter' || provider === 'custom' || provider === 'grok') {
    return {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 2048,
      temperature: 0.7,
      tools: toOpenAITools(CRM_TOOLS),
      tool_choice: 'auto',
      ...(stream ? { stream: true } : {}),
    };
  }
  if (provider === 'gemini') {
    return {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    };
  }
  // claude (default)
  return {
    model,
    system: systemPrompt,
    messages,
    max_tokens: 2048,
    tools: CRM_TOOLS,
  };
}

function getEndpoint(provider, model, customEndpoint) {
  if (provider === 'openai') return 'https://api.openai.com/v1/chat/completions';
  if (provider === 'grok')   return 'https://api.x.ai/v1/chat/completions';
  if (provider === 'gemini') return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  if (provider === 'openrouter') return customEndpoint || 'https://openrouter.ai/api/v1/chat/completions';
  if (provider === 'custom')     return customEndpoint || '';
  // claude
  return '/api/claude';
}

function getHeaders(provider, apiKey) {
  const h = { 'Content-Type': 'application/json' };
  if (provider === 'claude') return h;   // backend proxy handles auth
  if (provider === 'gemini') return { ...h, 'x-goog-api-key': apiKey };
  if (provider === 'openrouter') return { ...h, Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://fdd-crm.pages.dev', 'X-Title': 'FDD CRM' };
  return { ...h, Authorization: `Bearer ${apiKey}` };
}

function extractContent(provider, data) {
  if (provider === 'gemini') return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (provider === 'claude') {
    const block = (data.content || []).find(b => b.type === 'text');
    return block?.text || '';
  }
  return data.choices?.[0]?.message?.content || '';
}

function extractToolUses(provider, data) {
  if (provider === 'claude') {
    return (data.content || []).filter(b => b.type === 'tool_use');
  }
  if (provider === 'gemini') {
    const parts = data.candidates?.[0]?.content?.parts || [];
    const calls = [];
    for (const p of parts) {
      if (p.functionCall) {
        calls.push({ name: p.functionCall.name, input: p.functionCall.args });
      }
    }
    return calls;
  }
  // openai, openrouter, grok, custom
  const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
  return toolCalls.map(tc => {
    let input = {};
    try { input = JSON.parse(tc.function.arguments || '{}'); } catch { /**/ }
    return { name: tc.function.name, input };
  });
}

// ── sendChat ──────────────────────────────────────────────────────────────────

export async function sendChat() {
  const inp = document.getElementById('chat-input');
  if (!inp) return;
  const userMsg    = inp.value.trim();
  const attachments = getAttachments();
  if (!userMsg && !attachments.length) return;

  inp.value = '';
  inp.style.height = 'auto';

  const { provider, model, apiKey, endpoint: customEndpoint } = getAiSettings();
  if (!apiKey && provider !== 'claude') { toast('請先設定 API Key'); return; }

  // Snapshot attachments then clear (before async ops)
  const attachSnap = [...attachments];
  clearAttachments();

  // Build content: plain text or multipart (text + images/files)
  const userContent = buildContent(userMsg, provider, attachSnap);

  // Store display text + image previews in history
  const historyPayload = {
    role: 'user',
    content: userMsg || '（附件）',
    images: attachSnap.filter(a => a.type === 'image').map(a => a.preview),
  };
  dispatch({ type: 'CHAT_PUSH', payload: historyPayload });
  renderChat();

  // Show loading with live timer
  const box = document.getElementById('chat-area');
  const loading = document.createElement('div');
  loading.className = 'chat-msg assistant loading';
  loading.innerHTML = '<div class="chat-bubble assistant chat-thinking"><span class="chat-timer-count">0s</span></div>';
  box?.appendChild(loading);
  box && (box.scrollTop = box.scrollHeight);

  const sendBtn = document.getElementById('chat-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  const _t0 = Date.now();
  const _timerEl = () => loading.querySelector('.chat-timer-count');
  const _fmtElapsed = ms => {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  };
  const _timerId = setInterval(() => {
    const el = _timerEl();
    if (el) el.textContent = _fmtElapsed(Date.now() - _t0);
  }, 500);

  try {
    const personaKey  = getCurrentPersona();
    const { memories: _m, promptSnippet } = await memoryService.retrieve(userMsg, { persona: personaKey });
    const systemPrompt = await buildSystemPrompt(personaKey, promptSnippet, _currentContact);

    // Build messages array — trim by token budget, replace last user msg with rich content
    const history  = trimToTokenBudget(getChatHistory());
    const messages = history.map((m, i) => {
      // Last message is the one just pushed (has userContent with images)
      if (m.role === 'user' && i === history.length - 1 && attachSnap.length) {
        return { role: 'user', content: userContent };
      }
      return { role: m.role, content: m.content };
    });

    const url     = getEndpoint(provider, model, customEndpoint);
    const headers = getHeaders(provider, apiKey);
    const isOAI   = supportsStreaming(provider);

    let assistantContent = '';

    if (isOAI) {
      // ── OAI: streaming Round 1 (show text immediately, detect tool_calls) ──
      const body1 = buildRequestBody(provider, model, systemPrompt, messages, true);
      const res1  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body1) });
      if (!res1.ok) {
        const errText = await res1.text().catch(() => res1.statusText);
        throw new Error(`HTTP ${res1.status}: ${errText.slice(0, 200)}`);
      }

      // Show live bubble immediately
      loading.remove();
      const liveBubble = document.createElement('div');
      liveBubble.className = 'chat-msg assistant';
      liveBubble.innerHTML = '<div class="chat-bubble assistant" id="chat-stream-bubble"></div>';
      box?.appendChild(liveBubble);

      const reader  = res1.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let streamedContent = '';
      let finishReason = '';
      const toolCallsAcc = []; // accumulate tool_call deltas by index

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const chunk  = JSON.parse(raw);
            const choice = chunk.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;
            const delta = choice.delta || {};
            if (delta.content) {
              streamedContent += delta.content;
              const el = document.getElementById('chat-stream-bubble');
              if (el) { el.innerHTML = mdToHtml(streamedContent); box && (box.scrollTop = box.scrollHeight); }
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const i = tc.index;
                if (!toolCallsAcc[i]) toolCallsAcc[i] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                if (tc.id)                       toolCallsAcc[i].id = tc.id;
                if (tc.function?.name)            toolCallsAcc[i].function.name      += tc.function.name;
                if (tc.function?.arguments)       toolCallsAcc[i].function.arguments += tc.function.arguments;
              }
            }
          } catch { /**/ }
        }
      }

      assistantContent = streamedContent;

      if (finishReason === 'tool_calls' && toolCallsAcc.length > 0) {
        // Execute tools → Round 2 streaming
        const toolResultMsgs = [];
        for (const tc of toolCallsAcc) {
          let args = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /**/ }
          const result = await executeToolCall(tc.function?.name, args);
          toolResultMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
          if (result.message) assistantContent += (assistantContent ? '\n' : '') + result.message;
        }

        const followUpMessages = [
          ...messages,
          { role: 'assistant', content: streamedContent || '', tool_calls: toolCallsAcc },
          ...toolResultMsgs,
        ];
        const body2 = buildRequestBody(provider, model, systemPrompt, followUpMessages, true);
        const res2  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body2) });

        if (res2.ok && res2.body) {
          const el2 = document.getElementById('chat-stream-bubble');
          if (el2) el2.innerHTML = '';
          const reader2  = res2.body.getReader();
          const decoder2 = new TextDecoder();
          let buf2 = '';
          let streamed2 = '';
          while (true) {
            const { done, value } = await reader2.read();
            if (done) break;
            buf2 += decoder2.decode(value, { stream: true });
            const lines = buf2.split('\n'); buf2 = lines.pop();
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;
              try {
                const delta = JSON.parse(raw).choices?.[0]?.delta?.content || '';
                if (delta) {
                  streamed2 += delta;
                  const el = document.getElementById('chat-stream-bubble');
                  if (el) { el.innerHTML = mdToHtml(streamed2); box && (box.scrollTop = box.scrollHeight); }
                }
              } catch { /**/ }
            }
          }
          if (streamed2) assistantContent = (assistantContent ? assistantContent + '\n\n' : '') + streamed2;
        }
      }
    } else {
      // ── Claude / Gemini non-streaming path ─────────────────────────────────
      const body1 = buildRequestBody(provider, model, systemPrompt, messages, false);
      const res1  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body1) });
      if (!res1.ok) {
        const errText = await res1.text().catch(() => res1.statusText);
        throw new Error(`HTTP ${res1.status}: ${errText.slice(0, 200)}`);
      }
      const data1   = await res1.json();
      const toolUses = extractToolUses(provider, data1);
      assistantContent = extractContent(provider, data1);
      for (const tu of toolUses) {
        const result = await executeToolCall(tu.name, tu.input || {});
        if (result.message) assistantContent += (assistantContent ? '\n\n' : '') + `✅ ${result.message}`;
      }
    }

    if (!assistantContent) assistantContent = '（無回應）';
    const elapsed = _fmtElapsed(Date.now() - _t0);
    const tokEst  = Math.round(assistantContent.length / 1.5);
    const tokStr  = tokEst >= 1000 ? `${(tokEst / 1000).toFixed(1)}k` : `${tokEst}`;
    assistantContent += `\n\n<meta-timing>${elapsed} · ↓ ${tokStr} tokens</meta-timing>`;
    dispatch({ type: 'CHAT_PUSH', payload: { role: 'assistant', content: assistantContent } });

  } catch (e) {

    const errMsg = `❌ 錯誤：${e.message}`;
    dispatch({ type: 'CHAT_PUSH', payload: { role: 'assistant', content: errMsg } });
    toast(e.message.slice(0, 80));
  } finally {
    clearInterval(_timerId);
    loading.remove();
    if (sendBtn) sendBtn.disabled = false;
    renderChat();
    renderContextWarning();
    // Auto-save session for current contact
    if (_currentContact) {
      saveSession(_currentContact.id, _currentContact.name, getChatHistory());
      renderSessionBar(_currentContact.id, _currentContact.name);
    }
  }
}

// ── Extract memories from AI response ────────────────────────────────────────

export async function extractAndSaveMemories(content) {
  if (!content) return;
  const { provider, model, apiKey } = getAiSettings();
  if (!apiKey && provider !== 'claude') { toast('需要 API Key 才能萃取記憶'); return; }

  toast('正在萃取記憶…');
  const extractPrompt = `從以下 AI 回應中，找出值得長期記住的客戶資訊或業務洞察（最多3條）。
每條格式：{"subject":"對象","type":"insight|preference|fact","content":"內容"}
只輸出 JSON array，無其他文字。

回應內容：
${content.slice(0, 2000)}`;

  try {
    const url     = getEndpoint(provider, model, '');
    const headers = getHeaders(provider, apiKey);
    const body    = provider === 'claude'
      ? { model, system: '你是記憶萃取助理', messages: [{ role: 'user', content: extractPrompt }], max_tokens: 512 }
      : { model, messages: [{ role: 'system', content: '你是記憶萃取助理' }, { role: 'user', content: extractPrompt }], max_tokens: 512 };

    const res  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    const raw  = extractContent(provider, data).trim();
    const arr  = JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    if (!Array.isArray(arr)) throw new Error('格式錯誤');

    let saved = 0;
    for (const m of arr.slice(0, 3)) {
      if (m.subject && m.content) {
        await memoryService.create({ subject: m.subject, type: m.type || 'insight', content: m.content });
        saved++;
      }
    }
    toast(`已儲存 ${saved} 條記憶`);
  } catch (e) {
    toast('記憶萃取失敗：' + e.message.slice(0, 60));
  }
}

// ── Memory UI ─────────────────────────────────────────────────────────────────

export async function renderMemoryList(subjectFilter = '') {
  const box = document.getElementById('memory-list');
  if (!box) return;
  box.innerHTML = '<div style="color:var(--text-muted);font-size:12px">載入中…</div>';
  const memories = await memoryService.list(subjectFilter ? { subject: subjectFilter } : {});
  if (!memories.length) { box.innerHTML = '<div style="color:var(--text-muted);font-size:12px">尚無記憶</div>'; return; }
  box.innerHTML = memories.map(m => `
    <div class="memory-item" data-id="${m.id}">
      <div class="memory-header">
        <span class="memory-subject">${m.subject || '—'}</span>
        <span class="memory-type">${m.type || ''}</span>
        <button class="memory-del-btn" onclick="window.__crmDeleteMemory?.('${m.id}')">✕</button>
      </div>
      <div class="memory-content">${m.content || ''}</div>
    </div>`).join('');
}

export async function deleteMemory(id) {
  if (!id) return;
  const ok = await memoryService.delete(id);
  if (ok) { toast('已刪除記憶'); renderMemPanel(); }
  else    toast('刪除失敗');
}

// ── Memory panel (HTML-facing) ────────────────────────────────────────────────

let _memPanelOpen = false;
let _memType      = '';

export function toggleMemPanel() {
  _memPanelOpen = !_memPanelOpen;
  const panel = document.getElementById('mem-panel');
  const btn   = document.getElementById('mem-toggle-btn');
  if (panel) panel.style.display = _memPanelOpen ? '' : 'none';
  if (btn)   btn.classList.toggle('active', _memPanelOpen);
  if (_memPanelOpen) renderMemPanel();
}

export function switchMemTab(type, el) {
  _memType = type;
  document.querySelectorAll('.mem-tab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderMemPanel();
}

export async function renderMemPanel() {
  const box = document.getElementById('mem-list');
  if (!box) return;
  box.innerHTML = '<div class="mem-empty">載入中…</div>';
  const q = document.getElementById('mem-search')?.value.trim() || '';
  const params = {};
  if (_memType) params.type = _memType;
  if (q)        params.subject = q;
  const memories = await memoryService.list(params);
  if (!memories.length) {
    box.innerHTML = '<div class="mem-empty">尚無記憶</div>';
    return;
  }
  box.innerHTML = memories.map(m => `
    <div class="mem-item">
      <div class="mem-item-header">
        <span class="mem-subject">${m.subject || '—'}</span>
        <span class="mem-type-badge">${m.type || ''}</span>
        <button class="mem-del" onclick="window.__crmDeleteMemory?.('${m.id}')">✕</button>
      </div>
      <div class="mem-content">${m.content || ''}</div>
    </div>`).join('');
}

export async function addManualMemory() {
  const inp = document.getElementById('mem-add-input');
  const txt = inp?.value.trim();
  if (!txt) return;
  const ok = await memoryService.create({ subject: '手動', type: 'fact', content: txt });
  if (ok) { toast('已新增記憶'); if (inp) inp.value = ''; renderMemPanel(); }
  else toast('新增失敗');
}

// ── Daily briefing ────────────────────────────────────────────────────────────

export async function generateDailyBriefing() {
  const inp = document.getElementById('chat-input');
  if (inp) {
    inp.value = '幫我生成今日工作簡報：列出今天需要跟進的人脈、近期活動、以及業績進度摘要。';
    inp.dispatchEvent(new Event('input'));
  }
  await sendChat();
}

// ── AI Diagnostic ─────────────────────────────────────────────────────────────

export function toggleAiDiag() {
  const panel = document.getElementById('ai-diag-panel');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : '';
  if (!visible) _renderDiagConfig();
}

function _renderDiagConfig() {
  const { provider, model, apiKey, endpoint } = getAiSettings();
  const keyMask = apiKey
    ? apiKey.slice(0, 8) + '…' + apiKey.slice(-4)
    : '⚠ 未設定';
  const ep = endpoint || (provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : '（預設）');
  document.getElementById('ai-diag-config').innerHTML = `
    <div class="diag-row"><span class="diag-label">Provider</span><span class="diag-val">${provider}</span></div>
    <div class="diag-row"><span class="diag-label">Model</span><span class="diag-val">${model || '⚠ 未選擇'}</span></div>
    <div class="diag-row"><span class="diag-label">API Key</span><span class="diag-val">${keyMask}</span></div>
    <div class="diag-row"><span class="diag-label">Endpoint</span><span class="diag-val diag-ep">${ep}</span></div>
  `;
  document.getElementById('ai-diag-log').innerHTML = '';
}

function _diagLog(html) {
  const box = document.getElementById('ai-diag-log');
  if (box) box.innerHTML += html + '\n';
}

export async function runAiDiagnostic() {
  const btn = document.getElementById('ai-diag-run-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 測試中…'; }
  const box = document.getElementById('ai-diag-log');
  if (box) box.innerHTML = '';

  const { provider, model, apiKey, endpoint: customEndpoint } = getAiSettings();

  // Step 1: key
  if (!apiKey && provider !== 'claude') {
    _diagLog('❌ <b>API Key 未設定</b> — 請到設定填入 Key');
    if (btn) { btn.disabled = false; btn.textContent = '🚀 測試連線'; }
    return;
  }
  _diagLog('✅ API Key 已填入');

  // Step 2: model
  if (!model) {
    _diagLog('❌ <b>未選擇模型</b> — 請到設定選擇模型（OpenRouter 需先點「載入模型」）');
    if (btn) { btn.disabled = false; btn.textContent = '🚀 測試連線'; }
    return;
  }
  _diagLog(`✅ 模型：${model}`);

  // Step 3: send minimal request
  const url     = getEndpoint(provider, model, customEndpoint);
  const headers = getHeaders(provider, apiKey);
  const body    = buildRequestBody(provider, model, '你是測試助理，只需回覆「OK」。', [{ role: 'user', content: 'hi' }]);
  // override max_tokens for speed
  if (body.max_tokens) body.max_tokens = 30;
  if (body.generationConfig) body.generationConfig.maxOutputTokens = 30;

  _diagLog(`⏳ 呼叫 <code>${url.replace('https://', '')}</code>…`);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      _diagLog(`❌ HTTP ${res.status} (${elapsed}s)<br><code>${errText.slice(0, 300)}</code>`);
    } else {
      const data = await res.json();
      const reply = extractContent(provider, data) || '（空回應）';
      _diagLog(`✅ <b>連線成功</b>（${elapsed}s）<br>回應：「${reply.slice(0, 80)}」`);
    }
  } catch (e) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    _diagLog(`❌ 網路錯誤（${elapsed}s）：${e.message}`);
  }

  if (btn) { btn.disabled = false; btn.textContent = '🚀 測試連線'; }
}

// ── Today reminders ───────────────────────────────────────────────────────────

export function showTodayReminders() {
  // Dynamic import to avoid circular dep with state
  import('../../core/state.js').then(({ getNodes, getStudentsData }) => {
    const today = new Date().toISOString().slice(0, 10);
    const nodes = getNodes().filter(n => n.parentId && n.info?.nextFollowUp === today);
    const students = getStudentsData().filter(s => s.nextFollowUp === today);
    const count = nodes.length + students.length;
    if (!count) { toast('今日沒有待跟進聯繫人'); return; }
    const names = [
      ...nodes.map(n => n.name),
      ...students.map(s => s.name),
    ].slice(0, 10).join('、');
    alert(`📅 今日待跟進（${count} 人）：\n${names}`);
  });
}
