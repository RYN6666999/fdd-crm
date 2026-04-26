/**
 * core/calc.js
 * Pure calculation layer — 業績/活動/進度計算
 * IN: data objects  OUT: numbers / plain objects
 * FORBIDDEN: no DOM, no localStorage, no side effects
 */

import { SALES_TAX, BATCH_ANCHORS } from '../contracts/types.js';

export const CALC = {

  /**
   * 單筆業績收入
   * @param {{ saleType: string, product: string, amount: number, batchby: string, samerank: string }} sale
   * @param {number} myRate  - 個人費率 (e.g. 0.15)
   * @returns {number}
   */
  saleIncome(sale, myRate) {
    if (sale.saleType === 'transfer') return sale.amount;
    if (sale.saleType === 'bonus')    return sale.amount;
    const isBatch = sale.product === 'asst_mgr_pkg' || sale.product === 'manager_pkg';
    if (isBatch && sale.batchby === 'student')
      return sale.amount * Math.max(0, myRate - (BATCH_ANCHORS[sale.product] || 0));
    if (sale.samerank === 'samerank') return sale.amount * 0.01;
    return sale.amount * myRate;
  },

  /**
   * 月份業績匯總
   * @param {object[]} salesData
   * @param {number}   myRate
   * @param {string}   monthPrefix  e.g. "2026-03"
   * @returns {{ gross, transferTotal, bonusTotal, income, tax, net, newCount, bonusCount, totalCount, sorted }}
   */
  monthSummary(salesData, myRate, monthPrefix) {
    const ms        = salesData.filter(s => s.date && s.date.startsWith(monthPrefix));
    const newSales  = ms.filter(s => s.saleType === 'new');
    const transfers = ms.filter(s => s.saleType === 'transfer');
    const bonuses   = ms.filter(s => s.saleType === 'bonus');
    const gross         = newSales.reduce((a, s)  => a + s.amount, 0);
    const transferTotal = transfers.reduce((a, s) => a + s.amount, 0);
    const bonusTotal    = bonuses.reduce((a, s)   => a + s.amount, 0);
    const income = ms.reduce((a, s) => a + CALC.saleIncome(s, myRate), 0);
    const tax    = income * SALES_TAX;
    const net    = income - tax;
    const sorted = [...ms].sort((a, b) => b.date.localeCompare(a.date));
    return { gross, transferTotal, bonusTotal, income, tax, net, newCount: newSales.length, bonusCount: bonuses.length, totalCount: ms.length, sorted };
  },

  /**
   * 月份活動累計
   * @param {object} dailyReports  - { [date]: report }
   * @param {string} monthKey      - e.g. "2026-03"
   * @returns {{ invite, calls, forms, followup, close, consult }}
   */
  monthActuals(dailyReports, monthKey) {
    const t = { invite: 0, calls: 0, forms: 0, followup: 0, close: 0, consult: 0 };
    Object.entries(dailyReports).forEach(([date, r]) => {
      if (date.startsWith(monthKey)) {
        t.invite   += (r['act-invite']   || 0);
        t.calls    += (r['act-calls']    || 0);
        t.forms    += (r['act-forms']    || 0);
        t.followup += (r['act-followup'] || 0);
        t.close    += (r['act-close']    || 0);
        t.consult  += (r['act-consult']  || 0);
      }
    });
    return t;
  },

  /**
   * 活動進度條資料
   * @param {{ invite, calls, forms, followup, close, consult }} actuals
   * @param {object} goals  - { 'mg-invite': n, ... }
   * @returns {Array<{ k, label, goalK, actual, goal, pct, full }>}
   */
  progressItems(actuals, goals) {
    return [
      { k: 'invite',   label: '邀約', goalK: 'mg-invite'   },
      { k: 'calls',    label: '電話', goalK: 'mg-calls'    },
      { k: 'forms',    label: '問卷', goalK: 'mg-forms'    },
      { k: 'followup', label: '跟進', goalK: 'mg-followup' },
      { k: 'close',    label: '成交', goalK: 'mg-close'    },
      { k: 'consult',  label: '協談', goalK: 'mg-consult'  },
    ].map(d => {
      const goal   = goals[d.goalK] || 0;
      const actual = actuals[d.k]   || 0;
      const pct    = goal ? Math.min(100, Math.round(actual / goal * 100)) : 0;
      const full   = goal > 0 && actual >= goal;
      return { ...d, actual, goal, pct, full };
    });
  },

  /**
   * 業績進度
   * @param {object[]} salesData
   * @param {number}   myRate
   * @param {string}   monthPrefix
   * @param {number}   salesTarget
   * @returns {{ income, pct, full }}
   */
  salesProgress(salesData, myRate, monthPrefix, salesTarget) {
    const income = salesData
      .filter(s => s.date && s.date.startsWith(monthPrefix))
      .reduce((a, s) => a + CALC.saleIncome(s, myRate), 0);
    const pct  = salesTarget ? Math.min(100, Math.round(income / salesTarget * 100)) : 0;
    const full = salesTarget > 0 && income >= salesTarget;
    return { income, pct, full };
  },
};
