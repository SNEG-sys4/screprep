/* ============================================================
 * charts.js ― Plotlyフィギュア生成（画面・レポート共通）
 * 各ビルダーは {data, layout} を返す純粋関数。DataCore に依存。
 * ============================================================ */
(function (global) {
  'use strict';
  const DC = global.DataCore;
  const JP_FONT = 'Meiryo, Yu Gothic, Noto Sans JP, sans-serif';
  const SG = DC.SITE_GOVERNANCE;
  const CAT_COLOR = {}; Object.keys(SG).forEach(k => CAT_COLOR[k] = SG[k].color);

  function baseLayout(title, height, extra) {
    return Object.assign({
      title: title ? { text: '<b>'+title+'</b>', font:{size:15,color:'#1e3a5f',family:JP_FONT}, x:0.01, xanchor:'left' } : undefined,
      font: { family:JP_FONT, size:13, color:'#1e293b' },
      plot_bgcolor:'white', paper_bgcolor:'white',
      height: height||380, margin:{t:50,b:45,l:55,r:30},
      legend:{ bgcolor:'rgba(255,255,255,.9)', bordercolor:'#E2E8F0', borderwidth:1, font:{size:11,family:JP_FONT} },
    }, extra||{});
  }
  const CFG = { displayModeBar:false, responsive:true };

  // ── 集計ヘルパ ──
  const g = DC.groupBy, mean = DC.mean, sum = DC.sum, round = DC.round;
  function countBy(rows, keyFn){ const m=g(rows,keyFn), o=[]; m.forEach((v,k)=>o.push([k,v.length])); return o; }

  // ── サマリー：総合スコア棒 ──
  function figScoreBar(kpis) {
    const ir=kpis.interception_rate, gs=kpis.governance_score, wc=kpis.workload_concentration, ln=kpis.latenight_rate;
    const items = [
      ['リスク遮断完遂率', ir, DC.getStatus(ir,'risk_interception_rate',true), '%'],
      ['ガバナンス健全度', gs, DC.getStatus(gs,'governance_score',true), '点'],
      ['業務バランス', Math.max(0,100-(wc-1)*50), DC.getStatus(wc,'workload_concentration',false), '点'],
      ['深夜稼働安全度', Math.max(0,100-ln*10), DC.getStatus(ln,'latenight_rate',false), '点'],
    ];
    const data = items.map(it => ({ type:'bar', x:[it[0]], y:[it[1]], width:0.5,
      marker:{color:DC.STATUS_COLORS[it[2]]}, text:[it[1]+it[3]], textposition:'outside', showlegend:false }));
    const layout = baseLayout('ITガバナンス 総合スコア一覧', 320, { yaxis:{range:[0,115]},
      shapes:[hline(75,'#059669'),hline(60,'#D97706')] });
    return { data, layout };
  }
  function hline(y,color){ return { type:'line', xref:'paper', x0:0,x1:1, y0:y,y1:y, line:{color,dash:'dash',width:1.5} }; }

  function figGauge(value, title, level, suffix) {
    const color = DC.STATUS_COLORS[level] || '#059669';
    return {
      data:[{ type:'indicator', mode:'gauge+number', value:value,
        number:{suffix:suffix, font:{size:26,color:color}},
        title:{text:title, font:{size:12,color:'#1e293b'}},
        gauge:{ axis:{range:[0,100]}, bar:{color:color,thickness:0.25},
          steps:[{range:[0,60],color:'#FEE2E2'},{range:[60,75],color:'#FEF3C7'},{range:[75,100],color:'#D1FAE5'}],
          threshold:{line:{color:'#1e293b',width:3},thickness:0.75,value:value} } }],
      layout:{ font:{family:JP_FONT,size:12}, plot_bgcolor:'white', paper_bgcolor:'white', height:210, margin:{t:40,b:10,l:20,r:20} }
    };
  }

  // ── Webカテゴリ別件数（リスク順） ──
  function figCategoryBar(web) {
    const rows = countBy(web.filter(r=>!DC.isNil(r['リスク分類'])), r=>r['リスク分類'])
      .map(([cat,n])=>({cat,n,risk:(SG[cat]||{}).risk||0})).sort((a,b)=>b.risk-a.risk);
    const data = rows.map(r=>({ type:'bar', x:[r.cat], y:[r.n], name:r.cat,
      marker:{color:CAT_COLOR[r.cat]||'#94A3B8'}, text:[r.n], textposition:'outside', showlegend:false }));
    return { data, layout: baseLayout('カテゴリ別 アクセス件数（リスク順）', 380) };
  }

  // ── 月次カテゴリ別（積み上げ） ──
  function figMonthlyCategory(web, monthsJp) {
    const cats = Object.keys(SG);
    const data = cats.map(cat=>{
      const y = monthsJp.map(mj => web.filter(r=>r['月_表示']===mj && r['リスク分類']===cat).length);
      return { type:'bar', name:cat, x:monthsJp, y, marker:{color:CAT_COLOR[cat]} };
    }).filter(t=>sum(t.y)>0);
    return { data, layout: baseLayout('月次 カテゴリ別アクセス推移', 380, { barmode:'stack', xaxis:{categoryorder:'array',categoryarray:monthsJp} }) };
  }

  // ── 会社別ガバナンススコア ──
  function companyScores(web) {
    const m = g(web.filter(r=>!DC.isNil(r['台帳_会社名'])), r=>r['台帳_会社名']);
    const out = [];
    m.forEach((rows,comp)=>{
      const rd = sum(rows.map(r=>r['リスクレベル']))/(rows.length*3||1);
      const score = round((1-rd)*100,1);
      out.push({ comp, score, total:rows.length, high:rows.filter(r=>r['リスクレベル']===3).length,
                 level:DC.getStatus(score,'governance_score',true) });
    });
    return out.sort((a,b)=>a.comp.localeCompare(b.comp));
  }
  function figCompanyGovernance(web) {
    const cs = companyScores(web);
    const data = [{ type:'bar', x:cs.map(c=>c.comp), y:cs.map(c=>c.score),
      marker:{color:cs.map(c=>c.score),colorscale:'RdYlGn',cmin:0,cmax:100},
      text:cs.map(c=>c.score), textposition:'outside' }];
    return { data, layout: baseLayout('会社別 ガバナンス健全度スコア', 360, { yaxis:{range:[0,115]},
      shapes:[hline(75,'#059669'),hline(60,'#D97706')] }) , _scores:cs };
  }

  // ── 部署別 中〜高リスク内訳 ──
  function figDeptRisk(web) {
    const sub = web.filter(r=>!DC.isNil(r['台帳_部署名']) && r['リスクレベル']>=2);
    const depts = [...new Set(sub.map(r=>r['台帳_部署名']))];
    const cats = [...new Set(sub.map(r=>r['リスク分類']))];
    const data = cats.map(cat=>({ type:'bar', name:cat, x:depts,
      y:depts.map(d=>sub.filter(r=>r['台帳_部署名']===d && r['リスク分類']===cat).length),
      marker:{color:CAT_COLOR[cat]} }));
    return { data, layout: baseLayout('部署別 中〜高リスクアクセス内訳', 380, {barmode:'stack'}) , _empty: sub.length===0 };
  }

  // ── 部署別 平均PC稼働時間 ──
  function figDeptAvgHours(pc) {
    const m = g(pc.filter(r=>!DC.isNil(r['台帳_部署名'])), r=>r['台帳_部署名']);
    const rows=[]; m.forEach((v,d)=>rows.push({d, h:round(mean(v.map(r=>r['ログ時間_分']))/60,1)}));
    rows.sort((a,b)=>b.h-a.h);
    const gAvg = round(mean(rows.map(r=>r.h)),1);
    const data=[{ type:'bar', x:rows.map(r=>r.d), y:rows.map(r=>r.h),
      marker:{color:rows.map(r=>r.h),colorscale:'RdYlGn',reversescale:true},
      text:rows.map(r=>r.h+'h'), textposition:'outside' }];
    return { data, layout: baseLayout('部署別 平均PC稼働時間（業務偏重の可視化）', 400,
      { shapes:[{type:'line',xref:'paper',x0:0,x1:1,y0:gAvg,y1:gAvg,line:{color:'navy',dash:'dash'}}],
        annotations:[{xref:'paper',x:0.98,y:gAvg,text:'全社平均 '+gAvg+'h',showarrow:false,font:{color:'navy',size:11}}] }) };
  }

  // ── 会社別 月次深夜稼働 ──
  function figMonthlyLatenight(pc, monthsJp, lateStart) {
    const sub = pc.filter(r=>r['深夜稼働'] && !DC.isNil(r['台帳_会社名']));
    if (sub.length===0) return { data:[], layout: baseLayout('深夜稼働（'+lateStart+'時以降）は検出されていません', 380), _empty:true };
    const comps=[...new Set(sub.map(r=>r['台帳_会社名']))];
    const data=comps.map(c=>({ type:'bar', name:c, x:monthsJp,
      y:monthsJp.map(mj=>sub.filter(r=>r['月_表示']===mj && r['台帳_会社名']===c).length) }));
    return { data, layout: baseLayout('会社別 月次深夜稼働件数（'+lateStart+'時以降）', 380, {barmode:'group'}) };
  }

  // ── 終了時刻ヒートマップ ──
  function figHourHeatmap(pc, lateStart) {
    const sub = pc.filter(r=>r['終了時刻'] && !DC.isNil(r['台帳_部署名']));
    if (sub.length===0) return null;
    const depts=[...new Set(sub.map(r=>r['台帳_部署名']))];
    const hours=[...Array(24).keys()];
    const z = depts.map(d=>hours.map(h=>sub.filter(r=>r['台帳_部署名']===d && r['終了時刻'].getHours()===h).length));
    return { data:[{ type:'heatmap', x:hours, y:depts, z, colorscale:'YlOrRd' }],
      layout: baseLayout('部署別 終了時刻分布（深夜帯の偏り）', 360, { xaxis:{title:'終了時刻（時）'},
        shapes:[{type:'line',x0:lateStart,x1:lateStart,yref:'paper',y0:0,y1:1,line:{color:'red',dash:'dash'}}] }) };
  }

  // ── 月次イベント種類別（積み上げ） ──
  function figMonthEventStack(ac, monthsJp) {
    const kinds=[...new Set(ac.map(r=>DC.strip(r['種類'])).filter(Boolean))];
    const data=kinds.map(k=>({ type:'bar', name:k, x:monthsJp,
      y:monthsJp.map(mj=>ac.filter(r=>r['月_表示']===mj && DC.strip(r['種類'])===k).length) }));
    return { data, layout: baseLayout('月次 監視イベント種類別件数', 380, {barmode:'stack',
      xaxis:{categoryorder:'array',categoryarray:monthsJp}}) };
  }

  // ── 会社別 遮断・防止件数 ──
  function figCompanyBlock(ac) {
    const blk = ac.filter(r=>('防止・禁止' in r) && !DC.isNil(r['防止・禁止']) && !DC.isNil(r['台帳_会社名']));
    if (blk.length===0) return { data:[], layout: baseLayout('防止・禁止イベントは検出されていません',360), _empty:true };
    const rows = countBy(blk, r=>r['台帳_会社名']).sort((a,b)=>b[1]-a[1]);
    return { data:[{ type:'bar', x:rows.map(r=>r[0]), y:rows.map(r=>r[1]),
      marker:{color:rows.map(r=>r[1]),colorscale:'Reds'} }], layout: baseLayout('会社別 遮断・防止件数',360) };
  }

  // ── 高リスクドメインTOP15 ──
  function figHighRiskDomains(webHigh) {
    function dom(u){ try{ return new URL(String(u).toLowerCase()).host || String(u).slice(0,40); }catch(e){ return String(u).slice(0,40);} }
    const map = new Map();
    for (const r of webHigh){ const key=r['リスク分類']+'|'+dom(r['詳細 2']); map.set(key,(map.get(key)||0)+1); }
    let arr=[...map.entries()].map(([k,n])=>{const [cat,d]=k.split('|');return{cat,d,n};}).sort((a,b)=>b.n-a.n).slice(0,15);
    arr.reverse();
    const cats=[...new Set(arr.map(a=>a.cat))];
    const data=cats.map(cat=>({ type:'bar', orientation:'h', name:cat,
      x:arr.filter(a=>a.cat===cat).map(a=>a.n), y:arr.filter(a=>a.cat===cat).map(a=>a.d),
      marker:{color:CAT_COLOR[cat]} }));
    return { data, layout: baseLayout('検出された高リスクドメイン TOP15', 400, {barmode:'stack'}) };
  }
  function figHighRiskTrend(webHigh, monthsJp) {
    const cats=[...new Set(webHigh.map(r=>r['リスク分類']))];
    const data=cats.map(cat=>({ type:'scatter', mode:'lines+markers', name:cat, x:monthsJp,
      y:monthsJp.map(mj=>webHigh.filter(r=>r['月_表示']===mj && r['リスク分類']===cat).length),
      line:{color:CAT_COLOR[cat]} }));
    return { data, layout: baseLayout('高リスクアクセス 月次推移', 340, {xaxis:{categoryorder:'array',categoryarray:monthsJp}}) };
  }

  // ── 購入年別台数 ──
  function figPurchaseYear(hw) {
    const withDate = hw.filter(r=>r.purchase_date);
    if (withDate.length===0) return null;
    const m={}; for(const r of withDate){ const y=r.purchase_date.getFullYear(); m[y]=(m[y]||0)+1; }
    const years=Object.keys(m).sort();
    return { data:[{ type:'bar', x:years, y:years.map(y=>m[y]),
      marker:{color:years.map(y=>m[y]),colorscale:'Blues'}, text:years.map(y=>m[y]), textposition:'outside' }],
      layout: baseLayout('デバイス 購入年別台数（老朽化状況）', 340) };
  }
  function figCompanyDevices(hw) {
    const rows = countBy(hw.filter(r=>!DC.isNil(r['会社名'])), r=>r['会社名']);
    return { data:[{ type:'pie', hole:0.4, labels:rows.map(r=>r[0]), values:rows.map(r=>r[1]) }],
      layout: baseLayout('会社別 デバイス台数', 320) };
  }

  // ── 端末別稼働ランキング ──
  function terminalRanking(pc, thHours) {
    const m = g(pc.filter(r=>!DC.isNil(r['端末エージェント名'])), r=>r['端末エージェント名']);
    const rows=[]; const thMin=thHours*60;
    m.forEach((v,term)=>{
      const hrs=v.map(r=>(r['ログ時間_分']||0)/60);
      const days=new Set(v.map(r=>r['日付_dt']&&r['日付_dt'].getTime())).size;
      const longDays=v.filter(r=>(r['ログ時間_分']||0)>thMin).length;
      rows.push({ term, name:(v[0]['台帳_氏名']||null), dept:(v[0]['台帳_部署名']||null), comp:(v[0]['台帳_会社名']||null),
        avg:round(mean(hrs),1), max:round(Math.max.apply(null,hrs.concat([0])),1),
        longDays, days, longRate:days?round(longDays/days*100,1):0,
        night:v.filter(r=>r['深夜稼働']).length });
    });
    rows.sort((a,b)=>b.avg-a.avg);
    rows.forEach(r=>{ r.flag = r.longRate>=30?'🔴 要確認': r.longRate>=10?'🟡 注意':'🟢 正常'; });
    return rows;
  }
  function figTerminalRanking(rankRows, thHours) {
    const top=rankRows.slice(0,15);
    const useName = top.some(r=>r.name);
    const x = top.map(r=> useName ? (r.name||r.term) : r.term);
    return { data:[{ type:'bar', x, y:top.map(r=>r.avg),
      marker:{color:top.map(r=>r.longRate),colorscale:'RdYlGn',reversescale:true,cmin:0,cmax:50},
      text:top.map(r=>r.avg), textposition:'outside' }],
      layout: baseLayout('平均稼働時間ランキング（上位15件）／ 色：長時間稼働率', 400,
        { shapes:[{type:'line',xref:'paper',x0:0,x1:1,y0:thHours,y1:thHours,line:{color:'#DC2626',dash:'dash'}}] }) };
  }
  function figLongMonthly(pc, monthsJp, thHours) {
    const sub=pc.filter(r=>(r['ログ時間_分']||0)>thHours*60);
    const rows=monthsJp.map(mj=>sub.filter(r=>r['月_表示']===mj).length);
    return { data:[{ type:'bar', x:monthsJp, y:rows, marker:{color:rows,colorscale:'OrRd'} }],
      layout: baseLayout('月別 長時間稼働（'+thHours+'h超）件数推移',340) };
  }

  // ── トレンド予測 ──
  function linfit(x,y){ const n=x.length; const sx=sum(x),sy=sum(y),sxx=sum(x.map(v=>v*v)),sxy=sum(x.map((v,i)=>v*y[i]));
    const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx); const intercept=(sy-slope*sx)/n; return {slope,intercept}; }
  function figTrend(monthsJp, y, metricKey, unit, pred, predLevel) {
    const th = DC.THRESHOLDS[metricKey]||{};
    const shapes=[]; const anns=[];
    if('yellow' in th){shapes.push({type:'line',xref:'paper',x0:0,x1:1,y0:th.yellow,y1:th.yellow,line:{color:'#D97706',dash:'dot'}});}
    if('green' in th){shapes.push({type:'line',xref:'paper',x0:0,x1:1,y0:th.green,y1:th.green,line:{color:'#059669',dash:'dot'}});}
    const nextLbl='次月（予測）';
    const data=[
      { type:'scatter', mode:'lines+markers', name:'実績', x:monthsJp, y, line:{color:'#2563EB',width:3}, marker:{size:8} },
      { type:'scatter', mode:'lines+markers', name:'予測', x:[monthsJp[monthsJp.length-1],nextLbl], y:[y[y.length-1],pred],
        line:{color:'#94A3B8',width:3,dash:'dash'}, marker:{size:10,symbol:'diamond',color:DC.STATUS_COLORS[predLevel]} },
    ];
    const icon={green:'🟢',yellow:'🟡',red:'🔴'}[predLevel];
    return { data, layout: baseLayout(null,300,{ title:{text:'次月予測：'+round(pred,1)+unit+' '+icon,font:{size:13,family:JP_FONT}},
      shapes, showlegend:true, legend:{orientation:'h',y:1.15}, margin:{t:50,b:30,l:40,r:20} }) };
  }

  function figImpact(expLoss, elecMan, agingMan, totalMan) {
    return { data:[{ type:'bar',
      x:['情報漏洩<br>期待損失','電源付きっぱなし<br>電気代','老朽デバイス<br>追加コスト','合計'],
      y:[expLoss, elecMan, agingMan, totalMan],
      marker:{color:['#DC2626','#7C3AED','#D97706','#1E3A5F']},
      text:[expLoss,elecMan,agingMan,totalMan].map(v=>round(v,1)+'万円'), textposition:'outside' }],
      layout: baseLayout('検出リスクの想定インパクト（年換算・万円）', 350) };
  }

  global.Charts = {
    JP_FONT, CAT_COLOR, baseLayout, CFG, hline, countBy,
    figScoreBar, figGauge, figCategoryBar, figMonthlyCategory, companyScores, figCompanyGovernance,
    figDeptRisk, figDeptAvgHours, figMonthlyLatenight, figHourHeatmap, figMonthEventStack,
    figCompanyBlock, figHighRiskDomains, figHighRiskTrend, figPurchaseYear, figCompanyDevices,
    terminalRanking, figTerminalRanking, figLongMonthly, linfit, figTrend, figImpact,
  };
})(typeof self !== 'undefined' ? self : this);
