/**
 * features/ai/attachments.js
 * Image + document attachment handling for chat.
 * Supports: images (resize→base64), PDF/text/CSV (read as text).
 * Providers: Claude (content blocks) + OpenAI (image_url / text).
 *
 * Image recognition (two-layer):
 *   📝 OCR  — Tesseract.js (browser, chi_tra+eng) for text-heavy images
 *   👁️ Vision — Gemini Flash 2.0 via /api/vision for photos / complex images
 */

const MAX_IMG_PX  = 1024; // resize to fit within this box
const MAX_IMG_KB  = 1500; // JPEG quality fallback if still too large

// ── Attachment store ──────────────────────────────────────────────────────────

let _attachments = []; // [{ type:'image'|'file', name, mime, data, preview, ocrText? }]

export function getAttachments() { return _attachments; }
export function clearAttachments() {
  _attachments = [];
  renderPreview();
}

// ── File ingestion ────────────────────────────────────────────────────────────

export async function addFiles(files) {
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      const { base64, mime } = await resizeImage(file);
      _attachments.push({ type: 'image', name: file.name, mime, data: base64, preview: `data:${mime};base64,${base64}` });
    } else {
      const text = await readFileAsText(file);
      _attachments.push({ type: 'file', name: file.name, mime: file.type || 'text/plain', data: text, preview: null });
    }
  }
  renderPreview();
}

// ── Resize image using canvas ─────────────────────────────────────────────────

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_IMG_PX || height > MAX_IMG_PX) {
        const ratio = Math.min(MAX_IMG_PX / width, MAX_IMG_PX / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      // Try WebP first, fallback to JPEG
      let dataUrl = canvas.toDataURL('image/webp', 0.85);
      if (dataUrl.length / 1.33 > MAX_IMG_KB * 1024) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.80);
      }
      const [header, base64] = dataUrl.split(',');
      const mime = header.match(/:(.*?);/)[1];
      resolve({ base64, mime });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result || '');
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

// ── Clipboard paste (Ctrl+V) ──────────────────────────────────────────────────

export function initPasteHandler() {
  document.addEventListener('paste', async (e) => {
    const activeEl = document.activeElement;
    const inChat = activeEl?.id === 'chat-input' || activeEl?.closest?.('#page-ai');
    if (!inChat) return;

    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(i => i.type.startsWith('image/'));
    if (!imageItems.length) return;

    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) await addFiles([file]);
    }
  });
}

// ── Build content blocks for API ──────────────────────────────────────────────

/**
 * Returns content array for Claude or OpenAI given text + current attachments.
 * If no attachments, returns plain string (backward compat).
 * If image has ocrText/visionText, inject as text block instead of raw image
 * for providers that don't natively support vision (saves tokens too).
 */
export function buildContent(text, provider, attachments = _attachments) {
  if (!attachments.length) return text || '';

  if (provider === 'claude') {
    const blocks = [];
    for (const a of attachments) {
      if (a.type === 'image') {
        // If we have extracted text, send both image + text annotation
        if (a.ocrText || a.visionText) {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } });
          const annot = [a.ocrText && `【OCR文字】\n${a.ocrText}`, a.visionText && `【圖片描述】\n${a.visionText}`].filter(Boolean).join('\n\n');
          blocks.push({ type: 'text', text: `【圖片分析：${a.name}】\n${annot}` });
        } else {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } });
        }
      } else {
        blocks.push({ type: 'text', text: `【附件：${a.name}】\n${a.data.slice(0, 8000)}` });
      }
    }
    if (text) blocks.push({ type: 'text', text });
    return blocks;
  }

  // OpenAI / compatible
  const parts = [];
  for (const a of attachments) {
    if (a.type === 'image') {
      if (a.ocrText || a.visionText) {
        parts.push({ type: 'image_url', image_url: { url: `data:${a.mime};base64,${a.data}` } });
        const annot = [a.ocrText && `【OCR文字】\n${a.ocrText}`, a.visionText && `【圖片描述】\n${a.visionText}`].filter(Boolean).join('\n\n');
        parts.push({ type: 'text', text: `【圖片分析：${a.name}】\n${annot}` });
      } else {
        parts.push({ type: 'image_url', image_url: { url: `data:${a.mime};base64,${a.data}` } });
      }
    } else {
      parts.push({ type: 'text', text: `【附件：${a.name}】\n${a.data.slice(0, 8000)}` });
    }
  }
  if (text) parts.push({ type: 'text', text });
  return parts;
}

// ── Tesseract.js OCR ──────────────────────────────────────────────────────────

let _tesseractWorker = null;

async function getTesseractWorker() {
  if (_tesseractWorker) return _tesseractWorker;

  // Lazy-load Tesseract.js from CDN
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Create worker with Traditional Chinese + English
  _tesseractWorker = await window.Tesseract.createWorker(['chi_tra', 'eng'], 1, {
    workerPath:   'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    langPath:     'https://tessdata.projectnaptha.com/4.0.0',
    corePath:     'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js',
    logger: () => {}, // suppress progress logs
  });
  return _tesseractWorker;
}

async function runOCR(index) {
  const a = _attachments[index];
  if (!a || a.type !== 'image') return;

  setThumbStatus(index, 'ocr', 'loading', '⏳ OCR中…');
  try {
    const worker = await getTesseractWorker();
    const { data: { text } } = await worker.recognize(`data:${a.mime};base64,${a.data}`);
    const cleaned = text.trim();
    if (!cleaned) {
      setThumbStatus(index, 'ocr', 'empty', '（未偵測到文字）');
      return;
    }
    _attachments[index].ocrText = cleaned;
    setThumbStatus(index, 'ocr', 'done', cleaned);
  } catch (e) {
    setThumbStatus(index, 'ocr', 'error', `OCR失敗：${e.message.slice(0, 60)}`);
  }
}

// ── Gemini Flash Vision ───────────────────────────────────────────────────────

async function runVision(index) {
  const a = _attachments[index];
  if (!a || a.type !== 'image') return;

  setThumbStatus(index, 'vision', 'loading', '⏳ Gemini辨識中…');
  try {
    const res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: a.data, mime: a.mime }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    const text = (data.text || '').trim();
    if (!text) {
      setThumbStatus(index, 'vision', 'empty', '（無描述）');
      return;
    }
    _attachments[index].visionText = text;
    setThumbStatus(index, 'vision', 'done', text);
  } catch (e) {
    setThumbStatus(index, 'vision', 'error', `Vision失敗：${e.message.slice(0, 60)}`);
  }
}

// ── Preview UI ────────────────────────────────────────────────────────────────

export function renderPreview() {
  const bar = document.getElementById('chat-attach-preview');
  if (!bar) return;
  if (!_attachments.length) { bar.innerHTML = ''; return; }

  bar.innerHTML = _attachments.map((a, i) => {
    if (a.type === 'image') {
      const hasOcr    = !!a.ocrText;
      const hasVision = !!a.visionText;
      return `<div class="attach-thumb" id="attach-thumb-${i}">
        <img src="${a.preview}" alt="${a.name}">
        <button class="attach-remove" onclick="window.__crmRemoveAttach?.(${i})">×</button>
        <div class="attach-actions">
          <button class="attach-action-btn ${hasOcr ? 'done' : ''}" onclick="window.__crmRunOCR?.(${i})" title="OCR文字辨識">📝</button>
          <button class="attach-action-btn ${hasVision ? 'done' : ''}" onclick="window.__crmRunVision?.(${i})" title="Gemini圖片描述">👁️</button>
        </div>
        <div class="attach-result" id="attach-result-ocr-${i}" style="display:none"></div>
        <div class="attach-result" id="attach-result-vision-${i}" style="display:none"></div>
      </div>`;
    }
    return `<div class="attach-thumb attach-file" id="attach-thumb-${i}">
      <span class="attach-thumb-name">📄 ${a.name}</span>
      <button class="attach-remove" onclick="window.__crmRemoveAttach?.(${i})">×</button>
    </div>`;
  }).join('');

  window.__crmRemoveAttach = (i) => {
    _attachments.splice(i, 1);
    renderPreview();
  };

  window.__crmRunOCR = (i) => runOCR(i);
  window.__crmRunVision = (i) => runVision(i);

  window.__crmInsertText = (text) => {
    const inp = document.getElementById('chat-input');
    if (!inp) return;
    inp.value += (inp.value ? '\n' : '') + text;
    inp.dispatchEvent(new Event('input'));
    inp.focus();
  };
}

// ── Thumb status helper ───────────────────────────────────────────────────────

function setThumbStatus(index, type, state, text) {
  const el = document.getElementById(`attach-result-${type}-${index}`);
  if (!el) return;
  el.style.display = '';
  const label = type === 'ocr' ? '📝 OCR' : '👁️ Vision';
  const shortText = text.length > 120 ? text.slice(0, 120) + '…' : text;

  if (state === 'loading') {
    el.className = 'attach-result loading';
    el.innerHTML = `<span>${text}</span>`;
    return;
  }
  if (state === 'error' || state === 'empty') {
    el.className = 'attach-result error';
    el.innerHTML = `<span>${text}</span>`;
    return;
  }
  // done — show result with insert button
  el.className = 'attach-result done';
  el.innerHTML = `
    <div class="attach-result-header">
      <strong>${label}</strong>
      <button class="attach-insert-btn" onclick="window.__crmInsertText?.(${JSON.stringify(text)})">✓ 插入對話</button>
    </div>
    <div class="attach-result-text">${escHtml(shortText)}</div>`;

  // Also update the action button to show "done" state
  const btn = document.querySelector(`#attach-thumb-${index} .attach-action-btn:${type === 'ocr' ? 'first-child' : 'last-child'}`);
  if (btn) btn.classList.add('done');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
