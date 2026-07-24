/* ============================================================
 * exports.js ― TAB5(レポート出力: Word/HTML/Excel) + TAB6(リスク予測)
 * ============================================================ */
(function (global) {
  'use strict';
  const DC = global.DataCore, CH = global.Charts, RD = global.Render;
  const round=DC.round, isNil=DC.isNil, sum=DC.sum, mean=DC.mean, g=DC.groupBy;
  const fmtInt=n=>(n||0).toLocaleString('ja-JP');

  // ── 汎用ダウンロード ──
  function download(blob, name){
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=name; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },500);
  }
  function todayStr(){ const d=new Date(); return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'); }
  const App = global.App;

  // ── Plotly図 → PNG dataURL（オフスクリーン描画） ──
  async function figToPng(fig, w, h){
    const div=document.createElement('div');
    div.style.cssText='position:fixed;left:-9999px;top:0;width:'+w+'px;height:'+h+'px';
    document.body.appendChild(div);
    const layout=Object.assign({}, fig.layout, {width:w,height:h});
    await Plotly.newPlot(div, fig.data, layout, {staticPlot:true});
    const url=await Plotly.toImage(div, {format:'png', width:w, height:h, scale:2});
    Plotly.purge(div); div.remove();
    return url;
  }
  function dataUrlToU8(u){ const b=atob(u.split(',')[1]); const a=new Uint8Array(b.length); for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i); return a; }

  // ── CSV出力（電源つけっぱ一覧） ──
  App._exportLongCsv = function(rows, cols, th){
    const head=cols.join(',');
    const body=rows.map(r=>cols.map(c=>{
      let v = c==='稼働時間_h'?round((r['ログ時間_分']||0)/60,2): c==='深夜稼働'||c==='休日'?(r[c]?'1':'0'):(r[c]==null?'':r[c]);
      v=String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
    }).join(',')).join('\n');
    // Shift_JIS で出力（encoding-japanese）
    const utf=head+'\n'+body;
    let blob;
    try { const sjis=Encoding.convert(Encoding.stringToCode(utf),{to:'SJIS',from:'UNICODE'}); blob=new Blob([new Uint8Array(sjis)],{type:'text/csv'}); }
    catch(e){ blob=new Blob(['﻿'+utf],{type:'text/csv'}); }
    download(blob, '長時間稼働リスト_'+todayStr()+'.csv');
  };

  // ════════════════════════════════════════════════════
  // TAB5：レポート出力
  // ════════════════════════════════════════════════════
  const SECS=[
    {id:'summary', icon:'🏛️', name:'1. エグゼクティブサマリー', opts:[['summary','KPIスコアカード + 総合評価',true]], cmt:'summary'},
    {id:'web_risk',icon:'🔒', name:'2. リスク遮断・Webガバナンス', opts:[['web_risk','INSIGHTカード',true],['web_graph','グラフ（カテゴリ別・月次）',true]], cmt:'web_risk'},
    {id:'pc_ops', icon:'⚡', name:'3. PC稼働・組織健全性', opts:[['pc_ops','KPI + INSIGHT',true],['pc_graph','グラフ（部署別稼働）',true],['pc_dept_table','部署別稼働サマリー表',false]], cmt:'pc_ops'},
    {id:'power_on',icon:'🔌', name:'4. 電源付きっぱなし検出', opts:[['power_on','リスク説明 + KPI',true],['power_graph','グラフ（端末別ランキング）',true],['power_table','長時間稼働一覧表',false]], cmt:'power_on'},
    {id:'assets', icon:'🖥️', name:'5. IT資産管理', opts:[['assets','KPI + INSIGHT',true],['assets_graph','グラフ（会社別台数）',true]], cmt:'assets'},
    {id:'action_plan',icon:'📋',name:'6. 次期アクションプラン', opts:[['action_plan','アクションプラン表',true]], cmt:'action_plan'},
    {id:'focus', icon:'🔎', name:'7. 重点分析（問題の切り分け）', opts:[['focus','野良AI/深夜休日/電源つけっぱ の分析＋対策',true]], cmt:'focus'},
    {id:'risk', icon:'🔮', name:'8. リスク予測・想定インパクト', opts:[['risk','金額換算＋脅威シナリオ',true]], cmt:'risk'},
  ];

  global.renderT5 = function(){
    const period = App.monthsJp.length?`${App.monthsJp[0]}〜${App.monthsJp[App.monthsJp.length-1]}`:'全期間';
    let html=`<div class="sec-title">📄 経営幹部向け ITガバナンスレポート出力</div>
      <div class="note-box">含めたいセクション・グラフ・表をチェックして各ボタンを押してください。コメント欄に入力するとレポートに埋め込まれます（空欄=手書き用スペース）。</div>
      <div class="status-msg status-info">📋 出力対象：${period} ／ 対象会社：${App.outCompanies.join(' / ')}</div>
      <div class="sec-title">📋 出力するセクションを選択</div><div class="rep-cols"><div>`;
    SECS.forEach((s,i)=>{
      if(i===3) html+='</div><div>'; // 右カラムへ
      html+=`<details class="rep-sec" open><summary>${s.icon} ${s.name}</summary>`;
      s.opts.forEach(([key,lbl,def])=>{ html+=`<label class="chk"><input type="checkbox" data-sec="${key}" ${def?'checked':''}> ${lbl}</label>`; });
      html+=`<label class="chk"><input type="checkbox" data-sec="${s.cmt}_comment" checked> コメント欄を追加</label>
        <textarea data-cmt="${s.id}" placeholder="コメント（空欄=手書きスペース）"></textarea></details>`;
    });
    html+=`</div></div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-word">📄 Wordレポートを生成</button>
        <button class="btn btn-ghost" id="btn-html">🌐 HTMLレポートを生成</button>
        <button class="btn btn-ghost" id="btn-excel">📊 Excelレポートを生成</button>
      </div><div id="rep-status"></div>`;
    document.getElementById('t5').innerHTML=html;

    document.getElementById('btn-word').addEventListener('click', ()=>runExport('word'));
    document.getElementById('btn-html').addEventListener('click', ()=>runExport('html'));
    document.getElementById('btn-excel').addEventListener('click', ()=>runExport('excel'));
  };

  function collectSelections(){
    const secs={}, cmts={};
    document.querySelectorAll('#t5 input[data-sec]').forEach(el=>secs[el.dataset.sec]=el.checked);
    document.querySelectorAll('#t5 textarea[data-cmt]').forEach(el=>cmts[el.dataset.cmt]=el.value.trim());
    return {secs,cmts};
  }
  async function runExport(kind){
    const st=document.getElementById('rep-status');
    st.className='status-msg status-info'; st.innerHTML='<span class="spinner"></span>生成中…（グラフ画像化に少し時間がかかります）';
    try{
      const {secs,cmts}=collectSelections();
      if(kind==='html'){ const html=await buildHtmlReport(); download(new Blob([html],{type:'text/html'}),'ITガバナンスレポート_'+todayStr()+'.html'); }
      else if(kind==='word'){ const blob=await buildWordReport(secs,cmts); download(blob,'ITガバナンスレポート_'+todayStr()+'.docx'); }
      else { const blob=await buildExcelReport(); download(blob,'ITガバナンスレポート_'+todayStr()+'.xlsx'); }
      st.className='status-msg status-ok'; st.textContent='✅ 生成が完了しました。ダウンロードをご確認ください。';
    }catch(e){ console.error(e); st.className='status-msg status-err'; st.textContent='生成中にエラー：'+e.message; }
  }

  function ctx(){
    const k=App.kpis;
    const ir=k.interception_rate, gs=k.governance_score, wc=k.workload_concentration, ln=k.latenight_rate;
    return { k, ir, gs, wc, ln,
      irL:DC.getStatus(ir,'risk_interception_rate',true), gsL:DC.getStatus(gs,'governance_score',true),
      wcL:DC.getStatus(wc,'workload_concentration',false), lnL:DC.getStatus(ln,'latenight_rate',false),
      web: (App.ac_web_f||App.ac_f).filter(r=>r['Webアクセス'] && !isNil(r['リスク分類'])),
      period: App.monthsJp.length?`${App.monthsJp[0]}～${App.monthsJp[App.monthsJp.length-1]}`:'全期間',
      now: (()=>{const d=new Date();return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日';})(),
    };
  }

  // ─── 重点分析（問題の切り分け）共通計算 ───
  function analyzeFocus(){
    const k=App.kpis||{}, ac=App.ac_f||[], pc=App.pc_f||[], th=App.longThreshold||12;
    function dom(u){ try{ return new URL(String(u).toLowerCase()).host; }catch(e){ return ''; } }
    const exSet=new Set((App.aiExcludeUsers||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean));
    const aiEx=r=>{ if(!exSet.size) return false; const lid=r.login_id!=null?String(r.login_id).trim().toLowerCase():''; const nm=r['台帳_氏名']!=null?String(r['台帳_氏名']).trim().toLowerCase():''; return exSet.has(lid)||exSet.has(nm); };
    const aiAll=ac.filter(r=>r['Webアクセス'] && r['リスク分類']==='AI・外部サービス');
    const ai=aiAll.filter(r=>!aiEx(r));
    const svc={}; ai.forEach(r=>{ const d=dom(r['詳細 2']); let n='その他AI';
      if(d.indexOf('chatgpt')>=0)n='ChatGPT'; else if(d.indexOf('copilot')>=0)n='Copilot';
      else if(d.indexOf('gemini')>=0)n='Gemini'; else if(d.indexOf('notebooklm')>=0)n='NotebookLM';
      svc[n]=(svc[n]||0)+1; });
    const aiOff=ai.filter(r=>!(r['時刻_時']>=8 && r['時刻_時']<=19)).length;
    const aiDept={}; ai.forEach(r=>{ const d=r['台帳_部署名']||'(不明)'; aiDept[d]=(aiDept[d]||0)+1; });
    const night=pc.filter(r=>r['深夜稼働']);
    const nDept={}; night.forEach(r=>{ const d=r['台帳_部署名']||'(不明)'; nDept[d]=(nDept[d]||0)+1; });
    const long=pc.filter(r=>(r['ログ時間_分']||0)>th*60);
    const lTerm={}; long.forEach(r=>{ const t=r['端末エージェント名']||'(不明)'; lTerm[t]=(lTerm[t]||0)+1; });
    const top=(o,n)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n||5);
    return { th,
      ai:{ total:aiAll.length, excluded:aiAll.length-ai.length, shadow:ai.length, users:new Set(ai.map(r=>r.login_id)).size, depts:new Set(ai.map(r=>r['台帳_部署名']).filter(Boolean)).size,
           svc:Object.entries(svc).sort((a,b)=>b[1]-a[1]), off:aiOff, deptTop:top(aiDept) },
      night:{ n:night.length, rate:k.latenight_rate||0, holidayN:pc.filter(r=>r['休日']).length, deptTop:top(nDept) },
      power:{ n:long.length, terms:new Set(long.map(r=>r['端末エージェント名'])).size,
              max:long.length?round(Math.max.apply(null,long.map(r=>(r['ログ時間_分']||0)/60)),1):0, termTop:top(lTerm) } };
  }

  // ─────────────── HTMLレポート ───────────────
  async function buildHtmlReport(){
    const c=ctx(), k=c.k, mj=App.monthsJp;
    async function fh(fig,h){ const url=await figToPng(fig, 900, h||360); return `<img src="${url}" style="width:100%">`; }
    const gauges=await Promise.all([
      figToPng(CH.figGauge(c.ir,'リスク遮断完遂率',c.irL,'%'),360,240),
      figToPng(CH.figGauge(c.gs,'ガバナンス健全度',c.gsL,'点'),360,240),
      figToPng(CH.figGauge(Math.max(0,100-(c.wc-1)*50),'業務バランス',c.wcL,'点'),360,240),
      figToPng(CH.figGauge(Math.max(0,100-c.ln*10),'深夜稼働安全度',c.lnL,'点'),360,240),
    ]);
    const catImg=await fh(CH.figCategoryBar(c.web),360);
    const monImg=await fh(CH.figMonthlyCategory(c.web,mj),360);
    const compImg=await fh(CH.figCompanyGovernance(c.web),320);
    const deptImg=await fh(CH.figDeptAvgHours(App.pc_f),380);
    const hwImg=await fh(CH.figCompanyDevices(App.hw_f),320);
    const badge=RD.badge;
    function card(level,title,st,mv,unit,ins,act){ const[ic,lb,cc,bg]=badge(level);
      return `<div style="background:${bg};border:2px solid ${cc};border-left:6px solid ${cc};border-radius:10px;padding:18px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between"><b style="font-size:.95rem">${title}</b><span style="background:${cc};color:#fff;padding:3px 12px;border-radius:20px;font-size:.72rem">${ic} ${lb}</span></div>
        <div style="font-size:2rem;font-weight:900;color:${cc};margin:4px 0">${mv}${unit}</div><div style="color:#64748b;font-size:.82rem">${st}</div>
        <hr style="border:none;border-top:1px solid ${cc}44;margin:10px 0">
        <div style="color:${cc};font-weight:800;font-size:.72rem">💡 INSIGHT</div><div style="font-size:.85rem;line-height:1.7">${ins}</div>
        <div style="color:${cc};font-weight:800;font-size:.72rem;margin-top:8px">▶ ACTION</div><div style="font-size:.85rem;line-height:1.7">${act}</div></div>`; }
    // TAB1と同じ文面を流用
    document.getElementById('t1'); // ensure rendered
    const s1=document.querySelectorAll('#t1 .sia'); // 取得できれば流用（簡潔化のため要点のみ再構築）
    const hr=k.high_risk_count, mr=k.medium_risk_count, tw=k.total_web;
    const highCats=Object.keys(DC.SITE_GOVERNANCE).filter(x=>DC.SITE_GOVERNANCE[x].risk===3 && (k.cat_counts||{})[x]>0);
    const cards=[
      card(c.irL,'① セキュリティ統制：リスク遮断完遂率',`監視イベント ${fmtInt(k.total_risk_events)}件 ／ 遮断完遂率`,c.ir,'%',
        c.irL==='green'?'現在のセキュリティポリシーはしっかり機能しています。':'一部のイベントで遮断が完了していない可能性があります。ポリシーの抜け穴や新デバイス・アプリへの対応漏れを確認してください。',
        c.irL==='green'?'現行ポリシーの定期見直しを継続します。':'未対応イベントの原因を確認し、ポリシー改訂サイクルに反映します。'),
      card(c.gsL,'② Webアクセス：ガバナンス健全度',`全Web ${fmtInt(tw)}件 ／ 高リスク ${fmtInt(hr)}件 ／ 中リスク ${fmtInt(mr)}件（SNS ${fmtInt(k.sns_count||0)}・生成AI ${fmtInt(k.ai_count||0)}）${(App.aiExcludeDepts||[]).length?'　※部署除外適用中（'+App.aiExcludeDepts.join('・')+'を除く）':''}`,c.gs,'点',
        highCats.length?`高リスク検出：「${highCats.join('・')}」。情報の外部持ち出しにつながる可能性があります。組織全体の傾向として捉えてください。`:'ガバナンス状態は良好です。',
        c.gsL!=='green'?'利用目的を部門単位で確認し、必要なものはホワイトリスト登録を検討します。':'現状維持。四半期ごとにリスク分類を更新します。'),
      card(c.wcL,'③ 組織健全性：業務偏重指数',`最高稼働部署「${k.busiest_dept}」平均${k.busiest_hours}h ／ 全社平均${k.avg_hours}h`,c.wc,'倍',
        c.wcL!=='green'?`「${k.busiest_dept}」に業務が集中しています。長期的には離職リスクにつながりうるため把握が必要です。`:'部署間バランスは良好です。',
        c.wcL!=='green'?'人事・経営企画と情報共有し業務量配分を検討します。':'モニタリングを継続します。'),
      card(c.lnL,'④ セキュリティリスク：深夜・休日稼働',`深夜稼働 ${fmtInt(k.latenight_days)}件（${c.ln}%）休日 ${fmtInt(k.holiday_active)}件`,c.ln,'%',
        c.lnL!=='green'?'管理者不在時間帯の稼働はインシデント対応遅延リスクと労務観点から実態把握が必要です。':'深夜・休日稼働は非常に少ない水準です。',
        c.lnL!=='green'?'深夜稼働の多い部署・端末を確認しヒアリングします。':'自動通知設定を維持し早期把握体制を継続します。'),
    ];
    const F=analyzeFocus();
    const RC=global.RiskCalc, imp=RC.computeImpact(k,App.pc_f,App.longThreshold||12), scs=RC.computeScenarios(k,imp.longPcN,App.longThreshold||12), tr=RC.computeTrendAlerts(App.monthlyKpis);
    const aiSvcStr=F.ai.svc.length?F.ai.svc.map(s=>s[0]+' '+s[1]+'件').join(' / '):'なし';
    const th5='style="background:#1F3864;color:#fff;padding:8px;text-align:left;font-size:.78rem"';
    const triRow=(t,d,pb,ok,ac2)=>`<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;background:#FFFBEB">${t}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${d}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#b91c1c">${pb}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#166534">${ok}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${ac2}</td></tr>`;
    const smallTbl=(hd,rows)=>`<table style="width:100%;border-collapse:collapse;font-size:.8rem;margin:8px 0"><tr><th ${th5}>${hd[0]}</th><th ${th5}>${hd[1]}</th></tr>${rows.map(r=>`<tr><td style="padding:5px;border-bottom:1px solid #eee">${r[0]}</td><td style="padding:5px;border-bottom:1px solid #eee">${fmtInt(r[1])}</td></tr>`).join('')}</table>`;
    const focusHtml=`<div class="pg"><h2>🔎 重点分析：問題の切り分けと対策</h2>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:14px">
      <tr><th ${th5}>テーマ</th><th ${th5}>検出データ</th><th ${th5}>問題（データ基準）</th><th ${th5}>問題でない/経過観察</th><th ${th5}>対策</th></tr>
      ${triRow('① 野良AI（無許可AI）','野良AI '+fmtInt(F.ai.shadow)+'件（総'+fmtInt(F.ai.total)+'／除外'+fmtInt(F.ai.excluded)+'）/ '+F.ai.users+'名 / '+F.ai.depts+'部門','勤務時間外 '+fmtInt(F.ai.off)+'件（私的利用の疑い）','正規PJの業務利用は除外ユーザー設定で控除済','許可AI導入＋他はブロック＋ガイドライン')}
      ${triRow('② 深夜・休日稼働','深夜 '+fmtInt(F.night.n)+'件（'+F.night.rate+'%）/ 休日 '+fmtInt(F.night.holidayN)+'件','特定端末・部署の継続的な深夜稼働','勤務形態差(管理G等)・顧問・休日=日曜想定','該当端末の用途確認・自動通知・労務ヒアリング')}
      ${triRow('③ 電源つけっぱなし','長時間 '+fmtInt(F.power.n)+'件 / '+F.power.terms+'台 / 最長'+F.power.max+'h','無人・常時接続（侵入/感染/対応遅延）','サーバ兼用機・夜間バッチ・外出時消し忘れ','自動シャットダウン/スリープ・離席ロック・除外登録')}
      </table>
      ${card(F.ai.shadow>0?'yellow':'green','① 野良AI（無許可AIサービス）','検出'+fmtInt(F.ai.total)+'件 − 正規利用(除外)'+fmtInt(F.ai.excluded)+'件',fmtInt(F.ai.shadow),'件','サービス別：'+aiSvcStr+'。利用者'+F.ai.users+'名・'+F.ai.depts+'部門。勤務時間外 '+fmtInt(F.ai.off)+'件は私的利用の疑い。正規プロジェクト利用者は「レポート設定」パネルの野良AI除外設定で控除しています。','会社が許可するAIを1つ導入し、それ以外の生成AIサイトはブロック。入力禁止情報を明記した利用ガイドラインを全社周知。')}
      ${F.ai.deptTop.length?smallTbl(['部署','AIアクセス件数'],F.ai.deptTop):''}
      ${card(F.night.rate>=5?'red':F.night.rate>=2?'yellow':'green','② 深夜・休日稼働の問題点','',F.night.rate,'%','深夜稼働率は全体で'+F.night.rate+'%。全社では'+(F.night.rate<2?'問題は限定的':'注意が必要')+'だが、特定端末・部署への偏りは「管理者不在時間帯の稼働」として問題。勤務形態が異なる部署や顧問は業務上妥当なため下表と現場コメントで切り分け。','深夜稼働が多い上位を確認。真に問題な稼働はポリシー化、勤務形態差は対象外として記録し誤検知を低減。')}
      ${F.night.deptTop.length?smallTbl(['深夜稼働が多い部署','件数'],F.night.deptTop):''}
      ${card(F.power.n>0?'red':'green','③ 電源付きっぱなしの対策案','',fmtInt(F.power.n),'件','長時間稼働 '+fmtInt(F.power.n)+'件・'+F.power.terms+'台（最長'+F.power.max+'h）。無人・常時接続は不正アクセスやマルウェア拡大の温床。サーバ兼用機・夜間バッチ・外出時の消し忘れは切り分けが必要。','（1）業務時間外の自動シャットダウン/スリープ（2）離席時の自動ロック（数分）を全社必須（3）サーバ兼用機は用途登録して対象外（4）検出上位端末の用途確認と消し忘れ周知。')}
      ${F.power.termTop.length?smallTbl(['長時間稼働が多い端末','件数'],F.power.termTop):''}
      </div>`;
    const scLv={high:'高',medium:'中',low:'低'}, scBg={high:'#FEE2E2',medium:'#FFFBEB',low:'#EFF6FF'}, scC={high:'#DC2626',medium:'#D97706',low:'#2563EB'};
    const bignum=(l,v,c2)=>`<div style="flex:1;min-width:180px;background:#fff;border:2px solid ${c2};border-radius:10px;padding:14px;text-align:center"><div style="font-size:.75rem;color:#64748b;font-weight:700">${l}</div><div style="font-size:1.6rem;font-weight:900;color:${c2}">${v}</div></div>`;
    const riskHtml=`<div class="pg"><h2>🔮 リスク予測・想定インパクト（放置した場合）</h2>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">${bignum('情報漏洩 期待損失',fmtInt(imp.expLoss)+'万円','#DC2626')}${bignum('電源つけっぱ 電気代',imp.elecYen.toLocaleString()+'円','#7C3AED')}${bignum('老朽デバイス 追加/年',fmtInt(imp.agingMan)+'万円','#D97706')}${bignum('想定インパクト合計/年',fmtInt(imp.totalMan)+'万円','#1E3A5F')}</div>
      ${(tr.enough&&tr.alerts.length)?tr.alerts.map(a=>`<div style="background:#FEF2F2;border-left:5px solid #DC2626;border-radius:6px;padding:10px 14px;margin-bottom:8px;font-size:.85rem"><b style="color:#b91c1c">⚠️ ${a.label}が悪化傾向</b>：現在 ${a.cur}${a.unit} → 次月予測 <b>${a.pred}${a.unit}</b>（早期対応で悪化を防止可能）</div>`).join(''):''}
      <table style="width:100%;border-collapse:collapse;font-size:.8rem"><tr><th ${th5}>可能性</th><th ${th5}>シナリオ</th><th ${th5}>引き金</th><th ${th5}>想定被害／対策</th></tr>
      ${scs.map(s=>`<tr><td style="padding:7px;border-bottom:1px solid #eee;text-align:center;font-weight:800;color:${scC[s.level]};background:${scBg[s.level]}">${scLv[s.level]}</td><td style="padding:7px;border-bottom:1px solid #eee">${s.icon} ${s.title}</td><td style="padding:7px;border-bottom:1px solid #eee;font-size:.75rem">${s.trigger}</td><td style="padding:7px;border-bottom:1px solid #eee;font-size:.75rem">${s.story} <b>【対策】</b>${s.action}</td></tr>`).join('')}
      </table>
      <p style="font-size:.72rem;color:#64748b;margin-top:8px">※金額は公開データ（JNSA等）に基づく概算、発生確率は検討用の仮定値。正式なリスク評価の代替ではありません。</p></div>`;
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>ITガバナンスレポート ${c.period}</title>
      <style>body{font-family:'Meiryo','Yu Gothic',sans-serif;background:#F0F4F8;color:#1e293b;font-size:14px;margin:0}
      .w{max-width:1100px;margin:0 auto;padding:20px}.hd{background:linear-gradient(135deg,#1e3a5f,#1e40af);color:#fff;border-radius:12px;padding:22px}
      .pg{background:#fff;border-radius:10px;padding:16px;margin:14px 0;box-shadow:0 2px 8px rgba(0,0,0,.06)}
      .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      h2{color:#1e3a5f;font-size:1.1rem;margin:8px 0}img{display:block}
      @media print{.pg{page-break-inside:avoid}}</style></head><body><div class="w">
      <div class="hd"><h1>🏛️ ITガバナンス 戦略レポート</h1><p style="color:#93c5fd">対象期間：${c.period} ／ 対象会社：${App.outCompanies.join(' / ')} ／ 作成日：${c.now}</p></div>
      <div class="pg"><h2>🏛️ エグゼクティブサマリー</h2><div class="g4">${gauges.map(u=>`<img src="${u}" style="width:100%">`).join('')}</div>${cards.join('')}</div>
      <div class="pg"><h2>🔒 リスク・Webガバナンス</h2><div class="g2"><div>${catImg}</div><div>${monImg}</div></div>${compImg}</div>
      <div class="pg"><h2>⚡ PC稼働・組織健全性</h2>${deptImg}</div>
      <div class="pg"><h2>🖥️ IT資産管理</h2><div class="g2"><div>${hwImg}</div>
        <div><table style="width:100%;border-collapse:collapse"><tr><th style="background:#1F3864;color:#fff;padding:8px;text-align:left">項目</th><th style="background:#1F3864;color:#fff;padding:8px;text-align:left">値</th></tr>
        <tr><td style="padding:7px;border-bottom:1px solid #e2e8f0">登録デバイス総数</td><td style="padding:7px;border-bottom:1px solid #e2e8f0"><b>${k.total_devices}台</b></td></tr>
        <tr><td style="padding:7px;border-bottom:1px solid #e2e8f0">減価償却切れ台数</td><td style="padding:7px;border-bottom:1px solid #e2e8f0"><b style="color:#DC2626">${k.expired_devices}台</b></td></tr>
        <tr><td style="padding:7px">資産健全率</td><td style="padding:7px"><b>${k.asset_health}%</b></td></tr></table></div></div></div>
      ${focusHtml}${riskHtml}
      </div></body></html>`;
  }

  // ─────────────── Wordレポート（docx.js） ───────────────
  async function buildWordReport(secs, cmts){
    const D=global.docx, c=ctx(), k=c.k, mj=App.monthsJp;
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun,
      AlignmentType, ShadingType, BorderStyle, PageBreak } = D;
    const NAVY='1E3A5F', WHITE='FFFFFF', SLATE='475569', GREEN='059669', YELLOW='D97706', RED='DC2626';
    const stRGB={green:GREEN,yellow:YELLOW,red:RED}, stLBL={green:'🟢 良好',yellow:'🟡 要注意',red:'🔴 対応が必要'};
    const FONT='Yu Gothic UI';
    function run(t,o){ o=o||{}; return new TextRun(Object.assign({text:t,font:FONT,size:(o.size||20)},o)); }
    function para(children,o){ o=o||{}; return new Paragraph(Object.assign({children:Array.isArray(children)?children:[children]},o)); }
    function cell(children,opt){ opt=opt||{}; return new TableCell(Object.assign({children:Array.isArray(children)?children:[children],
      shading: opt.fill?{type:ShadingType.CLEAR, fill:opt.fill}:undefined, width: opt.width?{size:opt.width,type:WidthType.PERCENTAGE}:undefined },opt.cellOpt||{})); }
    function fullTable(rows){ return new Table({ width:{size:100,type:WidthType.PERCENTAGE}, rows }); }
    function heading(text,fill){ return fullTable([ new TableRow({children:[ cell(
      para(run(text,{bold:true,size:26,color:WHITE})), {fill:fill||NAVY}) ]}) ]); }
    function kpiRow(items){ return fullTable([ new TableRow({children: items.map(([lbl,val,st])=>cell([
      para(run(lbl,{size:16,color:SLATE})), para(run(String(val),{bold:true,size:40,color:stRGB[st]||GREEN})),
      para(run(stLBL[st]||'',{bold:true,size:16,color:stRGB[st]||GREEN})) ], {fill:'F8FAFC', width:Math.floor(100/items.length)})) })]); }
    function insightCard(icon,title,st,ins,act,ml,mv){ const fill={green:'ECFDF5',yellow:'FFFBEB',red:'FEF2F2'}[st]||'ECFDF5';
      const left=cell([ para(run(icon+'  '+title+'   '+(stLBL[st]||''),{bold:true,size:20,color:stRGB[st]})),
        para([run('INSIGHT  ',{bold:true,size:16,color:stRGB[st]}), run(ins,{size:18})]),
        para([run('ACTION  ',{bold:true,size:16,color:stRGB[st]}), run(act,{size:18})]) ], {fill, width: ml?70:100});
      const cells=[left]; if(ml) cells.push(cell([ para(run(ml,{size:16,color:SLATE}),{alignment:AlignmentType.CENTER}),
        para(run(String(mv),{bold:true,size:44,color:stRGB[st]}),{alignment:AlignmentType.CENTER}) ],{fill,width:30}));
      return fullTable([ new TableRow({children:cells}) ]); }
    async function graph(fig,h){ const url=await figToPng(fig, 900, h||340); const u8=dataUrlToU8(url);
      return para(new ImageRun({data:u8, transformation:{width:600, height:Math.round(600*(h||340)/900)}}),{alignment:AlignmentType.CENTER}); }
    function commentBox(text){ return fullTable([
      new TableRow({children:[ cell(para(run('📝 担当者コメント・現場知識メモ',{bold:true,size:18,color:'B45309'})),{fill:'FFF9E6'}) ]}),
      new TableRow({children:[ cell( text?para(run(text,{size:18})):[para(run(' ')),para(run(' ')),para(run(' '))], {fill:'FFFDF5'}) ]}) ]); }
    function dfTable(cols,rows){ const header=new TableRow({children:cols.map(cn=>cell(para(run(String(cn),{bold:true,size:16,color:WHITE})),{fill:NAVY}))});
      const body=rows.slice(0,30).map((r,i)=>new TableRow({children:r.map(v=>cell(para(run(String(v==null?'':v),{size:16})),{fill:i%2?'FFFFFF':'F8FAFC'}))}));
      return fullTable([header,...body]); }

    const children=[];
    // 表紙
    children.push(fullTable([ new TableRow({children:[ cell([
      para(run('🏛️  ITガバナンス 戦略レポート',{bold:true,size:44,color:WHITE}),{alignment:AlignmentType.CENTER}),
      para(run('経営リスク回避 ／ IT資産最適化 ／ 組織健全性の可視化',{size:20,color:'BFDBFE'}),{alignment:AlignmentType.CENTER}),
      para(run('対象期間：'+c.period,{size:20,color:'BFDBFE'}),{alignment:AlignmentType.CENTER}),
      para(run('対象会社：'+App.outCompanies.join(' / '),{size:20,color:'BFDBFE'}),{alignment:AlignmentType.CENTER}),
      para(run('作成日：'+c.now,{size:20,color:'BFDBFE'}),{alignment:AlignmentType.CENTER}),
    ],{fill:NAVY}) ]}) ]));

    if(secs.summary){ children.push(para(new PageBreak())); children.push(heading('1. エグゼクティブサマリー',NAVY)); children.push(para(run(' ')));
      children.push(kpiRow([['リスク遮断完遂率',c.ir+'%',c.irL],['Webガバナンス健全度',c.gs+'点',c.gsL],['深夜稼働率',c.ln+'%',c.lnL]]));
      children.push(para(run(' ')));
      children.push(insightCard('🎯','総合評価',c.gsL,`今期は${stLBL[c.gsL]}の状態です。主要KPIの詳細は各セクションをご確認ください。`,'優先度の高い項目から対応を検討してください。','総合スコア',c.gs+'点'));
      if(secs.summary_comment) children.push(commentBox(cmts.summary)); }

    if(secs.web_risk){ children.push(para(new PageBreak())); children.push(heading('2. リスク遮断・Webガバナンス分析',RED)); children.push(para(run(' ')));
      const hr=k.high_risk_count, mr=k.medium_risk_count;
      const highCats=Object.keys(DC.SITE_GOVERNANCE).filter(x=>DC.SITE_GOVERNANCE[x].risk===3 && (k.cat_counts||{})[x]>0);
      children.push(insightCard('🔴','転送・クラウドストレージアクセス',highCats.length?'red':'green',
        highCats.length?`高リスクカテゴリ検出：${highCats.join('・')}。情報漏洩リスクが懸念されます。`:'高リスクアクセスは検出されていません。',
        '部門ごとの利用目的を確認し、必要に応じてホワイトリスト登録またはポリシー周知を実施してください。','高リスクアクセス',fmtInt(hr)+'件'));
      children.push(insightCard('🟡','SNS・生成AI（中リスクの内訳）',mr>0?'yellow':'green',
        `中リスク計 ${fmtInt(mr)}件の内訳は SNS ${fmtInt(k.sns_count||0)}件・生成AI ${fmtInt(k.ai_count||0)}件。${(k.ai_count||0)>=(k.sns_count||0)?'生成AIへの機密情報入力リスクが主因':'SNSでの情報拡散・私的利用が主因'}とみられます。${(App.aiExcludeDepts||[]).length?'（「レポート設定」の野良AI除外対象者が所属する部署「'+App.aiExcludeDepts.join('・')+'」は本集計から除外しています）':''}`,'多い方から対応：生成AIは許可ツール導入＋入力禁止情報のガイドライン、SNSは業務目的の確認と周知。','中リスク計',fmtInt(mr)+'件'));
      if(secs.web_graph){ children.push(await graph(CH.figCategoryBar(c.web),320)); children.push(await graph(CH.figMonthlyCategory(c.web,mj),320)); }
      if(secs.web_risk_comment) children.push(commentBox(cmts.web_risk)); }

    if(secs.pc_ops){ children.push(para(new PageBreak())); children.push(heading('3. PC稼働状況・組織健全性','2563EB')); children.push(para(run(' ')));
      children.push(kpiRow([['業務偏重指数',c.wc+'倍',c.wcL],['深夜稼働率',c.ln+'%',c.lnL],['休日稼働件数',fmtInt(k.holiday_active)+'件',k.holiday_active===0?'green':'yellow']]));
      children.push(para(run(' ')));
      children.push(insightCard('⚡','業務偏重（特定部署への負荷集中）',c.wcL,
        `最高稼働部署「${k.busiest_dept}」平均${k.busiest_hours}h / 全社平均${k.avg_hours}h（格差${c.wc}倍）`,'該当部署の管理職と面談し業務量再配分を評価してください。','業務偏重指数',c.wc+'倍'));
      children.push(insightCard('🌙',`深夜稼働（${App.cfg.LATE_NIGHT_START}時〜）`,c.lnL,
        `深夜帯の稼働は${c.ln}%。管理者不在時のインシデント対応遅延リスクがあります。`,'深夜稼働の多い部署・端末を確認しポリシーを検討してください。','深夜稼働率',c.ln+'%'));
      if(secs.pc_graph) children.push(await graph(CH.figDeptAvgHours(App.pc_f),340));
      if(secs.pc_dept_table){ const m=g(App.pc_f.filter(r=>!isNil(r['台帳_会社名'])&&!isNil(r['台帳_部署名'])),r=>r['台帳_会社名']+'|'+r['台帳_部署名']);
        const rows=[]; m.forEach((v,key)=>{const[co,de]=key.split('|');rows.push([co,de,round(mean(v.map(r=>r['ログ時間_分']))/60,1),v.filter(r=>r['深夜稼働']).length,v.filter(r=>r['時間外稼働']).length,new Set(v.map(r=>r['日付_dt']&&r['日付_dt'].getTime())).size]);});
        rows.sort((a,b)=>b[2]-a[2]); children.push(dfTable(['会社','部署','平均h','深夜','時間外','稼働日'],rows)); }
      if(secs.pc_ops_comment) children.push(commentBox(cmts.pc_ops)); }

    if(secs.power_on){ children.push(para(new PageBreak())); children.push(heading('4. 電源付きっぱなし検出（セキュリティリスク）','7C3AED')); children.push(para(run(' ')));
      const th=App.longThreshold, longRows=App.pc_f.filter(r=>(r['ログ時間_分']||0)>th*60);
      children.push(fullTable([ new TableRow({children:[ cell(para(run(
        '⚠️ 電源付きっぱなしのリスク：①不正アクセスの踏み台 ②マルウェア感染拡大 ③内部不正・のぞき見 ④インシデント対応遅延',{size:18})),{fill:'FEF2F2'}) ]}) ]));
      const maxH=longRows.length?Math.max.apply(null,longRows.map(r=>(r['ログ時間_分']||0)/60)):0;
      children.push(kpiRow([['長時間稼働検出',fmtInt(longRows.length)+'件',longRows.length>0?'red':'green'],
        ['対象端末数',new Set(longRows.map(r=>r['端末エージェント名'])).size+'台',longRows.length>0?'red':'green'],
        ['最長稼働時間',round(maxH,1)+'h',longRows.length>10?'red':longRows.length>0?'yellow':'green']]));
      if(secs.power_graph && longRows.length){ children.push(await graph(CH.figTerminalRanking(CH.terminalRanking(App.pc_f,th),th),340)); }
      if(secs.power_table && longRows.length){ const disp=longRows.slice().sort((a,b)=>(b['ログ時間_分']||0)-(a['ログ時間_分']||0));
        children.push(dfTable(['日付','端末','氏名','部署','稼働h'],disp.map(r=>[r['日付'],r['端末エージェント名'],r['台帳_氏名']||'',r['台帳_部署名']||'',round((r['ログ時間_分']||0)/60,1)]))); }
      if(secs.power_on_comment) children.push(commentBox(cmts.power_on)); }

    if(secs.assets){ children.push(para(new PageBreak())); children.push(heading('5. IT資産管理（ハードウェア台帳）','7C3AED')); children.push(para(run(' ')));
      const aL=DC.getStatus(k.asset_health,'governance_score',true);
      children.push(kpiRow([['登録デバイス総数',k.total_devices+'台','green'],['減価償却切れ台数',k.expired_devices+'台',k.expired_devices>5?'red':k.expired_devices>0?'yellow':'green'],['資産健全率',k.asset_health+'%',aL]]));
      children.push(para(run(' ')));
      children.push(insightCard('🖥️','資産健全性評価',aL,`減価償却切れ ${k.expired_devices}台（全体の${round(k.expired_devices/Math.max(k.total_devices,1)*100,1)}%）。老朽化デバイスは早期更新が推奨されます。`,'次年度予算への計上を検討し、計画的なリプレースを実施してください。','資産健全率',k.asset_health+'%'));
      if(secs.assets_graph) children.push(await graph(CH.figCompanyDevices(App.hw_f),320));
      if(secs.assets_comment) children.push(commentBox(cmts.assets)); }

    if(secs.action_plan){ children.push(para(new PageBreak())); children.push(heading('6. 次期アクションプラン','059669')); children.push(para(run(' ')));
      const hdr=new TableRow({children:['優先度','分類','アクション内容','期限','担当'].map(h=>cell(para(run(h,{bold:true,size:18,color:WHITE})),{fill:'059669'}))});
      const body=[1,2,3,4,5].map(i=>{const pri=i<=2?'HIGH':i<=4?'MED':'LOW'; return new TableRow({children:[cell(para(run(pri,{bold:true,size:18})),{fill:pri==='HIGH'?'FEE2E2':pri==='MED'?'FFFBEB':'F1F5F9'}),cell(para(run(' '))),cell(para(run(' '))),cell(para(run(' '))),cell(para(run(' ')))]});});
      children.push(fullTable([hdr,...body]));
      if(secs.action_plan_comment) children.push(commentBox(cmts.action_plan)); }

    if(secs.focus){ children.push(para(new PageBreak())); children.push(heading('7. 重点分析：問題の切り分けと対策','B45309')); children.push(para(run(' ')));
      const F=analyzeFocus();
      const sHdr=new TableRow({children:['テーマ','検出データ','問題（データ基準）','問題でない/経過観察','主な対策'].map(t=>cell(para(run(t,{bold:true,size:15,color:WHITE})),{fill:NAVY}))});
      const trow=(t,d,pb,ok,ac2)=>new TableRow({children:[cell(para(run(t,{bold:true,size:14})),{fill:'FFFBEB',width:16}),cell(para(run(d,{size:13})),{width:20}),cell(para(run(pb,{size:13})),{width:24}),cell(para(run(ok,{size:13})),{width:20}),cell(para(run(ac2,{size:13})),{width:20})]});
      children.push(fullTable([sHdr,
        trow('① 野良AI（無許可AI）', '野良AI '+fmtInt(F.ai.shadow)+'件（総'+fmtInt(F.ai.total)+'／除外'+fmtInt(F.ai.excluded)+'）/ '+F.ai.users+'名 / '+F.ai.depts+'部門', '勤務時間外 '+fmtInt(F.ai.off)+'件（私的利用の疑い）', '正規PJの業務利用は除外ユーザー設定で控除済', '許可AI導入＋他はブロック＋ガイドライン'),
        trow('② 深夜・休日稼働', '深夜 '+fmtInt(F.night.n)+'件（'+F.night.rate+'%）/ 休日 '+fmtInt(F.night.holidayN)+'件', '特定端末・部署の継続的な深夜稼働', '勤務形態差(管理G等)・顧問・休日=日曜想定', '該当端末の用途確認・自動通知・労務ヒアリング'),
        trow('③ 電源つけっぱなし', '長時間 '+fmtInt(F.power.n)+'件 / '+F.power.terms+'台 / 最長'+F.power.max+'h', '無人・常時接続（侵入/感染/対応遅延）', 'サーバ兼用機・夜間バッチ・外出時消し忘れ', '自動シャットダウン/スリープ・離席ロック・除外登録')]));
      children.push(para(run(' ')));
      const aiSvcStr=F.ai.svc.length?F.ai.svc.map(x=>x[0]+' '+x[1]+'件').join(' / '):'なし';
      children.push(insightCard('🤖','① 野良AI（無許可AIサービス）',F.ai.shadow>0?'yellow':'green',
        'AI外部サービス検出 '+fmtInt(F.ai.total)+'件のうち正規利用として '+fmtInt(F.ai.excluded)+'件を除外 → 野良AI（無許可）'+fmtInt(F.ai.shadow)+'件（'+aiSvcStr+'）。利用者'+F.ai.users+'名・'+F.ai.depts+'部門。うち勤務時間外 '+fmtInt(F.ai.off)+'件は私的利用の疑い。※正規プロジェクト利用者は「レポート出力」タブの除外ユーザー設定で控除しています。',
        '会社として許可するAIサービスを1つ導入し、それ以外の生成AIサイトはブロック。入力禁止情報（個人情報・契約・未公開情報）を明記した利用ガイドラインを全社周知。','野良AI件数',fmtInt(F.ai.shadow)+'件'));
      if(F.ai.deptTop.length) children.push(dfTable(['部署','AIアクセス件数'],F.ai.deptTop.map(d=>[d[0],fmtInt(d[1])])));
      children.push(insightCard('🌙','② 深夜・休日稼働の問題点',F.night.rate>=5?'red':F.night.rate>=2?'yellow':'green',
        '深夜稼働率は全体で'+F.night.rate+'%。全社では'+(F.night.rate<2?'問題は限定的':'注意が必要')+'だが、特定端末・部署への偏りは「管理者不在時間帯の稼働」として問題。勤務形態が異なる部署（管理G等）や顧問は業務上妥当なため、下表と現場コメントで切り分けます。',
        '深夜稼働が多い上位の用途を確認。真に問題な稼働はポリシー化（自動通知・時間外制限）、勤務形態差は「対象外」として記録し翌期以降の誤検知を低減。','深夜稼働率',F.night.rate+'%'));
      if(F.night.deptTop.length) children.push(dfTable(['深夜稼働が多い部署','件数'],F.night.deptTop.map(d=>[d[0],fmtInt(d[1])])));
      children.push(insightCard('🔌','③ 電源付きっぱなしの対策案',F.power.n>0?'red':'green',
        '長時間稼働 '+fmtInt(F.power.n)+'件・'+F.power.terms+'台（最長'+F.power.max+'h）を検出。無人・常時接続は不正アクセスやマルウェア拡大の温床。サーバ兼用機・夜間バッチ・外出時の消し忘れは業務上の理由があるため切り分けが必要。',
        '（1）業務時間外の自動シャットダウン/スリープをポリシー適用（2）離席時の自動ロック（数分）を全社必須化（3）サーバ兼用機は用途登録して対象外に（4）検出上位端末の用途確認と消し忘れの周知徹底。','長時間稼働',fmtInt(F.power.n)+'件'));
      if(F.power.termTop.length) children.push(dfTable(['長時間稼働が多い端末','件数'],F.power.termTop.map(d=>[d[0],fmtInt(d[1])])));
      if(secs.focus_comment) children.push(commentBox(cmts.focus)); }

    if(secs.risk){ children.push(para(new PageBreak())); children.push(heading('8. リスク予測・想定インパクト（放置した場合）',RED)); children.push(para(run(' ')));
      const RC=global.RiskCalc, imp=RC.computeImpact(k,App.pc_f,App.longThreshold||12);
      children.push(kpiRow([['情報漏洩 期待損失',fmtInt(imp.expLoss)+'万円','red'],['電源つけっぱ 電気代',imp.elecYen.toLocaleString()+'円',imp.elecYen>0?'yellow':'green'],['老朽デバイス 追加/年',fmtInt(imp.agingMan)+'万円',imp.agingMan>0?'yellow':'green']]));
      children.push(insightCard('💰','想定インパクト合計（年換算）','red',
        '検出リスクを放置した場合の想定コストは年 約'+fmtInt(imp.totalMan)+'万円（前提：漏えい'+imp.assumptions.persons+'人・1件あたり'+round(imp.perIncidentMan,0)+'万円・発生確率'+imp.assumptions.prob+'%等）。対策コストがこれを下回るなら投資判断の根拠になります。',
        '対策（ポリシー整備・端末更新・自動シャットダウン・EDR・多要素認証等）を費用対効果で優先順位付けし、次年度予算へ計上してください。','想定合計',fmtInt(imp.totalMan)+'万円'));
      const tr=RC.computeTrendAlerts(App.monthlyKpis);
      if(tr.enough && tr.alerts.length) tr.alerts.forEach(al=>children.push(para([run('⚠️ ',{bold:true,color:RED}),run(al.label+'が悪化傾向：現在 '+al.cur+al.unit+' → 次月予測 '+al.pred+al.unit+'（早期対応で悪化を防止可能）',{bold:true})])));
      children.push(para(run(' ')));
      children.push(para(run('▼ 想定される重大インシデント シナリオ',{bold:true,size:18})));
      const scs=RC.computeScenarios(k,imp.longPcN,App.longThreshold||12);
      const scHdr=new TableRow({children:['可能性','シナリオ','引き金','想定被害／対策'].map(t=>cell(para(run(t,{bold:true,size:15,color:WHITE})),{fill:NAVY}))});
      const scRows=[scHdr];
      scs.forEach(sx=>{ const fill=sx.level==='high'?'FEE2E2':sx.level==='medium'?'FFFBEB':'EFF6FF'; const lv={high:'高',medium:'中',low:'低'}[sx.level];
        scRows.push(new TableRow({children:[cell(para(run(lv,{bold:true,size:14})),{fill:fill,width:8}),cell(para(run(sx.icon+' '+sx.title,{size:13})),{width:26}),cell(para(run(sx.trigger,{size:12})),{width:26}),cell(para(run(sx.story+' 【対策】'+sx.action,{size:11})),{width:40})]})); });
      children.push(fullTable(scRows));
      children.push(para(run('※ 金額は公開データ（JNSA等）に基づく概算、発生確率は検討用の仮定値。正式なリスク評価の代替ではありません。',{size:14,color:SLATE})));
      if(secs.risk_comment) children.push(commentBox(cmts.risk)); }

    const doc=new Document({ styles:{default:{document:{run:{font:FONT,size:20}}}}, sections:[{children}] });
    return await Packer.toBlob(doc);
  }

  // ─────────────── Excelレポート（ExcelJS + 画像埋込） ───────────────
  async function buildExcelReport(){
    const c=ctx(), k=c.k, mj=App.monthsJp, web=c.web;
    const wb=new ExcelJS.Workbook();
    async function addImg(ws, fig, w, h, tlCol, tlRow){
      const url=await figToPng(fig, w, h);
      const b64=url.indexOf(',')>=0 ? url.slice(url.indexOf(',')+1) : url;
      const id=wb.addImage({base64:b64, extension:'png'});
      ws.addImage(id, { tl:{col:tlCol, row:tlRow}, ext:{width:w, height:h} });
    }
    const hdrFill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F3864'}};
    function hcell(cell,text){ cell.value=text; cell.font={bold:true,color:{argb:'FFFFFFFF'},name:'Meiryo'}; cell.fill=hdrFill; cell.border={bottom:{style:'thin'}}; }

    // ① サマリー
    const ws1=wb.addWorksheet('①エグゼクティブサマリー',{pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1}});
    ws1.getCell('A1').value=`ITガバナンス評価レポート　対象期間：${c.period}`; ws1.getCell('A1').font={bold:true,size:14,color:{argb:'FF1E3A5F'},name:'Meiryo'};
    ws1.getCell('A2').value=`作成日：${c.now}　／　対象会社：${App.outCompanies.join(', ')}`;
    await addImg(ws1, CH.figScoreBar(k), 900, 300, 0, 3);
    let r=22; ws1.getCell('A'+r).value='■ 評価項目サマリー'; ws1.getCell('A'+r).font={bold:true,name:'Meiryo'}; r++;
    ['評価項目','スコア','判定','INSIGHT','ACTION'].forEach((h,i)=>hcell(ws1.getCell(r,i+1),h)); r++;
    const highCats=Object.keys(DC.SITE_GOVERNANCE).filter(x=>DC.SITE_GOVERNANCE[x].risk===3 && (k.cat_counts||{})[x]>0);
    const rows1=[
      ['リスク遮断完遂率',c.ir+'%',RD.badge(c.irL)[1], `監視イベント${fmtInt(k.total_risk_events)}件、遮断完遂率${c.ir}%。`,'現行ポリシーの定期見直しを継続。'],
      ['Webガバナンス健全度',c.gs+'点',RD.badge(c.gsL)[1], `高リスク${fmtInt(k.high_risk_count)}件。検出：${highCats.join('・')||'なし'}。`,'利用目的を部門単位で確認しホワイトリスト検討。'],
      ['業務偏重指数',c.wc+'倍',RD.badge(c.wcL)[1], `最高稼働部署「${k.busiest_dept}」平均${k.busiest_hours}h（全社平均${k.avg_hours}h）。`,'人事・経営企画と連携し業務量配分を見直し。'],
      ['深夜稼働率',c.ln+'%',RD.badge(c.lnL)[1], `深夜${fmtInt(k.latenight_days)}件・休日${fmtInt(k.holiday_active)}件。`,'深夜稼働部署・端末を確認しヒアリング。'],
      ['IT資産健全率',k.asset_health+'%',RD.badge(DC.getStatus(k.asset_health,'risk_interception_rate',true))[1], `総${k.total_devices}台中、償却切れ${k.expired_devices}台。`,'老朽デバイスの更新計画を策定し予算計上。'],
    ];
    rows1.forEach(row=>{ row.forEach((v,i)=>{ const cell=ws1.getCell(r,i+1); cell.value=v; cell.font={name:'Meiryo',size:10}; cell.alignment={wrapText:true,vertical:'top'}; cell.border={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}}; }); ws1.getRow(r).height=48; r++; });
    ws1.getColumn(1).width=22; ws1.getColumn(4).width=52; ws1.getColumn(5).width=52; ws1.getColumn(2).width=12; ws1.getColumn(3).width=12;

    // ② リスク・Web
    const ws2=wb.addWorksheet('②リスク・Webガバナンス',{pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1}});
    ws2.getCell('A1').value=`リスク・Webガバナンス分析　${c.period}`; ws2.getCell('A1').font={bold:true,size:14,name:'Meiryo'};
    if((App.aiExcludeDepts||[]).length){ ws2.getCell('A2').value=`※部署除外適用中：野良AI除外対象者が所属する部署「${App.aiExcludeDepts.join('・')}」を本シートの集計から除外しています。`; ws2.getCell('A2').font={italic:true,size:9,color:{argb:'FF7C3AED'},name:'Meiryo'}; }
    await addImg(ws2, CH.figCompanyGovernance(web), 900, 320, 0, 2);
    await addImg(ws2, CH.figCategoryBar(web), 450, 320, 0, 20);
    await addImg(ws2, CH.figMonthlyCategory(web,mj), 450, 320, 6, 20);
    let r2=40; ws2.getCell('A'+r2).value='■ カテゴリ別集計（数値）'; ws2.getCell('A'+r2).font={bold:true,name:'Meiryo'}; r2++;
    hcell(ws2.getCell(r2,1),'カテゴリ'); hcell(ws2.getCell(r2,2),'リスク'); mj.forEach((m,i)=>hcell(ws2.getCell(r2,3+i),m)); hcell(ws2.getCell(r2,3+mj.length),'合計'); r2++;
    Object.keys(DC.SITE_GOVERNANCE).sort((a,b)=>DC.SITE_GOVERNANCE[b].risk-DC.SITE_GOVERNANCE[a].risk).forEach(cat=>{
      const rl=DC.SITE_GOVERNANCE[cat].risk; ws2.getCell(r2,1).value=cat; ws2.getCell(r2,2).value=rl===3?'HIGH':rl===2?'MEDIUM':'LOW';
      let tot=0; App.months.forEach((m,i)=>{ const n=web.filter(x=>x['月']===m && x['リスク分類']===cat).length; ws2.getCell(r2,3+i).value=n; tot+=n; });
      ws2.getCell(r2,3+App.months.length).value=tot; r2++; });
    ws2.getColumn(1).width=20;

    // ③ PC稼働
    const ws3=wb.addWorksheet('③PC稼働・組織健全性',{pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1}});
    ws3.getCell('A1').value=`PC稼働状況・組織健全性　${c.period}`; ws3.getCell('A1').font={bold:true,size:14,name:'Meiryo'};
    await addImg(ws3, CH.figDeptAvgHours(App.pc_f), 900, 360, 0, 2);
    let r3=22; ['会社名','部署名','平均稼働h','深夜稼働','時間外稼働','稼働日数'].forEach((h,i)=>hcell(ws3.getCell(r3,i+1),h)); r3++;
    const m3=g(App.pc_f.filter(r=>!isNil(r['台帳_会社名'])&&!isNil(r['台帳_部署名'])),r=>r['台帳_会社名']+'|'+r['台帳_部署名']);
    const rows3=[]; m3.forEach((v,key)=>{const[co,de]=key.split('|');rows3.push([co,de,round(mean(v.map(r=>r['ログ時間_分']))/60,1),v.filter(r=>r['深夜稼働']).length,v.filter(r=>r['時間外稼働']).length,new Set(v.map(r=>r['日付_dt']&&r['日付_dt'].getTime())).size]);});
    rows3.sort((a,b)=>b[2]-a[2]); rows3.forEach(row=>{ row.forEach((v,i)=>ws3.getCell(r3,i+1).value=v); r3++; });
    ws3.getColumn(1).width=18; ws3.getColumn(2).width=20;

    // ④ IT資産
    const ws4=wb.addWorksheet('④IT資産管理',{pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1}});
    ws4.getCell('A1').value=`IT資産管理（ハードウェア台帳）　${c.period}`; ws4.getCell('A1').font={bold:true,size:14,name:'Meiryo'};
    ws4.getCell('A3').value='登録デバイス総数'; ws4.getCell('B3').value=k.total_devices+'台';
    ws4.getCell('A4').value='減価償却切れ台数'; ws4.getCell('B4').value=k.expired_devices+'台';
    ws4.getCell('A5').value='資産健全率'; ws4.getCell('B5').value=k.asset_health+'%';
    await addImg(ws4, CH.figCompanyDevices(App.hw_f), 450, 320, 0, 6);
    const yr=CH.figPurchaseYear(App.hw_f); if(yr) await addImg(ws4, yr, 450, 320, 5, 6);
    let r4=26; const hwCols=[['machine_name','端末名'],['user_name','使用者'],['会社名','会社名'],['部署名','部署名'],['課名','課名'],['maker_name','メーカー'],['model_name','モデル'],['os_type','OS'],['purchase_date','購入日'],['depreciation_date','減価償却終了日']];
    hwCols.forEach((c2,i)=>hcell(ws4.getCell(r4,i+1),c2[1])); r4++;
    App.hw_f.forEach(row=>{ hwCols.forEach((c2,i)=>{ let v=row[c2[0]]; if(v instanceof Date) v=v.toLocaleDateString('ja-JP'); ws4.getCell(r4,i+1).value=(v==null?'':String(v).slice(0,40)); }); r4++; });
    ws4.getColumn(1).width=16;

    const buf=await wb.xlsx.writeBuffer();
    return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  global._exports = { buildHtmlReport, buildWordReport, buildExcelReport, figToPng, analyzeFocus };
})(typeof self !== 'undefined' ? self : this);
