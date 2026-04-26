/**
 * features/events/index.js
 * 活動月曆頁：renderCalendar, openEventModal, saveEvent, deleteEvent
 * 依賴：core/state.js, core/toast.js, core/uid.js
 */

import { getEvents, getNodes, dispatch } from '../../core/state.js';
import { toast } from '../../core/toast.js';
import { uid } from '../../core/uid.js';

// CMD 由 main.js 注入
let _CMD = null;
export function setCMD(cmd) { _CMD = cmd; }

const EV_TYPES = ['分享會', '專場', '訓練', '二對一'];
let _editingEventId = null;
let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth(); // 0-based

function escHtml(s) {
  if (!s && s !== 0) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Calendar navigation ───────────────────────────────────────────────────────

export function calPrev()    { _calMonth--; if (_calMonth < 0)  { _calMonth = 11; _calYear--; } renderCalendar(); }
export function calNext()    { _calMonth++; if (_calMonth > 11) { _calMonth = 0;  _calYear++; } renderCalendar(); }
export function calGoToday() { const d = new Date(); _calYear = d.getFullYear(); _calMonth = d.getMonth(); renderCalendar(); }

// Alias
export const renderEvents = () => renderCalendar();

// ── renderCalendar ────────────────────────────────────────────────────────────

export function renderCalendar() {
  const label = document.getElementById('cal-month-label');
  if (!label) return;
  const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  label.textContent = `${_calYear} 年 ${MONTHS[_calMonth]}`;

  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const today      = new Date().toISOString().slice(0, 10);
  const firstDay   = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const daysInPrev  = new Date(_calYear, _calMonth, 0).getDate();
  const events = getEvents();

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, month: _calMonth - 1, year: _calMonth === 0 ? _calYear - 1 : _calYear, other: true });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, month: _calMonth, year: _calYear, other: false });
  const needed = 42 - cells.length;
  for (let d = 1; d <= needed; d++)
    cells.push({ day: d, month: _calMonth + 1, year: _calMonth === 11 ? _calYear + 1 : _calYear, other: true });

  grid.innerHTML = cells.map(c => {
    const dateStr = `${c.year}-${String(c.month + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
    const isToday = dateStr === today;
    const dayEvents = events.filter(ev => ev.date === dateStr);
    const chips = dayEvents.slice(0, 3).map(ev =>
      `<div class="cal-chip" data-type="${ev.type || ''}" onclick="event.stopPropagation();window.__crmOpenEventModal?.('${ev.id}')">${escHtml(ev.type || ev.name || '活動')}</div>`
    ).join('');
    const more = dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length - 3} 更多</div>` : '';
    return `<div class="cal-cell${c.other ? ' other-month' : ''}${isToday ? ' today' : ''}" onclick="window.__crmOpenEventModal?.(null,'${dateStr}')">
      <div class="cal-day-num">${c.day}</div>${chips}${more}</div>`;
  }).join('');
}

// ── Event modal ───────────────────────────────────────────────────────────────

export function openEventModal(id, defaultDate) {
  if (_CMD && !_CMD.allowed('event.open')) { toast('此指令已被停用'); return; }
  _editingEventId = id || null;
  const events = getEvents();
  const ev = id ? events.find(e => e.id === id) : null;

  document.getElementById('event-modal-title').textContent = ev ? '編輯活動' : '新增活動';
  const dateVal  = ev?.date || defaultDate || '';
  const selPax   = ev?.participants || [];
  const contactNodes = getNodes().filter(n => n.status !== null && n.name && n.name !== '新聯繫人');
  const typeOpts = EV_TYPES.map(t => `<option value="${t}"${(ev?.type || '分享會') === t ? ' selected' : ''}>${t}</option>`).join('');
  const paxTags  = contactNodes.length
    ? contactNodes.map(n => `
      <div class="ev-pax${selPax.includes(n.id) ? ' selected' : ''}" data-nid="${n.id}" onclick="this.classList.toggle('selected')">
        <span class="sdot ${n.status || 'gray'}"></span>${escHtml(n.name)}
      </div>`).join('')
    : '<span style="color:var(--text-muted);font-size:12px">尚無人脈節點</span>';

  document.getElementById('event-modal-body').innerHTML = `
    <div class="field-row">
      <div class="field-group"><div class="field-label">類型</div><select class="field-input" id="ev-type">${typeOpts}</select></div>
      <div class="field-group"><div class="field-label">日期</div><input class="field-input" type="date" id="ev-date" value="${dateVal}"></div>
    </div>
    <div class="field-row">
      <div class="field-group"><div class="field-label">時間</div><input class="field-input" type="time" id="ev-time" value="${ev?.time || ''}"></div>
      <div class="field-group"><div class="field-label">地點</div><input class="field-input" id="ev-location" value="${escHtml(ev?.location || '')}" placeholder="地點"></div>
    </div>
    <div class="field-group"><div class="field-label">邀約人脈</div><div class="ev-participants">${paxTags}</div></div>
    <div class="field-group"><div class="field-label">備注</div><textarea class="field-input field-textarea" id="ev-notes" placeholder="備注">${escHtml(ev?.notes || '')}</textarea></div>
    ${ev ? `<div style="margin-top:8px"><button class="btn btn-danger btn-sm" onclick="window.__crmDeleteEvent?.('${ev.id}');window.__crmCloseEventModal?.()">🗑 刪除此活動</button></div>` : ''}`;
  document.getElementById('event-modal')?.classList.add('open');
}

export function closeEventModal() {
  document.getElementById('event-modal')?.classList.remove('open');
  _editingEventId = null;
}

export function saveEvent() {
  if (_CMD && !_CMD.allowed('event.save')) { toast('此指令已被停用'); return; }
  const type = document.getElementById('ev-type')?.value;
  const participants = [...document.querySelectorAll('#event-modal .ev-pax.selected')].map(el => el.dataset.nid);
  const ev = {
    id:   _editingEventId || uid(),
    type, name: type,
    date:     document.getElementById('ev-date')?.value || '',
    time:     document.getElementById('ev-time')?.value || '',
    location: document.getElementById('ev-location')?.value || '',
    participants,
    notes:    document.getElementById('ev-notes')?.value || '',
  };
  if (_editingEventId) {
    dispatch({ type: 'EVENT_UPDATE', payload: { id: _editingEventId, patch: ev } });
  } else {
    dispatch({ type: 'EVENT_ADD', payload: ev });
  }
  closeEventModal();
  renderCalendar();
  toast(_editingEventId ? '活動已更新' : '活動已新增');
}

export function deleteEvent(id) {
  if (_CMD && !_CMD.allowed('event.delete')) { toast('此指令已被停用'); return; }
  if (!confirm('確定刪除此活動？')) return;
  dispatch({ type: 'EVENT_DELETE', payload: id });
  renderCalendar();
  toast('活動已刪除');
}
