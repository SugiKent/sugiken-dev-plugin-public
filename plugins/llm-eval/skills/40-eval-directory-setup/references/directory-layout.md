# eval/ の実行証跡レイアウト

## 標準構造

```text
eval/
├── CLAUDE.md
└── <category>/
    └── <YYYYMMDD-HHmmss>-<topic>/
        ├── scripts/
        ├── inputs/
        ├── reports/
        ├── artifacts/     # 必要な場合だけ
        └── run.json
```

category は長く使う分類、topic はその run 固有の評価目的を表す。timestamp を先頭に置くことで、
同じ category 内の履歴がファイル一覧のまま時系列になる。

## 証跡の自己完結性

各 run には、その評価で実際に使ったスクリプトの実体と report を一緒に残す。
過去 run のスクリプトを再利用する場合は、新しい run の `scripts/` へコピーし、コピーした側を実行する。
これにより、過去 run を変更せずに資産を再利用できる。

入力データをそのまま保存できない場合は、`inputs/manifest.json` に取得元、抽出条件、hash、件数を記録する。
秘密情報・個人情報・巨大な原本は run に複製しない。

## 最低限残すもの

- 実際に実行した `scripts/`
- 人間が読める `reports/report.md` と、必要に応じて機械可読な `reports/report.json`
- `reports/execution.log`
- 実行コマンド、時刻、Git 状態、スクリプトのコピー元を記録した `run.json`

モデル設定、dataset hash、seed、judge、split など、評価結果を左右する条件は `run.json` に追加する。
秘密情報や巨大ファイルを除き、run の証跡は `.gitignore` へ入れず Git で履歴を残す。
