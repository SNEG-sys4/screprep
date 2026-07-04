/* ============================================================
 * db.js ― IndexedDB 永続化層（取り込んだ生データを蓄積）
 *  - hw：単一スナップショット（id='current'、取込ごとに置換）
 *  - pc / ac：月キーで保存（同月は上書き＝置換）
 * 生の行データをそのまま保存するため、集計ロジックを後で変えても
 * 蓄積データは壊れない。
 * ============================================================ */
(function (global) {
  'use strict';
  const NAME='itgov_db', VER=1;
  let _db=null;

  function open(){
    return new Promise((res,rej)=>{
      if(_db) return res(_db);
      if(!global.indexedDB){ rej(new Error('このブラウザはIndexedDB非対応です')); return; }
      const rq=indexedDB.open(NAME,VER);
      rq.onupgradeneeded=e=>{ const db=e.target.result;
        if(!db.objectStoreNames.contains('hw')) db.createObjectStore('hw',{keyPath:'id'});
        if(!db.objectStoreNames.contains('pc')) db.createObjectStore('pc',{keyPath:'month'});
        if(!db.objectStoreNames.contains('ac')) db.createObjectStore('ac',{keyPath:'month'});
      };
      rq.onsuccess=e=>{ _db=e.target.result; res(_db); };
      rq.onerror=e=>rej(e.target.error);
    });
  }
  function run(store, mode, fn){
    return open().then(db=>new Promise((res,rej)=>{
      const t=db.transaction(store,mode); const os=t.objectStore(store);
      const out=fn(os); t.oncomplete=()=>res(out); t.onerror=e=>rej(e.target.error); t.onabort=e=>rej(e.target.error);
    }));
  }
  function putHw(rows){ return run('hw','readwrite',os=>os.put({id:'current', rows, importedAt:Date.now()})); }
  function putMonth(store, month, rows){ return run(store,'readwrite',os=>os.put({month, rows, importedAt:Date.now()})); }
  function getAll(store){ return open().then(db=>new Promise((res,rej)=>{
    const rq=db.transaction(store,'readonly').objectStore(store).getAll();
    rq.onsuccess=()=>res(rq.result||[]); rq.onerror=e=>rej(e.target.error); })); }
  function clearStore(store){ return run(store,'readwrite',os=>os.clear()); }
  function clearAll(){ return Promise.all(['hw','pc','ac'].map(clearStore)); }

  // バックアップ：全データを1オブジェクトに
  async function exportAll(){
    const [hw,pc,ac]=await Promise.all([getAll('hw'),getAll('pc'),getAll('ac')]);
    return { format:'itgov-backup', version:VER, exportedAt:Date.now(), hw, pc, ac };
  }
  // 復元：全消去してから投入（置換）
  async function importAll(data){
    if(!data || data.format!=='itgov-backup') throw new Error('バックアップ形式が不正です');
    await clearAll();
    for(const h of (data.hw||[])) await putHw(h.rows);
    for(const p of (data.pc||[])) await putMonth('pc', p.month, p.rows);
    for(const a of (data.ac||[])) await putMonth('ac', a.month, a.rows);
  }

  global.DB = { open, putHw, putMonth, getAll, clearStore, clearAll, exportAll, importAll };
})(typeof self !== 'undefined' ? self : this);
