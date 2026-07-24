/* ============================================================
 * riskcalc.js ― リスク予測・金額換算・脅威シナリオの純粋計算
 *   画面(TAB6)とレポート出力(TAB5)で共通利用し、数字のズレを防ぐ。
 * ============================================================ */
(function (global) {
  'use strict';
  const DC=global.DataCore;
  const round=DC.round, sum=DC.sum;

  const DEFAULTS={ persons:100, perCost:28308, response:300, prob:0.5, elec:31, kw:0.1, aging:3 };

  const TREND_METRICS=[
    {key:'governance_score',label:'Webガバナンス健全度',unit:'点',metric:'governance_score',hb:true},
    {key:'interception_rate',label:'リスク遮断完遂率',unit:'%',metric:'risk_interception_rate',hb:true},
    {key:'workload_concentration',label:'業務偏重指数',unit:'倍',metric:'workload_concentration',hb:false},
    {key:'latenight_rate',label:'深夜稼働率',unit:'%',metric:'latenight_rate',hb:false},
  ];

  function linfit(x,y){ const n=x.length; const sx=sum(x),sy=sum(y),sxx=sum(x.map(v=>v*v)),sxy=sum(x.map((v,i)=>v*y[i]));
    const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx); const intercept=(sy-slope*sx)/n; return {slope,intercept}; }

  // 金額換算（万円ベース）
  function computeImpact(kpis, pcRows, longThreshold, a){
    a=Object.assign({},DEFAULTS,a||{});
    const th=longThreshold||12;
    const perIncidentMan = a.response + (a.persons*a.perCost/10000);
    const highN=kpis.high_risk_count||0;
    const expLoss = highN*(a.prob/100)*perIncidentMan;
    const longPc=(pcRows||[]).filter(r=>(r['ログ時間_分']||0)>th*60);
    const excessH=sum(longPc.map(r=>Math.max(0,(r['ログ時間_分']||0)/60-th)));
    const elecYen=excessH*a.kw*a.elec;
    const expiredN=kpis.expired_devices||0;
    const agingMan=expiredN*a.aging;
    const totalMan=expLoss+(elecYen/10000)+agingMan;
    return { assumptions:a, perIncidentMan, highN, expiredN,
      expLoss:round(expLoss,1), elecYen:round(elecYen,0), agingMan:round(agingMan,0),
      totalMan:round(totalMan,1), longPcN:longPc.length, excessH:round(excessH,1) };
  }

  // トレンド予測・悪化アラート
  function computeTrendAlerts(monthlyKpis){
    const mk=monthlyKpis||[];
    if(mk.length<2) return { enough:false, alerts:[], preds:[] };
    const x=mk.map((_,i)=>i); const sev={green:0,yellow:1,red:2};
    const alerts=[], preds=[];
    TREND_METRICS.forEach(tm=>{
      const y=mk.map(m=>+m[tm.key]);
      const {slope,intercept}=linfit(x,y); const pred=slope*mk.length+intercept;
      const curS=DC.getStatus(y[y.length-1],tm.metric,tm.hb), predS=DC.getStatus(pred,tm.metric,tm.hb);
      preds.push({ key:tm.key,label:tm.label,unit:tm.unit,metric:tm.metric,hb:tm.hb, y, pred:round(pred,2), curS, predS });
      if(sev[predS]>sev[curS]) alerts.push({ label:tm.label, cur:y[y.length-1], pred:round(pred,2), unit:tm.unit, curS, predS });
    });
    return { enough:true, alerts, preds };
  }

  // 脅威シナリオ
  function computeScenarios(kpis, longPcN, longThreshold){
    const cc=kpis.cat_counts||{}, th=longThreshold||12; const S=[];
    const transferN=(cc['転送サービス']||0)+(cc['クラウドストレージ']||0);
    if(transferN>0) S.push({icon:'📤',title:'機密ファイルの外部転送による情報漏洩',level:transferN>=20?'high':transferN>=5?'medium':'low',
      trigger:`転送・クラウドストレージへのアクセス ${transferN.toLocaleString()}件を検出`,
      story:'退職予定者や悪意ある社員が顧客リストや設計データを私用クラウドへアップロードし社外に持ち出す。発覚は退職後、不正利用や競合流出が判明した時点となり対応が後手に回る。',
      action:'退職・異動予定者のアクセスログを重点監視。クラウドへのアップロードをDLPツールで検知・制御する。'});
    const aiN=cc['AI・外部サービス']||0;
    if(aiN>0) S.push({icon:'🤖',title:'生成AIへの機密情報入力による情報漏洩',level:aiN>=50?'high':aiN>=10?'medium':'low',
      trigger:`AI外部サービスへのアクセス ${aiN.toLocaleString()}件を検出`,
      story:'社員が契約書や顧客情報をそのまま生成AIに貼り付けて要約・翻訳を依頼。入力内容が外部サーバーに送信され、規約次第では学習利用される可能性がある。後日取引先から指摘を受け信用問題に発展する。',
      action:'生成AI利用ガイドラインを策定し「入力禁止情報」を明示。法人向けプラン（学習オフ）への移行を検討する。'});
    if(longPcN>0) S.push({icon:'🔌',title:'無人稼働端末を起点とした不正アクセス・ランサムウェア感染',level:longPcN>=30?'high':longPcN>=10?'medium':'low',
      trigger:`${th}時間超の長時間稼働を ${longPcN.toLocaleString()}件 検出`,
      story:'深夜、ロックされていない端末に第三者（または侵入済みマルウェア）がアクセスし社内ネットワークを横断探索。ランサムウェアが展開され翌朝には複数サーバーが暗号化、業務が完全停止する。JNSA調査では身代金は平均約2,400万円・中央値約860万円とされ、復旧・事業停止損失も発生する。',
      action:'長時間稼働端末の用途確認を行い、不要なものは自動シャットダウン・スリープを適用。離席時の自動ロックを全社必須化する。'});
    const expiredN=kpis.expired_devices||0;
    if(expiredN>0) S.push({icon:'🖥️',title:'サポート切れ端末の脆弱性を突いたマルウェア感染',level:expiredN>=10?'high':expiredN>=3?'medium':'low',
      trigger:`減価償却切れデバイス ${expiredN.toLocaleString()}台を検出`,
      story:'パッチ提供が終了した老朽端末が最新の脆弱性を悪用した攻撃の侵入口となる。一台の感染が社内ネットワークを通じて拡大し、復旧まで数日〜数週間の業務停止が発生する。',
      action:'サポート切れOS端末を優先リストアップしリプレースを前倒し。リプレースまではネットワーク分離（隔離VLAN等）を検討する。'});
    const lnRate=kpis.latenight_rate||0, holiday=kpis.holiday_active||0;
    if(lnRate>=2||holiday>0) S.push({icon:'🌙',title:'長時間労働による労務トラブル・退職リスク',level:lnRate>=5?'high':(lnRate>=2||holiday>0)?'medium':'low',
      trigger:`深夜稼働率 ${lnRate}% ／ 休日稼働 ${holiday.toLocaleString()}件 を検出`,
      story:'特定の部署・社員に業務が集中し慢性的な長時間労働が続く。本人が労基署に相談、または健康被害で長期離脱。労務管理体制の不備を問われ対外的信用にも影響する。',
      action:'深夜・休日稼働の多い部署・社員を特定し業務量の再配分や増員を検討。1on1で状況をヒアリングし早期にケアする。'});
    const ord={high:0,medium:1,low:2}; S.sort((a,b)=>ord[a.level]-ord[b.level]);
    return S;
  }

  global.RiskCalc={ DEFAULTS, TREND_METRICS, linfit, computeImpact, computeTrendAlerts, computeScenarios };
})(typeof self !== 'undefined' ? self : this);
