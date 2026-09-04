---
name: routine-sweep
description: issue-driven-sdd の定期後始末。ラベルと実態のズレを修復し、失効した wip を回収し、応答が止まった PR を引き継ぎ、着手可能な issue があれば 1 件だけ実行する。Routine のトリガーは Schedule（1 時間以上の間隔）、autofix_on_pr_create は true にする（sweep 自身が routine-propose を実行しうるため）。
---

# routine-sweep

まず同じ plugin の `routine-common` を読み、ラベル定義・着手可否・不変条件・PR の作り方に従う。ここではこの段階固有の手順だけを書く。

Routine の GitHub webhook は時間あたり上限を超えると黙って破棄されうる（`routine-common` 不変条件 5）。この skill は「起動イベントが届かなかった」ことを前提に、状態を突き合わせて後追いで直す。

## 1. ラベルと実態の修復

1. merge 済みで `propose` / `apply` ラベルの PR を新しい順に確認し、対応する issue の段階ラベルが 1 段階先に進んでいるか突き合わせる。ズレていれば（`routine-apply` / `routine-archive` が起動しなかった場合）、実装前の確認条件を満たすものに限り、そのスキルの手順を直接実行する。
2. `stage:archive` のまま長時間 open PR が無い issue は、archive PR が作られずに止まっている可能性がある。対応する apply PR まで遡り、archive 済みか確認する。

## 2. wip の失効回収

`wip` が付いた issue のうち、open PR が無いまま既定 3 時間（`routine-common` 記載の既定値）を超えたものから `wip` を外す。他者にアサイン済み、または人が明示的に作業中と分かる場合は外さない。

## 3. 応答が止まった PR の引き継ぎ

`question` ラベルが付いた PR のうち、人からの回答を得られないまま長時間放置されているものを一覧する。これは異常ではなく人の回答待ちなので、`wip` を外したり PR を閉じたりしない。回答が来ていて未反映のまま止まっている場合だけ、`routine-propose` または `routine-apply` の該当手順を引き継いで反映する。

## 4. 着手可能な issue を 1 つ実行

上記の後始末を終えたうえで、`todo` または段階ラベル未着手の issue のうち、`routine-common` の着手可否をすべて満たすものが 1 件あれば、対応する段階の routine スキル（`routine-propose` 等）の手順をそのまま実行する。無ければ実行しない。

同時に複数の issue へ着手しない。1 回の sweep で実行するのは後始末とこの 1 件だけにする。

## 完了報告

最初に後始末で修復した件数（ラベルのズレ・wip 失効・引き継ぎ）を述べ、次に着手した issue があればその番号と結果を、無ければ「着手可能な issue なし」と報告する。
