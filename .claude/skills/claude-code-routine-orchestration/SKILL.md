---
name: claude-code-routine-orchestration
description: Claude Code Web の Routines から、GitHub Issues・PR・OpenSpec change の状態を確認し、propose / apply / archive / フォールバックのうち今進めるべき作業を1つだけ実行する。定期実行で開発を継続するときや、「Routine で開発を進めて」「次にできる開発を1つ進めて」等の依頼で使用する。
---

# Claude Code Routine Orchestration

Claude Code Web の Routine 1回につき、状況を収集して、開発を前へ進める作業を1つだけ完了させる。

## 不変条件

- 1セッションで実行するのは `propose`、`apply`、`archive`、フォールバックのいずれか1つだけとする。PR の merge を検知しても、同じセッションで次のフェーズへ進まない。
- 実装は、merge 済みの OpenSpec change proposal が存在するときだけ開始する。
- `in-progress` ラベル付き、または他者にアサイン済みの issue は作業対象にしない。
- Open な PR、active change、対象ファイルが重なる作業を確認し、重複や複雑な依存がある仕事を新たに始めない。
- 基本リズムで実行可能な仕事がなければ、何もせず終了せず、フォールバックを1つだけ実行する。
- 外部状態を変更する直前に、対象 repository、issue、PR、branch を再確認する。

## 状況収集

無駄な全件調査を避けるため、次の順で確認する。

1. repository と現在の branch、作業ツリー、認証状態を確認する。
2. Open な PR を一覧し、propose / apply / archive の進行中作業と重複候補を把握する。
3. `openspec list --json` と必要な `openspec show <change> --json` を使い、active change、task 完了状態、change 間の依存・競合を確認する。
4. GitHub Issues の `todo`、`in-progress`、assignee を確認する。active change と関連する closed issue も、ラベル状態の確認対象に含める。
5. 次の優先順位で、このセッションの作業を1つ選ぶ。

   1. 全 task が完了し、安全に archive できる change
   2. proposal PR が merge 済みで、未完了 task がある apply 可能な change
   3. change や重複 PR がまだない `todo` issue の propose
   4. フォールバック

関連 issue が `in-progress`、または他者にアサイン済みなら、その change の未完了 task が見えても選ばない。依存・競合が複雑で安全な順序を確定できない場合も新規 change を増やさず、別の候補へ進む。

PR が merge または未mergeのまま close されたことの後処理だけを行うセッションでは、issue 状態を下記ルールに合わせたら終了し、次フェーズを開始しない。

## Issue をロックする

issue を作業対象に決めたら、branch 作成やファイル編集より前に次を行う。

1. 直前の状態を再取得し、`in-progress` でなく、他者にアサインされていないことを確認する。
2. `in-progress` ラベルを付け、`todo` ラベルを外す。
3. 自分自身を assignee にする。
4. branch は `issue-<番号>-<短いkebab-case名>` とする。

ロックに失敗した場合は競合相手の作業を奪わず、状態を再収集して別の候補を選ぶ。

propose / apply PR が merge された後は、関連 issue を `todo` に戻し、`in-progress` を外す。merge 検知と次フェーズの開始を同じセッションでは行わない。propose PR が未mergeのまま close された場合は、issue を `todo` に戻して `in-progress` と自分の assignment を外す。

## OpenSpec フェーズ

OpenSpec CLI と該当スキルを必ず併用する。CLI の status / instructions が返す schema と path を正とし、固定の成果物構成を仮定しない。

### Propose

- `todo` issue 本文、コメント、acceptance criteria を読む。
- 既存 change と Open PR に同じ目的や同じコード領域の作業がないことを確認する。
- `openspec-propose` スキルで change を作成する。既存 change と依存・競合する場合は proposal / design / tasks に明記する。複雑すぎる場合は propose しない。
- issue 番号を含む branch を使う。
- PR title は `#<issue>: [propose] <要約>`、本文には `Closes #<issue>` を含める。
- change の内容を説明する Xmile Artifact を作り、その URL を PR 本文へ貼る。

### Apply

- proposal が default branch に存在し、対応する propose PR が merge 済みであることを確認する。
- `openspec-apply-change` スキルで tasks を実装する。change と関係のない改善を混ぜない。
- project が要求する test、typecheck、lint、build を実行し、結果を記録する。
- PR title は `#<issue>: [apply] <要約>` とする。
- `.claude/skills/create-pr-description-artifact` が存在する場合はそれを使う。存在しない場合は Xmile Artifact MCP で、変更点・設計判断・検証結果を説明する Artifact を直接作成する。URL を PR 本文へ貼る。

### Archive

- OpenSpec の task がすべて完了し、apply PR が default branch に merge 済みであることを確認する。
- `openspec-archive-change` スキルで archive し、要求される spec sync と validation を完了する。
- PR title は `#<issue>: [archive] <要約>` とする。
- archive PR では Artifact は不要とする。

## PR 作成の共通ゲート

PR を作る直前に Open PR を再取得し、同じ issue、change、目的の PR がないことを確認する。重複が見つかったら新規 PR を作らない。

PR 本文には次を含める。

- 目的と変更範囲
- OpenSpec change 名とフェーズ（該当する場合）
- 検証コマンドと結果
- 残課題または既知の制約
- 必須の場合は Xmile Artifact URL

PR を作成したら URL を確認し、そのフェーズを終えてセッションを終了する。

## フォールバック

propose / apply / archive のいずれも安全に実行できない場合、以下から実行可能なものを1つだけ選ぶ。直近の同種レポートや Open Issue / PR と重複しないことを先に確認する。

### 1. 大きな frontend component の振る舞い保存リファクタリング

`apps/client` が存在し、500行以上の component があるプロジェクトだけが対象。

- 既存の分割慣習を調べ、データ取得は custom hook、表示は子 component、純粋ロジックは関数 module に分ける。
- hook は1ファイル1hookとし、対象周辺の配置慣習を踏襲する。
- UI、挙動、公開 export、props を変えない。メモ化、機能改善、仕様変更を追加しない。
- tracking issue を作成してロックし、issue 番号入り branch を使う。OpenSpec propose は不要。
- 既存 test をすべて通し、apply と同じ方法で Artifact を作成して PR 本文へ貼る。

この repository のように `apps/client` を持たない場合は、この候補をスキップする。

### 2. セキュリティチェック

- `docs/securities/` の過去1か月の report と既存 GitHub Issues を読み、重複しない仮説を約3つ立てる。
- セキュリティレビュー用の利用可能な skill があれば使用する。
- 全コードを対象に read-only で調査し、診断中はコードを変更しない。
- Critical / High の新規問題だけ GitHub Issue を作成する。
- 結果は重大度に関わらず `docs/securities/<YYYYMMDD-HHmm>-<title>/report.md` に記録する。
- report を repository に残すための tracking issue を作成してロックし、issue 番号入り branch と PR を使う。診断結果と作成 issue を PR 本文に記載する。

### 3. デザイン改善提案

- 既存画面がある場合、`ux-heuristics` 等の利用可能な UX skill でユーザビリティを分析する。
- Xmile Artifact MCP で、現状の課題、根拠、改善案を説明するページを作る。
- コード、OpenSpec、GitHub Issue、PR は作成しない。Artifact 作成だけで完了する。

## 終了報告

最初に実行した作業を述べ、その後に対象 issue / change / PR、Artifact URL、検証結果、残ったブロッカーだけを簡潔に報告する。候補がなかったという理由だけで終了してはならない。
