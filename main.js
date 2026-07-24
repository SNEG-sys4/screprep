/* ============================================================
 * main.js ― 状態管理・ファイル読込・永続化・フィルタ・タブ制御
 * ============================================================ */
(function (global) {
  'use strict';
  const DC=global.DataCore, DB=global.DB;
  const App = global.App = Object.assign(global.App || {}, {
    files:{hw:null,pc:null,ac:[]},
    hw:[],pc:[],ac:[], hw_f:[],pc_f:[],ac_f:[], kpis:{}, monthlyKpis:[],
    months:[], monthsJp:[], outCompanies:[],
    cfg:{LATE_NIGHT_START:22, EARLY_MORNING_END:6, OVERTIME_THRESHOLD:20}, longThreshold:12,
    allMonths:[], allCompanies:[], allGroups:[],
    sel:{months:[],companies:[],groups:[]},
    aiExcludeUsers:[], aiExcludeDepts:[],
  });

  // ── 汎用ダウンロード ──
  function download(blob, name){ const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},500); }
  function todayStr(){ const d=new Date(); return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'); }

  // ── ファイル読込（生の行を返す） ──
  function readCsvArrayBuffer(buf){
    const bytes=new Uint8Array(buf); let text;
    try { const uni=Encoding.convert(bytes,{to:'UNICODE',from:'AUTO'}); text=Encoding.codeToString(uni); }
    catch(e){ text=new TextDecoder('utf-8').decode(bytes); }
    if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
    return Papa.parse(text,{header:true,skipEmptyLines:true}).data;
  }
  async function readXlsx(buf){
    const wb=new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws=wb.worksheets[0]; const rows=[]; let headers=[];
    ws.eachRow((row,rn)=>{ const vals=row.values;
      if(rn===1){ headers=vals.map(v=>v==null?'':String(v).trim()); return; }
      const o={}; for(let i=1;i<headers.length;i++){ const h=headers[i]; if(!h) continue;
        let v=vals[i]; if(v && typeof v==='object' && 'text' in v) v=v.text; if(v && v.result!==undefined) v=v.result; o[h]=v==null?'':v; }
      rows.push(o); });
    return rows;
  }
  function readFile(file){ return new Promise((resolve,reject)=>{ const fr=new FileReader();
    fr.onload=async()=>{ try{ if(file.name.toLowerCase().endsWith('.xlsx')) resolve(await readXlsx(fr.result)); else resolve(readCsvArrayBuffer(fr.result)); }catch(e){ reject(e); } };
    fr.onerror=()=>reject(fr.error); fr.readAsArrayBuffer(file); }); }

  // 月バケット化（保存の上書き単位）
  function bucketPc(rows){ const o={}; for(const r of rows){ const m=DC.ymKey(DC.parsePcDate(r['日付']))||'不明'; (o[m]=o[m]||[]).push(r); } return o; }
  function bucketAc(rows){ const o={}; for(const r of rows){ const m=DC.ymKey(DC.parseDateLoose(r['日時']))||'不明'; (o[m]=o[m]||[]).push(r); } return o; }

  // ── アップロードUI ──
  function setFn(box,txt){ document.getElementById('fn-'+box).textContent=txt||''; document.getElementById('box-'+box).classList.toggle('filled',!!txt); }
  function checkReady(){ document.getElementById('btn-analyze').disabled=!(App.files.hw || App.files.pc || App.files.ac.length); }
  document.getElementById('file-hw').addEventListener('change',e=>{ App.files.hw=e.target.files[0]||null; setFn('hw',App.files.hw&&App.files.hw.name); checkReady(); });
  document.getElementById('file-pc').addEventListener('change',e=>{ App.files.pc=e.target.files[0]||null; setFn('pc',App.files.pc&&App.files.pc.name); checkReady(); });
  document.getElementById('file-ac').addEventListener('change',e=>{ App.files.ac=[...e.target.files]; setFn('ac',App.files.ac.length?App.files.ac.length+'ファイル選択':''); checkReady(); });
  document.getElementById('btn-analyze').addEventListener('click', importAndReload);

  // ── 取り込み → 保存 → 再ロード ──
  async function importAndReload(){
    const st=document.getElementById('upload-status');
    st.className='status-msg status-info'; st.innerHTML='<span class="spinner"></span>取り込んで保存しています…';
    try{
      if(App.files.hw){ const rows=await readFile(App.files.hw); await DB.putHw(rows); }
      if(App.files.pc){ const byM=bucketPc(await readFile(App.files.pc)); for(const m in byM) await DB.putMonth('pc',m,byM[m]); }
      if(App.files.ac.length){ let all=[]; for(const f of App.files.ac) all=all.concat(await readFile(f)); const byM=bucketAc(all); for(const m in byM) await DB.putMonth('ac',m,byM[m]); }
      App.files={hw:null,pc:null,ac:[]}; ['hw','pc','ac'].forEach(b=>{ document.getElementById('file-'+b).value=''; setFn(b,''); }); checkReady();
      const ok=await loadFromStore();
      st.className='status-msg status-ok'; st.textContent = ok ? '✅ 取り込み・保存が完了しました。' : '⚠️ 取り込めるデータがありませんでした。';
    }catch(e){ console.error(e); st.className='status-msg status-err'; st.textContent='取り込みエラー：'+e.message+'（列名・文字コードをご確認ください）'; }
  }

  // ── 保管データからロード（全期間） ──
  async function loadFromStore(){
    const [hwRec,pcRecs,acRecs]=await Promise.all([DB.getAll('hw'),DB.getAll('pc'),DB.getAll('ac')]);
    const hwRows=hwRec.length?hwRec[0].rows:[];
    const pcRows=[].concat(...pcRecs.map(r=>r.rows||[]));
    const acRows=[].concat(...acRecs.map(r=>r.rows||[]));
    updateStorePanel(hwRec,pcRecs,acRecs);
    if(!hwRows.length && !pcRows.length && !acRows.length){ document.getElementById('app-body').classList.add('hidden'); return false; }

    App.hw=DC.loadHw(hwRows);
    App.pc=DC.loadPc(pcRows, App.cfg);
    App.ac=DC.loadAc(acRows.length?[acRows]:[]);
    DC.joinLedgers(App.hw, App.pc, App.ac);

    App.allMonths=[...new Set([...App.pc.map(r=>r['月']),...App.ac.map(r=>r['月'])].filter(Boolean))].sort();
    App.allCompanies=[...new Set(App.hw.map(r=>r['会社名']).filter(Boolean))].sort();
    App.allGroups=[...new Set(App.pc.map(r=>r['所属グループ名']).filter(Boolean))].sort();
    App.sel.months=App.allMonths.slice(); App.sel.companies=App.allCompanies.slice(); App.sel.groups=App.allGroups.slice();

    buildFilterUI();
    applyFilters();
    document.getElementById('app-body').classList.remove('hidden');
    return true;
  }

  // ── 保管状況パネル ──
  function updateStorePanel(hwRec,pcRecs,acRecs){
    const el=document.getElementById('store-status'); if(!el) return;
    const pcMonths=pcRecs.map(r=>r.month).sort();
    const acMonths=acRecs.map(r=>r.month).sort();
    const pcN=pcRecs.reduce((a,r)=>a+(r.rows?r.rows.length:0),0);
    const acN=acRecs.reduce((a,r)=>a+(r.rows?r.rows.length:0),0);
    const hwN=hwRec.length?(hwRec[0].rows?hwRec[0].rows.length:0):0;
    if(!hwN && !pcN && !acN){ el.className='status-msg status-info'; el.innerHTML='💾 保管データ：まだありません。ファイルを取り込むとブラウザ内に蓄積されます。'; return; }
    const fmtMs=pcMonths.map(m=>DC.fmtMonth(m)).join('、')||'—';
    const fmtAs=acMonths.map(m=>DC.fmtMonth(m)).join('、')||'—';
    el.className='status-msg status-ok';
    el.innerHTML='💾 <b>保管データ（このブラウザ内に蓄積中）</b><br>台帳：'+hwN+'件　／　PC稼働：'+pcN.toLocaleString()+'件（'+pcMonths.length+'ヶ月：'+fmtMs+'）　／　アクセス：'+acN.toLocaleString()+'件（'+acMonths.length+'ヶ月：'+fmtAs+'）';
  }

  // ── バックアップ書出し／復元／全消去 ──
  document.getElementById('btn-backup').addEventListener('click', async()=>{
    try{ const data=await DB.exportAll(); download(new Blob([JSON.stringify(data)],{type:'application/json'}), 'ITガバナンス_バックアップ_'+todayStr()+'.json'); }
    catch(e){ alert('書出しエラー：'+e.message); }
  });
  document.getElementById('file-backup').addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return;
    if(!confirm('現在の保管データをバックアップの内容で置き換えます。よろしいですか？')){ e.target.value=''; return; }
    const st=document.getElementById('upload-status'); st.className='status-msg status-info'; st.innerHTML='<span class="spinner"></span>復元しています…';
    try{ const data=JSON.parse(await f.text()); await DB.importAll(data); await loadFromStore();
      st.className='status-msg status-ok'; st.textContent='✅ バックアップから復元しました。'; }
    catch(err){ console.error(err); st.className='status-msg status-err'; st.textContent='復元エラー：'+err.message; }
    e.target.value='';
  });
  document.getElementById('btn-clear').addEventListener('click', async()=>{
    if(!confirm('保管データをすべて消去します。元に戻せません（バックアップ済みならそこから復元可能）。実行しますか？')) return;
    try{ await DB.clearAll(); await loadFromStore();
      const st=document.getElementById('upload-status'); st.className='status-msg status-info'; st.textContent='🗑️ 保管データを消去しました。'; }
    catch(e){ alert('消去エラー：'+e.message); }
  });

  // ── フィルタUI ──
  function multiUI(elId, items, selected, labelFn, onChange){
    const el=document.getElementById(elId); el.innerHTML='';
    items.forEach(it=>{ const d=document.createElement('div');
      const label=labelFn?labelFn(it):(DC.isNil(it)?'(空白)':it);
      d.innerHTML='<label><input type="checkbox" '+(selected.includes(it)?'checked':'')+'> '+label+'</label>';
      d.querySelector('input').addEventListener('change',ev=>onChange(it,ev.target.checked)); el.appendChild(d); });
  }
  function buildFilterUI(){
    multiUI('f-months', App.allMonths, App.sel.months, m=>DC.fmtMonth(m), (v,on)=>toggle(App.sel.months,v,on));
    multiUI('f-companies', App.allCompanies, App.sel.companies, null, (v,on)=>toggle(App.sel.companies,v,on));
    multiUI('f-groups', App.allGroups, App.sel.groups, null, (v,on)=>toggle(App.sel.groups,v,on));
    const ot=document.getElementById('s-ot'), ln=document.getElementById('s-ln');
    ot.oninput=()=>{ App.cfg.OVERTIME_THRESHOLD=+ot.value; document.getElementById('v-ot').textContent=ot.value; applyFilters(); };
    ln.oninput=()=>{ App.cfg.LATE_NIGHT_START=+ln.value; document.getElementById('v-ln').textContent=ln.value; applyFilters(); };
    buildAiExcludeUI();
  }
  // チェック状態→App.aiExcludeUsers／App.aiExcludeDepts を更新するだけ（再描画はしない＝初期構築用）
  function _computeAiExcludeState(){
    const ids=[]; document.querySelectorAll('#f-aiexclude input.ai-ex:checked').forEach(cb=>ids.push(cb.value));
    App.aiExcludeUsers=ids;
    try{ if(window.localStorage) localStorage.setItem('aiExcludeUsers', ids.join(',')); }catch(e){}
    const byVal=App._userDeptByVal||{};
    const depts=new Set();
    ids.forEach(v=>{ const d=byVal[v]; if(d) depts.add(d); });
    App.aiExcludeDepts=[...depts];
  }
  // チェック変更時：状態更新＋再計算・再描画（画面・レポートにリアルタイム反映。連続クリックはデバウンス）
  function _syncAiExclude(){ _computeAiExcludeState(); clearTimeout(filterTimer); filterTimer=setTimeout(applyFilters,250); }
  function buildAiExcludeUI(){
    const el=document.getElementById('f-aiexclude'); if(!el) return;
    const esc=(global.Render&&global.Render.esc)?global.Render.esc:(s=>String(s==null?'':s));
    const ac=App.ac||[], hw=App.hw||[];
    const aiRows=ac.filter(r=>r['Webアクセス'] && r['リスク分類']==='AI・外部サービス');
    const cntId={}, cntNm={};
    aiRows.forEach(r=>{ const id=r.login_id!=null?String(r.login_id).trim().toLowerCase():''; if(id&&id!=='nan')cntId[id]=(cntId[id]||0)+1; const nm=r['台帳_氏名']!=null?String(r['台帳_氏名']).trim():''; if(nm)cntNm[nm]=(cntNm[nm]||0)+1; });
    const map={};
    function addU(rawId,rawNm,rawDep){ let id=rawId!=null?String(rawId).trim().toLowerCase():''; if(id==='nan')id=''; const nm=rawNm!=null?String(rawNm).trim():''; const dep=rawDep!=null?String(rawDep).trim():''; if(!id&&!nm)return; const key=id||('n:'+nm); if(!map[key])map[key]={val:(id||nm),id:id,name:nm,dept:dep,n:(id?(cntId[id]||0):(cntNm[nm]||0))}; else{ if(!map[key].name&&nm)map[key].name=nm; if(!map[key].dept&&dep)map[key].dept=dep; } }
    ac.forEach(r=>addU(r.login_id,r['台帳_氏名'],r['台帳_部署名']));
    hw.forEach(h=>addU(h.login_id,h.user_name,h['部署名']));
    const users=Object.values(map).sort((a,b)=> b.n-a.n || String(a.name||a.val).localeCompare(String(b.name||b.val),'ja'));
    // チェック対象値 → 所属部署 の対応表（Webガバナンスからの部署連動除外に使用）
    const byVal={}; users.forEach(u=>{ if(u.dept) byVal[u.val]=u.dept; });
    App._userDeptByVal=byVal;
    let set=new Set();
    try{ const raw=(window.localStorage&&localStorage.getItem('aiExcludeUsers'))||''; set=new Set(raw.split(/[\n,]+/).map(x=>x.trim().toLowerCase()).filter(Boolean)); }catch(e){}
    el.innerHTML = users.length ? users.map(u=>`<div><label><input type="checkbox" class="ai-ex" value="${esc(u.val)}" ${set.has(String(u.val).toLowerCase())?'checked':''}> ${esc(u.name||u.id||'(不明)')}${(u.id&&u.name)?'（'+esc(u.id)+'）':''}${u.dept?' ['+esc(u.dept)+']':''} — AI ${u.n}件</label></div>`).join('') : '<div style="color:#64748b;font-size:.8rem">ユーザーがいません。</div>';
    el.querySelectorAll('input.ai-ex').forEach(cb=>cb.addEventListener('change', _syncAiExclude));
    _computeAiExcludeState();
  }
  let filterTimer=null;
  function toggle(arr,v,on){ const i=arr.indexOf(v); if(on&&i<0)arr.push(v); if(!on&&i>=0)arr.splice(i,1);
    clearTimeout(filterTimer); filterTimer=setTimeout(applyFilters,250); }

  // ── フィルタ適用＋再計算＋描画 ──
  function applyFilters(){
    const selM=App.sel.months, selC=App.sel.companies, selG=App.sel.groups;
    App.pc_f=App.pc.filter(r=>selM.includes(r['月']) && selG.includes(r['所属グループ名']));
    App.ac_f=App.ac.filter(r=>selM.includes(r['月']));
    if(selC.length && selC.length!==App.allCompanies.length){
      App.ac_f=App.ac_f.filter(r=>selC.includes(r['台帳_会社名']) || DC.isNil(r['台帳_会社名']));
    }
    App.hw_f=selC.length?App.hw.filter(r=>selC.includes(r['会社名'])):App.hw.slice();
    DC.recomputePcFlags(App.pc_f, App.cfg);

    App.months=selM.slice().sort(); App.monthsJp=App.months.map(m=>DC.fmtMonth(m));
    App.kpis=DC.calcGovernanceKpis(App.pc_f, App.ac_f, App.hw_f);
    // 野良AI除外対象ユーザーの所属部署を、Webガバナンスの集計・グラフからだけ除外（リアルタイム連動）
    const exDepts=new Set(App.aiExcludeDepts||[]);
    App.ac_web_f = exDepts.size ? App.ac_f.filter(r=>!exDepts.has(r['台帳_部署名'])) : App.ac_f;
    Object.assign(App.kpis, DC.computeWebGovernance(App.ac_web_f));
    App.monthlyKpis=[];
    for(const m of App.months){ const pcm=App.pc_f.filter(r=>r['月']===m), acm=App.ac_f.filter(r=>r['月']===m);
      if(pcm.length===0 && acm.length===0) continue;
      const km=DC.calcGovernanceKpis(pcm, acm, App.hw_f); km['月']=m; km['月_表示']=DC.fmtMonth(m); App.monthlyKpis.push(km); }
    App.outCompanies = selC.length
      ? [...new Set(App.ac_f.map(r=>r['台帳_会社名']).filter(Boolean))].sort()
      : [...new Set(App.hw.map(r=>r['会社名']).filter(Boolean))].sort();
    if(!App.outCompanies.length) App.outCompanies=App.allCompanies.slice();

    global.Render.renderAll();
    buildAiExcludeUI(); // renderAll後にイベントリスナーを再登録
  }

  // ── タブ切替 ──
  document.querySelectorAll('.tabnav button').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.tabnav button').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tabpage').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); document.getElementById(b.dataset.tab).classList.add('active');
    window.dispatchEvent(new Event('resize'));
  }));

  // ── レポート設定の表示/非表示 ──
  (function(){ const t=document.getElementById('settings-toggle'), b=document.getElementById('settings-body'), c=document.getElementById('settings-caret');
    if(t&&b) t.addEventListener('click',()=>{ const hidden=b.classList.toggle('hidden'); if(c) c.textContent=hidden?'［表示する ▼］':'［非表示にする ▲］'; }); })();

  // ── 初期化：保管データがあれば自動表示 ──
  DB.open().then(loadFromStore).catch(e=>{ const st=document.getElementById('store-status');
    if(st){ st.className='status-msg status-err'; st.textContent='保存領域を開けませんでした：'+e.message; } });
})(typeof self !== 'undefined' ? self : this);
