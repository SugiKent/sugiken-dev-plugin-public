---
name: issue-driven-sdd-custom
description: issue-driven-sdd plugin の routine がこのプロジェクトで従う固有の調整。worker が routine-common の直後に読む。単独では実行しない。
disable-model-invocation: true
---

## routines

（`routines-setup` が控える Routine の id。worker は読まない。`RemoteTrigger list` は 1 ページ目しか返さないので、ここが正本）

| 役割 | id |
| --- | --- |
| dispatch | |
| propose | |
| apply | |
| archive | |
| sweep | |

## 共通

（E2E の要否、スクリーンショットの方針、アーティファクトの作り先、着手してはいけない領域、教訓の書き残し先など。空なら既定どおり）

## propose

## apply

## archive
