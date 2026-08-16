---
name: 110-implement-all-openspec-changes
description: "単一の Claude Code セッションで、openspec/changes 配下のすべての承認済み OpenSpec change を、実装順と archive 順を分けて安全に実装・archive するオーケストレーションスキル。MODIFIED delta の衝突、実装中に発見した後続 change、共有ファイルの並行コミット、共有 DB の汚染を管理し、途中と最終の結合レビューを行う。E2E 基盤があるプロジェクトでは、開始時に全 change を読ませた専属 SubAgent が docs/e2e_case.md を先行作成し、各 change 内では E2E を作成・実行せず、全 change 完了後にケース実装・全件実行・必要な修正を行う。「openspec を全部実装」「changes を実装しきる」「MVP 全実装」「apply を回しきる」「全 change archive まで」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, Agent, Skill, AskUserQuestion, mcp__codex__codex, mcp__codex__codex-reply
---

# OpenSpec Changes 完全実装スキル

/goal すべての changes の実装完了とアーカイブを達成してください。既存の E2E 基盤がある場合は、すべての実装が完了した後に db reset を行って E2E を実行し、完全グリーンになるまで改善してください。

`openspec/changes/` 配下に並んでいる **change をすべて、単一の Claude Code セッションで実装しきる** ためのスキル。

あなたは最上位の **オーケストレーター** として、依存関係、作業範囲、完了条件、実装順、archive 順を管理する。自分で数回のツール呼び出しで済む確認や修正は自分で行い、SubAgent は大きく独立して並行できる実装トラックにだけ使う。E2E は change ごとに扱わず、開始時のケース設計と全 change 完了後の実装・実行に分離する。

## 専門サブエージェント（このスキルの実行部隊）

大きな独立トラックでは、必要な専門性に応じて次のサブエージェントを使える。1 change ごとに全役割を起動したり、レビューのためだけに別 agent を増やしたりしない。共有スキーマ・認証・共通 UI のような競合しやすい領域は直列に扱う。

| サブエージェント | model | 役割 | 参照スキル |
|-----------------|-------|------|-----------|
| `apply-frontend` | sonnet | フロント実装（画面 / コンポーネント / クライアント状態） | `frontend-implementation` |
| `apply-backend` | opus | バックエンド実装（API / Service / Repository / スキーマ / migration） | `backend-implementation` |
| `apply-review` | opus | 高リスクまたは横断的変更のレビュー | architect 各スキル |
| `apply-archive` | sonnet | change の archive と `openspec validate --strict` | `.claude/commands/openspec/archive.md` |
| `apply-commit` | sonnet | 意味のある単位での外科的コミット | `20-commit-meaningful-diffs`（basic plugin） |

> **E2E の実行・報告は、全 change 完了後にだけ skill を直接 invoke**。`40-run-and-report-e2e` skill（e2e plugin, `model: sonnet` + `context: fork`）を invoke すると、skill 自身が subagent へ fork してヘッドレス実行・報告する。専用の実行 agent は挟まない。一方、開始時のケース設計は `20-enumerate-e2e-cases`、最終段階の E2E テスト実装・改善は `30-implement-e2e` を、それぞれ書き込み責務を分離した専属 SubAgent として invoke する。

## 最終ゴール（最上位の成功条件）

**最終ゴール**: すべての change が `archive` され、`openspec validate --strict` がグリーンであること。既存の E2E 基盤がある場合は、`docs/e2e_case.md` の全ケースが実装済みかつグリーンであることも成功条件に加える。高リスクまたは横断的な変更では、必要な結合レビューの指摘も解消する。
---

# 全体フロー

```
Phase 0  全 change と MODIFIED 衝突の把握（Codex の利用可否確認を含む）
Phase 1  E2E 基盤・共有 DB 汚染の検出と E2E ケース設計の先行開始
Phase 2  実装順序・archive 順序の確定（依存グラフ / Wave 分割）
Phase 3  change に取り組む（途中の結合レビューを含む。change 単位の E2E は行わない）
Phase 4  全 change 完了後の E2E 実装・実行・修正
Phase 5  必要な結合レビュー
Phase 6  報告
```

## Phase 0: change 台帳と MODIFIED 衝突を確定する

各 change の proposal・design・tasks・spec delta を読み、少なくとも次を含む change 台帳を作る。実装順と archive 順は同じとは限らないため、両方を別の列で管理する。

- change が新設する capability、依存する capability、変更する共有ファイル
- ADDED / MODIFIED / REMOVED ごとの capability と requirement 見出し
- 同一 capability の同一 requirement を MODIFIED する change の組合せ
- 実装依存、archive 依存、並列不可の理由、レビュー実施地点

**MODIFIED delta の衝突は必須レビュー項目**である。複数 change が同じ capability の同じ requirement を MODIFIED する場合、archive 時に後から archive した delta が先行本文を置き換える。そのため、後から archive する change は、先行 change による例外条項・表・MUST・補償処理を取り込んだ完全な本文にする。単に自分の差分だけを全文で書き直してはならない。

また、ある change が capability を新設し、別の change がそれを MODIFIED するなら、前者を先に archive する。後者を先に archive して「対象 requirement が存在しない」状態にしない。衝突が見つかったら、後続 change の delta を修正する責任者と、取り込みを確認するレビュー担当を台帳に明記する。

## Phase 1: E2E ケース設計を先行させる

Phase 0 で全 change を把握した直後に、既存の E2E 基盤があるか確認する。E2E 用ディレクトリ、テストランナー設定、実行スクリプト、既存 E2E テストを調べ、実行可能な E2E の構成を確認できれば E2E 基盤ありとして扱う。あわせて、統合テストや手動検証が共有 DB にデータを書き、後始末しない構成かを確認する。

共有 DB が汚染され得る場合は、後続の実機確認が成立しなくなる前に、E2E を専用 DB / 専用スキーマへ分離する。テスト実行前後の reset・cleanup の責務、接続先の検証、既存の未終端レコードやキュー残りがテストを妨げないことを Phase 1 の完了条件にする。共有 DB を手作業で終端・掃除する運用を正常な前提にしてはならない。

E2E 基盤がある場合は、次の専属 SubAgent を最優先で起動する。

- `20-enumerate-e2e-cases` skill を invoke し、`openspec/changes/` 配下の **全 change** の proposal・spec・design・tasks と、既存 E2E の構成・規約を対象にする。
- このスキルでは標準の `e2e/cases/{timestamp}_cases.md` ではなく、集約ファイル **`docs/e2e_case.md`** を出力先として明示する。既存ファイルがあれば内容を保持しつつ更新する。
- 全 change を横断した E2E ケースを洗い出す。正常系だけでなく、権限境界・入力エラー・空状態・主要な change 間連携を含め、各ケースから根拠となる change を追跡できるようにする。
- 書き込み先は原則 `docs/e2e_case.md` のみに限定し、実装 SubAgent との競合を避ける。

この SubAgent の起動後は完了を待たず、Phase 2 と Phase 3 を進める。ケース設計を実装と並走させることで、他の実装作業をブロックしない。Phase 4 に入る前に SubAgent の完了を待ち、全 change がケースへ反映されていることを確認する。

E2E 基盤がない場合は、E2E 基盤そのものを暗黙に新設せず、Phase 1 と Phase 4 をスキップしたことを最終報告へ記載する。

## 並列作業の原則

- **土台は逐次が安全**: 共有依存（モノレポ基盤・Prisma スキーマ・org スコープ機構・認証認可・共通 UI・E2E ハーネス）を持つ change は 1 つずつ直列に実装する。前段が緑になるまで次へ進まない。
- **Wave 内は並列可**: write スコープ（ファイル / モジュール）が重ならず、前後依存もない、十分に大きい change だけを同時に委譲する。軽微な確認・修正や、数回のツール呼び出しで終わる作業には SubAgent を起動しない。1 agent で完結するトラックは、さらに agent を増やさない。
- **共有ファイルの commit を隔離する**: 複数 change が contract / router / 型定義などの共有ファイルを触る場合、archive 担当は `git add -A` を使わない。対象ファイルを明示列挙して stage し、`git diff --cached` の内容を読んでから commit する。さらに並行中・未archive の他 change に固有のキーワードを staged diff から grep し、0 件であることを確認する。この3点を archive 担当への必須手順として渡す。

## Phase 2: 実装順と archive 順を別々に決める

実装順はコード上の土台・依存・競合を基準に Wave を作る。archive 順は OpenSpec の capability と requirement の存在・MODIFIED delta の取り込み順を基準に、Phase 0 の台帳から別途トポロジカルに決める。

- capability を ADDED する change は、その capability を MODIFIED する change より先に archive する。
- 同一 requirement を複数 change が MODIFIED する場合、先行 change を archive した後に、後続 change が先行本文を取り込んでいることを確認してから archive する。
- 実装を先に終えたことは archive の許可を意味しない。archive 順の前提が満たされるまで change は実装済み・未archive として保持する。
- 新しい change が発行されたら、実装 Wave、archive 順、MODIFIED 衝突表、E2E ケース台帳を更新してから後続作業を再開する。

## change 単位では E2E を行わない

各 change の担当者には、E2E テストの作成、`40-run-and-report-e2e` の invoke、E2E 成功の完了条件化を指示しない。change 単位では実装、必要な unit / integration test、必要な場合だけのレビュー、archive、commit までを担当させる。

`apply-archive` には、このスキルが **E2E を全 change 完了後へ集約する延期ポリシー**を採用していることを明示する。これにより、個別 change の E2E 未実行だけを理由に archive を止めず、最終ゴールとしての E2E オールグリーンは Phase 4 で担保する。

## Phase 3 の途中結合レビューと後続 change の発行

結合レビューは全 change 完了後だけに行わない。土台となる change が複数積み上がった時点、依存 Wave の境界、状態機械・非同期処理・永続化・共有 contract が結合された時点で、独立コンテキストのレビュアーに実装済みコード全体を読ませる。unit test が全緑でも、イベント逆順完了、開始途中の競合、例外時の Promise 未解決、補償処理、DB 更新順のような結合上の不変条件を重点的に確認する。

レビューで既存 change のスコープを超える欠陥を見つけたら、既存 change を膨らませない。新規 OpenSpec change を発行し、後続の実装・archive 対象として台帳へ追加する。新規 change の proposal / design / tasks には、発見根拠となるレビュー結果のファイルパスを **必読資料** として記載し、委譲指示にも同じパスを含める。これにより元 change の完了条件を曖昧にしない。

中間結合レビューで修正が必要になった場合も、修正内容が元 change の明示された範囲内なら元 change に戻し、範囲外なら上記の新規 change とする。いずれの場合も、修正後にその結合不変条件を検証するテストまたは再現手順を追加する。

## レビュー修正の完了条件

レビュー指摘を実装側へ返すときは、修正対象のコードだけでなく、そのコードの前提・手順・契約を記している OpenSpec 文書を特定する。通常は `design.md`、`tasks.md`、proposal、spec delta が対象になる。

- 実装が仕様どおりで文書だけが古い場合は、**同じ修正作業で根拠文書も更新する**。実行すると失敗する手順や、現実と異なる設計判断を残さない。
- 文書が正で実装が逸脱している場合は、文書を実装に合わせて書き換えず、実装を文書へ戻す。仕様変更が必要なら、変更理由と影響を明示して change の文書を更新する。
- `tasks.md` の完了チェックは、コードと根拠文書の両方が整合した後に付ける。修正後の再レビューでは、この整合性も確認対象に含める。
- 外部要因（資格情報・第三者サービス・環境障害など）で実行できない task は、`- [x]` にしない。未チェックのまま理由、試行した内容、再実行条件を `tasks.md` または archive 申し送りに注記する。未実行を成功として記録することは禁止する。

## archive 前の文書同期とゲート

archive 担当には、実装と spec / design / proposal / tasks の差分を確認し、「実装が正しく文書が古い」箇所を archive 前に必ず同期するよう申し送る。実装位置、フレームワークの実挙動、処理順、claim 順などの設計判断を古いまま残して archive してはならない。

archive の直前には、Phase 0 の MODIFIED 衝突表と archive 順を再確認する。後続 delta が先行本文を完全に取り込んでいること、ADDED capability が先に archive 済みであること、未完了 task に虚偽のチェックがないことを確認してから archive する。

SubAgent の完了報告や「無関係な既存の失敗」「環境起因」という自己判定を、そのままゲート通過にしてはならない。オーケストレーター自身が build、typecheck、lint、test を実行し、失敗を再現・分類する。環境起因と判断する場合も、対象 test の独立性、共有 DB の残骸、時刻・接続先・資格情報を確認した根拠を残す。実在の失敗なら、該当 change または新規後続 change として修正する。

修正委譲には、少なくとも次の形式を使う。

```text
<CHANGE_ID> のレビュー指摘を修正してください。
- 指摘: <重大度・問題・期待する振る舞い>
- 実装範囲: <ファイル / モジュール>
- 根拠文書: <design.md / tasks.md / proposal / spec delta の該当箇所>
- 文書との扱い: 文書が古ければコードと同時に更新し、文書が正なら実装を合わせる。コードだけを直して根拠文書を置き去りにしない。
- 検証: <本番契約を通るテスト / 実行コマンド>
- 完了報告: コード・更新した文書・検証結果・残課題を列挙する。
```

テストが緑でも、次のように本番の失敗を隠していないかを確認する。

- 本番経路で起きない入力や状態だけを使ったテストで、実際の入力契約・分岐を通っていない。
- 置き換えた旧実装を、根拠のないフォールバック・export・互換経路として残している。
- 画面で使われないフィールドや中間状態だけを検証し、実際に描画される値・状態のずれを見逃している。

これらは個別の実装パターンではなく、「テストは利用者に届く本番契約を検証し、不要な互換経路を残さず、仕様と実装の根拠を一緒に保守する」という確認観点として適用する。

## サブエージェントの通信と待機の運用

委譲は、起動しただけでは成立しない。開始時に対象・完了条件・書き込み範囲・必要な仕様文書を含む自己完結した指示を渡し、受領内容を短く要約して返すよう求める。

- エージェントから「指示が届いていない」「断片しか見えない」と報告された場合は、待機状態と扱わない。**SendMessage で自己完結した全文の指示を再送**し、受領確認を得てから進める。
- レビュー統括を起動する際は、各レビュー・各修正ラウンドについて結果を一度だけ親へ返して終了すること、待機コマンドによるポーリングや同じ完了通知の反復をしないことを明示する。
- 専門レビュアーが無応答なら、同じ待機を繰り返して全体を止めない。該当観点を未回収として記録し、時間を区切って打ち切る。必要なら、その観点だけを独立した新しいレビュアーへ再委譲し、再委譲先の結果をレビュー統括へ渡して最終判定させる。
- 未回収の必須観点を「承認」と読み替えない。再委譲もできない場合は、対象 change を変更要求または判断待ちとして扱い、archive へ進めない。

# 全 change 完了後の E2E と結合レビュー

すべての change が archive・commit されたら、システム全体の結合レビューを行う。

- Phase 1 の SubAgent を完了させ、`docs/e2e_case.md` と最終的な全 change の仕様に漏れやずれがないか確認する。
- `30-implement-e2e` skill を E2E 実装専属 SubAgent として invoke する。標準の `e2e/cases/*_cases.md` ではなく **`docs/e2e_case.md` を正とする**ことを起動プロンプトで明示し、未実装ケースのテストファイルを追加し、既存ケースも必要に応じて改善させる。`30-implement-e2e` はケースファイル指定を厳守する skill なので、`docs/e2e_case.md` 内の対象範囲（節・ケース ID 範囲）を具体的に渡す。
- 全 E2E ケースのヘッドレス実行は **`40-run-and-report-e2e` skill を直接 invoke**する（実行と報告のみ）。E2E ハートビートを遵守する。`40-run-and-report-e2e` はフォアグラウンドで完走を見届ける skill であり、「実行中、完了したら報告する」で終わる中間報告は未完了として扱う。
- 失敗を「E2E テストの不備」「プロダクト実装の不備」「環境・データ準備の不備」に分類し、それぞれ E2E 実装 SubAgent、該当領域の実装 SubAgent、環境を担当できる SubAgent に修正させる。
- 修正後は `docs/e2e_case.md` を正として、未実装ケースがなく全ケースがグリーンになるまで、失敗した本番契約に必要な範囲でテストまたは実装を直し、全件を再実行する。
- 結合レビューは、高リスク変更、複数 change の境界、または E2E が示した不整合がある場合に行う。レビュー修正でプロダクト実装または E2E に変更が入った場合は、影響するケースに加えて全 E2E を再確認する。
- この最終フェーズで既に archive 済みの change の範囲を超える欠陥が判明した場合も、既存 archive を改変して押し込まない。新規後続 change を発行し、Phase 2 の台帳・順序管理へ戻して実装、文書同期、検証、archive を行う。

## 集約 E2E フェーズの運用

- **ケース台帳に状態凡例を定義させる**: `[x] spec名`＝緑を実測 / `[c] spec名`＝既存 spec がコード上カバー（未実測・フル実行で昇格）/ `[u] テスト名`＝ユニットの責務（E2E で重複させない）/ `[s] 理由`＝決定論的に再現不能。「見た緑」と「読んだカバー」を混ぜない。全行がいずれかの状態を持つこと（裸の `[ ]` を残して完了と言わない）。
- **落とし穴を台帳へ蓄積させる**: ケース実装を複数クラスタへ分割する場合、各クラスタの担当が赤の切り分けで得た教訓（locator の部分一致仕様・seed の導出規則・controlled 要素の操作法など）を台帳冒頭の「実装者向けの既知の落とし穴」ブロックへ追記してから終了させる。後続クラスタの必読に指定する。
- **E2E は常に直列 1 本**: 実行ポートが共有のプロジェクトでは、E2E を実行する SubAgent（ケース実装のその場実行・スクリーンショット撮影・フル実行）を同時に 2 つ以上走らせない。
- **このフェーズの主目的は「ユニット・型・目視では出ない層」の回収**: マウント境界（アンマウント/再マウントを跨ぐ状態機械）・非同期レース・position:fixed 等の位置決め・メディアクエリ連動は、change 単位のゲートが全緑でも壊れていることがある。E2E をこのフェーズへ延期するのはこのため。失敗ゼロで終わっても、「陳腐化して何も守っていない緑」がないか（実装が変わったのにケースが古いままの spec がないか）を仕分けに含める。

## 進捗更新と最終報告

最初のツール呼び出し前に、これから確認する範囲を一文で伝える。作業中の更新は、依存関係の発見、失敗の分類、方針変更など、利用者の判断に影響する出来事があったときだけ短く行う。

最終報告は結果から始め、実装・archive 済みの change、実行した検証、残課題だけを簡潔に記す。ケース文書や報告書は、必要な根拠を残しつつ、定型的な要約や重複した節で水増ししない。
