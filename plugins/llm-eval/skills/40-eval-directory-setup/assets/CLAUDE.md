# eval ディレクトリ運用ルール

`eval/` は、評価の実行内容と結果を後から同じ条件で辿るための証跡置き場です。

## ディレクトリ構造

評価は次の単位で保存します。

```text
eval/<category>/<YYYYMMDD-HHmmss>-<topic>/
```

- `category` は評価の種類を表す、長く使える短い kebab-case 名にします。
- timestamp は実行開始時のローカル時刻を使います。
- `topic` は評価目的が分かる短い kebab-case 名にします。

各実行フォルダの標準構造は次のとおりです。

```text
<YYYYMMDD-HHmmss>-<topic>/
├── scripts/       # この実行で実際に使うスクリプト一式
├── inputs/        # 入力、または入力の取得条件・hash を示す manifest
├── reports/       # report、集計、標準出力・標準エラーの log
├── artifacts/     # その他の生成物がある場合だけ作る
└── run.json       # 実行条件とスクリプトの出典
```

## 過去資産の再利用

過去の評価スクリプトは積極的に再利用します。ただし、過去の実行フォルダは証跡なので直接編集しません。

1. 新しい timestamp-topic フォルダを作ります。
2. 利用する過去スクリプト一式を、新しいフォルダの `scripts/` へ丸コピーします。
3. 必要な変更はコピー後のファイルへ加えます。
4. 評価では、新しいフォルダへコピーしたスクリプトを実行します。
5. コピー元のパスと実行コマンドを `run.json` に記録します。

symlink、過去 run への import、過去 run の直接編集は行いません。新しい run だけを見れば、実際に使ったスクリプトと結果を辿れる状態を保ちます。

## 保存する証跡

- 実際に使ったスクリプトと評価専用 helper・設定
- report と実行 log
- 実行日時、実行コマンド、Git SHA、dirty 状態
- モデル、seed、dataset hash、judge など結果へ影響する条件
- スクリプトのコピー元

`run.json` に値を記録できない項目は推測せず `null` にします。
ケース単位の LLM eval は、機械可読な結果を `reports/report.json`、人間向けの要約を
`reports/report.md`、実行 log を `reports/execution.log` に保存します。

## 安全上の注意

- `.env`、API key、token、cookie などの秘密情報はコピーしません。環境変数は名前だけを記録します。
- 個人情報や機密データを複製できない場合は、原本ではなく取得条件、件数、hash を `inputs/manifest.json` に残します。
- 不要な巨大ファイルは保存せず、保存場所と hash を記録します。
- 保存可能な run の証跡は `.gitignore` へ入れず、Git で履歴を残します。
- 過去 run は削除・上書きせず、新しい評価は必ず新しい timestamp-topic フォルダに残します。
