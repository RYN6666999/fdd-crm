/**
 * main.js
 * CRM 應用程式進入點：初始化、導覽、資料載入、window bridge
 * 依賴：commands.js + 所有 features/*
 */

// ── Core ──────────────────────────────────────────────────────────────────────
import { STORE } from './core/store.js';
import { dispatch, getNodes, gatherSubtree, isHidden } from './core/state.js';
import { toast } from './core/toast.js';
import { undoLast, pushUndo } from './core/undo.js';

// ── Commands ──────────────────────────────────────────────────────────────────
import { CMD, DRAFT } from './commands.js';

// ── Canvas ────────────────────────────────────────────────────────────────────
import { renderNodes, setUpdateStatsFn } from './features/canvas/render.js';
import { drawEdges } from './features/canvas/edges.js';
import { initCanvas, fitView, zoomBy, applyTransform, updateZoomLabel } from './features/canvas/interact.js';
import { setClosePanelFn, setOpenPanelFn } from './features/canvas/interact.js';
import { getSelId, selectNode, deselect } from './features/canvas/select.js';
import { autoLayout, forceLayout } from './features/canvas/layout.js';
import {
  cycleStatus, toggleCollapse, promptDel, copySelected, cutSelected, pasteClipboard,
  headerAddNode, headerAddNote, setNoteColor, setNoteFontSize, saveNoteContent,
  setOpenPanelFn as crudSetOpenPanel, setClosePanelFn as crudSetClosePanel,
  setPanelNodeIdFn,
} from './features/canvas/crud.js';

// ── Panel ─────────────────────────────────────────────────────────────────────
import {
  openPanel, closePanel, savePanel, updateStats,
  markContactedToday, toggleNeed, toggleRegion, toggleAcc,
  copyCSheet, getPanelNodeId, setRenderNodesFn as panelSetRenderNodes,
} from './features/panel/index.js';

// ── Events ────────────────────────────────────────────────────────────────────
import {
  renderCalendar, openEventModal, closeEventModal, saveEvent, deleteEvent,
  calPrev, calNext, calGoToday, setCMD as evSetCMD,
} from './features/events/index.js';

// ── AI ────────────────────────────────────────────────────────────────────────
import { renderAiSettingsCard, saveAiSettings, onAiProviderChange, fetchDynamicModels, updateAiModelBadge } from './features/ai/providers.js';
import { setPersona, renderQuickPrompts, injectPrompt, getCurrentPersona } from './features/ai/personas.js';
import {
  sendChat, renderChat, clearChat, extractAndSaveMemories, deleteMemory,
  toggleMemPanel, switchMemTab, renderMemPanel, addManualMemory,
  generateDailyBriefing, showTodayReminders,
} from './features/ai/chat.js';

// ── Daily ─────────────────────────────────────────────────────────────────────
import {
  renderDailyPage, saveDailyReport, saveMonthlyTarget, renderMonthlyTargetInput,
  dailyToday, dailyPrev, dailyNext,
  updateScheduleSlot, updateBigThree, updateDailyConn, addDailyConn, removeDailyConn,
  updateReflect, saveDailyActInline, loadYestTomorrow,
  saveMonthSalesTarget, saveMonthlyGoalInputs, updateMonthlyProgressBars, renderMonthlyProgress,
} from './features/daily/index.js';

// ── Docs ──────────────────────────────────────────────────────────────────────
import {
  renderDocsPage, openDocModal, closeDocModal, saveDoc, deleteDoc, setDocsSearch,
  docsOnDragOver, docsOnDragLeave, docsOnDrop,
  modalFileOver, modalFileLeave, modalFileDrop, modalFileChange, onDocTypeChange,
} from './features/docs/index.js';

// ── Students ──────────────────────────────────────────────────────────────────
import { renderStudentsPage, openStudentModal, closeStudentModal, saveStudent, deleteStudent, logStudentContact, setStudentsSearch } from './features/students/index.js';

// ── Settings ──────────────────────────────────────────────────────────────────
import {
  initTheme, applyTheme, renderThemeGrid,
  renderLoginCard, saveLogin, exportData, importData, clearAllData, renderShortcutsHelp,
  openSkModal, closeSkModal, resetShortcuts, saveShortcut, setCmdMode, resetCmdPolicy, renderCmdList,
  resetGoogleClientId, startSheetsOAuth, resetSheetsAuth, saveSheetsId,
  saveObsidianPath, openObsidianVault, renderObsidianPath, OB_BACKUP,
} from './features/settings/index.js';

// ── Sales ─────────────────────────────────────────────────────────────────────
import {
  renderSalesPage, salesPrevMonth, salesNextMonth, salesGoToday,
  openSaleModal, openSaleEditModal, closeSaleModal, saveSale, deleteSale,
  onSaleTypeChange, onSaleProductChange, onSaleAmountFocus, onSaleAmountBlur, onSaleAmountInput,
} from './features/sales/index.js';

// ── Canvas Views ──────────────────────────────────────────────────────────────
import { setCrmView, toggleCrmSortDir, renderListView } from './features/canvas/views.js';

// ── Google Calendar ───────────────────────────────────────────────────────────
import { renderGcalCard, startGcalOAuth, disconnectGcal, fetchGcalEvents } from './integrations/gcal.js';

// ── Cloud Sync ────────────────────────────────────────────────────────────────
import { cloudLoadAll, cloudPush, setCloudToken, getCloudToken, testCloudConnection } from './core/cloud-sync.js';

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

let _currentPage = 'canvas';

export function navigate(page) {
  _currentPage = page;

  // Normalise aliases → canonical page ID
  const pageId = page === 'canvas' ? 'crm'
               : page === 'calendar' ? 'events'
               : page;

  // Show / hide pages using inline style (overrides CSS specificity)
  document.querySelectorAll('.page').forEach(s => { s.style.display = 'none'; });
  const section = document.getElementById(`page-${pageId}`);
  if (section) section.style.display = 'flex';

  // Highlight active tab button
  document.querySelectorAll('.tab-btn').forEach(n => n.classList.remove('active'));
  // Match by onclick content or data-page
  const navEl = document.querySelector(`.tab-btn[onclick*="'${page}'"]`)
             || document.querySelector(`.tab-btn[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  switch (pageId) {
    case 'crm':      setCrmView('tree'); break;
    case 'events':   renderCalendar(); break;
    case 'daily':    renderDailyPage(); renderMonthlyTargetInput(); break;
    case 'docs':     renderDocsPage(); break;
    case 'sales':    renderSalesPage(); break;
    case 'students': renderStudentsPage(); break;
    case 'ai':       renderChat(); renderQuickPrompts(getCurrentPersona()); updateAiModelBadge(); break;
    case 'settings':
      renderLoginCard(); renderAiSettingsCard(); renderGcalCard(); renderShortcutsHelp();
      renderObsidianPath(); renderCmdList(); renderThemeGrid();
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data bootstrap
// ─────────────────────────────────────────────────────────────────────────────

function loadData() {
  dispatch({ type: 'NODES_LOAD',                payload: STORE.loadNodes() || [] });
  dispatch({ type: 'EVENTS_SET',                payload: STORE.loadEvents() });
  dispatch({ type: 'SALES_SET',                 payload: STORE.loadSales() });
  dispatch({ type: 'DAILY_REPORTS_SET',         payload: STORE.loadDailyReports() });
  dispatch({ type: 'MONTHLY_GOALS_SET',         payload: STORE.loadMonthlyGoals() });
  dispatch({ type: 'MONTHLY_SALES_TARGETS_SET', payload: STORE.loadMonthlySalesTargets() });
  dispatch({ type: 'DOCS_SET',                  payload: STORE.loadDocs() });
  dispatch({ type: 'STUDENTS_SET',              payload: STORE.loadStudents() });
  dispatch({ type: 'CHAT_SET',                  payload: STORE.loadChat() });
}

/** 啟動時從 KV 拉最新資料，合併後 re-dispatch（有 token 才執行） */
async function syncFromCloud() {
  const remote = await cloudLoadAll();
  if (!remote || !Object.keys(remote).length) return;
  const TYPE_MAP = {
    nodes:               'NODES_LOAD',
    events:              'EVENTS_SET',
    sales:               'SALES_SET',
    dailyReports:        'DAILY_REPORTS_SET',
    monthlyGoals:        'MONTHLY_GOALS_SET',
    monthlySalesTargets: 'MONTHLY_SALES_TARGETS_SET',
    docs:                'DOCS_SET',
    students:            'STUDENTS_SET',
  };
  for (const [key, type] of Object.entries(TYPE_MAP)) {
    if (remote[key] != null) {
      // 同時寫回 localStorage（讓下次離線載入也是最新）
      STORE['save' + key.charAt(0).toUpperCase() + key.slice(1)]?.(remote[key]);
      dispatch({ type, payload: remote[key] });
    }
  }
  // 記憶單獨處理（不走 dispatch，直接寫 localStorage；下次 memoryService.list() 會讀到）
  if (remote.memories != null) {
    localStorage.setItem('crm-ai-memories', JSON.stringify(remote.memories));
  }
  console.log('[Cloud] 同步完成，已更新:', Object.keys(remote).join(', '));
  renderNodes(); drawEdges(); updateStats();
}

// ─────────────────────────────────────────────────────────────────────────────
// Window bridge (HTML inline onclick handlers → ES modules)
// ─────────────────────────────────────────────────────────────────────────────

function registerWindowBridge() {
  // ── 內部 __crm* 橋接（render.js / panel/index.js 模板用）────────────────
  window.__crmSelectNode      = id => selectNode(id);
  window.__crmOpenPanel       = id => openPanel(id);
  window.__crmClosePanel      = () => closePanel();
  window.__crmCycleStatus     = id => cycleStatus(id);
  window.__crmToggleCollapse  = id => toggleCollapse(id);
  window.__crmPromptDel       = id => promptDel(id);
  window.__crmGatherSubtree   = id => gatherSubtree(id);
  window.__crmIsHidden        = id => isHidden(id);
  window.__crmSetNoteColor    = (id, c) => setNoteColor(id, c);
  window.__crmSetNoteFontSize = (id, s) => setNoteFontSize(id, s);
  window.__crmSaveNoteContent = id => saveNoteContent(id);
  window.__crmRenderNodes     = () => renderNodes();
  window.__crmDrawEdges       = () => drawEdges();

  window.__crmOpenEventModal  = (id, date) => openEventModal(id, date);
  window.__crmCloseEventModal = () => closeEventModal();
  window.__crmSaveEvent       = () => saveEvent();
  window.__crmDeleteEvent     = id => deleteEvent(id);

  window.__crmOpenDocModal    = id => openDocModal(id);
  window.__crmCloseDocModal   = () => closeDocModal();
  window.__crmSaveDoc         = () => saveDoc();
  window.__crmDeleteDoc       = id => deleteDoc(id);

  window.__crmOpenStudentModal  = id => openStudentModal(id);
  window.__crmCloseStudentModal = () => closeStudentModal();
  window.__crmSaveStudent       = () => saveStudent();
  window.__crmDeleteStudent     = id => deleteStudent(id);
  window.__crmLogStudentContact = id => logStudentContact(id);

  window.__crmSavePanel         = () => savePanel();
  window.__crmMarkContacted     = () => markContactedToday();
  window.__crmToggleNeed        = el => toggleNeed(el);
  window.__crmToggleRegion      = el => toggleRegion(el);
  window.__crmToggleAcc         = h => toggleAcc(h);
  window.__crmCopyCSheet        = () => copyCSheet();

  window.__crmInjectPrompt      = idx => injectPrompt(idx);
  window.__crmExtractMemories   = c => extractAndSaveMemories(c);
  window.__crmDeleteMemory      = id => deleteMemory(id);

  window.__crmOpenSaleModal     = id => openSaleModal(id);
  window.__crmDeleteSale        = id => deleteSale(id);
  window.openSaleEditModal      = id => openSaleEditModal(id);

  window.__crmNavigate          = page => navigate(page);
  window.__crmFullRefresh       = () => { loadData(); navigate(_currentPage); };

  // ── A 類：HTML inline onclick 直接呼叫的全域名稱 ────────────────────────
  // Navigation
  window.switchPage             = page => navigate(page);

  // Canvas
  window.fitView                = () => fitView();
  window.zoomBy                 = v  => zoomBy(v);
  window.forceLayout            = () => forceLayout(renderNodes, fitView);
  window.headerAddNode          = () => headerAddNode(CMD);
  window.headerAddNote          = () => headerAddNote(CMD);
  window.setCrmView             = v  => setCrmView(v);
  window.toggleCrmSortDir       = () => toggleCrmSortDir();

  // Events
  window.calPrev                = () => calPrev();
  window.calNext                = () => calNext();
  window.calGoToday             = () => calGoToday();
  window.openEventModal         = (id, date) => openEventModal(id, date);
  window.closeEventModal        = () => closeEventModal();
  window.saveEvent              = () => saveEvent();
  window.deleteEvent            = id => deleteEvent(id);
  window.calTodayStr            = () => new Date().toISOString().slice(0, 10);

  // Sales
  window.salesPrevMonth         = () => salesPrevMonth();
  window.salesNextMonth         = () => salesNextMonth();
  window.salesGoToday           = () => salesGoToday();
  window.openSaleModal          = id => openSaleModal(id);
  window.closeSaleModal         = () => closeSaleModal();
  window.saveSale               = () => saveSale();
  window.onSaleTypeChange       = () => onSaleTypeChange();
  window.onSaleProductChange    = () => onSaleProductChange();
  window.onSaleAmountFocus      = () => onSaleAmountFocus();
  window.onSaleAmountBlur       = () => onSaleAmountBlur();
  window.onSaleAmountInput      = () => onSaleAmountInput();

  // Daily
  window.dailyPrev              = () => dailyPrev();
  window.dailyNext              = () => dailyNext();
  window.dailyToday             = () => dailyToday();
  window.saveDailyReport        = () => saveDailyReport();
  window.renderDailyPage        = () => renderDailyPage();
  window.updateScheduleSlot     = (i, f, v) => updateScheduleSlot(i, f, v);
  window.updateBigThree         = (i, f, v) => updateBigThree(i, f, v);
  window.updateDailyConn        = (i, f, v) => updateDailyConn(i, f, v);
  window.addDailyConn           = () => addDailyConn();
  window.removeDailyConn        = i => removeDailyConn(i);
  window.updateReflect          = (t, i, v) => updateReflect(t, i, v);
  window.saveDailyActInline     = el => saveDailyActInline(el);
  window.loadYestTomorrow       = () => loadYestTomorrow();
  window.saveMonthSalesTarget   = () => saveMonthSalesTarget();
  window.saveMonthlyGoalInputs  = () => saveMonthlyGoalInputs();

  // Docs
  window.openDocModal           = () => openDocModal(null);
  window.closeDocModal          = () => closeDocModal();
  window.saveDoc                = () => saveDoc();

  // Students
  window.addStudentModal        = () => openStudentModal(null);
  window.closeStudentDrawer     = () => closeStudentModal();
  window.studentSearch          = q  => setStudentsSearch(q);

  // Panel
  window.closePanel             = () => closePanel();
  window.savePanel              = () => savePanel();

  // AI
  window.sendChat               = () => sendChat();
  window.clearChat              = () => clearChat();
  window.setPersona             = (k, el) => setPersona(k, el);
  window.onAiProviderChange     = () => onAiProviderChange();
  window.saveAiSettings         = () => saveAiSettings();
  window.fetchDynamicModels     = () => fetchDynamicModels();

  // Settings
  window.exportAll              = () => exportData();
  window.importAll              = () => document.getElementById('import-file-input')?.click();
  window.clearAllData           = () => clearAllData();
  window.startGoogleOAuth       = () => startGcalOAuth();
  window.fetchGcalEvents        = () => fetchGcalEvents();
  window.disconnectGcal         = () => disconnectGcal();
  window.renderSettingsPage     = () => {
    renderLoginCard(); renderAiSettingsCard(); renderGcalCard(); renderShortcutsHelp();
    renderObsidianPath(); renderCmdList(); renderThemeGrid();
  };
  window.__crmApplyTheme        = (t) => { applyTheme(t); renderThemeGrid(); };
  window.doLogout = () => {
    if (!confirm('確定要登出？')) return;
    localStorage.removeItem('crm-login');
    window.location.replace('./login.html');
  };

  // Settings — shortcuts / cmd / gcal / sheets / obsidian
  window.openSkModal            = () => openSkModal();
  window.closeSkModal           = () => closeSkModal();
  window.resetShortcuts         = () => resetShortcuts();
  window.__crmSaveShortcut      = (a, k) => saveShortcut(a, k);
  window.setCmdMode             = v  => setCmdMode(v);
  window.resetCmdPolicy         = () => resetCmdPolicy();
  window.__crmToggleCmd         = (k, on) => {
    const disabled = new Set(JSON.parse(localStorage.getItem('crm-disabled-commands') || '[]'));
    on ? disabled.delete(k) : disabled.add(k);
    localStorage.setItem('crm-disabled-commands', JSON.stringify([...disabled]));
    renderCmdList();
  };
  window.resetGoogleClientId    = () => resetGoogleClientId();
  window.startSheetsOAuth       = () => startSheetsOAuth();
  window.resetSheetsAuth        = () => resetSheetsAuth();
  window.saveSheetsId           = () => saveSheetsId();
  window.saveObsidianPath       = () => saveObsidianPath();
  window.openObsidianVault      = () => openObsidianVault();
  window.OB_BACKUP              = OB_BACKUP;

  // AI memory panel
  window.toggleMemPanel         = () => toggleMemPanel();
  window.switchMemTab           = (t, el) => switchMemTab(t, el);
  window.renderMemPanel         = () => renderMemPanel();
  window.addManualMemory        = () => addManualMemory();
  window.generateDailyBriefing  = () => generateDailyBriefing();
  window.showTodayReminders     = () => showTodayReminders();

  // Chat input (HTML inline handlers, logic already in initChatInput via addEventListener)
  window.chatKeydown    = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } };
  window.autoResizeChat = el => { if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; } };

  // Docs drag-drop
  window.docsOnDragOver         = e => docsOnDragOver(e);
  window.docsOnDragLeave        = e => docsOnDragLeave(e);
  window.docsOnDrop             = e => docsOnDrop(e);
  window.modalFileOver          = e => modalFileOver(e);
  window.modalFileLeave         = e => modalFileLeave(e);
  window.modalFileDrop          = e => modalFileDrop(e);
  window.modalFileChange        = el => modalFileChange(el);
  window.onDocTypeChange        = () => onDocTypeChange();
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard shortcuts
// ─────────────────────────────────────────────────────────────────────────────

function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    const meta  = e.metaKey || e.ctrlKey;

    if (meta && e.key === 'z') { e.preventDefault(); undoLast(renderNodes, deselect); return; }
    if (meta && e.key === 'c') { e.preventDefault(); copySelected(); return; }
    if (meta && e.key === 'x') { e.preventDefault(); cutSelected();  return; }
    if (meta && e.key === 'v') { e.preventDefault(); pasteClipboard(); return; }

    if (inInput) return;

    switch (e.key) {
      case 'Delete': case 'Backspace': {
        const sid = getSelId();
        if (sid) { e.preventDefault(); promptDel(sid); }
        break;
      }
      case 'Tab': {
        const sid = getSelId();
        if (sid) { e.preventDefault(); import('./features/canvas/crud.js').then(m => m.addChild(sid)); }
        break;
      }
      case 'Enter': {
        const sid = getSelId();
        if (sid) { e.preventDefault(); import('./features/canvas/crud.js').then(m => m.addSibling(sid)); }
        break;
      }
      case 'Escape':
        deselect(); closePanel();
        break;
      case 'f': case 'F':
        fitView(); break;
      case '+': case '=':
        zoomBy(1.2); break;
      case '-':
        zoomBy(1 / 1.2); break;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat input auto-resize + Enter to send
// ─────────────────────────────────────────────────────────────────────────────

function initChatInput() {
  const inp = document.getElementById('chat-input');
  if (!inp) return;
  inp.addEventListener('input', () => {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency injection wiring
// ─────────────────────────────────────────────────────────────────────────────

function wireDependencies() {
  // canvas/interact needs open/close panel
  setClosePanelFn(closePanel);
  setOpenPanelFn(openPanel);

  // canvas/crud needs panel fns
  crudSetOpenPanel(openPanel);
  crudSetClosePanel(closePanel);
  setPanelNodeIdFn(getPanelNodeId);

  // panel needs renderNodes for after-save refresh
  panelSetRenderNodes(renderNodes);

  // canvas/render needs updateStats
  setUpdateStatsFn(updateStats);

  // events CMD guard
  evSetCMD(CMD);
}

// ─────────────────────────────────────────────────────────────────────────────
// init()
// ─────────────────────────────────────────────────────────────────────────────

export async function init() {
  initTheme();
  loadData();           // 先從 localStorage 載（即時可用）
  wireDependencies();
  registerWindowBridge();
  initCanvas();
  initKeyboard();
  initChatInput();

  // Initial render
  renderNodes();
  drawEdges();
  fitView();
  updateStats();

  // Restore last page
  const lastPage = localStorage.getItem('crm-last-page') || 'crm';
  navigate(lastPage);

  // Persist current page on tab-btn clicks (persist before navigating)
  document.querySelectorAll('.tab-btn[onclick]').forEach(el => {
    el.addEventListener('click', () => {
      const m = el.getAttribute('onclick')?.match(/switchPage\('([^']+)'\)/);
      if (m) localStorage.setItem('crm-last-page', m[1]);
    });
  });

  // 背景從 KV 拉最新（有 token 才跑，不阻塞啟動）
  syncFromCloud().catch(() => {});

  // 暴露 cloud-sync 給設定頁
  window.__crmSetCloudToken     = setCloudToken;
  window.__crmGetCloudToken     = getCloudToken;
  window.__crmTestCloudConn     = testCloudConnection;
  window.__crmCloudPush         = cloudPush;

  console.log('[CRM] init complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

function bootWithErrorReport() {
  init().catch(err => {
    console.error('[CRM BOOT ERROR]', err);
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:60px;left:0;right:0;z-index:99999;background:#3a0000;color:#ff8080;padding:16px;font-size:13px;font-family:monospace;white-space:pre-wrap;overflow:auto;max-height:40vh';
    div.textContent = '⚠️ 啟動錯誤（請截圖回報）:\n' + (err?.stack || err);
    document.body?.appendChild(div);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootWithErrorReport);
} else {
  bootWithErrorReport();
}
