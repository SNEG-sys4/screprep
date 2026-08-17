# screprep 改善指示書（Claude Code 向け）

作成日：2026-08-12  
対象リポジトリ：`/home/work/screprep/`  
GitHub：`SNEG-sys4/screprep`  
公開URL：`https://enxkidqq.gensparkclaw.com/screprep/`

---

## 概要

このアプリは「ITガバナンス戦略レポート」を生成するブラウザ完結型の静的SPA。  
CSVを読み込み → 分析 → Word/HTML/Excelで経営幹部向けレポートを出力する。

以下の改善を順番に実装すること。各タスクは独立しているが、**優先度順**に並んでいる。

---

## 全体ファイル構成（把握してから作業すること）

```
screprep/
├── index.html       # UIレイアウト・CSS・タブ定義
├── data-core.js     # データ処理コア（CSV解析・KPI計算・集計）
├── db.js            # IndexedDB永続化
├── charts.js        # Plotlyグラフ定義
├── render.js        # 各タブの画面描画（TAB1〜4）
├── exports.js       # TAB5(Word/HTML/Excel出力) + TAB6(リスク予測)
├── riskcalc.js      # リスク金額換算・シナリオ計算（純粋関数）
├── trends.js        # TAB6のUI描画
├── gap.js           # TAB7(SCS★評価・ギャップ評価)
└── main.js          # 状態管理・ファイル読込・フィルタ・タブ制御
```

---

## 【TASK 1】優先度：高　除外ユーザーをすべての集計に反映する

### 問題

`index.html` の「レポート設定」パネルに「🤖 野良AI：カウントしないユーザー」欄がある。  
現在このチェックは以下にしか効いていない：
- 野良AI（無許可AI）のカウント
- Webガバナンスの集計（`App.ac_web_f` 経由）

**効いていない集計：**
- PC稼働（深夜稼働・休日稼働・長時間稼働）
- IT資産管理（端末台帳との突合）
- リスク予測（金額換算）
- Word/HTML/Excelレポート内の数値

### 修正方針

`main.js` の `applyFilters()` 関数を修正する。

#### 現状（問題のある部分）

```javascript
// main.js 内の applyFilters()
App.pc_f = App.pc.filter(r => selM.includes(r['月']) && selG.includes(r['所属グループ名']));
App.ac_f = App.ac.filter(r => selM.includes(r['月']));
// ...
// ac_web_f だけ除外適用
const exDepts = new Set(App.aiExcludeDepts || []);
App.ac_web_f = exDepts.size ? App.ac_f.filter(r => !exDepts.has(r['台帳_部署名'])) : App.ac_f;
```

#### 修正後（こうする）

```javascript
// applyFilters() 内、既存の ac_web_f 生成の直後に追加

// 除外ユーザーのlogin_idセットを構築
const exUserSet = new Set(
  (App.aiExcludeUsers || []).map(x => String(x).trim().toLowerCase()).filter(Boolean)
);

// PC稼働からも除外ユーザーを除く（深夜・休日・長時間稼働の集計対象から外す）
App.pc_f_ex = exUserSet.size
  ? App.pc_f.filter(r => {
      const lid = r['台帳_login_id'] != null
        ? String(r['台帳_login_id']).trim().toLowerCase()
        : null;
      return !lid || !exUserSet.has(lid);
    })
  : App.pc_f;
```

> **注意：** `pc` の行には `台帳_login_id` が結合されていない可能性がある。  
> `data-core.js` の `joinLedgers()` を確認し、`pc` 行への `login_id` 結合が行われていない場合は、  
> `machine_name` → `hw` の `login_id` を経由して引っ張る処理を追加すること。

#### 反映先の確認と修正

`App.pc_f_ex` を以下の箇所で使う（`App.pc_f` を置き換える）：

| ファイル | 関数 | 変更箇所 |
|---------|------|---------|
| `render.js` | `renderT4()` | PC稼働タブの全グラフ・表・KPI計算 |
| `exports.js` | `ctx()` | `App.pc_f` → `App.pc_f_ex` |
| `riskcalc.js` | `computeImpact()` 呼び出し元 | pcRowsに `App.pc_f_ex` を渡す |
| `trends.js` | monthly KPI計算 | `pcm` のフィルタ対象を変更 |

#### UI表示

除外が適用されている場合、TAB4の先頭に以下のような注記を出す：

```
※除外ユーザー設定が適用されています（N名を除外）。「レポート設定」パネルで確認・変更できます。
```

---

## 【TASK 2】優先度：高　アクションプランをダッシュボード上で入力してWordに反映する

### 問題

Wordレポートの「6. 次期アクションプラン」がすべて空欄テーブルとして出力される。  
（`exports.js` の `buildWordReport()` 内で空テーブルを生成しているだけ）

### 修正方針

TAB5（レポート出力タブ）に「アクションプラン入力UI」を追加し、入力値をWordに反映する。

#### TAB5 の renderT5() 修正（exports.js）

既存の SECS 配列の `action_plan` セクション部分の `<textarea>` を、以下の構造化入力に差し替える：

```javascript
// SECS配列の action_plan セクションのコンテンツを変更
// textarea単体 → 構造化された行入力（最大5行）
```

追加するHTML（`t5el.dataset.init` ブロック内の action_plan セクション近辺）：

```html
<div id="action-plan-rows">
  <!-- 5行ぶん生成 -->
  <div class="ap-row" data-idx="0">
    <select class="ap-pri">
      <option value="">優先度</option>
      <option value="HIGH">HIGH</option>
      <option value="MED">MED</option>
      <option value="LOW">LOW</option>
    </select>
    <select class="ap-cat">
      <option value="">分類</option>
      <option value="Webガバナンス">Webガバナンス</option>
      <option value="PC稼働管理">PC稼働管理</option>
      <option value="IT資産">IT資産</option>
      <option value="セキュリティ対策">セキュリティ対策</option>
      <option value="組織・ルール整備">組織・ルール整備</option>
      <option value="SCS★3対応">SCS★3対応</option>
    </select>
    <input class="ap-action" type="text" placeholder="アクション内容" style="flex:1">
    <input class="ap-deadline" type="text" placeholder="期限 例：2026年9月">
    <input class="ap-owner" type="text" placeholder="担当">
  </div>
  <!-- ×5繰り返し（idx=0〜4） -->
</div>
<button class="btn btn-ghost" id="btn-ap-auto">⚡ 重点分析から自動生成</button>
```

#### 自動生成ボタンの動作

`btn-ap-auto` クリック時に `analyzeFocus()`（exports.js内に定義済み）の結果を使って  
アクションプランの推奨値を各入力欄にセットする：

```javascript
document.getElementById('btn-ap-auto').addEventListener('click', () => {
  const F = analyzeFocus(); // 既存関数
  const suggestions = [];
  
  if (F.ai.shadow > 0) {
    suggestions.push({
      pri: 'HIGH', cat: 'Webガバナンス',
      action: `野良AI(${F.ai.shadow.toLocaleString()}件)対策：許可AIの導入とガイドライン策定`,
      deadline: '', owner: 'システム課'
    });
  }
  if (F.power.n > 0) {
    suggestions.push({
      pri: 'HIGH', cat: 'PC稼働管理',
      action: `電源つけっぱ(${F.power.n}件/${F.power.terms}台)対策：自動シャットダウンポリシー適用`,
      deadline: '', owner: 'システム課'
    });
  }
  if ((App.kpis.expired_devices || 0) > 0) {
    suggestions.push({
      pri: 'MED', cat: 'IT資産',
      action: `減価償却切れ端末(${App.kpis.expired_devices}台)のリプレース計画策定`,
      deadline: '', owner: 'システム課'
    });
  }
  if (F.night.rate >= 2) {
    suggestions.push({
      pri: 'MED', cat: 'PC稼働管理',
      action: `深夜稼働(${F.night.rate}%)の実態確認・ポリシー整備`,
      deadline: '', owner: '人事部'
    });
  }
  suggestions.push({
    pri: 'LOW', cat: 'SCS★3対応',
    action: 'SCS評価★3取得に向けてCISO任命・情報セキュリティ基本方針の策定',
    deadline: '', owner: '経営企画室'
  });
  
  // 入力欄にセット（最大5行）
  document.querySelectorAll('#action-plan-rows .ap-row').forEach((row, i) => {
    const s = suggestions[i];
    if (!s) return;
    row.querySelector('.ap-pri').value = s.pri;
    row.querySelector('.ap-cat').value = s.cat;
    row.querySelector('.ap-action').value = s.action;
    row.querySelector('.ap-deadline').value = s.deadline;
    row.querySelector('.ap-owner').value = s.owner;
  });
});
```

#### Wordレポートへの反映（buildWordReport() 内）

`action_plan` セクションのWord生成部分（現在空のテーブルを出力している箇所）を修正：

```javascript
// action_plan セクション内のWord行生成
// 入力欄の値を読み取り、空でない行だけ出力する

function collectActionPlan() {
  const rows = [];
  document.querySelectorAll('#action-plan-rows .ap-row').forEach(row => {
    const pri = row.querySelector('.ap-pri').value;
    const cat = row.querySelector('.ap-cat').value;
    const action = row.querySelector('.ap-action').value.trim();
    const deadline = row.querySelector('.ap-deadline').value.trim();
    const owner = row.querySelector('.ap-owner').value.trim();
    // 少なくともアクション内容が入力されていれば行を追加
    if (action) rows.push({ pri, cat, action, deadline, owner });
  });
  return rows;
}
```

Wordのテーブル行生成：入力された行だけ出力。0行の場合は「(アクションプランが入力されていません)" と1行出力。

---

## 【TASK 3】優先度：中　Wordレポートの空コメント欄を省略するオプション

### 問題

TAB5の各セクションに「コメント欄を追加」チェックがある。  
コメントが空でも「📝 担当者コメント・現場知識メモ」という空欄のセクションがWordに出力されてしまう。

### 修正方針

`buildWordReport()` 内のコメント出力部分（各セクションで `cmts[sectionId]` を参照している箇所）に条件分岐を追加：

```javascript
// 変更前（空でも出力）
if (secs[`${s.id}_comment`]) {
  // コメント欄のWord要素を追加
  children.push(/* コメント欄 */);
}

// 変更後（コメントが空なら空欄スペースを省略）
const cmtText = cmts[s.id] || '';
if (secs[`${s.id}_comment`]) {
  if (cmtText) {
    // 入力済みならコメントを出力
    children.push(/* 入力テキストのParagraph */);
  } else {
    // 空なら「手書き用スペース」として空白行×3を出力（省略オプションで制御）
    const skipEmpty = document.getElementById('chk-skip-empty-comment')?.checked;
    if (!skipEmpty) {
      children.push(/* 空白3行 */);
    }
    // skipEmpty=true なら何もしない
  }
}
```

#### UIに追加するチェックボックス（TAB5の出力設定エリア上部）

```html
<label class="chk">
  <input type="checkbox" id="chk-skip-empty-comment">
  コメント欄が空の場合は省略する（手書きスペースを出力しない）
</label>
```

---

## 【TASK 4】優先度：中　Webガバナンス健全度スコアの内訳表示

### 問題

スコア計算式がUI上で見えないため、経営層へ「なぜ47.4点なのか」を説明しにくい。

計算ロジック（`data-core.js` の `computeWebGovernance()`）：

```javascript
const density = riskWeighted / maxPossible; // リスク加重密度（0〜1）
governance_score = (1 - density) * 100;      // 高いほど良い
```

### 修正方針

TAB3（Webガバナンスタブ）の上部に「スコア内訳カード」を追加する。

#### 追加するHTML（renderT3() の metrics エリアの下）

```javascript
// render.js の renderT3() 内、metrics の後に追加
const web = (App.ac_web_f || App.ac_f).filter(r => r['Webアクセス']);
const totalWeb = web.length;
const highN = web.filter(r => r['リスクレベル'] === 3).length;
const midN  = web.filter(r => r['リスクレベル'] === 2).length;
const lowN  = web.filter(r => r['リスクレベル'] === 1).length;
const riskWeighted = highN * 3 + midN * 2 + lowN * 1;
const maxPossible = totalWeb * 3;
const density = maxPossible > 0 ? riskWeighted / maxPossible : 0;

const breakdownHtml = `
<div class="note-box" style="margin-bottom:16px">
  <b>📊 スコア算出根拠</b><br>
  全Webアクセス ${totalWeb.toLocaleString()} 件のうち、
  高リスク(×3点) ${highN.toLocaleString()} 件 ＋
  中リスク(×2点) ${midN.toLocaleString()} 件 ＋
  低リスク(×1点) ${lowN.toLocaleString()} 件
  → リスク加重合計 ${riskWeighted.toLocaleString()} ／ 最大 ${maxPossible.toLocaleString()}<br>
  リスク密度 = ${(density * 100).toFixed(1)}%
  → <b>健全度スコア = (1 − ${(density * 100).toFixed(1)}%) × 100 = ${App.kpis.governance_score} 点</b><br>
  <span style="color:#64748b;font-size:.78rem">
    ※スコアは全アクセスのうちリスクの低さを0〜100点で表します。
    高リスクアクセスが多いほどスコアが下がります。
    ${(App.aiExcludeDepts || []).length ? '（除外部署あり：' + App.aiExcludeDepts.join('・') + '）' : ''}
  </span>
</div>`;
```

---

## 【TASK 5】優先度：低　前四半期比較パネルをTAB1（サマリー）に追加

### 問題

現状、前期比で改善/悪化しているかはグラフを見て人間が判断するしかない。  
TAB1のサマリーに「前四半期比」を一目でわかるカードとして追加する。

### 前提条件の確認

`App.monthlyKpis`（月次KPI配列）が2件以上あれば実装可能。

### 修正方針

`render.js` の `renderT1()` 内、KPIスコアカードの下に追加：

```javascript
// monthlyKpis が四半期ぶん（3か月）以上あれば前期比を計算する
const mk = App.monthlyKpis;
if (mk.length >= 2) {
  // 直近3か月の平均 vs その前3か月の平均
  const recent = mk.slice(-3);
  const prev   = mk.slice(-6, -3);
  
  const metrics = [
    { key: 'governance_score',      label: 'Webガバナンス健全度', unit: '点', hb: true },
    { key: 'interception_rate',     label: 'リスク遮断完遂率',   unit: '%', hb: true },
    { key: 'workload_concentration',label: '業務偏重指数',       unit: '倍', hb: false },
    { key: 'latenight_rate',        label: '深夜稼働率',         unit: '%', hb: false },
  ];
  
  // 各指標について prev 平均と recent 平均を比較
  // 改善 → 🟢↑ / 悪化 → 🔴↓ / 変化なし → ⚪→
  // カード形式でTAB1に追加（grid4レイアウト）
}
```

---

## 【TASK 6】優先度：低　複合リスクフラグ機能（要注意ユーザー自動リストアップ）

### 問題

深夜アクセス + 高リスクサービス + 長時間稼働が重なる端末・ユーザーを  
現状は各タブを個別に見て人間が判断している。

### 修正方針

TAB4（PC稼働タブ）または TAB2（リスク遮断タブ）の末尾に「複合リスク端末」セクションを追加。

```javascript
// 複合リスクの判定ロジック（render.js か exports.js に追加）
function detectCompositeRisk(pc_f, ac_f, longThreshold) {
  const longSet = new Set(
    pc_f
      .filter(r => (r['ログ時間_分'] || 0) > longThreshold * 60)
      .map(r => r['端末エージェント名'])
  );
  const nightSet = new Set(
    pc_f.filter(r => r['深夜稼働']).map(r => r['端末エージェント名'])
  );
  const highRiskUsers = new Set(
    ac_f
      .filter(r => r['Webアクセス'] && r['リスクレベル'] === 3)
      .map(r => r.login_id)
      .filter(Boolean)
  );
  
  // 3条件すべて該当する端末を抽出
  const flagged = [...longSet].filter(t => {
    if (!nightSet.has(t)) return false;
    // 台帳からlogin_idを引く
    const row = pc_f.find(r => r['端末エージェント名'] === t);
    const lid = row && row['台帳_login_id'];
    return lid && highRiskUsers.has(lid);
  });
  
  return flagged;
}
```

出力は「⚠️ 複合リスク端末（長時間＋深夜＋高リスクWeb）」として  
端末名・氏名・部署・フラグ数を一覧表示する。

---

## デプロイ手順（作業後に必ず実施）

```bash
# 1. 差分確認
cd /home/work/screprep
git diff --stat

# 2. 本番ディレクトリに同期
sudo cp -r /home/work/screprep/* /var/www/screprep/

# 3. git コミット（コミット・pushのタイミングは管理人に確認すること）
git add -A
git commit -m "feat: [変更内容を一行で]"
# push は管理人確認後
```

---

## 注意事項

- **削除・上書きなど不可逆な操作は管理人に確認してから実行する**
- `git push` のタイミングは管理人に確認すること（勝手にpushしない）
- `index.html` の CSS は末尾の `<style>` タグ内に追加する（外部ファイル化しない）
- IndexedDBの構造（`db.js`）は変更しない（既存データの破壊を防ぐため）
- `data-core.js` の `computeWebGovernance()` と `calcGovernanceKpis()` の計算ロジック本体は変更しない（表示側で内訳を出すだけにする）

---

## 補足：ファイルの依存関係

```
index.html
  └─ data-core.js   (DataCore)
  └─ db.js          (DB)
  └─ charts.js      (Charts) ─── DataCore
  └─ render.js      (Render)  ─── DataCore, Charts
  └─ riskcalc.js    (RiskCalc) ── DataCore
  └─ exports.js     ─────────── DataCore, Charts, Render, RiskCalc, docx(CDN)
  └─ trends.js      ─────────── DataCore, RiskCalc, Render
  └─ gap.js         ─────────── DataCore, Render, docx(CDN)
  └─ main.js        ─────────── DataCore, DB（最後に読み込む）
```

`App` オブジェクト（`window.App`）が全ファイルの共有状態。  
`main.js` が状態管理の主役で、`applyFilters()` → `Render.renderAll()` の流れで全タブを再描画する。
