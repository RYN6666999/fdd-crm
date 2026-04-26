/**
 * features/sales/index.js
 * 業績頁：完整移植 crm.js 原始功能
 * 依賴：core/state.js, core/toast.js, core/calc.js, core/store.js, core/uid.js
 */

import { getSalesData, getNodes, dispatch } from '../../core/state.js';
import { STORE } from '../../core/store.js';
import { CALC } from '../../core/calc.js';
import { toast } from '../../core/toast.js';
import { uid } from '../../core/uid.js';
import { SALES_TAX, BATCH_ANCHORS } from '../../contracts/types.js';

// ── Constants (mirror crm.js) ─────────────────────────────────────────────────

const TRANSFER_AMOUNT = 75440;

const RANK_LABELS = {
  director:    '主任(15%)',
  asst_mgr:    '襄理(20%)',
  manager:     '經理(25%)',
  shop_partner:'店股東(25%)',
  shop_head:   '店長(25%)',
};

const BATCH_RESTRICTED_RANKS = new Set(['director', 'asst_mgr']);

const SALES_PRODUCTS = {
  student:      { name:'學員',         price:79800,          color:'#3b82f6', bg:'rgba(59,130,246,.12)' },
  member:       { name:'會員服務',     price:200000,         color:'#8b5cf6', bg:'rgba(139,92,246,.12)' },
  vip:          { name:'VIP買房服務',  price:300000,         color:'#f59e0b', bg:'rgba(245,158,11,.12)'  },
  asst_mgr_pkg: { name:'襄理批貨',    price:79800*6,         color:'#10b981', bg:'rgba(16,185,129,.12)' },
  manager_pkg:  { name:'經理批貨',    price:79800*15,        color:'#ef4444', bg:'rgba(239,68,68,.12)'   },
  consult:      { name:'協談獎金',    price:Math.round(79800*0.03), color:'#06b6d4', bg:'rgba(6,182,212,.12)', perPerson:true, noSamerank:true },
};

// ── State ─────────────────────────────────────────────────────────────────────

let _salesYear  = new Date().getFullYear();
let _salesMonth = new Date().getMonth();
let _editingSaleId    = null;
let _saleManualAmount = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtMoney(n) { return 'NT$ ' + Math.round(n).toLocaleString('zh-TW'); }

function _parseMoneyText(s) {
  const cleaned = String(s || '').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function _canSeeBatch(pid) {
  if (pid !== 'asst_mgr_pkg' && pid !== 'manager_pkg') return true;
  return !BATCH_RESTRICTED_RANKS.has(STORE.getMyRank());
}

function _getMyRate() { return STORE.getMyRate(); }

function _getSaleAmountFromInput() {
  const el = document.getElementById('sale-amount-display');
  const n  = _parseMoneyText(el?.value || '');
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function _setSaleAmountToInput(amount) {
  const el = document.getElementById('sale-amount-display');
  if (el) el.value = fmtMoney(amount);
}

// ── Navigation ────────────────────────────────────────────────────────────────

export function salesPrevMonth() {
  _salesMonth--;
  if (_salesMonth < 0) { _salesMonth = 11; _salesYear--; }
  renderSalesPage();
}

export function salesNextMonth() {
  _salesMonth++;
  if (_salesMonth > 11) { _salesMonth = 0; _salesYear++; }
  renderSalesPage();
}

export function salesGoToday() {
  _salesYear  = new Date().getFullYear();
  _salesMonth = new Date().getMonth();
  renderSalesPage();
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderSalesPage() {
  const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const label  = document.getElementById('sales-month-label');
  if (label) label.textContent = `${_salesYear} 年 ${MONTHS[_salesMonth]}`;

  const myRate = _getMyRate();
  const prefix = `${_salesYear}-${String(_salesMonth + 1).padStart(2, '0')}`;
  const salesData = getSalesData();
  const { gross, transferTotal, bonusTotal, income, tax, net, newCount, bonusCount, totalCount, sorted } =
    CALC.monthSummary(salesData, myRate, prefix);

  const body = document.getElementById('sales-body');
  if (!body) return;

  const rankLabel = RANK_LABELS[STORE.getMyRank()] || '主任(15%)';

  // 近7天協談趨勢
  const today7 = new Date();
  const days7  = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(today7); d.setDate(today7.getDate() - i); days7.push(d.toISOString().slice(0, 10)); }
  const sums7 = days7.map(ds => salesData.filter(s => s.saleType === 'bonus' && s.date === ds).reduce((a, s) => a + s.amount, 0));
  const max7  = Math.max(1, ...sums7);
  const bars7 = sums7.map(v =>
    `<div title="${v ? fmtMoney(v) : '—'}" style="flex:1;height:${Math.max(2, Math.round(v / max7 * 28))}px;background:${v > 0 ? 'var(--accent)' : 'var(--surface2)'};border:1px solid var(--border);border-bottom:0;border-radius:3px 3px 0 0"></div>`
  ).join('');

  const kpiHtml = `
  <div class="kpi-bar">
    <div class="kpi-card kpi-total">
      <div class="kpi-label">業績量（新業績）</div>
      <div class="kpi-value">${fmtMoney(gross)}</div>
      <div class="kpi-sub">${newCount} 筆 · 舊單轉讓 ${fmtMoney(transferTotal)}</div>
    </div>
    <div class="kpi-card kpi-net">
      <div class="kpi-label">我的所得 <span style="font-size:10px;font-weight:400">${rankLabel}</span></div>
      <div class="kpi-value">${fmtMoney(income)}</div>
      <div class="kpi-sub">稅金 ${fmtMoney(tax)}</div>
    </div>
    <div class="kpi-card kpi-count">
      <div class="kpi-label">稅後實得</div>
      <div class="kpi-value">${fmtMoney(net)}</div>
      <div class="kpi-sub">${totalCount} 筆成交</div>
    </div>
    <div class="kpi-card kpi-bonus">
      <div class="kpi-label">協談獎金合計</div>
      <div class="kpi-value">${fmtMoney(bonusTotal)}</div>
      <div class="kpi-sub">${bonusCount} 筆協談</div>
      <div style="display:flex;align-items:flex-end;gap:3px;height:30px;margin-top:8px">${bars7}</div>
    </div>
  </div>`;

  const prodHtml = `
  <div>
    <div class="prod-section-title">快速新增成交</div>
    <div class="prod-grid">
      <div class="prod-card" style="--prod-color:#f97316" onclick="openSaleModal('transfer')">
        <span class="prod-add-icon">＋</span>
        <div class="prod-name">舊單轉讓</div>
        <div class="prod-price" style="color:#f97316">${fmtMoney(TRANSFER_AMOUNT)}</div>
        <div class="prod-desc">固定金額</div>
      </div>
      ${Object.entries(SALES_PRODUCTS).filter(([id]) => _canSeeBatch(id)).map(([id, p]) => `
        <div class="prod-card" style="--prod-color:${p.color}" onclick="openSaleModal('${id}')">
          <span class="prod-add-icon">＋</span>
          <div class="prod-name">${p.name}</div>
          <div class="prod-price">${fmtMoney(p.price)}${p.perPerson ? '／人' : ''}</div>
          ${id === 'asst_mgr_pkg' ? '<div class="prod-desc">79,800 × 6</div>'
          : id === 'manager_pkg'  ? '<div class="prod-desc">79,800 × 15</div>'
          : id === 'consult'      ? '<div class="prod-desc">79,800 × 3%</div>' : ''}
        </div>`).join('')}
    </div>
  </div>`;

  const nodes = getNodes();
  const logHtml = `
  <div>
    <div class="prod-section-title">成交記錄</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="display:grid;grid-template-columns:88px 1fr 110px 100px 100px 90px 32px;gap:8px;padding:6px 12px;font-size:11px;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border)">
        <span>日期</span><span>客戶</span><span>類別</span><span>業績量</span><span>所得</span><span>稅後</span><span></span>
      </div>
      ${sorted.length ? sorted.map(s => {
        const isTransfer = s.saleType === 'transfer';
        const p = isTransfer
          ? { name: '舊單轉讓', color: '#f97316', bg: 'rgba(249,115,22,.12)' }
          : (SALES_PRODUCTS[s.product] || { name: s.product, color: 'var(--accent)', bg: 'var(--surface2)' });
        const rowIncome = CALC.saleIncome(s, myRate);
        const rowNet    = rowIncome * (1 - SALES_TAX);
        const clientNames = (s.clients || []).map(id => { const n = nodes.find(x => x.id === id); return n ? n.name : '—'; }).join('、') || '—';
        return `<div onclick="openSaleEditModal('${s.id}')"
          style="display:grid;grid-template-columns:88px 1fr 110px 100px 100px 90px 32px;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;align-items:center;transition:background .1s;cursor:pointer"
          onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
          <span>${s.date}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(clientNames)}">${_esc(clientNames)}</span>
          <span><span class="sale-badge" style="--prod-color:${p.color};--prod-bg:${p.bg}">${p.name}</span></span>
          <span class="sale-amount">${fmtMoney(s.amount)}</span>
          <span style="font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums">${fmtMoney(rowIncome)}</span>
          <span class="sale-net">${fmtMoney(rowNet)}</span>
          <button class="sale-del" onclick="event.stopPropagation();deleteSale('${s.id}')">✕</button>
        </div>`;
      }).join('') : '<div class="sale-empty">本月尚無成交記錄</div>'}
    </div>
  </div>`;

  body.innerHTML = kpiHtml + prodHtml + logHtml;
}

// ── Modal: new sale (by productId) ────────────────────────────────────────────

export function openSaleModal(productId) {
  _editingSaleId    = null;
  _saleManualAmount = false;
  const isTransfer  = productId === 'transfer';
  const today       = new Date().toISOString().slice(0, 10);

  document.getElementById('sale-modal-title-text').textContent = '新增成交';
  document.getElementById('sale-date').value  = today;
  document.getElementById('sale-notes').value = '';
  document.getElementById('sale-qty').value   = '1';

  // 根據職級隱藏批貨選項
  document.getElementById('sale-product')
    ?.querySelectorAll('option[value="asst_mgr_pkg"], option[value="manager_pkg"]')
    .forEach(opt => { opt.style.display = _canSeeBatch(opt.value) ? '' : 'none'; });

  document.querySelectorAll('input[name="sale-type"]').forEach(r => {
    r.checked = isTransfer ? r.value === 'transfer' : r.value === 'new';
  });

  onSaleTypeChange();

  if (!isTransfer && productId && _canSeeBatch(productId))
    document.getElementById('sale-product').value = productId;

  const contactNodes = getNodes().filter(n => n.status !== null && n.name);
  document.getElementById('sale-pax').innerHTML = contactNodes.length
    ? contactNodes.map(n => `<div class="ev-pax" data-nid="${n.id}" onclick="this.classList.toggle('selected')"><span class="sdot ${n.status || 'gray'}"></span>${_esc(n.name)}</div>`).join('')
    : '<span style="color:var(--text-muted);font-size:12px">尚無人脈節點</span>';

  onSaleProductChange();
  document.getElementById('sale-modal')?.classList.add('open');
}

// ── Modal: edit existing sale ─────────────────────────────────────────────────

export function openSaleEditModal(id) {
  const s = getSalesData().find(x => x.id === id);
  if (!s) { toast('找不到此筆成交'); return; }
  _editingSaleId    = id;
  _saleManualAmount = true;

  document.getElementById('sale-modal-title-text').textContent = '編輯成交';
  document.getElementById('sale-date').value  = s.date  || new Date().toISOString().slice(0, 10);
  document.getElementById('sale-notes').value = s.notes || '';
  document.getElementById('sale-qty').value   = String(s.qty || 1);

  const isTransfer = s.saleType === 'transfer';
  document.querySelectorAll('input[name="sale-type"]').forEach(r => {
    r.checked = isTransfer ? r.value === 'transfer' : r.value === 'new';
  });

  document.getElementById('sale-product')
    ?.querySelectorAll('option[value="asst_mgr_pkg"], option[value="manager_pkg"]')
    .forEach(opt => { opt.style.display = _canSeeBatch(opt.value) ? '' : 'none'; });

  if (!isTransfer) {
    document.getElementById('sale-product').value = s.product || 'student';
    document.querySelectorAll('input[name="sale-batchby"]').forEach(r => { r.checked = r.value === (s.batchby || 'self'); });
    document.querySelectorAll('input[name="sale-samerank"]').forEach(r => { r.checked = r.value === (s.samerank || 'self'); });
  }

  onSaleTypeChange();

  const contactNodes = getNodes().filter(n => n.status !== null && n.name);
  const selected = new Set((s.clients || []).map(String));
  document.getElementById('sale-pax').innerHTML = contactNodes.length
    ? contactNodes.map(n => `<div class="ev-pax${selected.has(String(n.id)) ? ' selected' : ''}" data-nid="${n.id}" onclick="this.classList.toggle('selected')"><span class="sdot ${n.status || 'gray'}"></span>${_esc(n.name)}</div>`).join('')
    : '<span style="color:var(--text-muted);font-size:12px">尚無人脈節點</span>';

  _setSaleAmountToInput(s.amount || 0);
  _updateSalePreview();
  document.getElementById('sale-modal')?.classList.add('open');
}

export function closeSaleModal() {
  document.getElementById('sale-modal')?.classList.remove('open');
  _editingSaleId = null;
}

// ── Modal change handlers ─────────────────────────────────────────────────────

export function onSaleTypeChange() {
  const isTransfer = document.querySelector('input[name="sale-type"]:checked')?.value === 'transfer';
  const prodGroup  = document.getElementById('sale-product-group');
  const qtyGroup   = document.getElementById('sale-qty-group');
  if (prodGroup) prodGroup.style.display = isTransfer ? 'none' : '';
  if (qtyGroup)  qtyGroup.style.display  = 'none';
  if (isTransfer) {
    if (!_saleManualAmount) _setSaleAmountToInput(TRANSFER_AMOUNT);
    const badge = document.getElementById('sale-modal-product-badge');
    if (badge) { badge.textContent = '舊單轉讓'; badge.style.cssText = 'background:rgba(249,115,22,.15);color:#f97316'; }
    _updateSalePreview();
  } else {
    onSaleProductChange();
  }
}

export function onSaleProductChange() {
  const isTransfer = document.querySelector('input[name="sale-type"]:checked')?.value === 'transfer';
  if (isTransfer) { onSaleTypeChange(); return; }
  const pid = document.getElementById('sale-product')?.value;
  const p   = SALES_PRODUCTS[pid];
  if (!p) return;
  const qty   = p.perPerson ? (parseInt(document.getElementById('sale-qty')?.value) || 1) : 1;
  const isBatch = pid === 'asst_mgr_pkg' || pid === 'manager_pkg';

  const qtyGroup     = document.getElementById('sale-qty-group');
  const batchGroup   = document.getElementById('sale-batchby-group');
  const samerankGroup= document.getElementById('sale-samerank-group');
  if (qtyGroup)      qtyGroup.style.display      = p.perPerson ? '' : 'none';
  if (batchGroup)    batchGroup.style.display     = isBatch ? '' : 'none';
  if (samerankGroup) samerankGroup.style.display  = (!isBatch && !p.perPerson && !p.noSamerank) ? '' : 'none';

  if (!_saleManualAmount) _setSaleAmountToInput(p.price * qty);

  const badge = document.getElementById('sale-modal-product-badge');
  if (badge) { badge.textContent = p.name; badge.style.cssText = `background:${p.bg};color:${p.color}`; }
  _updateSalePreview();
}

export function onSaleAmountFocus() {
  const el = document.getElementById('sale-amount-display');
  if (!el) return;
  const n = _parseMoneyText(el.value);
  if (Number.isFinite(n)) el.value = String(Math.round(n));
}

export function onSaleAmountBlur() {
  const el = document.getElementById('sale-amount-display');
  if (!el) return;
  const n = _parseMoneyText(el.value);
  if (Number.isFinite(n)) el.value = fmtMoney(n);
}

export function onSaleAmountInput() {
  _saleManualAmount = true;
  _updateSalePreview();
}

function _updateSalePreview() {
  const isTransfer = document.querySelector('input[name="sale-type"]:checked')?.value === 'transfer';
  const amount     = _getSaleAmountFromInput();
  const myRate     = _getMyRate();
  const pid        = document.getElementById('sale-product')?.value;
  const p          = SALES_PRODUCTS[pid];
  let myIncome = 0, incomeLabel = fmtMoney(0);

  if (isTransfer) {
    myIncome    = amount;
    incomeLabel = fmtMoney(myIncome);
  } else if (p) {
    if (pid === 'consult') {
      myIncome    = amount;
      incomeLabel = `${fmtMoney(myIncome)} (協談獎金)`;
    } else if (pid === 'asst_mgr_pkg' || pid === 'manager_pkg') {
      const batchby = document.querySelector('input[name="sale-batchby"]:checked')?.value || 'self';
      if (batchby === 'student') {
        const anchor = BATCH_ANCHORS[pid] || 0;
        const diff   = Math.max(0, myRate - anchor);
        myIncome     = amount * diff;
        incomeLabel  = `${fmtMoney(myIncome)} (${(myRate*100).toFixed(0)}%−${(anchor*100).toFixed(0)}%=${(diff*100).toFixed(0)}%)`;
      } else {
        myIncome    = amount * myRate;
        incomeLabel = fmtMoney(myIncome);
      }
    } else {
      const samerank = document.querySelector('input[name="sale-samerank"]:checked')?.value || 'self';
      if (samerank === 'samerank') {
        myIncome    = amount * 0.01;
        incomeLabel = `${fmtMoney(myIncome)} (傘下同階 1%)`;
      } else {
        myIncome    = amount * myRate;
        incomeLabel = fmtMoney(myIncome);
      }
    }
  }

  const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  set('sale-income-preview', incomeLabel);
  set('sale-tax-preview',    fmtMoney(myIncome * SALES_TAX));
  set('sale-net-preview',    fmtMoney(myIncome * (1 - SALES_TAX)));
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

export function saveSale() {
  const isTransfer = document.querySelector('input[name="sale-type"]:checked')?.value === 'transfer';
  const pid        = isTransfer ? 'transfer' : (document.getElementById('sale-product')?.value || 'student');
  const p          = SALES_PRODUCTS[pid];
  const qty        = (!isTransfer && p?.perPerson) ? (parseInt(document.getElementById('sale-qty')?.value) || 1) : 1;
  const amount     = _getSaleAmountFromInput();
  const date       = document.getElementById('sale-date')?.value || '';
  const notes      = document.getElementById('sale-notes')?.value || '';
  const clients    = [...document.querySelectorAll('#sale-pax .ev-pax.selected')].map(el => el.dataset.nid);

  if (!date)   { toast('請選擇日期');   return; }
  if (!amount) { toast('請填寫業績金額'); return; }

  const isBatch  = pid === 'asst_mgr_pkg' || pid === 'manager_pkg';
  const batchby  = isBatch ? (document.querySelector('input[name="sale-batchby"]:checked')?.value || 'self') : 'self';
  const samerank = (!isBatch && !isTransfer && !p?.noSamerank) ? (document.querySelector('input[name="sale-samerank"]:checked')?.value || 'self') : 'self';
  const saleType = isTransfer ? 'transfer' : (pid === 'consult' ? 'bonus' : 'new');

  const sale = { id: _editingSaleId || uid(), saleType, product: pid, amount, qty, clients, batchby, samerank, date, notes };

  if (_editingSaleId) {
    dispatch({ type: 'SALE_UPDATE', payload: { id: _editingSaleId, patch: sale } });
    toast('成交已更新');
  } else {
    dispatch({ type: 'SALE_ADD', payload: sale });
    toast(isTransfer ? '舊單轉讓已記錄' : '新業績成交 🎉');
  }
  closeSaleModal();
  renderSalesPage();
}

export function deleteSale(id) {
  if (!id || !confirm('確定刪除此筆成交？')) return;
  dispatch({ type: 'SALE_DELETE', payload: id });
  renderSalesPage();
  toast('已刪除');
}
