# screprep システム構成・レポート出力構成 概要書

作成日：2026-08-17  
リポジトリ：SNEG-sys4/screprep  
公開URL：https://enxkidqq.gensparkclaw.com/screprep/  
最終コミット：1d72d69（TASK1-6 全実装完了）

---

## 1. システム概要

### 何をするアプリか

ITガバナンス戦略レポートを生成するブラウザ完結型の静的SPA（Single Page Application）。

- 社内PCのCSVログ（稼働ログ・アクセスログ・ハードウェア台帳）をブラウザにアップロード
- IndexedDB にデータを蓄積（月単位、追記可能）
- データを分析・可視化し、経営幹部向けレポートを Word / HTML / Excel で出力

**サーバーサイド処理なし。すべてブラウザ内で完結（Caddy は静的ファイル配信のみ）。**

### 対象データ

| 入力ファイル | 内容 | 形式 |
|-------------|------|------|
| ハードウェア台帳 | 端末一覧・購入日・減価償却日・ユーザー紐付け | CSV / XLSX |
| PC稼働ログ（初回最終） | 端末ごとの1日の初回〜最終ログイン時刻 | CSV / XLSX |
| アクセスログ（複数月可） | Webアクセス・デバイス操作・アプリ起動ログ | CSV（複数可） |

---

## 2. ファイル構成と役割

```
screprep/
├── index.html        UIレイアウト・CSS・タブ定義・CDN読み込み
├── data-core.js      データ処理コア（CSV解析・KPI計算・集計・台帳結合）
├── db.js             IndexedDB永続化（月単位バケット管理・バックアップ）
├── charts.js         Plotlyグラフ定義（ゲージ・棒・折れ線・ランキング等）
├── render.js         タブ1〜4の画面描画
├── exports.js        TAB5レポート出力（Word/HTML/Excel）+ TAB6リスク予測UI
├── riskcalc.js       リスク金額換算・脅威シナリオ・トレンド予測（純粋関数）
├── trends.js         TAB6リスク予測の画面描画
├── gap.js            TAB7 SCS★評価ギャップ評価・Word出力
└── main.js           状態管理・ファイル読込・フィルタ・タブ制御（起点）
```

### 依存関係（読み込み順）

```
index.html
  ├─ data-core.js   → DataCore（グローバル）
  ├─ db.js          → DB（グローバル）
  ├─ charts.js      → Charts（DataCoreを使用）
  ├─ render.js      → Render（DataCore, Charts を使用）
  ├─ riskcalc.js    → RiskCalc（DataCore を使用）
  ├─ exports.js     → DataCore, Charts, Render, RiskCalc, docx(CDN), ExcelJS(CDN)
  ├─ trends.js      → DataCore, RiskCalc, Render
  ├─ gap.js         → DataCore, Render, docx(CDN)
  └─ main.js        → DataCore, DB（最後に読み込む・起点）
```

### 共有状態オブジェクト（window.App）

`main.js` が管理する中央状態。全ファイルが参照する。

| プロパティ | 内容 |
|-----------|------|
| `App.hw` / `App.hw_f` | 台帳（全件 / フィルタ後） |
| `App.pc` / `App.pc_f` | PC稼働（全件 / フィルタ後） |
| `App.pc_f_ex` | PC稼働フィルタ後＋除外ユーザー適用済み（TASK1で追加） |
| `App.ac` / `App.ac_f` | アクセスログ（全件 / フィルタ後） |
| `App.ac_web_f` | アクセスログ（Webガバナンス計算用・部署除外適用） |
| `App.kpis` | 全KPI値（4指標＋内訳） |
| `App.monthlyKpis` | 月次KPI配列（トレンド・前期比較用） |
| `App.aiExcludeUsers` | 除外ユーザーのlogin_id一覧 |
| `App.aiExcludeDepts` | 除外ユーザーの所属部署一覧 |

### データフロー

```
CSVファイル投入
  → main.js: importAndReload()
    → DB.putHw() / DB.putMonth('pc') / DB.putMonth('ac')  [IndexedDB保存]
    → loadFromStore()
      → DataCore.loadHw/loadPc/loadAc()   [行パース・フラグ付与]
      → DataCore.joinLedgers()             [台帳結合（login_id / machine_name）]
      → applyFilters()
          → フィルタ適用（月・会社・グループ）
          → DataCore.calcGovernanceKpis()  [KPI計算]
          → DataCore.computeWebGovernance() [Webガバナンス計算（部署除外適用）]
          → App.pc_f_ex 生成               [除外ユーザー適用PC集計]
          → Render.renderAll()             [全タブ再描画]
```

---

## 3. タブ構成

| タブ | ID | 描画関数 | 内容 |
|------|-----|---------|------|
| 🏛️ サマリー | t1 | renderT1() | KPIスコアカード4枚・経営コメント・**前四半期比較**（TASK5） |
| 🔒 リスク遮断 | t2 | renderT2() | 遮断完遂率・高リスクサービス検出・IT資産健全性 |
| 🌐 Webガバナンス | t3 | renderT3() | ガバナンス健全度スコア・**スコア算出根拠**（TASK4）・カテゴリ別分析 |
| ⚡ PC稼働 | t4 | renderT4() | 業務偏重・深夜/休日稼働・電源つけっぱ・**複合リスク端末**（TASK6） |
| 📥 レポート出力 | t5 | renderT5() | Word/HTML/Excel生成・**アクションプランUI**（TASK2）・**空コメント省略**（TASK3） |
| 🔮 リスク予測 | t6 | renderT6() | 金額換算・脅威シナリオ・トレンド予測 |
| 🎯 ★評価 | t7 | renderT7() | SCS評価★2/★3ギャップ評価・Word出力 |

---

## 4. KPI計算ロジック（data-core.js）

### ① リスク遮断完遂率（interception_rate）
```
遮断完遂率 = 遮断・検知件数 / 監視イベント総数 × 100（%）
閾値：緑≥95% / 黄≥85% / 赤<85%
```

### ② Webガバナンス健全度スコア（governance_score）
```
リスク加重合計 = 高リスク件数×3 + 中リスク件数×2 + 低リスク件数×1
リスク密度 = リスク加重合計 / (全Webアクセス件数 × 3)
ガバナンス健全度 = (1 − リスク密度) × 100（点）
閾値：緑≥75点 / 黄≥60点 / 赤<60点
```

### ③ 業務偏重指数（workload_concentration）
```
業務偏重指数 = 最高稼働部署の平均稼働時間 / 全部署平均稼働時間（倍）
閾値：緑≤1.5倍 / 黄≤2.0倍 / 赤>2.0倍
```

### ④ 深夜稼働率（latenight_rate）
```
深夜稼働率 = 深夜（デフォルト22時以降）の稼働日数 / 全稼働日数 × 100（%）
閾値：緑≤2% / 黄≤5% / 赤>5%
```

### リスクカテゴリ分類（SITE_GOVERNANCE）

| カテゴリ | リスクレベル | 主なドメイン例 |
|---------|------------|--------------|
| 転送サービス | 3（高） | gigafile.nu, firestorage.jp |
| クラウドストレージ | 3（高） | drive.google.com, dropbox.com |
| SNS | 2（中） | twitter.com, instagram.com |
| AI・外部サービス | 2（中） | chatgpt.com, copilot.microsoft.com |
| 動画・娯楽 | 1（低） | youtube.com, nicovideo.jp |
| ショッピング | 1（低） | amazon.co.jp, rakuten.co.jp |
| その他Web | 0 | （上記以外のHTTP/HTTPSアクセス） |

---

## 5. レポート出力構成（TAB5・exports.js）

### 出力形式

| ボタン | 出力形式 | ライブラリ |
|--------|---------|-----------|
| 📄 Wordレポートを生成 | .docx | docx（CDN: unpkg.com/docx@8.5.0） |
| 🌐 HTMLレポートを生成 | .html | 自前生成（Plotly PNGを埋め込み） |
| 📊 Excelレポートを生成 | .xlsx | ExcelJS（CDN） |

### Wordレポートのセクション構成（SECS配列）

| # | セクションID | タイトル | 選択可能コンテンツ |
|---|------------|---------|-----------------|
| 1 | summary | 1. エグゼクティブサマリー | KPIスコアカード＋総合評価 |
| 2 | web_risk | 2. リスク遮断・Webガバナンス | INSIGHTカード / グラフ（カテゴリ別・月次） |
| 3 | pc_ops | 3. PC稼働・組織健全性 | KPI＋INSIGHT / グラフ / 部署別表 |
| 4 | power_on | 4. 電源付きっぱなし検出 | リスク説明＋KPI / グラフ / 長時間一覧表 |
| 5 | assets | 5. IT資産管理 | KPI＋INSIGHT / グラフ |
| 6 | action_plan | 6. 次期アクションプラン | **アクションプラン表（UI入力値を反映）** |
| 7 | focus | 7. 重点分析（問題の切り分け） | 野良AI/深夜休日/電源つけっぱの分析＋対策 |
| 8 | risk | 8. リスク予測・想定インパクト | 金額換算＋脅威シナリオ |

各セクションに「📝 担当者コメント・現場知識メモ」欄（オプション・空欄省略可）。

### Word生成フロー

```
runExport('word')
  → collectSelections()   セクション選択チェック状態を収集
  → collectActionPlan()   アクションプランUI入力値を収集（TASK2）
  → buildWordReport(secs, cmts)
      → figToPng()        各Plotlyグラフを PNG化（オフスクリーン描画）
      → docx.Document()   セクションごとにWord要素を生成
          ├─ タイトルページ（対象期間・会社名・作成日）
          ├─ 各セクション（チェック済みのもののみ出力）
          │    └─ maybeComment()  コメント欄（空欄省略オプション適用）
          └─ アクションプラン表（入力値 or 「入力なし」）
      → Packer.toBlob()   Blobとしてダウンロード
```

### HTMLレポート生成フロー

```
buildHtmlReport()
  → figToPng() × 複数グラフを並行PNG化
  → HTML文字列を直接構築（CSS埋め込み）
  → グラフはBase64 data URI で <img> に埋め込み
  → 単一HTMLファイルとしてダウンロード（外部依存なし・オフライン閲覧可）
```

### Excelレポート生成フロー

```
buildExcelReport()
  → ExcelJS.Workbook() でシートを生成
  → 各KPIシート（サマリー・リスク・PC稼働・資産）を作成
  → figToPng() でグラフをPNG化→シートに画像埋め込み
  → .xlsx としてダウンロード
```

---

## 6. TASK1-6 で追加された機能（2026-08-12）

| タスク | 機能 | 影響ファイル |
|--------|------|------------|
| TASK1 | 除外ユーザーをPC稼働・リスク予測・Word出力にも反映（`App.pc_f_ex`） | data-core.js, main.js, render.js, exports.js |
| TASK2 | TAB5にアクションプラン入力UI追加・⚡自動生成ボタン・Wordに反映 | exports.js |
| TASK3 | 空コメント欄を省略するチェックボックス（「コメント省略オプション」） | exports.js |
| TASK4 | TAB3にガバナンススコアの算出根拠カード追加 | render.js |
| TASK5 | TAB1サマリーに前四半期比較パネル追加（6か月以上のデータで表示） | render.js |
| TASK6 | TAB4末尾に複合リスク端末の自動リストアップ（長時間＋深夜＋高リスクWeb） | render.js |

---

## 7. SCS★評価制度（TAB7・gap.js）

経産省/IPAの「サプライチェーン強化に向けたセキュリティ対策評価制度」への対応状況をチェックする自己点検タブ。

### ★3（SCS最低限）：7分類の評価

| 分類 | 機能 | 本システムでの可視化状況 |
|------|------|----------------------|
| ガバナンス整備 | 統治 | 対象外（体制・ルール） |
| 取引先管理 | 統治 | 対象外 |
| リスクの特定 | 識別 | 一部可視化（台帳・資産健全率） |
| 攻撃等の防御 | 防御 | 一部可視化（遮断完遂率・高リスク検出） |
| 攻撃等の検知 | 検知 | 一部可視化（監視イベント・ログ集計） |
| インシデント対応 | 対応 | 対象外（手順書・訓練） |
| 復旧 | 復旧 | 対象外（バックアップ体制） |

★3取得には7分類すべての充足が必要。本システムで証跡化できるのは識別・防御・検知の一部のみ。

---

## 8. 既知の制限事項・留意点

- **Webガバナンス健全度スコアはリスク密度ベース**：高リスクアクセス件数が多いほど下がる設計。スコアの意味を経営層に説明する際はTAB3のスコア算出根拠カードを参照。
- **SCS★評価は自己点検用**：制度は2025年12月中間取りまとめベース。正式要件は今後確定予定。
- **複合リスクフラグ（TASK6）**：PC台帳のlogin_idとアクセスログのlogin_idが一致する場合のみ機能。台帳未登録端末は対象外。
- **前四半期比較（TASK5）**：6か月以上のデータが蓄積されていないと比較表示されない。
- **IndexedDB**：ブラウザごとにデータが保存される。別端末・別ブラウザでは「バックアップ書出し/読込」機能でデータを移行する。
- **印刷対応**：`@media print` CSSは最低限。グラフを含む印刷は HTMLレポートをブラウザで開いて印刷推奨。

---

*このドキュメントはジェン（Genspark Claw）が自動生成しました。*
