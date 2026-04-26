/**
 * features/daily/index.js
 * 日報表：完整移植 crm.js 原始功能
 * 依賴：core/state.js, core/toast.js, core/calc.js, core/store.js
 */

import { getDailyReports, getMonthlyGoals, getMonthlySalesTargets, getSalesData, getNodes, dispatch } from '../../core/state.js';
import { STORE } from '../../core/store.js';
import { CALC } from '../../core/calc.js';
import { toast } from '../../core/toast.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAILY_TIMES = [
  '08:00','09:00','09:30','10:00','10:30','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00',
  '20:00','21:00','22:00','23:00',
];

const DAILY_KPI = [
  { k: 'act-invite',   label: '邀約', mk: 'mg-invite'   },
  { k: 'act-calls',    label: '電話', mk: 'mg-calls'    },
  { k: 'act-forms',    label: '問卷', mk: 'mg-forms'    },
  { k: 'act-followup', label: '跟進', mk: 'mg-followup' },
  { k: 'act-close',    label: '成交', mk: 'mg-close'    },
];

// ── Date state ────────────────────────────────────────────────────────────────

let _viewDate = new Date().toISOString().slice(0, 10);

export function dailyToday() {
  _viewDate = new Date().toISOString().slice(0, 10);
  const inp = document.getElementById('daily-date-input');
  if (inp) inp.value = _viewDate;
  renderDailyPage();
}

export function dailyPrev() {
  const d = new Date(_viewDate); d.setDate(d.getDate() - 1);
  _viewDate = d.toISOString().slice(0, 10);
  const inp = document.getElementById('daily-date-input');
  if (inp) inp.value = _viewDate;
  renderDailyPage();
}

export function dailyNext() {
  const d = new Date(_viewDate); d.setDate(d.getDate() + 1);
  _viewDate = d.toISOString().slice(0, 10);
  const inp = document.getElementById('daily-date-input');
  if (inp) inp.value = _viewDate;
  renderDailyPage();
}

function _dateStr() {
  const inp = document.getElementById('daily-date-input');
  return (inp && inp.value) ? inp.value : _viewDate;
}

function _getMonthKey(ds) { return (ds || _dateStr()).slice(0, 7); }

// ── Data helpers ──────────────────────────────────────────────────────────────

function _getDR(ds) {
  const r = getDailyReports()[ds] || {};
  return {
    schedule:    r.schedule    || DAILY_TIMES.map(t => ({ time: t, planned: '', achieved: '', review: '' })),
    bigThree:    r.bigThree    || Array(3).fill(null).map(() => ({ task: '', goal: '', verify: '' })),
    connections: r.connections || [{ who: '', topic: '', nextStep: '', hasGoal: false }],
    gratitude:   r.gratitude   || Array(5).fill(''),
    optimize:    r.optimize    || Array(5).fill(''),
    tomorrow:    r.tomorrow    || '',
    ...Object.fromEntries(DAILY_KPI.map(i => [i.k, r[i.k] || 0])),
  };
}

function _patch(ds, patch) {
  dispatch({ type: 'DAILY_REPORT_PATCH', payload: { date: ds, patch } });
}

// ── Inline save handlers (called from oninput/onblur in rendered HTML) ────────

export function updateScheduleSlot(idx, field, value) {
  const ds = _dateStr();
  const r  = getDailyReports()[ds] || {};
  const schedule = r.schedule || DAILY_TIMES.map(t => ({ time: t, planned: '', achieved: '', review: '' }));
  schedule[idx] = { ...schedule[idx], [field]: value };
  _patch(ds, { schedule: [...schedule] });
}

export function updateBigThree(idx, field, value) {
  const ds = _dateStr();
  const r  = getDailyReports()[ds] || {};
  const bt = r.bigThree || Array(3).fill(null).map(() => ({ task: '', goal: '', verify: '' }));
  bt[idx] = { ...bt[idx], [field]: value };
  _patch(ds, { bigThree: [...bt] });
}

export function updateDailyConn(idx, field, value) {
  const ds = _dateStr();
  const r  = getDailyReports()[ds] || {};
  const conn = [...(r.connections || [])];
  while (conn.length <= idx) conn.push({ who: '', topic: '', nextStep: '', hasGoal: false });
  conn[idx] = { ...conn[idx], [field]: value };
  _patch(ds, { connections: conn });
}

export function addDailyConn() {
  const ds = _dateStr();
  const r  = getDailyReports()[ds] || {};
  const conn = [...(r.connections || []), { who: '', topic: '', nextStep: '', hasGoal: false }];
  _patch(ds, { connections: conn });
  renderDailyPage();
}

export function removeDailyConn(idx) {
  const ds = _dateStr();
  const r  = getDailyReports()[ds] || {};
  const conn = (r.connections || []).filter((_, i) => i !== idx);
  _patch(ds, { connections: conn });
  renderDailyPage();
}

export function updateReflect(type, idx, value) {
  const ds = _dateStr();
  const r  = getDailyReports()[ds] || {};
  const arr = [...(r[type] || Array(5).fill(''))];
  arr[idx] = value;
  _patch(ds, { [type]: arr });
}

export function saveDailyActInline(el) {
  const k = el?.dataset?.daily;
  if (!k) return;
  _patch(_dateStr(), { [k]: parseInt(el.value) || 0 });
  updateMonthlyProgressBars();
}

export function loadYestTomorrow() {
  const ds = _dateStr();
  const prev = new Date(ds); prev.setDate(prev.getDate() - 1);
  const ps = prev.toISOString().slice(0, 10);
  const yr = getDailyReports()[ps];
  if (!yr?.tomorrow?.trim()) { toast('昨日無「明天要做」記錄'); return; }
  const r = getDailyReports()[ds] || {};
  const schedule = r.schedule || DAILY_TIMES.map(t => ({ time: t, planned: '', achieved: '', review: '' }));
  const slot = schedule.find(s => !s.planned.trim());
  if (slot) slot.planned = '[昨]' + yr.tomorrow.split('\n')[0].slice(0, 18);
  _patch(ds, { schedule: [...schedule] });
  renderDailyPage();
  toast('✅ 已帶入昨日計畫');
}

// ── Save button ───────────────────────────────────────────────────────────────

export function saveDailyReport() {
  const ds   = _dateStr();
  const body = document.getElementById('daily-body');
  if (!body) return;
  const patch = {};
  DAILY_KPI.forEach(i => {
    const el = body.querySelector(`[data-daily="${i.k}"]`);
    if (el) patch[i.k] = parseInt(el.value) || 0;
  });
  _patch(ds, patch);
  renderMonthlyProgress();
  toast('✅ 已儲存');
}

// ── Monthly goals ─────────────────────────────────────────────────────────────

export function saveMonthSalesTarget() {
  const mkey = _getMonthKey();
  const el = document.querySelector('[data-mst="mg-sales"]');
  if (!el) return;
  const val = parseInt(el.value.replace(/[^\d]/g, '')) || 0;
  dispatch({ type: 'MONTHLY_SALES_TARGETS_PATCH', payload: { [mkey]: val } });
  // Update progress bar without re-rendering
  const sp = CALC.salesProgress(getSalesData(), STORE.getMyRate(), mkey, val);
  const bar = el.closest('.daily-kpi-card')?.querySelector('[data-progress-bar]');
  if (bar) bar.style.width = sp.pct + '%';
}

export function saveMonthlyGoalInputs() {
  const mkey = _getMonthKey();
  const goals = { ...(getMonthlyGoals()[mkey] || {}) };
  ['mg-invite','mg-calls','mg-forms','mg-followup','mg-close'].forEach(k => {
    const el = document.querySelector(`[data-mg="${k}"]`);
    if (el) goals[k] = parseInt(el.value) || 0;
  });
  dispatch({ type: 'MONTHLY_GOALS_PATCH', payload: { [mkey]: goals } });
  updateMonthlyProgressBars();
}

export function updateMonthlyProgressBars() {
  const mkey   = _getMonthKey();
  const goals  = getMonthlyGoals()[mkey] || {};
  const actuals = CALC.monthActuals(getDailyReports(), mkey);
  const items  = CALC.progressItems(actuals, goals);
  items.forEach(it => {
    const card  = document.querySelector(`[data-mg="${it.goalK}"]`)?.closest('.daily-kpi-card');
    if (!card) return;
    const bar   = card.querySelector('[data-progress-bar]');
    const label = card.querySelector('[data-progress-label]');
    if (bar)   bar.style.width = it.pct + '%';
    if (label) label.textContent = `實績 ${it.actual} · ${it.pct}%`;
    card.classList.toggle('exceeded', it.full);
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Monthly progress (left column, top) ──────────────────────────────────────

export function renderMonthlyProgress() {
  const mkey   = _getMonthKey();
  const goals  = getMonthlyGoals()[mkey] || {};
  const actuals = CALC.monthActuals(getDailyReports(), mkey);
  const items  = CALC.progressItems(actuals, goals).filter(i => i.k !== 'consult');
  const sp     = CALC.salesProgress(getSalesData(), STORE.getMyRate(), mkey, getMonthlySalesTargets()[mkey] || 0);
  const cont   = document.getElementById('monthly-goal-body');
  if (!cont) return;

  const mLabel = `${mkey.slice(0,4)}年${parseInt(mkey.slice(5))}月`;
  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <span style="font-size:12px;font-weight:700;white-space:nowrap;color:var(--text-muted)">💰 業績目標</span>
      <input data-mst="mg-sales" data-nodraft="true" type="number" min="0"
        value="${getMonthlySalesTargets()[mkey] || 0}"
        style="width:90px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:3px 8px;font-size:13px;font-weight:700;font-family:inherit"
        oninput="saveMonthSalesTarget()">
      <div style="flex:1;min-width:60px;height:5px;background:var(--surface2);border-radius:3px;overflow:hidden;border:1px solid var(--border)">
        <div data-progress-bar style="height:100%;width:${sp.pct}%;background:${sp.full?'var(--green)':'var(--accent)'};border-radius:3px;transition:width .3s"></div>
      </div>
      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">$${Math.round(sp.income).toLocaleString()} · ${sp.pct}%</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
      ${items.map(it => `
        <div class="daily-kpi-card${it.full?' exceeded':''}">
          <div style="font-size:10px;color:var(--text-muted);font-weight:600;margin-bottom:3px">${it.label}</div>
          <input data-mg="${it.goalK}" data-nodraft="true" type="number" min="0" value="${it.goal}"
            style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:3px 6px;font-size:14px;font-weight:700;text-align:center;font-family:inherit"
            oninput="saveMonthlyGoalInputs()">
          <div style="height:4px;background:var(--surface2);border-radius:2px;overflow:hidden;margin-top:4px;border:1px solid var(--border)">
            <div data-progress-bar style="height:100%;width:${it.pct}%;background:${it.full?'var(--green)':'var(--accent)'};border-radius:2px;transition:width .3s"></div>
          </div>
          <div style="font-size:10px;color:${it.full?'var(--green)':'var(--text-muted)'};margin-top:2px;font-weight:600" data-progress-label>${it.actual}/${it.goal}</div>
        </div>`).join('')}
    </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderDailyPage() {
  const inp = document.getElementById('daily-date-input');
  if (inp) {
    if (inp.value) _viewDate = inp.value;
    else inp.value = _viewDate;
  }
  const ds   = _viewDate;
  const rpt  = _getDR(ds);
  const body = document.getElementById('daily-body');
  if (!body) return;

  const mkey   = ds.slice(0, 7);
  const mLabel = `${mkey.slice(0,4)}年${parseInt(mkey.slice(5))}月`;

  // 計算當前時段
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowMins  = new Date().getHours() * 60 + new Date().getMinutes();
  let nowSlot = -1;
  if (ds === todayStr) {
    rpt.schedule.forEach((s, i) => {
      const [sh, sm] = s.time.split(':').map(Number);
      if (sh * 60 + sm <= nowMins) nowSlot = i;
    });
  }

  // Node autocomplete list
  const nodeOptions = getNodes()
    .filter(n => n.name && !n.nodeType)
    .map(n => `<option value="${escHtml(n.name)}">`)
    .join('');

  body.innerHTML = `
<datalist id="drn-list">${nodeOptions}</datalist>
<div class="daily-two-col">

  <!-- LEFT -->
  <div class="daily-col">
    <div class="daily-section">
      <div class="daily-section-header">
        <span>📊 ${mLabel}月統計</span>
        <span style="font-size:10px;color:var(--text-muted)">目標可直接修改</span>
      </div>
      <div class="daily-section-body" id="monthly-goal-body" style="padding:10px 12px"></div>
    </div>

    <div class="daily-section">
      <div class="daily-section-header"><span>⏰ 時間安排</span></div>
      <div class="daily-section-body" style="padding:6px 10px">
        <div class="daily-sched-grid">
          <div class="dsgh"></div>
          <div class="dsgh">📋 預定</div>
          <div class="dsgh">✅ 成就</div>
          <div class="dsgh">🔍 復盤</div>
          ${rpt.schedule.map((s, i) => {
            const isNow = i === nowSlot;
            return `
            <div class="dsgt${isNow?' dsgt-now':''}" data-si="${i}">${s.time}${isNow?'<span class="dsgt-now-dot"></span>':''}</div>
            <input class="dsgi${isNow?' dsgi-now':''}" value="${escHtml(s.planned)}" placeholder="—" oninput="updateScheduleSlot(${i},'planned',this.value)">
            <input class="dsgi${isNow?' dsgi-now':''}" value="${escHtml(s.achieved)}" placeholder="—" oninput="updateScheduleSlot(${i},'achieved',this.value)">
            <input class="dsgi dsgi-r${isNow?' dsgi-now':''}" value="${escHtml(s.review)}" placeholder="—" oninput="updateScheduleSlot(${i},'review',this.value)">`;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="daily-section">
      <div class="daily-section-header">
        <span>📞 今日實績</span>
        <span style="font-size:10px;color:var(--text-muted)">輸入後自動儲存</span>
      </div>
      <div class="daily-section-body" style="padding:10px 12px">
        <div style="display:flex;gap:8px">
          ${DAILY_KPI.map(kpi => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
              <div style="font-size:10px;color:var(--text-muted);font-weight:600">${kpi.label}</div>
              <input class="daily-act-input" type="number" min="0"
                data-daily="${kpi.k}" value="${rpt[kpi.k] || 0}"
                oninput="saveDailyActInline(this)">
            </div>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <!-- RIGHT -->
  <div class="daily-col">
    <div class="daily-section">
      <div class="daily-section-header"><span>🎯 三件大事</span></div>
      <div class="daily-section-body">
        <div class="daily-bt-hdr">
          <div></div><div>項目名稱</div><div>目標</div><div>如何驗證</div>
        </div>
        ${rpt.bigThree.map((item, i) => `
          <div class="daily-bt-row">
            <div class="daily-bt-num">${i + 1}</div>
            <input class="daily-bt-inp" value="${escHtml(item.task)}"   placeholder="事項"   oninput="updateBigThree(${i},'task',this.value)">
            <input class="daily-bt-inp" value="${escHtml(item.goal)}"   placeholder="目標"   oninput="updateBigThree(${i},'goal',this.value)">
            <input class="daily-bt-inp" value="${escHtml(item.verify)}" placeholder="如何驗證" oninput="updateBigThree(${i},'verify',this.value)">
          </div>`).join('')}
      </div>
    </div>

    <div class="daily-section">
      <div class="daily-section-header">
        <span>🤝 今日與誰連結</span>
        <button class="btn" style="font-size:11px;padding:3px 10px" onclick="addDailyConn()">+ 新增</button>
      </div>
      <div class="daily-section-body">
        <div class="daily-conn-hdr">
          <div>誰</div><div>主題</div><div>下一步</div>
          <div style="text-align:center">目標?</div><div></div>
        </div>
        ${rpt.connections.map((c, i) => `
          <div class="daily-conn-row">
            <input class="daily-conn-inp" list="drn-list" value="${escHtml(c.who)}"      placeholder="姓名"  oninput="updateDailyConn(${i},'who',this.value)">
            <input class="daily-conn-inp" value="${escHtml(c.topic)}"    placeholder="主題"  oninput="updateDailyConn(${i},'topic',this.value)">
            <input class="daily-conn-inp" value="${escHtml(c.nextStep)}" placeholder="下一步" oninput="updateDailyConn(${i},'nextStep',this.value)">
            <label class="daily-conn-goal">
              <input type="checkbox" ${c.hasGoal?'checked':''} onchange="updateDailyConn(${i},'hasGoal',this.checked)">
              <span class="daily-conn-goal-dot"></span>
            </label>
            <button class="daily-conn-del" onclick="removeDailyConn(${i})">×</button>
          </div>`).join('')}
      </div>
    </div>

    <div class="daily-section">
      <div class="daily-section-header"><span>🌙 今日復盤</span></div>
      <div class="daily-section-body">
        <div class="daily-reflect-2col">
          <div>
            <div style="font-size:10.5px;font-weight:700;color:var(--text-muted);margin-bottom:6px">🙏 值得感謝的五件事</div>
            ${rpt.gratitude.map((v, i) => `
              <div class="daily-rf-item">
                <span class="daily-rf-num">${i + 1}</span>
                <input class="daily-rf-inp" value="${escHtml(v)}" placeholder="…" onblur="updateReflect('gratitude',${i},this.value)">
              </div>`).join('')}
          </div>
          <div>
            <div style="font-size:10.5px;font-weight:700;color:var(--text-muted);margin-bottom:6px">💡 值得優化的五件事</div>
            ${rpt.optimize.map((v, i) => `
              <div class="daily-rf-item">
                <span class="daily-rf-num">${i + 1}</span>
                <input class="daily-rf-inp" value="${escHtml(v)}" placeholder="…" onblur="updateReflect('optimize',${i},this.value)">
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="daily-section">
      <div class="daily-section-header">
        <span>📋 明天要做的事</span>
        <button class="btn" style="font-size:11px;padding:3px 10px" onclick="loadYestTomorrow()">← 帶入昨日</button>
      </div>
      <div class="daily-section-body">
        <textarea class="daily-notes-input" placeholder="明天的首要任務…"
          onblur="_patchTomorrow(this.value)">${escHtml(rpt.tomorrow)}</textarea>
      </div>
    </div>
  </div>

</div>`;

  renderMonthlyProgress();

  // 自動捲到當前時段
  if (nowSlot >= 0) {
    requestAnimationFrame(() => {
      document.querySelector(`.dsgt[data-si="${nowSlot}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

// patch helper exposed to inline onblur for tomorrow field
window._patchTomorrow = function(value) {
  _patch(_dateStr(), { tomorrow: value });
};

// ── Monthly target input (header bar) ─────────────────────────────────────────

export function renderMonthlyTargetInput() {
  const mkey = _getMonthKey();
  const el   = document.getElementById('monthly-target-input');
  if (el) el.value = getMonthlySalesTargets()[mkey] || '';
}

export function saveMonthlyTarget() {
  const mkey = _getMonthKey();
  const val  = Number(document.getElementById('monthly-target-input')?.value) || 0;
  dispatch({ type: 'MONTHLY_SALES_TARGETS_PATCH', payload: { [mkey]: val } });
  toast('月目標已儲存');
  renderDailyPage();
}
