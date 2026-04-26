/**
 * features/panel/index.js
 * 右側資料面板：openPanel / closePanel / renderPanel / savePanel
 * 依賴：core/state.js, core/toast.js, models/node.js
 */

import { findNode, getNodes, dispatch } from '../../core/state.js';
import { toast } from '../../core/toast.js';
import { STATUS_LABELS } from '../../models/node.js';

// renderNodes 由 main.js 注入（避免循環依賴）
let _renderNodesFn = () => {};
export function setRenderNodesFn(fn) { _renderNodesFn = fn; }

let _panelNodeId = null;
export const getPanelNodeId = () => _panelNodeId;

// ── HTML escape ───────────────────────────────────────────────────────────────
function escHtml(s) {
  if (!s && s !== 0) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

export function updateStats() {
  const nodes  = getNodes();
  const total  = nodes.filter(n => n.status !== null).length;
  const green  = nodes.filter(n => n.status === 'green').length;
  const yellow = nodes.filter(n => n.status === 'yellow').length;
  const red    = nodes.filter(n => n.status === 'red').length;
  const el = document.getElementById('header-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat stat-btn" onclick="window.__crmJumpToStatus?.('green')" title="查看高意願聯繫人"><span class="stat-dot" style="background:var(--green)"></span>${green} 高意願</div>
    <div class="stat stat-btn" onclick="window.__crmJumpToStatus?.('yellow')" title="查看觀察中聯繫人"><span class="stat-dot" style="background:var(--yellow)"></span>${yellow} 觀察中</div>
    <div class="stat stat-btn" onclick="window.__crmJumpToStatus?.('red')" title="查看冷淡聯繫人"><span class="stat-dot" style="background:var(--red)"></span>${red} 冷淡</div>
    <div class="stat stat-btn" onclick="window.__crmJumpToStatus?.(null)" title="查看全部聯繫人"><span class="stat-dot" style="background:var(--border-hover)"></span>${total} 總計</div>`;
}

// ── Panel open / close ────────────────────────────────────────────────────────

export function openPanel(id) {
  const n = findNode(id);
  if (!n) return;
  _panelNodeId = id;
  window.__crmSelectNode?.(id);
  const titleEl = document.getElementById('panel-title');
  if (titleEl) titleEl.textContent = n.name || '聯繫人資料';
  renderPanel(n);
  document.getElementById('side-panel')?.classList.add('open');
}

export function closePanel() {
  document.getElementById('side-panel')?.classList.remove('open');
  _panelNodeId = null;
}

// ── Mark contacted ────────────────────────────────────────────────────────────

export function markContactedToday() {
  if (!_panelNodeId) return;
  const n = findNode(_panelNodeId);
  if (!n) return;
  const today = new Date().toISOString().slice(0, 10);
  dispatch({ type: 'NODE_UPDATE', payload: { id: n.id, patch: {
    info: { ...n.info, lastContact: today },
    lastContactAt: Date.now(),
  }}});

  // 同步更新面板欄位（不需要重繪整個面板）
  const el = document.querySelector('[data-info="lastContact"]');
  if (el) el.value = today;
  const hint = document.getElementById('quick-contact-hint');
  if (hint) hint.textContent = '上次：' + today;
  const ts = document.querySelector('.node-timestamps');
  if (ts) {
    const spans = ts.querySelectorAll('span');
    if (spans[2]) spans[2].textContent = '📞 聯繫 ' + today;
    if (spans[1]) spans[1].textContent = '✏️ 編輯 ' + today;
  }
  const wrap = document.querySelector(`.node-wrap[data-id="${n.id}"]`);
  if (wrap) { const lbl = wrap.querySelector('.node-last-contact'); if (lbl) lbl.textContent = today; }
  toast('✅ 已記錄今日聯繫（' + today + '）');
}

// ── Save panel ────────────────────────────────────────────────────────────────

export function savePanel() {
  if (!_panelNodeId) return;
  const n = findNode(_panelNodeId);
  if (!n) return;
  const body = document.getElementById('panel-body');
  if (!body) return;

  const nameEl = body.querySelector('[data-field="name"]');
  const newName = nameEl ? nameEl.value : n.name;

  const newInfo = { ...n.info };
  body.querySelectorAll('[data-info]').forEach(el => {
    const k = el.dataset.info;
    if (el.type !== 'checkbox') newInfo[k] = el.value;
  });
  const tagsEl = body.querySelector('[data-info="tags-input"]');
  if (tagsEl) newInfo.tags = tagsEl.value.split(',').map(s => s.trim()).filter(Boolean);

  const needsChecked = [];
  body.querySelectorAll('[data-need].checked').forEach(el => needsChecked.push(el.dataset.need));
  newInfo.needs = needsChecked;

  const regionsChecked = [];
  body.querySelectorAll('[data-region].checked').forEach(el => regionsChecked.push(el.dataset.region));
  newInfo.regions = regionsChecked;

  const lastContactAt = newInfo.lastContact ? new Date(newInfo.lastContact).getTime() || n.lastContactAt : n.lastContactAt;

  dispatch({ type: 'NODE_UPDATE', payload: { id: n.id, patch: {
    name: newName, info: newInfo, lastContactAt,
  }}});

  const titleEl = document.getElementById('panel-title');
  if (titleEl) titleEl.textContent = newName || '聯繫人資料';

  // 精準更新節點卡片
  const wrap = document.querySelector(`.node-wrap[data-id="${n.id}"]`);
  if (wrap) {
    const nameDiv = wrap.querySelector('.node-name');
    if (nameDiv) { nameDiv.textContent = newName; nameDiv.title = newName; }
    const avatar = wrap.querySelector('.node-avatar');
    if (avatar) avatar.textContent = (newName || '?')[0];
    const meta = wrap.querySelector('.node-meta');
    if (meta) meta.textContent = newInfo.company || (newInfo.tags && newInfo.tags[0]) || '';

    const ROLE_MAP = { 潛在客戶: 'role-prospect', 轉介紹中心: 'role-referral', 學員: 'role-student', 從業人員: 'role-agent' };
    let rolePill = wrap.querySelector('.node-role-pill');
    if (newInfo.role) {
      if (!rolePill) { rolePill = document.createElement('div'); rolePill.className = 'node-role-pill'; wrap.querySelector('.node-card')?.insertBefore(rolePill, wrap.querySelector('.node-footer')); }
      rolePill.className = 'node-role-pill ' + (ROLE_MAP[newInfo.role] || '');
      rolePill.textContent = newInfo.role;
    } else if (rolePill) { rolePill.remove(); }

    let regionDiv = wrap.querySelector('.node-region-tags');
    if (newInfo.regions && newInfo.regions.length) {
      if (!regionDiv) { regionDiv = document.createElement('div'); regionDiv.className = 'node-region-tags'; wrap.querySelector('.node-card')?.insertBefore(regionDiv, wrap.querySelector('.node-footer')); }
      regionDiv.innerHTML = newInfo.regions.map(r => `<span class="node-region-tag">${r}</span>`).join('');
    } else if (regionDiv) { regionDiv.remove(); }
  }
  updateStats();
}

// ── Accordion / checkbox helpers（HTML inline onclick 呼叫）──────────────────

export function toggleNeed(el) { el.classList.toggle('checked'); savePanel(); }
export function toggleRegion(el) { el.classList.toggle('checked'); savePanel(); }
export function toggleAcc(header) { header.closest('.accordion')?.classList.toggle('open'); }

// ── C單 ───────────────────────────────────────────────────────────────────────

function toROCDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `民國${d.getFullYear() - 1911}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
  } catch { return dateStr; }
}

export function buildCSheet(n) {
  if (!n) return '';
  const i = n.info;
  return [
    `姓名：${n.name || ''}`,
    `年齡：${i.age || ''} 歲　星座：${i.zodiac || ''}　家鄉：${i.hometown || ''}`,
    `個性：${i.personality || ''}　興趣：${i.interests || ''}`,
    `認識方式：${i.howMet || ''}`,
    `背景：${i.background || ''}`, ``,
    `── 工作 ──`,
    `現職：${i.currentJob || ''} / 年資：${i.jobDuration || ''}`,
    `前職：${i.prevJob || ''} / 層級：${i.prevJobLevel || ''}`, ``,
    `── 財務 ──`,
    `收入：${i.income || ''}　薪轉：${i.salaryTransfer || ''}`,
    `名下房產：${i.hasProperty || ''}　家庭房產：${i.familyProperty || ''}`,
    `投資：${i.hasInvestment || ''}　保險：${i.hasInsurance || ''}　信用卡：${i.creditCard || ''}　負債：${i.debt || ''}`, ``,
    `── 邀約 ──`,
    `邀約方式：${i.invitationMethod || ''}`,
    `告知場地費：${i.knowsVenueFee || ''}　告知學費79800：${i.knowsTuition || ''}`,
    `需求：${(i.needs || []).join('、') || ''}`,
    `關鍵問題：${i.keyQuestions || ''}`,
    `可自行決定：${i.canDecide || ''}　當場付款：${i.payOnSite || ''}`, ``,
    `── C單 ──`,
    `活動日期：${toROCDate(i.eventDate)}`,
    `活動名稱：${i.eventName || ''}`,
    `邀約人：${i.referrer || ''}　推薦人：${i.recommender || ''}`,
    `備注：${i.formNotes || ''}`,
  ].join('\n');
}

export function copyCSheet() {
  if (!_panelNodeId) return;
  const n = findNode(_panelNodeId);
  if (!n) return;
  navigator.clipboard.writeText(buildCSheet(n)).then(() => toast('C單已複製到剪貼板'));
}

// ── renderPanel（HTML 模板）──────────────────────────────────────────────────

export function renderPanel(n) {
  const body = document.getElementById('panel-body');
  if (!body) return;
  const inf = n.info;

  const needsOptions = ['買房', '買車', '子女教育', '退休規劃', '保障規劃', '創業資金', '學習成長', '財富自由'];
  const needsHtml = needsOptions.map(nd =>
    `<div class="cb-item${(inf.needs || []).includes(nd) ? ' checked' : ''}" data-need="${nd}" onclick="window.__crmToggleNeed?.(this)">${nd}</div>`
  ).join('');

  const tagsVal = (inf.tags || []).join(', ');
  const REGION_OPTIONS = ['台北', '新北', '桃園', '新竹', '台中', '彰化', '台南', '高雄', '其他'];
  const regionsHtml = REGION_OPTIONS.map(r =>
    `<div class="cb-item${(inf.regions || []).includes(r) ? ' checked' : ''}" data-region="${r}" onclick="window.__crmToggleRegion?.(this)">${r}</div>`
  ).join('');
  const ROLES = ['潛在客戶', '轉介紹中心', '學員', '從業人員'];

  const fmt = ts => ts ? new Date(ts).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—';

  body.innerHTML = `
    <div class="quick-contact-bar">
      <button class="quick-contact-btn" onclick="window.__crmMarkContactedToday?.()">📞 今天聯繫到</button>
      <span class="quick-contact-hint" id="quick-contact-hint">${inf.lastContact ? '上次：' + inf.lastContact : ''}</span>
    </div>
    <div class="field-group">
      <div class="field-label">姓名</div>
      <input class="field-input" data-field="name" value="${escHtml(n.name)}" oninput="window.__crmSavePanel?.()" placeholder="姓名">
    </div>
    <div class="field-row">
      <div class="field-group">
        <div class="field-label">身份標籤</div>
        <select class="field-input" data-info="role" onchange="window.__crmSavePanel?.()">
          <option value="">— 未設定 —</option>
          ${ROLES.map(r => `<option value="${r}"${inf.role === r ? ' selected' : ''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="field-group">
        <div class="field-label">地區（可複選）</div>
        <div class="cb-group" style="flex-wrap:wrap;gap:4px;display:flex">${regionsHtml}</div>
      </div>
    </div>
    <div class="accordion open">
      <div class="acc-header" onclick="window.__crmToggleAcc?.(this)">基本資料 <span class="acc-chevron">▲</span></div>
      <div class="acc-body">
        <div class="field-row">
          <div class="field-group"><div class="field-label">年齡</div><input class="field-input" data-info="age" value="${escHtml(inf.age)}" oninput="window.__crmSavePanel?.()" placeholder="歲"></div>
          <div class="field-group"><div class="field-label">星座</div><input class="field-input" data-info="zodiac" value="${escHtml(inf.zodiac)}" oninput="window.__crmSavePanel?.()" placeholder="星座"></div>
        </div>
        <div class="field-group"><div class="field-label">家鄉</div><input class="field-input" data-info="hometown" value="${escHtml(inf.hometown)}" oninput="window.__crmSavePanel?.()" placeholder="家鄉"></div>
        <div class="field-group"><div class="field-label">個性</div><input class="field-input" data-info="personality" value="${escHtml(inf.personality)}" oninput="window.__crmSavePanel?.()" placeholder="個性特質"></div>
        <div class="field-group"><div class="field-label">興趣</div><input class="field-input" data-info="interests" value="${escHtml(inf.interests)}" oninput="window.__crmSavePanel?.()" placeholder="興趣愛好"></div>
        <div class="field-group"><div class="field-label">認識方式</div><input class="field-input" data-info="howMet" value="${escHtml(inf.howMet)}" oninput="window.__crmSavePanel?.()" placeholder="如何認識"></div>
        <div class="field-group"><div class="field-label">背景</div><textarea class="field-input field-textarea" data-info="background" oninput="window.__crmSavePanel?.()" placeholder="背景說明">${escHtml(inf.background)}</textarea></div>
        <div class="field-group"><div class="field-label">公司</div><input class="field-input" data-info="company" value="${escHtml(inf.company)}" oninput="window.__crmSavePanel?.()" placeholder="公司名稱"></div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">電話</div><input class="field-input" data-info="phone" value="${escHtml(inf.phone)}" oninput="window.__crmSavePanel?.()" placeholder="手機"></div>
          <div class="field-group"><div class="field-label">Email</div><input class="field-input" data-info="email" value="${escHtml(inf.email)}" oninput="window.__crmSavePanel?.()" placeholder="信箱"></div>
        </div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">來源</div><input class="field-input" data-info="source" value="${escHtml(inf.source)}" oninput="window.__crmSavePanel?.()" placeholder="來源"></div>
          <div class="field-group"><div class="field-label">最後聯絡</div><input class="field-input" type="date" data-info="lastContact" value="${escHtml(inf.lastContact)}" oninput="window.__crmSavePanel?.()"></div>
        </div>
        <div class="field-group"><div class="field-label">標籤（逗號分隔）</div><input class="field-input" data-info="tags-input" value="${escHtml(tagsVal)}" oninput="window.__crmSavePanel?.()" placeholder="VIP, 客戶, 介紹人"></div>
        <div class="field-group"><div class="field-label">備注</div><textarea class="field-input field-textarea" data-info="notes" oninput="window.__crmSavePanel?.()" placeholder="備注說明">${escHtml(inf.notes)}</textarea></div>
        <div class="node-timestamps">
          <span title="建立時間">🕐 建立 ${fmt(n.createdAt)}</span>
          <span title="最後編輯">✏️ 編輯 ${n.updatedAt && n.updatedAt !== n.createdAt ? fmt(n.updatedAt) : '—'}</span>
          <span title="最後聯繫">📞 聯繫 ${inf.lastContact || '—'}</span>
        </div>
      </div>
    </div>
    <div class="accordion">
      <div class="acc-header" onclick="window.__crmToggleAcc?.(this)">工作背景 <span class="acc-chevron">▲</span></div>
      <div class="acc-body">
        <div class="field-row">
          <div class="field-group"><div class="field-label">現職</div><input class="field-input" data-info="currentJob" value="${escHtml(inf.currentJob)}" oninput="window.__crmSavePanel?.()" placeholder="職稱/職務"></div>
          <div class="field-group"><div class="field-label">年資</div><input class="field-input" data-info="jobDuration" value="${escHtml(inf.jobDuration)}" oninput="window.__crmSavePanel?.()" placeholder="幾年"></div>
        </div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">前職</div><input class="field-input" data-info="prevJob" value="${escHtml(inf.prevJob)}" oninput="window.__crmSavePanel?.()" placeholder="前職職稱"></div>
          <div class="field-group"><div class="field-label">前職層級</div><input class="field-input" data-info="prevJobLevel" value="${escHtml(inf.prevJobLevel)}" oninput="window.__crmSavePanel?.()" placeholder="層級"></div>
        </div>
      </div>
    </div>
    <div class="accordion">
      <div class="acc-header" onclick="window.__crmToggleAcc?.(this)">財務狀況 <span class="acc-chevron">▲</span></div>
      <div class="acc-body">
        <div class="field-row">
          <div class="field-group"><div class="field-label">收入</div><input class="field-input" data-info="income" value="${escHtml(inf.income)}" oninput="window.__crmSavePanel?.()" placeholder="月收 / 年收"></div>
          <div class="field-group"><div class="field-label">薪轉</div><select class="field-input" data-info="salaryTransfer" onchange="window.__crmSavePanel?.()"><option value="">—</option><option${inf.salaryTransfer === '是' ? ' selected' : ''}>是</option><option${inf.salaryTransfer === '否' ? ' selected' : ''}>否</option></select></div>
        </div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">名下房產</div><input class="field-input" data-info="hasProperty" value="${escHtml(inf.hasProperty)}" oninput="window.__crmSavePanel?.()" placeholder="有/無/幾間"></div>
          <div class="field-group"><div class="field-label">家庭房產</div><input class="field-input" data-info="familyProperty" value="${escHtml(inf.familyProperty)}" oninput="window.__crmSavePanel?.()" placeholder="有/無"></div>
        </div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">有無投資</div><select class="field-input" data-info="hasInvestment" onchange="window.__crmSavePanel?.()"><option value="">—</option><option${inf.hasInvestment === '是' ? ' selected' : ''}>是</option><option${inf.hasInvestment === '否' ? ' selected' : ''}>否</option></select></div>
          <div class="field-group"><div class="field-label">有無保險</div><select class="field-input" data-info="hasInsurance" onchange="window.__crmSavePanel?.()"><option value="">—</option><option${inf.hasInsurance === '是' ? ' selected' : ''}>是</option><option${inf.hasInsurance === '否' ? ' selected' : ''}>否</option></select></div>
        </div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">信用卡</div><input class="field-input" data-info="creditCard" value="${escHtml(inf.creditCard)}" oninput="window.__crmSavePanel?.()" placeholder="有/無/張數"></div>
          <div class="field-group"><div class="field-label">負債</div><input class="field-input" data-info="debt" value="${escHtml(inf.debt)}" oninput="window.__crmSavePanel?.()" placeholder="有/無/金額"></div>
        </div>
      </div>
    </div>
    <div class="accordion">
      <div class="acc-header" onclick="window.__crmToggleAcc?.(this)">邀約資訊 <span class="acc-chevron">▲</span></div>
      <div class="acc-body">
        <div class="field-group"><div class="field-label">邀約方式</div><input class="field-input" data-info="invitationMethod" value="${escHtml(inf.invitationMethod)}" oninput="window.__crmSavePanel?.()" placeholder="電話/面邀/介紹"></div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">告知場地費</div><select class="field-input" data-info="knowsVenueFee" onchange="window.__crmSavePanel?.()"><option value="">—</option><option${inf.knowsVenueFee === '是' ? ' selected' : ''}>是</option><option${inf.knowsVenueFee === '否' ? ' selected' : ''}>否</option></select></div>
          <div class="field-group"><div class="field-label">告知學費79800</div><select class="field-input" data-info="knowsTuition" onchange="window.__crmSavePanel?.()"><option value="">—</option><option${inf.knowsTuition === '是' ? ' selected' : ''}>是</option><option${inf.knowsTuition === '否' ? ' selected' : ''}>否</option></select></div>
        </div>
        <div class="field-group"><div class="field-label">關鍵問題</div><textarea class="field-input field-textarea" data-info="keyQuestions" oninput="window.__crmSavePanel?.()" placeholder="客戶提出的關鍵問題">${escHtml(inf.keyQuestions)}</textarea></div>
        <div class="field-group">
          <div class="field-label">需求（多選）</div>
          <div class="checkbox-group">${needsHtml}</div>
        </div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">可自行決定</div><select class="field-input" data-info="canDecide" onchange="window.__crmSavePanel?.()"><option value="">—</option><option${inf.canDecide === '是' ? ' selected' : ''}>是</option><option${inf.canDecide === '否' ? ' selected' : ''}>否</option></select></div>
          <div class="field-group"><div class="field-label">當場付款</div><select class="field-input" data-info="payOnSite" onchange="window.__crmSavePanel?.()"><option value="">—</option><option${inf.payOnSite === '是' ? ' selected' : ''}>是</option><option${inf.payOnSite === '否' ? ' selected' : ''}>否</option></select></div>
        </div>
      </div>
    </div>
    <div class="accordion">
      <div class="acc-header" onclick="window.__crmToggleAcc?.(this)">C單資訊 <span class="acc-chevron">▲</span></div>
      <div class="acc-body">
        <div class="field-row">
          <div class="field-group"><div class="field-label">活動日期</div><input class="field-input" type="date" data-info="eventDate" value="${escHtml(inf.eventDate)}" oninput="window.__crmSavePanel?.()"></div>
          <div class="field-group"><div class="field-label">活動名稱</div><input class="field-input" data-info="eventName" value="${escHtml(inf.eventName)}" oninput="window.__crmSavePanel?.()" placeholder="活動名稱"></div>
        </div>
        <div class="field-row">
          <div class="field-group"><div class="field-label">邀約人</div><input class="field-input" data-info="referrer" value="${escHtml(inf.referrer)}" oninput="window.__crmSavePanel?.()" placeholder="邀約人姓名"></div>
          <div class="field-group"><div class="field-label">推薦人</div><input class="field-input" data-info="recommender" value="${escHtml(inf.recommender)}" oninput="window.__crmSavePanel?.()" placeholder="推薦人姓名"></div>
        </div>
        <div class="field-group"><div class="field-label">表單備注</div><textarea class="field-input field-textarea" data-info="formNotes" oninput="window.__crmSavePanel?.()" placeholder="其他說明">${escHtml(inf.formNotes)}</textarea></div>
      </div>
    </div>
    <div class="accordion">
      <div class="acc-header" onclick="window.__crmToggleAcc?.(this)">📋 C單輸出 <span class="acc-chevron">▲</span></div>
      <div class="acc-body">
        <div class="export-box" id="export-preview">${buildCSheet(n)}</div>
        <button class="btn btn-sm" style="width:100%" onclick="window.__crmCopyCSheet?.()">複製 C單</button>
      </div>
    </div>`;
}
