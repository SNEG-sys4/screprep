/* ============================================================
 * render.js ― 各タブの画面描画。グローバル App / Charts / DataCore を使用。
 * ============================================================ */
(function (global) {
  'use strict';
  const DC = global.DataCore, CH = global.Charts;
  const round = DC.round, isNil = DC.isNil, sum = DC.sum, g = DC.groupBy, mean = DC.mean;

  function badge(level){
    return ({ green:['🟢','良好','#059669','#ECFDF5'], yellow:['🟡','要注意','#D97706','#FFFBEB'],
      red:['🔴','対応が必要です','#DC2626','#FEF2F2'] }[level] || ['🟢','良好','#059669','#ECFDF5']);
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function scoreCard(title, value, unit, level){
    const [ic,lb,c,bg]=badge(level);
    return `<div class="score-card" style="background:${bg};border-color:${c}">
      <div class="lbl">${title}</div><div class="val" style="color:${c}">${value}${unit}</div>
      <div class="bd" style="color:${c}">${ic} ${lb}</div></div>`;
  }
  function siaCard(level, title, statusText, insight, action, metricVal, metricUnit){
    const [ic,lb,c,bg]=badge(level);
    const mv = metricVal!==undefined && metricVal!==null ? `<div class="metric-big" style="color:${c}">${metricVal}${metricUnit||''}</div>`:'';
    return `<div class="sia" style="background:${bg};border-color:${c}">
      <div class="head"><span style="font-size:1.3rem">${ic}</span><span class="title">${title}</span>
        <span class="badge" style="background:${c}">${lb}</span></div>
      ${mv}<div class="st">${statusText}</div><hr>
      <div class="k" style="color:${c}">INSIGHT</div><div class="v">${insight}</div>
      <div class="k" style="color:${c}">ACTION</div><div class="v">${action}</div></div>`;
  }
  function metric(lbl,val){ return `<div class="metric"><div class="m-lbl">${lbl}</div><div class="m-val">${val}</div></div>`; }
  function chartBox(id){ return `<div class="chart-box"><div id="${id}"></div></div>`; }
  function plot(id, fig){ if(!fig) return; const el=document.getElementById(id); if(el) Plotly.newPlot(el, fig.data, fig.layout, CH.CFG); }
  function tableHtml(cols, rows){
    let h='<div class="table-scroll"><table class="dt"><thead><tr>'+cols.map(c=>`<th>${esc(c)}</th>`).join('')+'</tr></thead><tbody>';
    for(const r of rows){ h+='<tr>'+r.map(c=>`<td>${esc(c)}</td>`).join('')+'</tr>'; }
    return h+'</tbody></table></div>';
  }
  function fmtInt(n){ return (n||0).toLocaleString('ja-JP'); }

  // ══ TAB1 サマリー ══
  function renderT1(){
    const k=App.kpis, mj=App.monthsJp;
    const period = mj.length ? `${mj[0]} ～ ${mj[mj.length-1]}` : '全期間';
    const ir=k.interception_rate, gs=k.governance_score, wc=k.workload_concentration, ln=k.latenight_rate;
    const irS=DC.getStatus(ir,'risk_interception_rate',true), gsS=DC.getStatus(gs,'governance_score',true),
          wcS=DC.getStatus(wc,'workload_concentration',false), lnS=DC.getStatus(ln,'latenight_rate',false);
    const hr=k.high_risk_count, mr=k.medium_risk_count, tw=k.total_web;
    const highCats=Object.keys(DC.SITE_GOVERNANCE).filter(c=>DC.SITE_GOVERNANCE[c].risk===3 && (k.cat_counts||{})[c]>0);
    const highStr=highCats.length?highCats.join('・'):'なし';

    let html = `<div class="sec-title">📋 ITガバナンス評価サマリー ｜ 対象期間：${period}</div>`;
    html += `<div class="grid4">
      ${scoreCard('リスク遮断完遂率',ir,'%',irS)}
      ${scoreCard('Webガバナンス健全度',gs,'点',gsS)}
      ${scoreCard('業務偏重指数',wc,'倍',wcS)}
      ${scoreCard('深夜稼働率',ln,'%',lnS)}</div>`;
    html += `<div class="sec-title">経営層向け 評価コメント</div>`;

    html += siaCard(irS,'① セキュリティ統制：リスク遮断完遂率',
      `対象期間の監視イベント ${fmtInt(k.total_risk_events)}件 ／ 遮断・検知完遂率 ${ir}%`,
      irS==='green' ? '現在のセキュリティポリシーはしっかり機能しています。未許可デバイスや禁止アプリのブロックが適切に行われており、情報漏洩リスクへの対策は安定した水準を維持できています。'
        : '一部のイベントで遮断が完了していない可能性があります。ポリシーの抜け穴や、新しいデバイス・アプリへの対応漏れが生じている可能性を確認しておく必要があります。',
      irS==='green' ? '現行ポリシーの定期的な見直しを継続します。四半期ごとに新しい脅威動向を反映し、ルールの鮮度を保ちます。'
        : '未対応イベントの原因を確認し、ポリシーの見直しを次回の改訂サイクルに組み込みます。まずは管理者側での事実確認から始めましょう。', ir,'%');

    html += siaCard(gsS,'② Webアクセス：ガバナンス健全度スコア',
      `全Webアクセス ${fmtInt(tw)}件 ／ 高リスク ${fmtInt(hr)}件（${tw?round(hr/tw*100,1):0}%）中リスク ${fmtInt(mr)}件（${tw?round(mr/tw*100,1):0}%）`,
      highCats.length ? `高リスクカテゴリとして検出されたサービスは「${highStr}」です。これらは情報の外部持ち出しやデータ漏洩につながる可能性があります。特定の個人を問題視するのではなく、「そういう状況が起きやすい環境になっていないか」という視点で考えることが重要です。`
        : 'SNSや動画サービスへのアクセスが一定数みられますが、業務に必要なケースもあるため、組織全体の傾向として把握しておく程度で問題ありません。現在のガバナンス状態は概ね良好です。',
      gsS!=='green' ? `「${highStr}」の利用が業務上必要なものかどうか、まず部門ごとの傾向を確認します。必要であればホワイトリスト登録を検討し、そうでなければ利用ガイドラインの周知を行います。強制ブロックより先に「なぜ使われているか」を把握するのがスムーズな対応につながります。`
        : '現在の状態を維持します。新しいクラウドサービスやAIツールが増えてきているため、四半期ごとにカテゴリの見直しを行い、リスク分類を最新の状況に合わせていきます。', gs,'点');

    html += siaCard(wcS,'③ 組織健全性：業務偏重指数（部署間の稼働時間格差）',
      `最も稼働時間が長い部署「${k.busiest_dept}」の平均 ${k.busiest_hours}時間 ／ 全社平均 ${k.avg_hours}時間（格差：${wc}倍）`,
      wcS!=='green' ? `「${k.busiest_dept}」に業務が集中している傾向が数字に出ています。これは必ずしもその部署の人たちの問題ではなく、業務量の配分や人員構成に改善の余地があるサインかもしれません。長期的には離職リスクや品質低下にもつながりうるため、経営層として把握しておくべき状況です。`
        : '部署間の稼働時間のバランスは良好な状態です。特定の部署だけに負担が集中している様子は見られません。',
      wcS!=='green' ? '人事・経営企画と情報を共有し、業務量の配分について対話の場を設けることをお勧めします。IT側からは、繰り返し作業の自動化や業務効率化ツールの提案といった形で貢献できます。'
        : '引き続きモニタリングを継続します。業務量が季節変動する部署については、繁忙期に向けた事前の体制確認を行います。', wc,'倍');

    html += siaCard(lnS,'④ セキュリティリスク：深夜・休日稼働状況',
      `深夜稼働（${App.cfg.LATE_NIGHT_START}時以降）：${fmtInt(k.latenight_days)}件（全稼働の${ln}%）　休日稼働：${fmtInt(k.holiday_active)}件`,
      lnS!=='green' ? '深夜や休日の稼働は、管理者が不在の時間帯にシステムが動いている状態です。セキュリティインシデントが発生したとき対応が遅れやすく、また万が一の際に気づきにくいという点でリスクになります。長時間労働の観点からも、念のため実態を把握しておくことをお勧めします。'
        : '深夜・休日の稼働は非常に少ない水準です。管理者不在の時間帯のリスクは最小化されており、現時点で特段の懸念はありません。',
      lnS!=='green' ? '深夜稼働が多い部署・端末を確認し、業務上の必要性があるかどうかを簡単にヒアリングします。必要なものは適切に管理し、そうでないものはポリシーで対応します。いきなり制限するより、まず実態把握が先です。'
        : '深夜稼働が発生した際には自動通知が届く設定を維持し、異常の早期把握ができる体制を続けます。', ln,'%');

    document.getElementById('t1').innerHTML = html;
  }

  // ══ TAB2 リスク遮断・デバイス ══
  function renderT2(){
    const k=App.kpis, ac=App.ac_f, hw=App.hw_f, mj=App.monthsJp;
    const devN=ac.filter(r=>r['デバイス操作']).length;
    let html = `<div class="sec-title">🔒 セキュリティ統制：リスク遮断・デバイス・アプリ管理</div>
      <p class="hint">目的：未許可デバイス・アプリの遮断による情報漏洩リスク・脆弱性対策の完遂率を評価</p>
      <div class="metric-row">${metric('監視イベント総数',fmtInt(k.total_risk_events))}${metric('遮断・検知件数',fmtInt(k.blocked_count))}${metric('遮断完遂率',k.interception_rate+'%')}${metric('デバイス操作検知',fmtInt(devN))}</div>
      <div class="grid2">${chartBox('c2-ev')}${chartBox('c2-blk')}</div>`;

    const webHigh = ac.filter(r=>r['Webアクセス'] && r['リスクレベル']===3);
    html += `<div class="sec-title">🔴 高リスクサービス 検出内訳</div>`;
    if(webHigh.length){
      html += `<div class="grid2">${chartBox('c2-domtable')}${chartBox('c2-dom')}</div>${chartBox('c2-hrtrend')}`;
      const cats=[...new Set(webHigh.map(r=>r['リスク分類']))];
      html += `<div class="warn-box"><b>📌 管理者メモ：</b><br>
        今期は <b>「${cats.join('」「')}」</b> カテゴリへのアクセスが検出されています。<br>
        これらは社外へのファイル転送や、個人のクラウドストレージへのデータ保存に使われる可能性があるサービスです。<br><br>
        <b>まず確認すべきこと：</b>業務上の必要性があってアクセスしているケースも多いため、いきなり制限をかけるのではなく、<b>部門ごとの利用傾向を把握</b>してから対応方針を決めることをお勧めします。必要に応じて「申請制」での利用許可の仕組みを整えることが、現実的な落としどころになります。</div>`;
    } else {
      html += `<div class="status-msg status-ok">✅ 高リスクカテゴリのアクセスは検出されていません。現在のポリシーが有効に機能しています。</div>`;
    }

    html += `<div class="sec-title">🖥️ IT資産健全性</div>
      <div class="metric-row">${metric('登録デバイス数',k.total_devices)}${metric('減価償却切れ台数',k.expired_devices)}${metric('資産健全率',k.asset_health+'%')}${metric('',' ')}</div>
      ${chartBox('c2-year')}`;
    document.getElementById('t2').innerHTML = html;

    plot('c2-ev', CH.figMonthEventStack(ac, mj));
    const blk=CH.figCompanyBlock(ac); if(blk._empty){ document.getElementById('c2-blk').outerHTML='<div class="status-msg status-info">防止・禁止イベントは検出されていません</div>'; } else plot('c2-blk',blk);
    if(webHigh.length){
      plot('c2-dom', CH.figHighRiskDomains(webHigh));
      plot('c2-hrtrend', CH.figHighRiskTrend(webHigh, mj));
      // カテゴリ集計テーブル
      const m=g(webHigh,r=>r['リスク分類']); const rows=[];
      m.forEach((v,cat)=>rows.push([cat,(DC.SITE_GOVERNANCE[cat].domains.slice(0,3).join(' / ')||'不明'),v.length,
        new Set(v.map(r=>r.login_id)).size, new Set(v.map(r=>r['台帳_会社名'])).size, DC.SITE_GOVERNANCE[cat].reason]));
      rows.sort((a,b)=>b[2]-a[2]);
      document.getElementById('c2-domtable').innerHTML = tableHtml(['カテゴリ','該当サービス例','件数','関係ユーザー','会社数','リスク内容'],rows);
    }
    const yr=CH.figPurchaseYear(hw); if(yr) plot('c2-year',yr); else document.getElementById('c2-year').outerHTML='';
  }

  // ══ TAB3 Webガバナンス ══
  function renderT3(){
    const k=App.kpis, ac=App.ac_f, mj=App.monthsJp;
    const web=ac.filter(r=>r['Webアクセス'] && !isNil(r['リスク分類']));
    let html = `<div class="sec-title">🌐 Webアクセス：ガバナンス健全度分析</div>
      <p class="hint">目的：特定個人の監視ではなく、カテゴリ別アクセス傾向によるガバナンス状態の可視化</p>
      <div class="metric-row">${metric('Webアクセス総数',fmtInt(k.total_web))}${metric('高リスク件数',fmtInt(k.high_risk_count)+`（${k.total_web?round(k.high_risk_count/k.total_web*100,1):0}%）`)}${metric('中リスク件数',fmtInt(k.medium_risk_count)+`（${k.total_web?round(k.medium_risk_count/k.total_web*100,1):0}%）`)}${metric('ガバナンス健全度',k.governance_score+'点')}</div>
      <div class="note-box"><b>リスク分類の定義：</b>
        🔴 <b>高リスク(3)</b> 転送・クラウドストレージ：情報漏洩・持ち出しリスク ／
        🟡 <b>中リスク(2)</b> SNS・AI外部：情報拡散・機密入力リスク ／
        🔵 <b>低リスク(1)</b> 動画・ショッピング：生産性への影響 ／ ⚪ <b>その他(0)</b></div>
      <div class="grid2">${chartBox('c3-cat')}${chartBox('c3-month')}</div>
      <div class="sec-title">会社別 ガバナンス健全度スコア</div>${chartBox('c3-comp')}<div id="c3-comptable"></div>
      <div class="sec-title">部署別 リスクカテゴリ傾向（組織単位）</div>${chartBox('c3-dept')}`;
    document.getElementById('t3').innerHTML=html;

    plot('c3-cat', CH.figCategoryBar(web));
    plot('c3-month', CH.figMonthlyCategory(web, mj));
    const cg=CH.figCompanyGovernance(web); plot('c3-comp',cg);
    if(cg._scores.length){
      document.getElementById('c3-comptable').innerHTML = tableHtml(['会社名','スコア','総アクセス','高リスク','判定'],
        cg._scores.map(s=>[s.comp,s.score,s.total,s.high, badge(s.level)[0]+' '+badge(s.level)[1]]));
    }
    const dr=CH.figDeptRisk(web); if(dr._empty){ document.getElementById('c3-dept').outerHTML='<div class="status-msg status-info">中〜高リスクアクセスは検出されていません</div>'; } else plot('c3-dept',dr);
  }

  // ══ TAB4 PC稼働 ══
  function renderT4(){
    const k=App.kpis, pc=App.pc_f, mj=App.monthsJp;
    let html = `<div class="sec-title">⚡ PC稼働状況：組織健全性・業務偏重・深夜稼働リスク</div>
      <p class="hint">目的：個人の残業摘発ではなく、組織の業務偏重と深夜稼働によるセキュリティリスクを分析</p>
      <div class="metric-row">${metric('対象稼働記録',fmtInt(pc.length)+'件')}${metric('業務偏重指数',k.workload_concentration+'倍')}${metric('深夜稼働件数',fmtInt(k.latenight_days)+'件')}${metric('休日稼働件数',fmtInt(k.holiday_active)+'件')}</div>
      <div class="grid2">${chartBox('c4-dept')}${chartBox('c4-ln')}</div>
      <div class="sec-title">稼働時間帯分布（リスク時間帯の可視化）</div><div id="c4-heatwrap">${chartBox('c4-heat')}</div>
      <div class="sec-title">部署別 稼働状況ランキング（四半期集計）</div><div id="c4-depttable"></div>
      <div class="sec-title">🔌 PC稼働時間ランキング ＆ 電源付きっぱなし検出</div>
      <div class="warn-box"><b>⚠️ なぜ「電源付きっぱなし」がセキュリティリスクなのか</b><br>
        <b>① 不正アクセスの踏み台：</b>誰もいないPCがネットワーク接続されたままだと、外部からの侵入口になりえます。<br>
        <b>② マルウェア感染の拡大：</b>感染端末が長時間稼働していると、社内ネットワーク全体への被害拡大リスクが高まります。<br>
        <b>③ 内部不正・のぞき見：</b>ロックされていない放置PCは、物理的な情報漏洩の機会を与えます。<br>
        <b>④ 対応の遅延：</b>担当者不在の長時間稼働端末は検知・対応が遅れる原因になります。</div>
      <label class="chk">長時間稼働とみなす閾値（時間）：<input type="number" id="long-th" min="6" max="24" value="${App.longThreshold}" style="width:70px"></label>
      <div id="c4-rankwrap"></div>`;
    document.getElementById('t4').innerHTML=html;

    plot('c4-dept', CH.figDeptAvgHours(pc));
    const ln=CH.figMonthlyLatenight(pc, mj, App.cfg.LATE_NIGHT_START); plot('c4-ln', ln);
    const heat=CH.figHourHeatmap(pc, App.cfg.LATE_NIGHT_START); if(heat) plot('c4-heat',heat); else document.getElementById('c4-heatwrap').innerHTML='';
    // 部署別集計テーブル
    const m=g(pc.filter(r=>!isNil(r['台帳_会社名'])&&!isNil(r['台帳_部署名'])), r=>r['台帳_会社名']+'|'+r['台帳_部署名']);
    const rows=[]; m.forEach((v,key)=>{ const [co,de]=key.split('|');
      rows.push([co,de, round(mean(v.map(r=>r['ログ時間_分']))/60,1), v.filter(r=>r['深夜稼働']).length,
        v.filter(r=>r['休日']).length, v.filter(r=>r['時間外稼働']).length, new Set(v.map(r=>r['日付_dt']&&r['日付_dt'].getTime())).size]); });
    rows.sort((a,b)=>b[2]-a[2]);
    document.getElementById('c4-depttable').innerHTML = tableHtml(['会社名','部署名','平均稼働時間','深夜稼働','休日稼働','時間外稼働','稼働日数'],rows);

    renderRanking();
    document.getElementById('long-th').addEventListener('change', e=>{
      App.longThreshold=Math.min(24,Math.max(6,parseInt(e.target.value)||12)); renderRanking();
    });
  }
  function renderRanking(){
    const pc=App.pc_f, th=App.longThreshold;
    const rank=CH.terminalRanking(pc, th);
    let html = `<div class="sec-title" style="border-left-color:#7C3AED">📊 端末別 平均稼働時間ランキング（上位30件）</div>${chartBox('c4-rank')}`;
    const longRows = pc.filter(r=>(r['ログ時間_分']||0)>th*60);
    html += `<div class="sec-title" style="border-left-color:#DC2626">🚨 電源付きっぱなし疑い一覧（${th}時間超）</div>`;
    if(longRows.length===0){ html+=`<div class="status-msg status-ok">✅ ${th}時間を超える稼働記録は検出されませんでした。</div>`; }
    else {
      const maxH=Math.max.apply(null,longRows.map(r=>(r['ログ時間_分']||0)/60));
      html += `<div class="metric-row">${metric('検出件数',fmtInt(longRows.length)+'件')}${metric('対象端末数',new Set(longRows.map(r=>r['端末エージェント名'])).size+'台')}${metric('最長稼働',round(maxH,1)+'h')}${metric('平均長時間稼働',round(mean(longRows.map(r=>(r['ログ時間_分']||0)/60)),1)+'h')}</div>${chartBox('c4-longm')}<div id="c4-longtable"></div>
        <button class="btn btn-ghost" id="btn-csv">📥 電源付きっぱなし疑いリスト を CSV でダウンロード</button>`;
    }
    document.getElementById('c4-rankwrap').innerHTML=html;
    plot('c4-rank', CH.figTerminalRanking(rank, th));
    // ランキングテーブル
    const top=rank.slice(0,30);
    document.getElementById('c4-rank').insertAdjacentHTML('afterend',
      tableHtml(['端末名','氏名','部署','会社','平均h','最大h','長時間日数','稼働日数','長時間率%','深夜','判定'],
        top.map(r=>[r.term,r.name||'',r.dept||'',r.comp||'',r.avg,r.max,r.longDays,r.days,r.longRate,r.night,r.flag])));
    if(longRows.length){
      plot('c4-longm', CH.figLongMonthly(pc, App.monthsJp, th));
      const cols=['日付','端末エージェント名','台帳_氏名','台帳_部署名','初回ログ時刻','最終ログ時刻','稼働時間_h','深夜稼働','休日'];
      const disp = longRows.slice().sort((a,b)=>(b['ログ時間_分']||0)-(a['ログ時間_分']||0));
      document.getElementById('c4-longtable').innerHTML = tableHtml(cols,
        disp.map(r=>cols.map(c=> c==='稼働時間_h'?round((r['ログ時間_分']||0)/60,2): c==='深夜稼働'||c==='休日'?(r[c]?'✓':''): (r[c]==null?'':r[c]))));
      document.getElementById('btn-csv').addEventListener('click', ()=>App._exportLongCsv(disp,cols,th));
    }
  }

  // TAB5/6 は exports.js / trends.js が定義（renderT5, renderT6 を上書き）
  function renderAll(){
    renderT1(); renderT2(); renderT3(); renderT4();
    if(global.renderT5) global.renderT5();
    if(global.renderT6) global.renderT6();
  }

  global.Render = { renderT1,renderT2,renderT3,renderT4,renderAll, badge, esc, tableHtml, siaCard, scoreCard, metric, chartBox, plot, fmtInt };
})(typeof self !== 'undefined' ? self : this);
