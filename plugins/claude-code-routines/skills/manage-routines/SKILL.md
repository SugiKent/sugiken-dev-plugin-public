---
name: manage-routines
description: 'Claude Code Routines を検索・作成・更新し、停止・再開や実行状況を確認する。「Routine を作って」「Routines の設定を直して」「起動しない原因を調べて」、workflow の setup からの委譲で使う。'
---

# 入力と対象

依頼または呼び出し元の設定表から、対象 repo / Routine、操作、望む設定を決める。調査依頼では読むだけにする。
作成・更新では name、prompt、repositories、trigger / filter、model、`autofix_on_pr_create`、必要 connector、
schedule の時刻・timezone、ID の記録先を使う。既存設定と依頼で決まる値は引き継ぎ、不足する判断だけ尋ねる。
workflow 固有のラベルや状態遷移は呼び出し元の規約に従う。

Claude Code の `RemoteTrigger`、`/schedule` または Routines UI を使う。利用できなければ実行したふりをせず、
不足する接続と適用すべき設定を返す。GitHub event を使う repo は Claude GitHub App の導入を確認する。
API を操作するときは先に `references/routines-api.md` を読む。利用環境の tool schema を優先し、
未対応 field や API を推測で送らない。

# 現状と差分

1. 記録済み ID を get し、repo / name を照合する。ID が無ければ list で探し、一覧が不完全なら UI で確認する。
   見つからないことと存在しないことを区別し、同定できないまま重複作成しない。
2. 無ければ作成、あれば差分だけ更新する。対象外の Routine、connector、trigger は保持する。
   停止・再開・削除は依頼対象を ID で確認して行い、設定移行では既存 Routine を再利用する。
3. 作成・発見した ID は指定先へ保存する。記録先が無い手動依頼では repo の `docs/playbooks/claude-code-routines.md`
   を既定とし、repo が無ければ ID と設定を回答に残す。役割 / name / repo / ID の対応を辿れる形で記録する。
   repo や設定表から一意なら既存の役割 / ID 表でよい。token は含めない。

# 設定を反映する

- prompt は呼び出し元が指定した仕事を使う。skill 参照には plugin namespace を付け、実行環境で解決できることを確認する。
  PR branch に存在しない手順書を使う場合は、指定された信頼できる branch から読む本文を保持する。
- Issue Labeled の filter は追加ラベルでなく操作後の集合を見る。自己再起動を抑える除外ラベルは呼び出し元の表から取る。
  複数 trigger は 1 Routine にまとめ、利用 UI が許さなければ同一 prompt の Routine に分けて全 ID を記録する。
- connector は現在値を読み、必要なものを追加して読み戻す。session の記録・生存確認が必要なら Claude Code Remote を使う。
- `autofix_on_pr_create` は作成 PR のコメント対応を同じ session に渡す設定。値と、停止時の回収担当は呼び出し元で決める。

# 確認と引継ぎ

get で prompt / repo / model / autofix / connector / enabled を読み戻し、trigger は UI または実際の起動履歴でも
照合する。`list_runs` が空でも無効とは断定しない。設定の保存と、event からの起動成功は別に報告する。
導入の試運転は呼び出し元の検証手順を使う。手動 run は依頼範囲でのみ行い、起動数、skill の解決、結果、
自己再起動の有無を確認する。

結果は ID / 記録先、変更点、設定確認、起動確認、未確認・失敗と次の操作を返す。動作を確認できなければ
導入完了としない。利用上限・停止・接続不良で処理が進まない場合は対象を明記して呼び出し元へ返し、
workflow の人待ちへの引継ぎを実行させる。Routine が存在するだけで回復経路があると扱わない。

公式の操作案内: https://code.claude.com/docs/en/routines
