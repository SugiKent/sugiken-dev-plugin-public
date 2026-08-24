---
name: assess-pr-risk
description: 作成された PR を変更量・複雑度・動作確認推奨度で評価し、人間レビューの要否を PR にコメントする。人間レビューが不要で安全ゲートも通る場合は merge する。「PR のリスク評価」「この PR は人間レビューが必要か判断」「PR を評価して merge」「PR リスク」等の依頼で使用する。PR 番号や PR URL が対象として渡された場合も使用する。
---

# PR リスク評価

対象 PR のリスクを3軸で評価し、結果を PR にコメントする。人間レビューが不要で、merge の安全条件も満たす場合だけ merge する。

## 対象を確定する

PR 番号または URL から repository と PR を一意に特定する。番号だけが渡された場合は現在の repository を使う。対象が一意でない場合は merge せず確認を求める。

評価前に最新の次の情報を取得する。

- title、body、author、draft 状態、base / head branch
- additions、deletions、changed files
- ファイル一覧と diff
- commits、checks、required status checks
- review 状態と未解決 review threads
- mergeability と branch protection

生成物、lockfile、snapshot の大量更新は変更量には含める。ただし複雑度の根拠は実質的なソース差分を中心に判断し、数字だけで安全とみなさない。

## 特例を先に判定する

### OpenSpec change の作成 PR

`openspec/changes/<name>/` 配下に proposal、tasks、spec delta 等を新規追加する PR は、リスク軸の結果に関わらず人間レビューを必須とし、merge しない。既存 change の軽微な編集を「作成 PR」と誤判定せず、新しい change directory の追加を diff で確認する。

### OpenSpec change の archive PR

active change を `openspec/changes/archive/` へ移動するだけの PR は、3軸すべて「最低」とする。rename に紛れて実装コードや無関係な spec 変更が含まれる場合は特例を使わず、通常どおり評価する。

## 3軸の評価

各軸は PR 全体について最も高い該当リスクを採用する。

### 変更量

`additions + deletions` の合計を使う。

- 500行以下: 最低
- 501〜1500行: 中程度
- 1501行以上: 高い

フロントエンドだけの変更であることをファイル一覧から確認できる場合は、2500行以下を最低とする。frontend と backend、DB、infra、認証、CI、migration 等が混在する場合はこの例外を使わない。2501行以上は高い。

### 複雑度

- 簡単な frontend の表示・style 変更だけ: 最低
- ロジックが関連 test で十分にカバーされ、diff と test の対応を確認できる: 最低
- 簡単なロジックや domain の修正: 中程度
- DB schema や migration の変更（例: `prisma/schema.prisma`、migration）: 中程度
- data migration: 高い
- 後方互換性を壊す API / schema / behavior、不可逆な処理、広い権限変更: 高い

「test ファイルがある」だけでは最低にしない。変更した分岐、境界条件、失敗経路を test が実際に検証しているか diff で確認する。

### 動作確認推奨度

- 自動 test、typecheck、lint、build 等で変更の主要な振る舞いを担保でき、required checks が成功している: 最低
- 外部サービス、実機、実ブラウザ、production 相当環境での確認が重要、または主要動作を自動検証できていない: 高い

外部サービスとの連携を含む場合は、mock test があっても高いとする。

## 人間レビューの要否

次のいずれかに該当すれば人間レビューが必要。

- いずれかの軸が「高い」
- OpenSpec change の作成 PR

それ以外で、全軸が「最低」または「中程度」なら人間レビューは不要と判定する。

## コメントする

評価結果を、必ず次の形式で対象 PR に1回コメントする。同じ commit SHA に対する同内容の評価コメントが既にあれば重複投稿せず、既存コメントを更新できる場合は更新する。

```markdown
## PR リスク評価

| 軸 | リスク | 根拠 |
| --- | --- | --- |
| 変更量 | <最低/中程度/高い> | <+XXX / -YYY 行、合計 ZZZ 行> |
| 複雑度 | <最低/中程度/高い> | <判断根拠> |
| 動作確認推奨度 | <最低/高い> | <判断根拠> |

**判定: 人間によるレビューが<必要 / 不要>**

<不要かつ merge 済みなら「自動 merge しました」/ 必要なら理由 / merge を見送った場合は安全ゲートの理由>
```

コメント時点では、merge 結果がまだ確定していない。人間レビュー不要と判定した場合は、まず「安全ゲート通過後に自動 merge します」としてコメントし、merge 後に末尾を「自動 merge しました」へ更新する。コメント更新ができない環境では、評価コメントを投稿してから merge し、merge 成功を短い追記コメントで報告する。

## 自動 merge の安全ゲート

人間レビュー不要の判定だけでは merge しない。次をすべて確認する。

- PR が open かつ draft ではない
- head SHA が評価時から変わっていない
- mergeable で conflict がない
- required checks がすべて成功し、pending / failed / cancelled がない
- branch protection が要求する approval を満たす
- changes requested と未解決 review thread がない
- repository が auto-merge または通常 merge を許可している

すべて満たす場合だけ repository の許可する merge method で merge する。満たさない場合は merge せず、評価コメントに具体的なゲート理由を記載する。権限不足や一時的エラーを branch protection の迂回で解決しない。

## 完了報告

最初に「人間レビューが必要 / 不要」と merge 結果を述べ、3軸の評価、PR コメント URL、merge を見送った場合の理由だけを簡潔に報告する。
