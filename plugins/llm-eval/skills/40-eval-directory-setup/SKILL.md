---
name: 40-eval-directory-setup
description: "LLM エージェントや生成機能の評価を、repo root の `eval/<category>/<YYYYMMDD-HHmmss>-<topic>/` に実行単位で保存する基盤をセットアップするスキル。各実行フォルダへ、その実行で使ったスクリプト一式・入力条件・report・log をまとめ、過去のスクリプトを再利用するときも新しい実行フォルダへ丸コピーしてから使う。過去 run を上書きしない運用規約を `eval/CLAUDE.md` に作成・統合する。「eval フォルダを作りたい」「評価結果をカテゴリー別に残したい」「eval の証跡を残したい」「過去の評価スクリプトを再利用したい」「eval ディレクトリをセットアップ」「timestamp-topic で評価を保存」等の発話・タスク要求時に必ず使用する。"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# eval 実行証跡ディレクトリのセットアップ

評価ごとに「何を実行し、何が得られたか」をフォルダ単位で読み返せるようにする。
評価手法や言語には依存せず、本番コードの挙動は変えない。

## 作る構造

repo root に次の構造を作る。

```text
eval/
├── CLAUDE.md
└── <category>/
    └── <YYYYMMDD-HHmmss>-<topic>/
        ├── scripts/       # この実行で実際に使うスクリプト一式のコピー
        ├── inputs/        # 入力データ、または機密データを指す manifest
        ├── reports/       # report、集計結果、実行 log
        └── run.json       # 実行条件と出典
```

- `category` は評価の種類を表す、長く使える短い kebab-case 名にする。
- timestamp は実行開始時のローカル時刻を `YYYYMMDD-HHmmss` で記録する。
- `topic` は今回の評価目的が分かる短い kebab-case 名にする。
- 追加成果物があるときだけ `artifacts/` を作ってよい。

例:

```text
eval/retrieval/20260901-143012-ranking-baseline/
eval/prompt-quality/20260902-101530-refusal-tone/
```

## セットアップ手順

1. repo root と既存の `eval/`、評価スクリプト、過去 report を確認する。既存ファイルは上書きしない。
2. `assets/CLAUDE.md` を読み、repo root の `eval/CLAUDE.md` を作る。すでに存在する場合は、既存のプロジェクト固有ルールを残しつつ不足する規約だけを統合する。
3. category と topic が依頼から明らかなら、現在時刻を使って実行フォルダを作る。不明な場合は勝手な空カテゴリーやダミー run を作らず、`eval/CLAUDE.md` までを初期セットアップとする。
4. 新しい実行フォルダ内に `scripts/`、`inputs/`、`reports/`、`run.json` を用意する。空ディレクトリを Git で保持する必要がある場合だけ `.gitkeep` を置く。
5. 使用する評価スクリプトと、その実行に必要な評価専用 helper・設定ファイルを `scripts/` へコピーする。過去 run の資産を使う場合も、必ず新しい実行フォルダへ丸コピーしてから編集・実行する。
6. 実行後、report、標準出力・標準エラーの log、主要な生成物を同じ実行フォルダへ保存する。

## スクリプト再利用の原則

- 過去 run は証跡なので、直接編集しない。
- 過去 run のスクリプトを import、symlink、相対参照して済ませず、新しい run の `scripts/` へ実体をコピーする。
- コピー後に変更した場合、その run では変更後のコピーを実行する。別の場所にある最新版を実行して、古いコピーだけ残す状態を作らない。
- コピー元のパスと、分かる場合はコピー元 run を `run.json` に記録する。
- `.env`、API key、token、cookie、個人情報などの秘密情報はコピーしない。必要な環境変数は名前だけを記録する。

## run.json

最低限、次の情報を残す。取得できない値は推測せず `null` にする。

```json
{
  "createdAt": "ISO8601 with timezone",
  "category": "retrieval",
  "topic": "ranking-baseline",
  "command": "実際に実行したコマンド",
  "scriptSources": ["コピー元の相対パス"],
  "gitSha": "実行時の HEAD",
  "gitDirty": true,
  "runtime": { "name": "node", "version": "..." },
  "environmentVariables": ["値ではなく変数名のみ"]
}
```

評価手法に固有のモデル、dataset hash、seed、judge 設定などは、この JSON に追加してよい。

## reports/report.json の共通契約

ケース単位の LLM eval では、後続の採点・比較・最適化が同じ結果を読めるように、
`reports/report.json` の各ケースを最低限次の形にする。使わない列は `null` にする。

```json
{
  "target": "...",
  "caseId": "...",
  "pass": true,
  "score": 4,
  "reason": "採点または失敗の理由",
  "structuralPass": true,
  "error": null
}
```

人間向けの要約は `reports/report.md`、実行 log は `reports/execution.log` に残す。
ケース型でない評価では report 形式を目的に合わせてよいが、形式と読み方を run 内に記録する。

## 完了条件

- `eval/CLAUDE.md` に、category/run の命名とスクリプト丸コピー運用が書かれている。
- 新しい run を作った場合、使用したスクリプトと report が同じ run フォルダだけで辿れる。
- 過去 run が変更されていない。
- 秘密情報や不要な巨大ファイルが保存されていない。
- 保存可能な証跡が `.gitignore` で除外されず、Git 管理対象になっている。
- 作成・更新したパスと、実行した検証をユーザーへ報告する。
