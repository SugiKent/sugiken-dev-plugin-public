---
name: routine-dispatch
description: 'issue / PR event の対象 1 件を次段階へ進め、解けた依存を放出する。段階ラベルを書く唯一の routine。「dispatch を回して」でも使う。'
---

`routine-common` を読む。成果物は対象 1 件のラベルとコメントだけ。実装、ファイル変更、PR 操作、他 skill の実行は
worker / sweep に任せる。

# 対象

`CCR_TRIGGER_` 変数から event と対象を一意に決める。
対象を一意に決められなければ、読めなかった情報を報告して何も変更せず終える。

| event | 処理 |
| --- | --- |
| `issues.labeled` | issue に手順 A |
| `pull_request.closed` | PR に手順 B |
| `issues.closed` | issue に手順 C |
| 手動 | 指定 issue に手順 A。指定が無ければ sweep を案内 |

# 手順 A. stage:todo を受け付ける

今の段階ラベルが `stage:todo` のみで `blocked` も無い場合だけ進める。まず「stage:todo から進める先」を決め、その段階の条件で
本文の全 `depends on #m` を評価する。未解決なら common の「見送りの書き戻し」を使う。

## 依存が解けた条件

| 進める先 | issue `#m` の条件 |
| --- | --- |
| `stage:propose` | proposal が `origin/main` にある。`#m` が apply 以降または closed なら満たす |
| `stage:apply` | `#m` が closed |

`#m` が PR なら段階に関係なく merge 済みであること。

## stage:todo から進める先

common の「issue と change の対応」を `origin/main` で調べる。OpenSpec は実行しない。

| 状態 | 結果 |
| --- | --- |
| 対応 change が 1 つ | `[stage:apply]` |
| `change:` の指す change が無い、または対応が複数 | push / 名前 / 対応を人へ問い `[stage:todo, blocked, question]` |
| 対応は無いが、本文が実在 change の path に言及 | 対応なら `change: <name>` を追記、別物ならそう回答するよう問い、同上 |
| それ以外 | `[stage:propose]` |

# 手順 B. merge で段階を進める

PR title の `[<段階>] #n`、無ければ本文の `Refs #n` から issue を決める。
どちらにも無ければ対象を決められなかったことを報告して終える。

| PR | issue の現段階 | 結果 |
| --- | --- | --- |
| `propose` | `stage:propose` | apply 条件で依存を再評価。解決済みなら `[stage:apply]`、未解決なら `[stage:apply, blocked]` |
| `apply` | `stage:apply` | `[stage:archive]` |
| `propose` / `apply` | 既に次段階以降 | 何もしない |
| `propose` / `apply` | 前段階または段階無し | 状態を一度コメントし、何もしない |

PR の未確定判断数は見ない。人が merge したことを推奨案への同意とみなす。
書く直前に issue を再取得する。進めるときは先に `advance: stage:X` を routine コメントへ残す。
未解決で進める場合は続けて `blocked-by:` コメント、最後にラベルを書く。

`propose` を処理したら、open + blocked issue を全件読み、`stage:todo` で本文または最新の `blocked-by:` が
この issue を指すものだけを手順 D で評価する。

# 手順 C. closed issue の依存を解放する

open + blocked issue を全件読み、本文の `depends on` または最新の `blocked-by:` が closed issue を指すものに
手順 D を行う。番号検索は取りこぼすため使わない。

# 手順 D. blocker を評価して放出する

最新の `blocked-by:` コメントを正本にする。

| blocker | 解決条件 |
| --- | --- |
| issue `#m` | 待つ側が todo なら手順 A の段階別条件、それ以降なら closed |
| PR `#m` | merged。未 merge close なら `blocked-by: human` へ置換 |
| `change <name>` | main の進行中 changes から消えた |
| `human` | `unblock-when: comment` = 人の新コメント、`docs` = 文書変更を述べる新コメント、`#m` = issue close / PR merge |

issue / PR / change blocker は、正本コメントより後に人のコメントがあっても解決扱いとし、worker に再評価させる。
human の `unblock-when:` 省略は `comment` とする。

| 状態 | 全 blocker 解決 | 未解決 |
| --- | --- | --- |
| `stage:todo, blocked` | 手順 A の進める先を書く | human だけ解けた場合は question を外す。それ以外は何もしない |
| `stage:X, blocked` | `release: stage:X` → `[]` → `[stage:X]` | 同上 |

# 報告

対象、変えたラベル、投稿したコメントを簡潔に報告する。
