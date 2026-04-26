/**
 * features/docs/index.js
 * 知識庫文件管理：CRUD + 搜尋 + 拖放上傳
 * 依賴：core/state.js, core/toast.js, core/uid.js
 */

import { getDocsData, dispatch } from '../../core/state.js';
import { toast } from '../../core/toast.js';
import { uid } from '../../core/uid.js';

const TYPE_LABELS = { file: '📄 文件', link: '🔗 連結', form: '📋 表單', poster: '🖼 海報' };

let _editingDocId  = null;
let _searchQuery   = '';
let _pendingFile   = null;   // File object from drag-drop / input

function escHtml(s) {
  if (!s && s !== 0) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render docs grid ──────────────────────────────────────────────────────────

export function renderDocsPage() {
  const docs = getDocsData();
  const q    = _searchQuery.toLowerCase();
  const filtered = q
    ? docs.filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q) ||
        (d.tags || []).some(t => t.toLowerCase().includes(q))
      )
    : docs;

  // HTML uses #docs-grid inside the dropzone
  const el = document.getElementById('docs-grid');
  if (!el) return;

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state">${q ? '沒有符合的文件' : '尚無文件，點「新增」或拖曳檔案'}</div>`;
    return;
  }

  el.innerHTML = filtered.map(d => `
    <div class="doc-card" onclick="window.__crmOpenDocModal?.('${d.id}')">
      <div class="doc-card-header">
        <span class="doc-type-badge">${TYPE_LABELS[d.type] || '📄'}</span>
        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();window.__crmDeleteDoc?.('${d.id}')">🗑</button>
      </div>
      <div class="doc-name">${escHtml(d.name)}</div>
      ${d.description ? `<div class="doc-desc">${escHtml(d.description)}</div>` : ''}
      ${d.url ? `<a class="doc-link" href="${escHtml(d.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escHtml(d.url).slice(0,60)}${d.url.length>60?'…':''}</a>` : ''}
      ${d.imgDataUrl ? `<img src="${escHtml(d.imgDataUrl)}" style="max-height:80px;border-radius:6px;margin-top:6px;object-fit:cover;width:100%">` : ''}
      ${(d.tags||[]).length ? `<div class="doc-tags">${d.tags.map(t=>`<span class="tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
    </div>`).join('');
}

export function setDocsSearch(q) {
  _searchQuery = q || '';
  renderDocsPage();
}

// ── Full-page drag-drop ───────────────────────────────────────────────────────

export function docsOnDragOver(e) {
  e.preventDefault();
  document.getElementById('docs-dropzone')?.classList.add('dragover');
}

export function docsOnDragLeave(e) {
  if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
    document.getElementById('docs-dropzone')?.classList.remove('dragover');
  }
}

export function docsOnDrop(e) {
  e.preventDefault();
  document.getElementById('docs-dropzone')?.classList.remove('dragover');
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  // Open modal for first file; queue remaining
  _setModalFile(files[0]);
  openDocModal(null);
  if (files.length > 1) toast(`共 ${files.length} 個檔案，請逐一儲存`);
}

// ── Modal file drop zone ──────────────────────────────────────────────────────

export function modalFileOver(e) {
  e.preventDefault();
  document.getElementById('doc-file-dropzone')?.classList.add('dragover');
}

export function modalFileLeave(e) {
  document.getElementById('doc-file-dropzone')?.classList.remove('dragover');
}

export function modalFileDrop(e) {
  e.preventDefault();
  document.getElementById('doc-file-dropzone')?.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) _setModalFile(file);
}

export function modalFileChange(input) {
  const file = input?.files?.[0];
  if (file) _setModalFile(file);
}

function _setModalFile(file) {
  _pendingFile = file;
  document.getElementById('doc-file-label').textContent = file.name;
  document.getElementById('doc-file-icon').textContent  = file.type.startsWith('image/') ? '🖼' : '📄';
  // Preview image
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.getElementById('doc-img-preview');
      if (img) { img.src = e.target.result; img.style.display = ''; }
    };
    reader.readAsDataURL(file);
  }
  // Auto-fill name if empty
  const nameEl = document.getElementById('doc-name');
  if (nameEl && !nameEl.value) nameEl.value = file.name.replace(/\.[^.]+$/, '');
}

// ── onDocTypeChange ───────────────────────────────────────────────────────────

export function onDocTypeChange() {
  const type = document.getElementById('doc-type')?.value;
  const urlGroup  = document.getElementById('doc-url-group');
  const fileGroup = document.getElementById('doc-file-group');
  const needFile  = type === 'poster' || type === 'file';
  if (urlGroup)  urlGroup.style.display  = needFile ? 'none' : '';
  if (fileGroup) fileGroup.style.display = needFile ? ''     : 'none';
}

// ── Modal open/close ──────────────────────────────────────────────────────────

export function openDocModal(id) {
  _editingDocId = id || null;
  _pendingFile  = null;
  const docs = getDocsData();
  const d = id ? docs.find(x => x.id === id) : null;

  // Reset modal fields
  const nameEl = document.getElementById('doc-name');
  const urlEl  = document.getElementById('doc-url');
  const typeEl = document.getElementById('doc-type');
  const fileLabel = document.getElementById('doc-file-label');
  const fileIcon  = document.getElementById('doc-file-icon');
  const imgPrev   = document.getElementById('doc-img-preview');

  if (nameEl) nameEl.value = d?.name || '';
  if (urlEl)  urlEl.value  = d?.url  || '';
  if (typeEl) typeEl.value = d?.type || 'poster';
  if (fileLabel) fileLabel.textContent = '點擊選擇 或 拖曳檔案至此';
  if (fileIcon)  fileIcon.textContent  = '⬆';
  if (imgPrev)   { imgPrev.src = ''; imgPrev.style.display = 'none'; }
  if (d?.imgDataUrl && imgPrev) { imgPrev.src = d.imgDataUrl; imgPrev.style.display = ''; }

  onDocTypeChange();
  document.getElementById('doc-add-modal')?.classList.add('open');
}

export function closeDocModal() {
  document.getElementById('doc-add-modal')?.classList.remove('open');
  _editingDocId = null;
  _pendingFile  = null;
}

export function saveDoc() {
  const name = document.getElementById('doc-name')?.value.trim();
  if (!name) { toast('請輸入名稱'); return; }
  const type = document.getElementById('doc-type')?.value || 'link';

  const persist = () => {
    const doc = {
      id:         _editingDocId || uid(),
      type,
      name,
      url:        document.getElementById('doc-url')?.value.trim() || '',
      imgDataUrl: _pendingFile ? (document.getElementById('doc-img-preview')?.src || '') : undefined,
      updatedAt:  new Date().toISOString(),
    };
    if (!doc.imgDataUrl) delete doc.imgDataUrl;

    if (_editingDocId) {
      dispatch({ type: 'DOC_UPDATE', payload: { id: _editingDocId, patch: doc } });
      toast('文件已更新');
    } else {
      dispatch({ type: 'DOC_ADD', payload: doc });
      toast('文件已新增');
    }
    closeDocModal();
    renderDocsPage();
  };

  // If image pending, ensure DataURL is ready
  if (_pendingFile && _pendingFile.type.startsWith('image/')) {
    const img = document.getElementById('doc-img-preview');
    if (img && img.src && img.src.startsWith('data:')) { persist(); return; }
    const reader = new FileReader();
    reader.onload = e => {
      if (img) img.src = e.target.result;
      persist();
    };
    reader.readAsDataURL(_pendingFile);
  } else {
    persist();
  }
}

export function deleteDoc(id) {
  if (!id || !confirm('確定刪除此文件？')) return;
  dispatch({ type: 'DOC_DELETE', payload: id });
  renderDocsPage();
  toast('已刪除');
}
