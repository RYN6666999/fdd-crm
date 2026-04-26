/**
 * features/students/index.js
 * 學員管理頁：CRUD + 聯繫紀錄 + 搜尋
 * 依賴：core/state.js, core/toast.js, models/student.js
 */

import { getStudentsData, dispatch } from '../../core/state.js';
import { toast } from '../../core/toast.js';
import { newStudent, newContact, escHtml, slugResult, getNextFollowUp, getLastContact } from '../../models/student.js';
import { STUDENT_FIXED_TAGS, CONTACT_METHODS, CONTACT_RESULTS } from '../../contracts/types.js';

let _editingStudentId = null;
let _searchQuery      = '';

// ── Render students list ──────────────────────────────────────────────────────

export function renderStudentsPage() {
  const students = getStudentsData();
  const q = _searchQuery.toLowerCase();
  const filtered = q
    ? students.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q) ||
        (s.tags || []).some(t => t.toLowerCase().includes(q))
      )
    : students;

  const el = document.getElementById('students-list');
  if (!el) return;

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state">${q ? '沒有符合的學員' : '尚無學員，點「新增學員」開始'}</div>`;
    return;
  }

  el.innerHTML = filtered.map(s => {
    const last = getLastContact(s);
    const next = getNextFollowUp(s);
    const tags = (s.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
    return `<div class="student-card" onclick="window.__crmOpenStudentModal?.('${s.id}')">
      <div class="student-header">
        <span class="student-name">${escHtml(s.name || '未命名')}</span>
        ${s.phone ? `<span class="student-phone">${escHtml(s.phone)}</span>` : ''}
        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();window.__crmDeleteStudent?.('${s.id}')">🗑</button>
      </div>
      ${tags ? `<div class="student-tags">${tags}</div>` : ''}
      <div class="student-meta">
        ${last ? `最後聯繫：${last.date}` : '尚未聯繫'}
        ${next ? `　下次跟進：${next}` : ''}
      </div>
    </div>`;
  }).join('');
}

export function setStudentsSearch(q) {
  _searchQuery = q || '';
  renderStudentsPage();
}

// ── Student modal ─────────────────────────────────────────────────────────────

export function openStudentModal(id) {
  _editingStudentId = id || null;
  const students = getStudentsData();
  const s = id ? students.find(x => x.id === id) : null;

  const tagCheckboxes = STUDENT_FIXED_TAGS.map(t =>
    `<label class="tag-checkbox"><input type="checkbox" value="${t.id}"${(s?.tags || []).includes(t.id) ? ' checked' : ''}> ${escHtml(t.label)}</label>`
  ).join('');

  const contactRows = (s?.contacts || []).slice(-5).reverse().map(c => `
    <tr>
      <td>${c.date || ''}</td>
      <td>${escHtml(c.method || '')}</td>
      <td>${escHtml(c.result || '')}</td>
      <td>${escHtml(c.note  || '')}</td>
    </tr>`).join('');

  const titleEl = document.querySelector('.student-drawer-title');
  if (titleEl) titleEl.textContent = s ? `${s.name} — 學員資料` : '新增學員';

  document.getElementById('student-drawer-body').innerHTML = `
    <div class="field-row">
      <div class="field-group"><div class="field-label">姓名</div><input class="field-input" id="st-name" value="${escHtml(s?.name || '')}" placeholder="姓名"></div>
      <div class="field-group"><div class="field-label">電話</div><input class="field-input" id="st-phone" value="${escHtml(s?.phone || '')}" placeholder="手機號碼"></div>
    </div>
    <div class="field-row">
      <div class="field-group"><div class="field-label">Line ID</div><input class="field-input" id="st-line" value="${escHtml(s?.lineId || '')}" placeholder="Line ID"></div>
      <div class="field-group"><div class="field-label">下次跟進</div><input class="field-input" type="date" id="st-followup" value="${escHtml(s?.nextFollowUp || '')}"></div>
    </div>
    <div class="field-group"><div class="field-label">標籤</div><div class="tag-checkboxes">${tagCheckboxes}</div></div>
    <div class="field-group"><div class="field-label">備注</div><textarea class="field-input field-textarea" id="st-notes" placeholder="備注">${escHtml(s?.notes || '')}</textarea></div>
    ${s ? `
    <div class="section-divider">聯繫記錄</div>
    <div class="field-row">
      <div class="field-group"><div class="field-label">方式</div>
        <select class="field-input" id="st-contact-method">
          ${CONTACT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
      </div>
      <div class="field-group"><div class="field-label">結果</div>
        <select class="field-input" id="st-contact-result">
          ${CONTACT_RESULTS.map(r => `<option value="${r}">${escHtml(r)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-group"><div class="field-label">備注</div><input class="field-input" id="st-contact-note" placeholder="聯繫備注"></div>
    <button class="btn btn-sm" onclick="window.__crmLogStudentContact?.('${s.id}')">＋ 記錄聯繫</button>
    ${contactRows ? `
    <table class="data-table" style="margin-top:8px">
      <thead><tr><th>日期</th><th>方式</th><th>結果</th><th>備注</th></tr></thead>
      <tbody>${contactRows}</tbody>
    </table>` : ''}
    ` : ''}
    ${s ? `<div style="margin-top:8px"><button class="btn btn-danger btn-sm" onclick="window.__crmDeleteStudent?.('${s.id}');window.__crmCloseStudentModal?.()">🗑 刪除學員</button></div>` : ''}
    <div class="modal-actions" style="margin-top:16px">
      <button class="btn" onclick="window.__crmCloseStudentModal?.()">取消</button>
      <button class="btn btn-accent" onclick="window.__crmSaveStudent?.()">儲存</button>
    </div>`;

  document.getElementById('student-drawer')?.classList.add('open');
  document.getElementById('student-drawer-overlay')?.classList.add('show');
}

export function closeStudentModal() {
  document.getElementById('student-drawer')?.classList.remove('open');
  document.getElementById('student-drawer-overlay')?.classList.remove('show');
  _editingStudentId = null;
}

export function saveStudent() {
  const name = document.getElementById('st-name')?.value.trim();
  if (!name) { toast('請輸入姓名'); return; }
  const checkedTags = [...document.querySelectorAll('#student-drawer-body .tag-checkbox input:checked')].map(el => el.value);
  const existing = _editingStudentId ? getStudentsData().find(s => s.id === _editingStudentId) : null;

  const s = {
    ...(existing || newStudent()),
    id:          _editingStudentId || existing?.id || newStudent().id,
    name,
    phone:       document.getElementById('st-phone')?.value.trim()   || '',
    lineId:      document.getElementById('st-line')?.value.trim()    || '',
    nextFollowUp: document.getElementById('st-followup')?.value      || '',
    notes:       document.getElementById('st-notes')?.value.trim()   || '',
    tags:        checkedTags,
    updatedAt:   new Date().toISOString(),
  };

  if (_editingStudentId) {
    dispatch({ type: 'STUDENT_UPDATE', payload: { id: _editingStudentId, patch: s } });
    toast('學員資料已更新');
  } else {
    dispatch({ type: 'STUDENT_ADD', payload: s });
    toast('學員已新增');
  }
  closeStudentModal();
  renderStudentsPage();
}

export function logStudentContact(studentId) {
  const method = document.getElementById('st-contact-method')?.value || '';
  const result = document.getElementById('st-contact-result')?.value || '';
  const note   = document.getElementById('st-contact-note')?.value.trim() || '';
  const today  = new Date().toISOString().slice(0, 10);
  const students = getStudentsData();
  const s = students.find(x => x.id === studentId);
  if (!s) return;
  const entry = newContact();
  Object.assign(entry, { date: today, method, result, note });
  const contacts = [...(s.contacts || []), entry];
  dispatch({ type: 'STUDENT_UPDATE', payload: { id: studentId, patch: { contacts, lastContactDate: today } } });
  toast('聯繫紀錄已記錄');
  openStudentModal(studentId);
}

export function deleteStudent(id) {
  if (!id || !confirm('確定刪除此學員？')) return;
  dispatch({ type: 'STUDENT_DELETE', payload: id });
  renderStudentsPage();
  toast('已刪除');
}
