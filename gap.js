/* ============================================================
 * gap.js ― TAB7 SCS評価制度 ギャップ評価（★2 / ★3 切替）
 * 出典：経産省/IPA「サプライチェーン強化に向けたセキュリティ対策評価制度
 *   （SCS評価制度）」制度構築方針(案)・★3/★4要求事項案(2025年12月 中間取りまとめ)、
 *   IPA「SECURITY ACTION」（★1/★2 自己宣言制度）。
 *   ※制度は検討中で正式要件は今後確定。本タブは自己点検の出発点であり公式判定ではない。
 * ============================================================ */
(function (global) {
  'use strict';
  const DC=global.DataCore, RD=global.Render;
  const fmtInt=n=>(n||0).toLocaleString('ja-JP');

  // ── ★3：7分類（NIST CSF 6機能 + 取引先管理） ──
  // status: 'partial'（本システムで一部裏付け可）/ 'out'（本システム範囲外＝別途整備必須）
  const CATS3 = [
    { fn:'統治', name:'ガバナンス整備', status:'out',
      star3:'企業として最低限のリスク管理体制の構築（責任者・社内ルールの整備）',
      sys:()=>'本システムの対象外（体制・ルールは測定できない）',
      gaps:['統括役員（CISO等）・担当部署の任命が未確認','社内ルールの策定・周知が未確認','経営層の関与の仕組みが未確認'],
      acts:['統括役員と担当部署を任命し役割・責任を文書化','情報セキュリティ基本方針と社内ルールを策定・周知','四半期の本レポートを経営会議の定例議題に'] },
    { fn:'統治', name:'取引先管理', status:'out',
      star3:'取引先に課す最低限のルールの明確化',
      sys:()=>'本システムの対象外（取引先の対策状況は測定できない）',
      gaps:['重要な機密情報を扱う子会社・取引先の対策状況を年1回以上把握する運用が未確認','取引先へ求める要件の明確化が未確認'],
      acts:['重要取引先・子会社をリスト化し年1回以上の状況確認を制度化','取引契約にセキュリティ要求事項を明記'] },
    { fn:'識別', name:'リスクの特定', status:'partial',
      star3:'自社IT基盤や資産の現状把握',
      sys:k=>`ハードウェア台帳で資産${k.total_devices}台を把握、資産健全率${k.asset_health}%を可視化`,
      gaps:['減価償却切れ端末 ${expired}台 の扱い（★3対象外にするには専門家/評価機関の妥当性評価が必要）','クラウド・ソフトを含む棚卸しの網羅性が未確認','脆弱性情報の継続把握が未確認'],
      acts:['台帳を全IT基盤（オンプレ＋クラウド＋端末）まで拡張','老朽端末はリプレース計画、除外時は理由と妥当性評価を用意','脆弱性情報の収集・反映プロセスを整備'] },
    { fn:'防御', name:'攻撃等の防御', status:'partial',
      star3:'不正アクセスに対する基礎的な防御／端末・サーバーの基礎的な保護',
      sys:k=>`デバイス制御・アプリ監視・Web監視の遮断状況を可視化（遮断完遂率${k.interception_rate}%、高リスク${fmtInt(k.high_risk_count)}件）`,
      gaps:['アンチウイルス/EDR・多要素認証・パッチ管理・特権ID管理の導入状況は本データ外＝要確認','遮断完遂率が基準未満なら防御の抜けの可能性'],
      acts:['全端末・サーバのマルウェア対策/EDRとパッチ適用状況を棚卸し','認証基盤へ多要素認証を導入','遮断ポリシーの抜けを定期点検'] },
    { fn:'検知', name:'攻撃等の検知', status:'partial',
      star3:'ネットワーク上の基礎的な監視等',
      sys:k=>`アクセス・PC稼働ログの監視で一部具備（監視イベント${fmtInt(k.total_risk_events)}件を集計）`,
      gaps:['検知→アラート→対応の運用が未確認','ログの保全期間・改ざん防止が未確認'],
      acts:['異常検知時の通知先・エスカレーション手順を定義','ログ保全（保存期間・アクセス制御）を規程化'] },
    { fn:'対応', name:'インシデントへの対応', status:'out',
      star3:'インシデント発生に備えた対応手順の整備',
      sys:k=>`本システムの対象外。ただし深夜稼働率${k.latenight_rate}%・電源つけっぱ検出は「対応遅延リスク」の傍証`,
      gaps:['対応手順書・連絡体制（社内/取引先/当局）が未確認','対応訓練の実施が未確認'],
      acts:['インシデント対応手順書と連絡体制を整備','年1回以上の対応訓練（机上演習）を実施'] },
    { fn:'復旧', name:'インシデントからの復旧', status:'out',
      star3:'インシデントから復旧するための対策の整備',
      sys:()=>'本システムの対象外（バックアップ・復旧体制は測定できない）',
      gaps:['バックアップ取得・復元テストが未確認','BCP・復旧目標時間が未確認'],
      acts:['重要システムのバックアップ運用と定期復元テストを整備','復旧手順とBCPを策定'] },
  ];

  // ── ★2：SECURITY ACTION 二つ星（IPA・自己宣言制度／簡易版・今後詳細化） ──
  const ITEMS2 = [
    { lvl:'★1相当', name:'情報セキュリティ5か条に取り組む（宣言）', status:'declare',
      detail:'①OS・ソフトを最新に ②ウイルス対策ソフト導入 ③パスワードを強化 ④共有設定を見直す ⑤脅威や手口を知る',
      sys:k=>`一部は本システムで裏付け可：①更新/老朽＝資産健全率${k.asset_health}% ④共有設定＝クラウドストレージ等の高リスクアクセス${fmtInt(k.high_risk_count)}件 ⑤脅威把握＝本レポート`,
      acts:['SECURITY ACTION（IPA）サイトで「情報セキュリティ5か条」に取り組む旨を宣言','ウイルス対策・パスワード方針を全端末へ適用'] },
    { lvl:'★2', name:'自社診断の実施', status:'evidence',
      detail:'「5分でできる！情報セキュリティ自社診断」等で現状を点検（25項目）',
      sys:()=>'本システムのログ・台帳を自社診断のエビデンスとして活用可',
      acts:['自社診断シートを実施し結果を記録','不足項目を本レポートのデータと突き合わせて是正'] },
    { lvl:'★2', name:'情報セキュリティ基本方針の策定・公開', status:'declare',
      detail:'基本方針を文書化し、社外にも公開',
      sys:()=>'本システムの対象外（文書の整備）',
      acts:['基本方針を策定し経営層が承認','自社サイト等で外部公開','SECURITY ACTION 二つ星を自己宣言'] },
  ];

  function badge3(status){ return status==='partial'
    ? ['🟡','一部可視化・要補完','#D97706','#FFFBEB']
    : ['🔴','本システム外・要整備','#DC2626','#FEF2F2']; }
  function badge2(status){ return status==='evidence'
    ? ['🟡','本システムで裏付け可','#D97706','#FFFBEB']
    : ['🔵','宣言・整備が必要','#2563EB','#EFF6FF']; }

  function selectorHtml(target){
    const b=(v,label)=>`<button class="btn ${target===v?'btn-primary':'btn-ghost'}" data-lvl="${v}" style="min-width:150px">${label}</button>`;
    return `<div class="btn-row" style="margin:4px 0 14px">
      <span style="align-self:center;font-weight:700;color:#475569">目標レベル：</span>
      ${b('star2','★2（SECURITY ACTION）')}${b('star3','★3（SCS 最低限）')}</div>`;
  }

  global.renderT7 = function(){
    const target = App.gapTarget || 'star3';
    let html = `<div class="sec-title">🎯 セキュリティ評価制度（SCS評価制度）ギャップ評価</div>` + selectorHtml(target);
    html += (target==='star2') ? bodyStar2() : bodyStar3();
    document.getElementById('t7').innerHTML = html;
    // 目標レベル切替
    document.querySelectorAll('#t7 button[data-lvl]').forEach(b=>b.addEventListener('click',()=>{
      App.gapTarget=b.dataset.lvl; global.renderT7();
    }));
    const wb=document.getElementById('btn-gap-word'); if(wb) wb.addEventListener('click',()=>exportGapWord(App.gapTarget||'star3'));
  };

  function bodyStar3(){
    const k=App.kpis||{}, groups=App.outCompanies||[], expired=k.expired_devices||0;
    const partialN=CATS3.filter(c=>c.status==='partial').length;
    let html=`<div class="warn-box" style="border-left-color:#DC2626">
      <b>なぜ今、グループ全体で動く必要があるのか</b><br>
      SCS評価制度（経産省・IPA）は、サプライチェーン攻撃の連鎖（サイバードミノ）を防ぐため、企業のセキュリティ水準を★の数で可視化する新制度。<b>2026年度末ごろに★3・★4が運用開始</b>予定で、<b>取引条件として提示されることが想定</b>される。<br><br>
      <b>★3は「全企業が最低限実装すべき」水準</b>。取得範囲は<b>「グループ全体／自社単体／特定部門」から選べる</b>ため、発注元がグループ単位の取得を求めれば<b>グループ各社が同水準を満たす必要</b>がある。しかも<b>7分類すべての充足が前提で、1項目でも欠ければ取得不可</b>。<br>
      つまり、<b>1社・1部門でも対策が欠けると、グループ全体で星が取れず、取引機会を失いかねない。</b></div>`;
    html+=`<div class="note-box">
      <b>制度の要点（出典：経産省/IPA 制度構築方針(案)・★3/★4要求事項案 2025年12月中間取りまとめ）</b><br>
      ・段階：★3（最低限）／★4（標準・第三者評価＋技術検証）／★5（到達点・検討中）。運用開始は2026年度末ごろ、★3・★4先行。<br>
      ・<b>★3の審査</b>：専門家の確認付きの<b>自己評価</b>。有効期間<b>1年</b>。<br>
      ・<b>評価は7分類</b>：NIST CSF 6機能（統治・識別・防御・検知・対応・復旧）＋「取引先管理」。<b>全項目充足が必須</b>。<br>
      <span style="color:#991b1b">※制度は検討中で正式要件は今後確定。本評価は自己点検の出発点で公式判定ではない（要確認）。</span></div>`;
    html+=`<div class="grid4">
      ${RD.scoreCard('制度上 必須の分類','7','分類','red')}
      ${RD.scoreCard('本システムで一部裏付け可',String(partialN),'分類','yellow')}
      ${RD.scoreCard('別途整備が必要な分類',String(7-partialN),'分類','red')}
      ${RD.scoreCard('取得範囲(想定)','ｸﾞﾙｰﾌﾟ','','red')}</div>
      <div class="note-box" style="background:#FEF2F2;border-color:#fecaca">
      <b>見立て：</b>本システム（ログ監視）で裏付けできるのは主に「識別・防御・検知」の技術面の<b>一部</b>のみ。<b>統治・対応・復旧といった組織的対策は範囲外</b>で規程・体制・手順の整備が別途必要。★3は全7分類の充足が前提のため、<b>現時点のままでは★3取得は困難</b>。対象がグループ会社${groups.length?`（${groups.join('・')}）`:''}に及ぶ場合、<b>各社が足並みを揃えない限りグループとしての★3は成立しない。</b></div>`;
    html+=`<div class="sec-title">分類別 ギャップ（現状 → ★3で必要 → 不足・対策）</div>`;
    for(const c of CATS3){
      const [ic,lb,col,bg]=badge3(c.status);
      const gaps=c.gaps.map(g=>g.replace('${expired}',expired)).map(g=>`<li>${g}</li>`).join('');
      const acts=c.acts.map(a=>`<li>${a}</li>`).join('');
      html+=`<div class="sia" style="background:${bg};border-color:${col}">
        <div class="head"><span style="font-size:1.15rem">${ic}</span>
          <span class="title">［${c.fn}］${c.name}</span>
          <span class="badge" style="background:${col}">${lb}</span></div>
        <div class="v"><b>★3で最低限：</b>${c.star3}</div>
        <div class="v"><b>本システムでの可視化：</b>${c.sys(k)}</div>
        <div class="v"><b>不足・確認事項：</b><ul style="margin:4px 0 0 18px">${gaps}</ul></div>
        <div class="v"><b>対策：</b><ul style="margin:4px 0 0 18px">${acts}</ul></div></div>`;
    }
    html+=`<div class="sec-title">経営層への提言</div>
      <div class="note-box">
      1) <b>★3取得を全社目標に設定</b>し、統括役員（CISO）と推進体制を任命する（統治の整備が起点）。<br>
      2) <b>グループ各社を同一水準に</b>：取得範囲をグループ全体と定め、各社の現状を本レポートで四半期ごとに点検。<br>
      3) <b>組織的対策（ルール・教育・取引先管理・対応/復旧手順）を優先整備</b>：技術ログだけでは★3の過半の分類を満たせない。<br>
      4) <b>本システムを識別・防御・検知の“証跡”として活用</b>：自己評価のエビデンスにする。<br>
      5) <b>運用開始（2026年度末ごろ）から逆算</b>し、費用と時間のかかる対策（EDR・多要素認証・バックアップ等）を先行着手。</div>`;
    html+=wordBtnHtml('出典：経産省 制度構築方針(案)・★3/★4要求事項案（2025年12月 中間取りまとめ）、IPA「SCS評価制度」。制度は検討中のため最新の公表資料で要件を要確認。');
    return html;
  }

  function bodyStar2(){
    const k=App.kpis||{};
    let html=`<div class="note-box" style="border-left:5px solid #2563EB">
      <b>★2 ＝ IPA「SECURITY ACTION」二つ星（自己宣言制度）</b><br>
      ★1（情報セキュリティ5か条への取組宣言）→ ★2（自社診断の実施＋情報セキュリティ基本方針の策定・公開）。SCS評価制度では★1/★2にこのSECURITY ACTIONを活用。<b>★3（SCS）の前段</b>として、まず★2の自己宣言を固めるのが現実的な第一歩。<br>
      <span style="color:#1e40af">※本タブの★2は簡易版（今後詳細化）。正式要件はIPA SECURITY ACTION公式サイトで要確認。</span></div>
      <div class="grid4">
        ${RD.scoreCard('★2 到達の要点','3','項目','yellow')}
        ${RD.scoreCard('本システムで裏付け可','診断','エビデンス','yellow')}
        ${RD.scoreCard('主に必要なこと','宣言・方針','整備','yellow')}
        ${RD.scoreCard('次の目標','★3','SCS','red')}
      </div>
      <div class="sec-title">★2 到達チェック（現状 → 必要 → 対策）</div>`;
    for(const it of ITEMS2){
      const [ic,lb,col,bg]=badge2(it.status);
      const acts=it.acts.map(a=>`<li>${a}</li>`).join('');
      html+=`<div class="sia" style="background:${bg};border-color:${col}">
        <div class="head"><span style="font-size:1.15rem">${ic}</span>
          <span class="title">［${it.lvl}］${it.name}</span>
          <span class="badge" style="background:${col}">${lb}</span></div>
        <div class="v"><b>内容：</b>${it.detail}</div>
        <div class="v"><b>本システムでの裏付け：</b>${it.sys(k)}</div>
        <div class="v"><b>対策：</b><ul style="margin:4px 0 0 18px">${acts}</ul></div></div>`;
    }
    html+=`<div class="note-box">★2は自己宣言が中心のため短期取得が可能。まず★2を宣言し、並行して本レポートで技術面の実態（識別・防御・検知）を固め、★3（SCS）の全社整備へ段階的に進めるのが推奨。</div>`;
    html+=wordBtnHtml('出典：IPA「SECURITY ACTION」（★1/★2 自己宣言制度）。本タブの★2は簡易版で、正式要件は公式サイトで要確認。');
    return html;
  }

  function wordBtnHtml(note){
    return `<div class="btn-row"><button class="btn btn-primary" id="btn-gap-word">📄 このギャップ評価をWordで出力</button></div>
      <div id="gap-status"></div><p class="hint">${note}</p>`;
  }

  // ── Word出力（★2/★3 共通・自己完結） ──
  async function exportGapWord(target){
    const st=document.getElementById('gap-status');
    st.className='status-msg status-info'; st.innerHTML='<span class="spinner"></span>Wordを生成しています…';
    try{
      const D=global.docx, k=App.kpis||{};
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, PageBreak } = D;
      const FONT='Yu Gothic UI', NAVY='1E3A5F', WHITE='FFFFFF', RED='DC2626', BLUE='2563EB', AMBER='B45309';
      const run=(t,o)=>new TextRun(Object.assign({text:t,font:FONT,size:20},o||{}));
      const para=(c,o)=>new Paragraph(Object.assign({children:Array.isArray(c)?c:[c]},o||{}));
      const cell=(c,fill,w)=>new TableCell({children:Array.isArray(c)?c:[c],shading:fill?{type:ShadingType.CLEAR,fill}:undefined,width:w?{size:w,type:WidthType.PERCENTAGE}:undefined});
      const table=rows=>new Table({width:{size:100,type:WidthType.PERCENTAGE},rows});
      const head=(t,f)=>table([new TableRow({children:[cell(para(run(t,{bold:true,size:26,color:WHITE})),f||NAVY)]})]);
      const groups=App.outCompanies||[];
      const now=(()=>{const d=new Date();return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日';})();
      const children=[];
      const titleTxt = target==='star2' ? 'SECURITY ACTION ★2 到達ギャップ評価' : 'SCS評価制度 ★3取得 ギャップ評価';
      children.push(table([new TableRow({children:[cell([
        para(run(titleTxt,{bold:true,size:38,color:WHITE}),{alignment:AlignmentType.CENTER}),
        para(run('作成日：'+now+(groups.length?'　／　対象：'+groups.join('・'):''),{size:18,color:'BFDBFE'}),{alignment:AlignmentType.CENTER}),
      ],NAVY)]})]));
      children.push(para(run('')));

      if(target==='star2'){
        children.push(head('★2（IPA SECURITY ACTION 二つ星）とは',BLUE));
        children.push(para(run('★1（情報セキュリティ5か条への取組宣言）→ ★2（自社診断の実施＋情報セキュリティ基本方針の策定・公開）。SCS評価制度では★1/★2にSECURITY ACTIONを活用。★3の前段として、まず★2の自己宣言を固めるのが現実的な第一歩。')));
        children.push(para(run('※本書の★2は簡易版（今後詳細化）。正式要件はIPA SECURITY ACTION公式サイトで要確認。',{size:16,color:AMBER})));
        children.push(head('★2 到達チェック',NAVY));
        const hdr=new TableRow({children:['項目','内容','本システムでの裏付け','対策'].map(t=>cell(para(run(t,{bold:true,size:16,color:WHITE})),NAVY))});
        const rows=[hdr];
        ITEMS2.forEach(it=>rows.push(new TableRow({children:[
          cell(para(run('['+it.lvl+'] '+it.name,{size:15})),'F8FAFC',20),
          cell(para(run(it.detail,{size:15})),null,30),
          cell(para(run(it.sys(k),{size:15})),null,28),
          cell(para(run(it.acts.join('／'),{size:14})),null,22),
        ]})));
        children.push(table(rows));
      } else {
        children.push(head('1. なぜ今、グループ全体で動く必要があるのか',RED));
        children.push(para(run('SCS評価制度（経産省・IPA）は、サプライチェーン攻撃の連鎖を防ぐため企業のセキュリティ水準を★で可視化する新制度。2026年度末ごろ★3・★4が運用開始予定で、取引条件として提示されることが想定される。')));
        children.push(para(run('★3は「全企業が最低限実装すべき」水準。取得範囲はグループ全体／自社／部門から選べるため、発注元がグループ単位を求めればグループ各社が同水準を満たす必要がある。7分類すべての充足が前提で、1項目でも欠ければ取得不可。1社・1部門でも欠けると、グループ全体で星が取れず取引機会を失いかねない。',{bold:true})));
        children.push(head('2. 制度の要点',NAVY));
        [['段階','★3(最低限)／★4(標準・第三者評価+技術検証)／★5(検討中)。2026年度末ごろ★3・★4先行'],
         ['★3の審査','専門家の確認付き自己評価。有効期間1年（継続運用が必要）'],
         ['評価分類','NIST CSF 6機能(統治・識別・防御・検知・対応・復旧)＋取引先管理＝計7分類。全項目充足が必須'],
         ['対象','IT基盤(オンプレ+クラウド)・エンドポイント・認証基盤等。OTは原則対象外']].forEach(([a,b])=>
          children.push(table([new TableRow({children:[cell(para(run(a,{bold:true,size:18})),'F1F5F9',26),cell(para(run(b,{size:18})),null,74)]})])));
        children.push(para(run('※制度は検討中で正式要件は今後確定。本評価は自己点検の出発点であり公式な合否判定ではない。',{size:16,color:AMBER})));
        children.push(para(new PageBreak()));
        children.push(head('3. 分類別 ギャップ（現状 → ★3で必要 → 不足・対策）',NAVY));
        const hdr=new TableRow({children:['分類','★3で最低限','本システムでの可視化','不足・対策','判定'].map(t=>cell(para(run(t,{bold:true,size:16,color:WHITE})),NAVY))});
        const rows=[hdr];
        CATS3.forEach(c=>{
          const j=c.status==='partial'?'🟡 一部可視化・要補完':'🔴 本システム外・要整備';
          const g=c.gaps.map(x=>x.replace('${expired}',k.expired_devices||0)).join('／');
          rows.push(new TableRow({children:[
            cell(para(run('['+c.fn+']'+c.name,{size:15})),'F8FAFC',14),
            cell(para(run(c.star3,{size:15})),null,22),
            cell(para(run(c.sys(k),{size:15})),null,24),
            cell(para(run('【不足】'+g+'　【対策】'+c.acts.join('／'),{size:14})),null,30),
            cell(para(run(j,{size:14})),null,10),
          ]}));
        });
        children.push(table(rows));
        children.push(para(new PageBreak()));
        children.push(head('4. 経営層への提言',NAVY));
        ['★3取得を全社目標に設定し、統括役員(CISO)と推進体制を任命する（統治の整備が起点）。',
         'グループ各社を同一水準に：取得範囲をグループ全体と定め、各社の現状を四半期レポートで点検する。',
         '組織的対策(ルール・教育・取引先管理・対応/復旧手順)を優先整備：技術ログだけでは★3の過半を満たせない。',
         '本システムを識別・防御・検知の証跡として活用し、自己評価のエビデンスにする。',
         '運用開始(2026年度末ごろ)から逆算し、費用と時間のかかる対策(EDR・多要素認証・バックアップ等)を先行着手する。'
        ].forEach((t,i)=>children.push(para([run((i+1)+') ',{bold:true}),run(t)])));
      }
      children.push(para(run('')));
      children.push(para(run('出典：経産省「サプライチェーン強化に向けたセキュリティ対策評価制度に関する制度構築方針(案)」(2025年12月)、IPA「SCS評価制度」「SECURITY ACTION」。制度は検討中のため最新の公表資料で要確認。',{size:15,color:'64748B'})));

      const doc=new Document({styles:{default:{document:{run:{font:FONT,size:20}}}},sections:[{children}]});
      const blob=await Packer.toBlob(doc);
      const d=new Date(), ds=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
      const fn=(target==='star2'?'SECURITY_ACTION_★2ギャップ評価_':'SCS_★3ギャップ評価_')+ds+'.docx';
      const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=fn;
      document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},500);
      st.className='status-msg status-ok'; st.textContent='✅ Wordを生成しました。';
    }catch(e){ console.error(e); st.className='status-msg status-err'; st.textContent='生成エラー：'+e.message; }
  }

  // renderAll に相乗り（render.js を書き換えずに連携）
  if(global.Render && typeof global.Render.renderAll==='function'){
    const _orig=global.Render.renderAll;
    global.Render.renderAll=function(){ _orig.apply(this,arguments); try{ if(document.getElementById('t7')) global.renderT7(); }catch(e){ console.error('renderT7',e); } };
  }
})(typeof self !== 'undefined' ? self : this);
