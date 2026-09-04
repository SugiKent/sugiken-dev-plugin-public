---
name: 99-refresh-store-metadata
description: "個人開発の Expo + React Native モバイルアプリで、App Store / Google Play のストア文言（name / subtitle / keywords / promotional_text / description / short_description / full_description）を、実装の現状に合わせて最新化するスキル。`openspec/specs/` の capability 一覧・実際の画面実装・PROJECT.md を突き合わせて『実装済みなのにストアで訴求されていない機能』と『ストアに書いてあるが実装に存在しない記述（虚偽表示リスク）』のドリフトを検出し、字数上限・ASO・iOS/Android 整合を守って書き換える。「ストアの説明文を最新化」「metadata を最新化」「ストア文言が実装と合ってない」「description を実装に合わせて」「新機能をストアに反映」「キーワードを見直したい」「ASO を見直したい」「訴求漏れがないか確認」等の発話・タスク要求時に使用。書き換えとローカル検証までが責務で、App Store Connect / Play Console への push は行わない（99-push-fastlane-metadata の責務）。release_notes / changelogs も扱わない（同 push スキル Step 0 の責務）。"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
---

# ストアメタデータ最新化スキル（実装 → 文言のドリフト解消）

`apps/mobile/fastlane/metadata/` 配下の **テキスト文言を、実装の現状に合わせて書き直す** ためのスキル。

ストア文言は一度書くと更新されず、実装だけが先へ進む。結果として

- **訴求漏れ** — 実装済みなのにストアのどこにも書かれていない機能（獲得機会の損失）
- **虚偽表示** — ストアに書いてあるが今は存在しない／挙動が変わった記述（審査リジェクト・低評価レビューの原因）

の 2 種類のドリフトが溜まる。本スキルはこれを**証拠ベースで検出して潰す**ことに専念する。

## 責務の境界（重要）

| やること | やらないこと |
|---|---|
| `ja/*.txt` と `android/ja-JP/*.txt` の文言書き換え | App Store Connect / Play Console への push → [[99-push-fastlane-metadata]] |
| ドリフト検出・字数検証・iOS/Android 整合 | `release_notes.txt` / `changelogs/default.txt` の生成 → 同スキル **Step 0**（バージョン単位の差分要約であり、本スキルの「恒常的な製品紹介文の最新化」とは別物） |
| user 承認を取ってから書き込み | スクショ画像の生成 → [[95-store-images-setup]] |
| 変更のコミット | 審査提出・自動公開 |

> release_notes を本スキルで書かないのは意図的。「今回のバージョンで何が変わったか」と「このアプリは何ができるか」は寿命の違う文章で、混ぜると両方腐る。

## Step 1: 実装側の機能インベントリを作る（証拠収集）

**推測で書かない。** 以下から実際に出荷されている機能を列挙する。

- `openspec/specs/` — capability の正本。archive 済み = 実装済みと見なせる
- `openspec/changes/`（archive 以外）— 未 archive の change は「まだ出荷されていない」候補
- `apps/mobile/src` の実際の画面 / 主要コンポーネント — specs に無い後付け機能を拾う
- `PROJECT.md` — ビジネス仕様側の未実装記述

各機能について **「ストアの文章にできる粒度のユーザー価値」** に翻訳してメモする。`### Requirement:` の見出しをそのまま並べない（内部仕様語彙はストア文言にならない）。

> 判断が要るのは「この capability はユーザーに見える価値か」の仕分けだけ（認証基盤・API バージョニングのような不可視の capability は落とす）。列挙自体は機械的に済ませる（LLM は判断タスクにのみ使う）。

## Step 2: 現行のストア文言を読み、ドリフト表を作る

`apps/mobile/fastlane/metadata` 配下の 8 ファイル（`ja/name.txt` / `ja/subtitle.txt` / `ja/keywords.txt` / `ja/promotional_text.txt` / `ja/description.txt` / `android/ja-JP/title.txt` / `android/ja-JP/short_description.txt` / `android/ja-JP/full_description.txt`）を読み、各ファイルの字数を数える。あわせて `description.txt` の最終更新日を git log で確認し、ドリフトの深さの目安にする。

Step 1 のインベントリと突き合わせ、**必ずこの表を user に提示する**（これが本スキルの成果物の核）:

| 機能 / 記述 | 実装 | ストア文言 | 判定 |
|---|---|---|---|
| 例: 機能 A（specs にあり、画面もある） | あり (`capability-a`) | 記載なし | **訴求漏れ → 追記** |
| 例: 機能 B（複数機能を横断する統合ビュー） | あり (`capability-b`) | 旧機能名で部分的に言及 | 記述更新 |
| 例: 機能 C（直近リリースで追加） | あり (`capability-c`) | 記載なし | **訴求漏れ → 追記** |
| 例: 「◯◯ができます」 | 実装なし | 記載あり | **虚偽表示 → 削除**（最優先） |
| 例: 機能 D【NEW】 | あり（3 バージョン前に出荷） | `【NEW】` 付き | **NEW を剥がす** |

判定の優先順位: **虚偽表示の削除 > NEW の剥がし > 訴求漏れの追記 > 表現の磨き込み**。

## Step 3: 書き換え方針（フィールド別）

### 変更の副作用を先に理解する

`name` / `subtitle` / `description` / スクショを変更すると **iOS の審査が再走する**。審査を走らせたくないタイミングなら、`promotional_text`（iOS のみ・審査なしで差し替え可能）に寄せる選択肢を user に提示する。

| フィールド | 上限 | 方針 |
|---|---|---|
| `ja/name.txt` / `android/ja-JP/title.txt` | 30 | **iOS と Android で同一に保つ**。変更は最終手段（ブランド想起とレビュー資産を壊す） |
| `ja/subtitle.txt` | 30 | 一番の差別化価値を 1 つだけ。機能の羅列にしない |
| `ja/keywords.txt` | 100（**スペースも 1 文字**、カンマ区切り） | name / subtitle に既出の語は入れない（重複は無駄）。新機能で増えた検索語を入れ、死語を落とす |
| `ja/promotional_text.txt` | 170 | **審査不要で差し替えできる唯一の枠**。直近の推し機能・季節訴求をここに置く |
| `ja/description.txt` | 4000 | 構成（冒頭フック → 3つの特徴 → 主な機能 → 深掘り → こんな方におすすめ → 締め）は既存を踏襲。外科的変更に徹し、**ドリフト箇所だけ**を直す |
| `android/ja-JP/short_description.txt` | 80 | Play の検索結果に出る。iOS subtitle と同じ事実を、80 字なりの情報量で |
| `android/ja-JP/full_description.txt` | 4000 | iOS description と**同じ事実**を書く。ズレると「どちらかが古い」状態が再生産される |

### 文体の鉄則

- 既存の description のトーンを維持する。**トーンの刷新は明示指示があるときだけ**。
- 機能名ではなく**ユーザーの得**を書く。「AI ステップ提案」ではなく「何から始めればいいか、AI が 5 つ提案します」。
- `【NEW】` は**次のリリースで剥がす前提の期限付きマーカー**。Step 2 で必ず棚卸しする。
- 誇張・断定（「必ず」「絶対に」「No.1」）は書かない。審査リジェクトと期待値超過レビューの両方を招く。

### iOS / Android の整合

同じ事実を 2 箇所に書くので、**片方だけ直すのが最大の事故源**。Step 3 では必ずペアで編集する:

- `ja/subtitle.txt` ⇄ `android/ja-JP/short_description.txt`
- `ja/description.txt` ⇄ `android/ja-JP/full_description.txt`
- `ja/name.txt` ⇄ `android/ja-JP/title.txt`

## Step 4: 検証（書き込み後・push 前に必ず）

```bash
cd apps/mobile/fastlane/metadata

# 1) 字数（末尾改行を除いた厳密カウント）
check() { printf '%-46s %4s / %s\n' "$1" "$(tr -d '\n' < "$1" | wc -m | tr -d ' ')" "$2"; }
check ja/name.txt 30
check ja/subtitle.txt 30
check ja/keywords.txt 100
check ja/promotional_text.txt 170
check ja/description.txt 4000
check android/ja-JP/title.txt 30
check android/ja-JP/short_description.txt 80
check android/ja-JP/full_description.txt 4000

# 2) name / title が一致しているか
diff <(tr -d '\n' < ja/name.txt) <(tr -d '\n' < android/ja-JP/title.txt) \
  && echo "OK: name == title" || echo "NG: name と title がズレている"

# 3) 剥がし忘れマーカーと禁止表現
grep -n 'NEW\|新機能\|近日\|準備中\|No\.1\|必ず\|絶対' ja/description.txt android/ja-JP/full_description.txt ja/promotional_text.txt || echo "OK: 該当なし"

# 4) 変更差分を全部見る
cd -
git diff -- apps/mobile/fastlane/metadata
```

**上限超過が 1 つでもあれば止まって直す。**「だいたい収まっている」で push に渡さない（サイレントに進めない）。

`keywords.txt` は**スペースも 1 文字消費**する。カンマ区切りに空白を入れない。

## Step 5: user 承認 → コミット → 引き継ぎ

1. Step 2 のドリフト表と Step 4 の `git diff` を提示し、**承認を取る**。「更新しました」で終わらせない。
2. 承認後にコミット（[[20-commit-meaningful-diffs]] に従い、metadata 以外を巻き込まない）。
3. ストアへの反映は **[[99-push-fastlane-metadata]] を起動して引き継ぐ**。本スキルは push しない。引き継ぎ時に「今回 name/subtitle/description を変えたので iOS 審査が再走する」かどうかを明示して渡す。

## よくある落とし穴

### 1. release_notes を一緒に書き換えてしまう
本スキルの守備範囲外。バージョン差分の要約は push スキル Step 0 が git ログから生成する。ここで書くと二重管理になり、必ずどちらかが古くなる。

### 2. iOS だけ直して Android を忘れる
`description` と `full_description` は別ファイル。片方だけ直すと、次に読んだ人が「どちらが正しいか」を判定できなくなる。Step 4 の diff で両方に変更が入っているか確認する。

### 3. `【NEW】` が数バージョン残り続ける
出荷から時間が経った `【NEW】` は「更新されていないアプリ」の signal になる。Step 2 の棚卸しで機械的に剥がす。

### 4. 実装を確認せずに「たぶんある」で書く
虚偽表示は審査リジェクト事由。`openspec/specs/` に無く、コードにも見当たらない機能は書かない。判断がつかなければ user に確認する。

### 5. 未 archive の change を「実装済み」として書く
`openspec/changes/` 直下（archive 以外）に残っている change は**まだ出荷されていない**可能性が高い。ストア文言に先出しすると、審査時点で存在しない機能を謳うことになる。

### 6. トーンごと書き直してしまう
「最新化」の依頼は「全面リライト」の依頼ではない。ドリフト箇所だけを外科的に直す。全面刷新したい場合は user が明示的にそう言う。

### 7. 並行セッションが push 中に書き換える
push が走っている最中に本スキルで metadata を編集しない。

## 関連スキル

| スキル | 関係 |
|---|---|
| **[[99-push-fastlane-metadata]]** | 本スキルの出力を App Store Connect / Play Console へ push する。release_notes / changelogs はあちらの責務 |
| **[[95-store-images-setup]]** | スクショ・Feature Graphic の生成。文言を変えたらスクショ内キャプションもズレていないか確認する |
| **[[99-release-mobile]]** | binary を含む本リリース。バージョン提出の直前に本スキルで棚卸しするのが標準フロー |
| **[[01-humanizer-ja]]** | 生成した文言が AI くさくなったときの書き直しに使う |

- `apps/mobile/fastlane/metadata/README.md` — 各フィールドの上限・運用メモ
