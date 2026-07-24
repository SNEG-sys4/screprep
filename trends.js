/* ============================================================
 * trends.js ― TAB6 リスク予測・インパクト分析
 * DOM保持方針は render.js と同様（初回のみ骨格生成、以降は中身のみ更新）。
 * ここは特にユーザーが数値を打ち込む入力欄（想定漏えい人数 等）を持つため、
 * 骨格を毎回作り直すと「他のフィルタを変えただけで入力が消える」事故になる。
 * 骨格は初回のみ生成し、以降は再生成しない。
 * ============================================================ */
(function (global) {
  'use strict';
  const DC=global.DataCore, CH=global.Charts, RD=global.Render;
  const round=DC.round, fmtInt=n=>(n||0).toLocaleString('ja-JP');

  global.renderT6 = function(){
    const mk=App.monthlyKpis, n=mk.length;
    const t6el=document.getElementById('t6');
    if(!t6el.dataset.init){
      t6el.dataset.init='1';
      t6el.innerHTML = `<div class="sec-title">🔮 リスク予測・インパクト分析</div>
        <p class="hint">過去データの傾向から将来を予測し、放置した場合の経営インパクトと脅威シナリオを可視化します。</p>
        <div class="sec-title">📈 トレンド予測・アラート</div>
        <div id="t6-trend-wrap"></div>
        <div class="sec-title">💰 リスクの金額換算（インパクト・シミュレーション）</div>
        <p class="hint">検出リスクを放置した場合の想定コストを公開調査データ（JNSA等）をもとに概算。実際の金額は業種・規模等で大きく異なります。</p>
        <div class="filters">
          <div class="filter-item"><label>🔴 想定漏えい人数（人）</label><input type="number" id="i-persons" value="100" step="10"></div>
          <div class="filter-item"><label>1人あたり想定損害賠償額（円）</label><input type="number" id="i-percost" value="28308" step="1000"></div>
          <div class="filter-item"><label>初動対応・調査費用（万円）</label><input type="number" id="i-response" value="300" step="50"></div>
          <div class="filter-item"><label>高リスク1件あたり発生確率(%)※仮定値</label><input type="number" id="i-prob" value="0.5" step="0.1"></div>
          <div class="filter-item"><label>🔌 電気料金単価（円/kWh）</label><input type="number" id="i-elec" value="31" step="1"></div>
          <div class="filter-item"><label>PC1台平均消費電力（kW）</label><input type="number" id="i-kw" value="0.1" step="0.01"></div>
          <div class="filter-item"><label>🖥️ 償却切れ1台あたり追加コスト（万円/年）</label><input type="number" id="i-aging" value="3" step="1"></div>
        </div>
        <div class="metric-row" id="impact-metrics" style="margin-top:14px"></div>
        <div class="chart-box"><div id="impact-chart"></div></div>
        <div class="note-box"><b>📌 この数字の見方：</b>対策コストと放置コストを比較する参考値です。<br>
          <b>📚 主な出典：</b>JNSA「情報セキュリティインシデントに関する調査報告書」（2016〜2018）、「インシデント損害額調査レポート2021年版」。<br>
          <b>⚠️ 注意：</b>公開データに基づく概算であり、正式なリスク評価の代替にはなりません。</div>
        <div class="sec-title">🧨 今後起こりうるセキュリティインシデント シナリオ</div>
        <div id="scenarios"></div>`;
      bindImpact();
    }

    const trendWrap=document.getElementById('t6-trend-wrap');
    if(n<2){
      trendWrap.innerHTML = `<div class="status-msg status-info">📌 トレンド予測には2ヶ月以上のデータが必要です。対象期間を増やしてください。</div>`;
    } else {
      // 骨格（グラフ枠・アラート枠）は月数が2以上になった最初のタイミングで1回だけ生成
      if(!trendWrap.dataset.init){
        trendWrap.dataset.init='1';
        trendWrap.innerHTML = `<div class="grid2" id="trend-charts"></div><div id="trend-alerts"></div>
          <p class="hint">※ 予測は過去データの線形トレンドに基づく簡易推計です。傾向把握・早期対応の参考値としてご活用ください。</p>`;
      }
      renderTrends();
    }

    recomputeImpact();
  };

  function renderTrends(){
    const mk=App.monthlyKpis, mj=App.monthsJp;
    const METRICS=[
      {key:'governance_score',label:'Webガバナンス健全度',unit:'点',metric:'governance_score',hb:true},
      {key:'interception_rate',label:'リスク遮断完遂率',unit:'%',metric:'risk_interception_rate',hb:true},
      {key:'workload_concentration',label:'業務偏重指数',unit:'倍',metric:'workload_concentration',hb:false},
      {key:'latenight_rate',label:'深夜稼働率',unit:'%',metric:'latenight_rate',hb:false},
    ];
    const wrap=document.getElementById('trend-charts');
    // グラフ用divは初回のみ作成（以降は同じdivにreact()で差分更新）
    if(!wrap.dataset.init){
      wrap.dataset.init='1';
      wrap.innerHTML = METRICS.map((tm,idx)=>`<div class="chart-box"><div id="trend-${idx}"></div></div>`).join('');
    }
    const x=mk.map((_,i)=>i); const sev={green:0,yellow:1,red:2}; const alerts=[];
    METRICS.forEach((tm,idx)=>{
      const y=mk.map(m=>+m[tm.key]);
      const {slope,intercept}=CH.linfit(x,y); const pred=slope*mk.length+intercept;
      const curS=DC.getStatus(y[y.length-1],tm.metric,tm.hb), predS=DC.getStatus(pred,tm.metric,tm.hb);
      if(sev[predS]>sev[curS]) alerts.push({label:tm.label,cur:y[y.length-1],pred:round(pred,2),unit:tm.unit,curS,predS});
      RD.plot('trend-'+idx, CH.figTrend(mj, y, tm.metric, tm.unit, pred, predS));
    });
    const al=document.getElementById('trend-alerts');
    if(alerts.length){ al.innerHTML=alerts.map(a=>{ const[ip,,cp,bp]=RD.badge(a.predS), [ic]=RD.badge(a.curS);
      return `<div style="background:${bp};border-left:5px solid ${cp};border-radius:6px;padding:12px 16px;margin-bottom:8px">
        <b style="color:${cp}">⚠️ アラート：${a.label}が悪化傾向です</b><br>
        <span style="font-size:.85rem">現在 ${ic} ${a.cur}${a.unit} → このペースが続くと次月は ${ip} <b>${a.pred}${a.unit}</b> となる見込みです。早期対応で悪化を防げる可能性があります。</span></div>`; }).join(''); }
    else al.innerHTML='<div class="status-msg status-ok">✅ 現在のトレンドでは、次月に主要KPIが悪化ゾーンへ移行する見込みはありません。</div>';
  }

  function bindImpact(){ ['i-persons','i-percost','i-response','i-prob','i-elec','i-kw','i-aging'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.addEventListener('input', recomputeImpact); }); }

  function recomputeImpact(){
    const k=App.kpis; const val=id=>parseFloat(document.getElementById(id).value)||0;
    const persons=val('i-persons'), perCost=val('i-percost'), response=val('i-response'), prob=val('i-prob')/100;
    const elec=val('i-elec'), kw=val('i-kw'), aging=val('i-aging');
    const th=App.longThreshold;
    const perIncidentMan = response + (persons*perCost/10000);
    const highN=k.high_risk_count||0;
    const expLoss = highN*prob*perIncidentMan;
    const longPc=App.pc_f.filter(r=>(r['ログ時間_分']||0)>th*60);
    const excessH=DC.sum(longPc.map(r=>Math.max(0,(r['ログ時間_分']||0)/60-th)));
    const elecYen=excessH*kw*elec;
    const expiredN=k.expired_devices||0;
    const agingMan=expiredN*aging;
    const totalMan=expLoss+(elecYen/10000)+agingMan;
    document.getElementById('impact-metrics').innerHTML=
      RD.metric('🔴 情報漏洩 期待損失額',round(expLoss,1)+' 万円')+
      RD.metric('🔌 電源つけっぱ 電気代',round(elecYen,0).toLocaleString('ja-JP')+' 円')+
      RD.metric('🖥️ 老朽デバイス 追加/年',fmtInt(agingMan)+' 万円')+
      RD.metric('💰 想定インパクト合計',round(totalMan,1)+' 万円');
    RD.plot('impact-chart', CH.figImpact(round(expLoss,1), round(elecYen/10000,1), agingMan, round(totalMan,1)));
    renderScenarios(longPc.length);
  }

  function renderScenarios(longPcN){
    const k=App.kpis, cc=k.cat_counts||{}, th=App.longThreshold;
    const lb=lv=>({high:['🔴','可能性：高','#DC2626','#FEF2F2'],medium:['🟡','可能性：中','#D97706','#FFFBEB'],low:['🔵','可能性：低','#2563EB','#EFF6FF']}[lv]);
    const S=[];
    const transferN=(cc['転送サービス']||0)+(cc['クラウドストレージ']||0);
    if(transferN>0) S.push({icon:'📤',title:'機密ファイルの外部転送による情報漏洩',level:transferN>=20?'high':transferN>=5?'medium':'low',
      trigger:`転送・クラウドストレージへのアクセス ${fmtInt(transferN)}件を検出`,
      story:'退職予定者や悪意ある社員が顧客リストや設計データを私用クラウドへアップロードし社外に持ち出す。発覚は退職後、不正利用や競合流出が判明した時点となり対応が後手に回る。',
      action:'退職・異動予定者のアクセスログを重点監視。クラウドへのアップロードをDLPツールで検知・制御する。'});
    const aiN=cc['AI・外部サービス']||0;
    if(aiN>0) S.push({icon:'🤖',title:'生成AIへの機密情報入力による情報漏洩',level:aiN>=50?'high':aiN>=10?'medium':'low',
      trigger:`AI外部サービスへのアクセス ${fmtInt(aiN)}件を検出`,
      story:'社員が契約書や顧客情報をそのまま生成AIに貼り付けて要約・翻訳を依頼。入力内容が外部サーバーに送信され、規約次第では学習利用される可能性がある。後日取引先から指摘を受け信用問題に発展する。',
      action:'生成AI利用ガイドラインを策定し「入力禁止情報」を明示。法人向けプラン（学習オフ）への移行を検討する。'});
    if(longPcN>0) S.push({icon:'🔌',title:'無人稼働端末を起点とした不正アクセス・ランサムウェア感染',level:longPcN>=30?'high':longPcN>=10?'medium':'low',
      trigger:`${th}時間超の長時間稼働を ${fmtInt(longPcN)}件 検出`,
      story:'深夜、ロックされていない端末に第三者（または侵入済みマルウェア）がアクセスし社内ネットワークを横断探索。ランサムウェアが展開され翌朝には複数サーバーが暗号化、業務が完全停止する。JNSA調査では身代金は平均約2,400万円・中央値約860万円とされ、復旧・事業停止損失も発生する。',
      action:'長時間稼働端末の用途確認を行い、不要なものは自動シャットダウン・スリープを適用。離席時の自動ロックを全社必須化する。'});
    const expiredN=k.expired_devices||0;
    if(expiredN>0) S.push({icon:'🖥️',title:'サポート切れ端末の脆弱性を突いたマルウェア感染',level:expiredN>=10?'high':expiredN>=3?'medium':'low',
      trigger:`減価償却切れデバイス ${fmtInt(expiredN)}台を検出`,
      story:'パッチ提供が終了した老朽端末が最新の脆弱性を悪用した攻撃の侵入口となる。一台の感染が社内ネットワークを通じて拡大し、復旧まで数日〜数週間の業務停止が発生する。',
      action:'サポート切れOS端末を優先リストアップしリプレースを前倒し。リプレースまではネットワーク分離（隔離VLAN等）を検討する。'});
    const lnRate=k.latenight_rate||0, holiday=k.holiday_active||0;
    if(lnRate>=2||holiday>0) S.push({icon:'🌙',title:'長時間労働による労務トラブル・退職リスク',level:lnRate>=5?'high':(lnRate>=2||holiday>0)?'medium':'low',
      trigger:`深夜稼働率 ${lnRate}% ／ 休日稼働 ${fmtInt(holiday)}件 を検出`,
      story:'特定の部署・社員に業務が集中し慢性的な長時間労働が続く。本人が労基署に相談、または健康被害で長期離脱。労務管理体制の不備を問われ対外的信用にも影響する。',
      action:'深夜・休日稼働の多い部署・社員を特定し業務量の再配分や増員を検討。1on1で状況をヒアリングし早期にケアする。'});

    const el=document.getElementById('scenarios');
    if(!S.length){ el.innerHTML='<div class="status-msg status-ok">✅ 現在のデータでは、重大な懸念シナリオは検出されていません。</div>'; return; }
    const ord={high:0,medium:1,low:2}; S.sort((a,b)=>ord[a.level]-ord[b.level]);
    el.innerHTML=S.map(s=>{ const[ic,lab,cl,bg]=lb(s.level);
      return `<div style="border:1px solid ${cl}33;border-left:6px solid ${cl};border-radius:8px;padding:16px 18px;margin-bottom:14px;background:${bg}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:1.05rem;font-weight:800">${s.icon} ${s.title}</span>
          <span style="font-weight:800;color:${cl};font-size:.85rem">${ic} ${lab}</span></div>
        <div style="font-size:.78rem;color:${cl};font-weight:700;margin-bottom:6px">検出データ：${s.trigger}</div>
        <div style="font-size:.85rem;line-height:1.8;margin-bottom:10px"><b>想定シナリオ：</b>${s.story}</div>
        <div style="font-size:.85rem;line-height:1.8"><b>🛡️ 推奨対策：</b>${s.action}</div></div>`; }).join('')
      +'<p class="hint">※ 上記は検出パターンに基づく一般的な想定例です。実際の発生有無・確率を示すものではありません。</p>';
  }
})(typeof self !== 'undefined' ? self : this);
