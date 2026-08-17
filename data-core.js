/* ============================================================
 * data-core.js  ―  ITガバナンスレポート データ処理コア
 * Streamlit(app.py) の pandas 処理をブラウザJSへ忠実移植した純粋関数群。
 * Node(テスト) / ブラウザ(本番) 両対応。DOM非依存。
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DataCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── ガバナンス定数（app.py と同一） ──────────────────
  const SITE_GOVERNANCE = {
    '転送サービス':      { label:'転送サービス', risk:3, color:'#DC2626',
      reason:'外部ファイル転送による情報漏洩リスク',
      domains:['gigafile.nu','datadeliver.net','firestorage.jp','filesend.jp'] },
    'クラウドストレージ': { label:'クラウドストレージ', risk:3, color:'#EA580C',
      reason:'シャドウIT・データ持ち出しリスク',
      domains:['drive.google.com','onedrive.live.com','dropbox.com','box.com'] },
    'SNS':               { label:'SNS', risk:2, color:'#D97706',
      reason:'情報漏洩・風評リスク（投稿行為の可能性）',
      domains:['twitter.com','x.com','instagram.com','threads.net','facebook.com','tiktok.com'] },
    'AI・外部サービス':  { label:'AI・外部サービス', risk:2, color:'#7C3AED',
      reason:'機密情報の外部AIへの入力リスク',
      domains:['chatgpt.com','copilot.microsoft.com','notebooklm.google','gemini.google.com'] },
    '動画・娯楽':        { label:'動画・娯楽', risk:1, color:'#2563EB',
      reason:'業務時間中の生産性への影響',
      domains:['youtube.com','youtu.be','nicovideo.jp'] },
    'ショッピング':       { label:'ショッピング', risk:1, color:'#059669',
      reason:'業務時間中の私的利用',
      domains:['amazon.co.jp','rakuten.co.jp','zozo.jp','shopping.yahoo.co.jp'] },
    'その他Web':         { label:'その他Web', risk:0, color:'#94A3B8',
      reason:'一般Webアクセス（業務関連含む）', domains:[] },
  };

  const THRESHOLDS = {
    risk_interception_rate: { green:95, yellow:85 },
    governance_score:       { green:75, yellow:60 },
    workload_concentration: { green:1.5, yellow:2.0 },
    latenight_rate:         { green:2, yellow:5 },
  };

  const DEFAULTS = {
    LATE_NIGHT_START: 22,
    EARLY_MORNING_END: 6,
    OVERTIME_THRESHOLD: 20,
  };

  const BASE_CLR = ['#2563EB','#059669','#D97706','#DC2626','#7C3AED','#EA580C','#0891B2','#BE185D'];
  const STATUS_COLORS = { green:'#059669', yellow:'#D97706', red:'#DC2626' };
  const STATUS_LABELS = { green:'🟢 良好', yellow:'🟡 要注意', red:'🔴 対応が必要です' };

  // ── ヘルパ ────────────────────────────────────────
  function isNil(v){ return v === null || v === undefined || v === '' || (typeof v==='number' && isNaN(v)); }

  function classifyUrl(url) {
    if (isNil(url)) return 'その他Web';
    const u = String(url).toLowerCase();
    let domain = u;
    try { domain = new URL(u).host; } catch (e) { domain = u; }
    for (const cat in SITE_GOVERNANCE) {
      for (const d of SITE_GOVERNANCE[cat].domains) {
        if (domain.indexOf(d) !== -1) return cat;
      }
    }
    return u.indexOf('http') === 0 ? 'その他Web' : null;
  }

  function fmtMonth(p) {
    try {
      const [y, m] = String(p).split('-');
      return `${y}年${parseInt(m,10)}月`;
    } catch (e) { return String(p); }
  }

  function getStatus(value, metric, higherIsBetter) {
    if (higherIsBetter === undefined) higherIsBetter = true;
    const th = THRESHOLDS[metric] || { green:80, yellow:60 };
    if (higherIsBetter) {
      if (value >= th.green) return 'green';
      if (value >= th.yellow) return 'yellow';
      return 'red';
    } else {
      if (value <= th.green) return 'green';
      if (value <= th.yellow) return 'yellow';
      return 'red';
    }
  }

  // "2026/06/01（月）" → Date（括弧内曜日を除去して解析）
  function parsePcDate(s) {
    if (isNil(s)) return null;
    const cleaned = String(s).replace(/[（(][^)）]*[）)]/g, '').trim();
    const m = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2]-1, +m[3]);
  }

  function hmToMinutes(s) {
    if (isNil(s)) return null;
    const parts = String(s).split(':');
    if (parts.length < 2) return null;
    const h = parseInt(parts[0],10), mi = parseInt(parts[1],10);
    if (isNaN(h) || isNaN(mi)) return null;
    return h*60 + mi;
  }

  // Date + "HH:MM[:SS]" → Date（時刻付き）
  function combineDateTime(d, t) {
    if (!d || isNil(t)) return null;
    const parts = String(t).split(':');
    const h = parseInt(parts[0],10), mi = parseInt(parts[1]||'0',10), se = parseInt(parts[2]||'0',10);
    if (isNaN(h) || isNaN(mi)) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi, se||0);
  }

  function ymKey(d) {
    if (!d || isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  function parseDateLoose(s) {
    if (isNil(s)) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function num(v) {
    if (isNil(v)) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g,''));
    return isNaN(n) ? null : n;
  }

  function strip(v){ return isNil(v) ? '' : String(v).trim(); }

  // ── 台帳ロード ────────────────────────────────────
  // rows: 配列(オブジェクト)。列見出しに数字キー('59','68','69','70')を含む想定。
  function loadHw(rows) {
    return rows.map(r0 => {
      const r = Object.assign({}, r0);
      for (const c of ['purchase_date','depreciation_date','inst_date']) {
        if (c in r) r[c] = parseDateLoose(r[c]);
      }
      if ('inst_price' in r) r.inst_price = num(r.inst_price);
      // 数字列 → 名称列
      if ('68' in r) r['会社名'] = r['68'];
      if ('69' in r) r['部署名'] = r['69'];
      if ('70' in r) r['課名']   = r['70'];
      if ('59' in r) r['login_id'] = r['59'];
      const parts = [strip(r['会社名'])];
      if (!isNil(r['部署名'])) parts.push(strip(r['部署名']));
      if (!isNil(r['課名']))   parts.push(strip(r['課名']));
      r['組織'] = parts.filter(x => x && x !== 'nan').join(' ');
      if (!isNil(r.login_id)) {
        let lid = String(r.login_id).trim().toLowerCase();
        r.login_id = (lid === 'nan' || lid === '') ? null : lid;
      } else r.login_id = null;
      return r;
    });
  }

  // ── PC稼働ログロード ──────────────────────────────
  function loadPc(rows, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg);
    return rows.map(r0 => {
      const r = Object.assign({}, r0);
      const d = parsePcDate(r['日付']);
      r['日付_dt'] = d;
      r['月'] = ymKey(d);
      r['月_表示'] = r['月'] ? fmtMonth(r['月']) : null;
      r['曜日'] = d ? ((d.getDay()+6)%7) : null; // 0=月..6=日
      r['休日'] = r['曜日'] !== null ? r['曜日'] >= 5 : false;
      r['開始時刻'] = combineDateTime(d, r['初回ログ時刻']);
      r['終了時刻'] = combineDateTime(d, r['最終ログ時刻']);
      r['ログ時間_分'] = hmToMinutes(r['ログ時間']);
      const endH = r['終了時刻'] ? r['終了時刻'].getHours() : null;
      const startH = r['開始時刻'] ? r['開始時刻'].getHours() : null;
      r['深夜稼働'] = (endH !== null && endH >= cfg.LATE_NIGHT_START) ||
                      (startH !== null && startH < cfg.EARLY_MORNING_END);
      r['時間外稼働'] = (endH !== null && endH >= cfg.OVERTIME_THRESHOLD);
      return r;
    });
  }

  // フィルタ後の再計算（app.py 278-279 行：終了時刻のみで判定）
  function recomputePcFlags(rows, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg);
    for (const r of rows) {
      const endH = r['終了時刻'] ? r['終了時刻'].getHours() : null;
      r['時間外稼働'] = (endH !== null && endH >= cfg.OVERTIME_THRESHOLD);
      r['深夜稼働']   = (endH !== null && endH >= cfg.LATE_NIGHT_START);
    }
    return rows;
  }

  // ── アクセスログロード（複数ファイル結合） ─────────
  function loadAc(fileRowsList) {
    let all = [];
    for (const rows of fileRowsList) {
      for (const r0 of rows) {
        const r = Object.assign({}, r0);
        const d = parseDateLoose(r['日時']);
        r['日時_dt'] = d;
        r['月'] = ymKey(d);
        r['月_表示'] = r['月'] ? fmtMonth(r['月']) : null;
        r['時刻_時'] = d ? d.getHours() : null;
        r['勤務時間内'] = r['時刻_時'] !== null && r['時刻_時'] >= 8 && r['時刻_時'] <= 19;
        r['login_id'] = isNil(r['ログオン ユーザー名']) ? 'nan'
                        : String(r['ログオン ユーザー名']).trim().toLowerCase();
        const cat = classifyUrl(r['詳細 2']);
        r['リスク分類'] = cat;
        r['リスクレベル'] = cat && SITE_GOVERNANCE[cat] ? SITE_GOVERNANCE[cat].risk : 0;
        const kind = strip(r['種類']);
        r['Webアクセス'] = kind === 'Web アクセス監視';
        r['デバイス操作'] = kind.indexOf('デバイス') !== -1;
        r['アプリ監視'] = kind.indexOf('アプリケーション') !== -1;
        all.push(r);
      }
    }
    all.sort((a,b) => {
      const ta = a['日時_dt'] ? a['日時_dt'].getTime() : 0;
      const tb = b['日時_dt'] ? b['日時_dt'].getTime() : 0;
      return ta - tb;
    });
    return all;
  }

  // ── 台帳結合 ─────────────────────────────────────
  function joinLedgers(hw, pc, ac) {
    // login_id → 台帳情報
    const byLogin = {};
    for (const r of hw) {
      if (!isNil(r.login_id) && !(r.login_id in byLogin)) {
        byLogin[r.login_id] = r;
      }
    }
    for (const r of ac) {
      const h = byLogin[r.login_id];
      r['台帳_氏名']   = h ? h.user_name : null;
      r['台帳_端末名'] = h ? h.machine_name : null;
      r['台帳_会社名'] = h ? h['会社名'] : null;
      r['台帳_部署名'] = h ? h['部署名'] : null;
      r['台帳_課名']   = h ? h['課名'] : null;
      r['台帳_組織']   = h ? h['組織'] : null;
    }
    // machine_name → 台帳情報
    const byMachine = {};
    for (const r of hw) {
      if (!isNil(r.machine_name) && !(r.machine_name in byMachine)) {
        byMachine[r.machine_name] = r;
      }
    }
    for (const r of pc) {
      const h = byMachine[r['端末エージェント名']];
      r['台帳_氏名']     = h ? h.user_name : null;
      r['台帳_login_id'] = h ? h.login_id : null;
      r['台帳_会社名']   = h ? h['会社名'] : null;
      r['台帳_部署名']   = h ? h['部署名'] : null;
      r['台帳_課名']     = h ? h['課名'] : null;
      r['台帳_組織']     = h ? h['組織'] : null;
    }
    return { hw, pc, ac };
  }

  // ── 集計ユーティリティ ────────────────────────────
  function groupBy(rows, keyFn) {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (k === null || k === undefined) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  }
  function mean(arr){ const v = arr.filter(x=>x!==null&&!isNaN(x)); return v.length? v.reduce((a,b)=>a+b,0)/v.length : 0; }
  function sum(arr){ return arr.reduce((a,b)=>a+(b||0),0); }
  function uniqueCount(rows, keyFn){ const s = new Set(); for(const r of rows){ const k=keyFn(r); if(!isNil(k)) s.add(k);} return s.size; }
  function round(v, n){ const f = Math.pow(10,n||0); return Math.round(v*f)/f; }

  // ── ②Webガバナンス健全度（部署除外を適用したacを渡せば、その除外を反映した集計を返す） ──
  function computeWebGovernance(ac) {
    const kpis = {};
    const web = ac.filter(r => r['Webアクセス']);
    if (web.length > 0) {
      const totalWeb = web.length;
      const riskWeighted = sum(web.map(r => r['リスクレベル']));
      const maxPossible = totalWeb * 3;
      const density = maxPossible > 0 ? riskWeighted / maxPossible : 0;
      kpis.governance_score = round((1 - density) * 100, 1);
      const catCounts = {};
      for (const r of web) { if (!isNil(r['リスク分類'])) catCounts[r['リスク分類']] = (catCounts[r['リスク分類']]||0)+1; }
      kpis.cat_counts = catCounts;
      kpis.total_web = totalWeb;
      kpis.high_risk_count = web.filter(r => r['リスクレベル']===3).length;
      kpis.medium_risk_count = web.filter(r => r['リスクレベル']===2).length;
      kpis.sns_count = catCounts['SNS']||0;
      kpis.ai_count = catCounts['AI・外部サービス']||0;
    } else {
      kpis.governance_score = 100.0; kpis.cat_counts = {}; kpis.total_web = 0;
      kpis.high_risk_count = 0; kpis.medium_risk_count = 0; kpis.sns_count = 0; kpis.ai_count = 0;
    }
    return kpis;
  }

  // ── KPI計算エンジン（app.py calc_governance_kpis 忠実移植） ──
  function calcGovernanceKpis(pc, ac, hw) {
    const kpis = {};

    // ① リスク遮断完遂率
    const blockEvents = ac.filter(r => /監視|遮断|禁止/.test(strip(r['種類'])));
    const hasBlockCol = ac.some(r => '防止・禁止' in r);
    const highRiskEvents = hasBlockCol ? ac.filter(r => !isNil(r['防止・禁止'])) : [];
    const totalRiskEvents = blockEvents.length;
    const blockedCount = highRiskEvents.length > 0 ? highRiskEvents.length : totalRiskEvents;
    const interceptionRate = totalRiskEvents > 0
      ? Math.min(100, blockedCount / totalRiskEvents * 100) : 100;
    kpis.interception_rate = round(interceptionRate, 1);
    kpis.total_risk_events = totalRiskEvents;
    kpis.blocked_count = blockedCount;

    // ② ガバナンス健全度
    Object.assign(kpis, computeWebGovernance(ac));

    // ③ 業務偏重指数
    const deptGroups = groupBy(pc.filter(r=>!isNil(r['台帳_部署名'])), r=>r['台帳_部署名']);
    const deptAvg = [];
    deptGroups.forEach((rows, dept) => { deptAvg.push([dept, mean(rows.map(r=>r['ログ時間_分']))]); });
    if (deptAvg.length >= 2) {
      const overallAvg = mean(deptAvg.map(d=>d[1]));
      let maxDept = deptAvg[0][0], maxVal = deptAvg[0][1];
      for (const [d,v] of deptAvg) if (v > maxVal) { maxVal=v; maxDept=d; }
      kpis.workload_concentration = overallAvg > 0 ? round(maxVal/overallAvg, 2) : 1.0;
      kpis.busiest_dept = maxDept;
      kpis.busiest_hours = round(maxVal/60, 1);
      kpis.avg_hours = round(overallAvg/60, 1);
    } else {
      kpis.workload_concentration = 1.0; kpis.busiest_dept = '-'; kpis.busiest_hours = 0; kpis.avg_hours = 0;
    }

    // ④ 深夜稼働率
    const totalDays = pc.length;
    const latenightDays = pc.filter(r=>r['深夜稼働']).length;
    kpis.latenight_rate = totalDays > 0 ? round(latenightDays/totalDays*100, 1) : 0;
    kpis.latenight_days = latenightDays;
    kpis.holiday_active = pc.filter(r=>r['休日']).length;

    // ⑤ IT資産健全性
    const totalDevices = hw.length;
    const now = new Date();
    let expired = 0, hasDep = false;
    for (const r of hw) { if (!isNil(r.depreciation_date)) { hasDep = true; if (r.depreciation_date < now) expired++; } }
    if (!hasDep) expired = 0;
    kpis.asset_health = totalDevices > 0 ? round((1 - expired/totalDevices)*100, 1) : 100.0;
    kpis.expired_devices = expired;
    kpis.total_devices = totalDevices;

    return kpis;
  }

  return {
    SITE_GOVERNANCE, THRESHOLDS, DEFAULTS, BASE_CLR, STATUS_COLORS, STATUS_LABELS,
    isNil, classifyUrl, fmtMonth, getStatus, parsePcDate, hmToMinutes, combineDateTime,
    ymKey, parseDateLoose, num, strip,
    loadHw, loadPc, recomputePcFlags, loadAc, joinLedgers,
    groupBy, mean, sum, uniqueCount, round, calcGovernanceKpis, computeWebGovernance,
  };
});
