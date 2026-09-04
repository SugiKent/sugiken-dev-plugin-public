---
name: assess-pr-risk
description: この Claude Code plugin marketplace の PR を、変更量・配布物への影響・検証の十分さ・セキュリティ敏感パスで評価し、人間レビューの要否を PR にコメントする。人間レビューが不要で安全ゲートも通る場合は merge する。「PR のリスク評価」「この PR は人間レビューが必要か判断」「PR を評価して merge」「PR リスク」等の依頼で使用する。アプリケーションコードがない、またはドキュメント中心の PR でも、plugin の配布・発動・メタデータ整合性を評価する。
---

# PR リスク評価

対象 PR の差分を、セキュリティ敏感パスを先に判定したうえで、次の3軸で評価し、結果を PR に1回コメントする。このリポジトリの主な成果物はアプリケーションではなく plugin marketplace の配布物なので、コード行数だけでなく「インストール後に意図した skill が呼び出せるか」「marketplace の索引や plugin 構成を壊さないか」を重視する。人間レビュー不要と判定しても、安全ゲートを通るまで merge しない。

## 対象を確定する

PR 番号または URL から repository と PR を一意に特定する。番号だけなら現在の repository を使う。一意に特定できない場合は merge せず確認を求める。

評価前に最新の次を取得する。

- title、body、author、draft 状態、base / head branch、head SHA
- additions、deletions、changed files、ファイル一覧と diff
- commits、checks、required status checks
- review 状態、未解決 review threads、mergeability、branch protection

差分の意図が不明な生成物、lockfile、snapshot、大量の機械的変更は、内容と生成元を確認するまで安全とみなさない。

## 先に確認する注意領域

次の変更を含む PR は、セキュリティ敏感パスまたは3軸の評価結果にかかわらず人間レビューが必要になる可能性が高い。

- `.claude-plugin/marketplace.json` の plugin 登録、source、category、description
- plugin の追加・削除、skill / agent / hooks の発動条件や権限に関わる変更
- `SKILL.md` の指示が、secret の取り扱い、外部への投稿、破壊的操作、認証・権限変更を促すものになる変更
- hooks、スクリプト、実行可能ファイル、依存関係、CI/CD、外部公開設定の変更
- README、NOTICE、第三者由来の instruction やライセンス表記の変更
- 参照リンク切れ、重複した skill 名、frontmatter / JSON の破損、plugin パス不整合の疑い

## セキュリティ敏感パス（先に判定）

changed files 一覧を diff で確認し、次のいずれかに該当するパスへ**追加・変更・削除**がある PR は、他軸の結果に関わらず人間レビューを必須とし、merge しない。

判定は path の部分一致（glob 相当）で行う。リポジトリのディレクトリ構造に応じて、同等の認証・CI・シークレット取扱いパスも同様に扱う。

| カテゴリ | パターン例 |
| --- | --- |
| 認証・認可 | `**/auth/**`, `**/better-auth/**`, `**/middleware.*`, `**/session.*`, `**/permissions.*`, `**/rbac/**` |
| CI / デプロイ | `.github/workflows/**`, `.gitlab-ci.yml`, `**/Dockerfile*`, `docker-compose*.yml`, `**/railway.toml`, `**/fly.toml` |
| シークレット・環境変数 | `.env`, `.env.*`, `**/.env.example`, `**/secrets/**`, `**/credentials/**` |
| 依存・サプライチェーン | `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `go.sum`, `Cargo.lock`（lockfile のみの自動更新 PR は別途判断） |
| セキュリティポリシー | `docs/securities/**`, `SECURITY.md`, `**/assess-pr-risk/**`, `**/claude-code-routine-orchestration/**` |
| フック・自動化 | `**/hooks/**`, `.claude/**`, `.cursor/**`, `**/automation/**` |

次も人間レビュー必須とする。

- PR 本文・コメント・commit message に、認証バイパス・権限緩和・シークレット露出・外部入力の信頼境界緩和を示唆する記述がある
- diff にハードコードされた API キー・トークン・パスワードらしき文字列が含まれる（ダミー例・テスト用プレースホルダを除く）

利用可能な場合は `35-architect-security` で diff を read-only レビューし、指摘があれば人間レビュー必須とする。スキルが利用できない場合でも、上記パスに該当すれば merge しない。

## 3軸の評価

### 変更量

`additions + deletions` の合計を記録する。

- 20行以下: 最低
- 51~100行: 中程度
- 101行以上: 高い

ドキュメントや `SKILL.md` 中心の小規模な差分は、行数が少なくても他の2軸を別に評価する。大量の生成物・参照資料・テンプレート更新は、機械的に見えても変更量に含める。

### 配布物への影響と複雑度

- README、NOTICE、説明文、単純な skill 文言の修正で、plugin 構成を変えない: 最低
- 1つの skill / agent の指示修正で、参照リンク・frontmatter・責務が確認できる: 最低〜中程度
- 複数 plugin、marketplace 索引、hooks、実行スクリプト、依存関係をまたぐ変更: 中程度
- plugin の追加・削除、skill の発動条件や権限を大きく変える変更: 高い
- secret、認証・認可、外部投稿、破壊的操作、production 設定を促す変更: 高い

「SKILL.md だから安全」とは扱わない。自然言語の指示が Claude の実行方針を変えるため、外部状態の変更範囲、曖昧な発動条件、既存スキルとの重複、ロールバック可能性を diff から確認する。

### 検証推奨度

- JSON 構文、frontmatter、参照先、plugin パス、skill 名の重複、差分内容を確認でき、必要な marketplace 検証が成功している: 最低
- plugin のインストール、skill の読み込み・発動、hooks、スクリプト、外部サービスなど実環境依存の確認が必要: 高い
- 検証コマンドが失敗・未完了、または変更した発動条件や配布経路を確認できない: 高い

アプリケーションの test、typecheck、lint、build がこのリポジトリに存在しない場合、それらがないことだけで減点しない。代わりに marketplace と plugin の静的整合性、および必要に応じたインストール・読み込み確認を根拠にする。

## 人間レビューの要否

次のいずれかに該当すれば、人間レビューが必要と判定する。

- セキュリティ敏感パスに該当する（上記「セキュリティ敏感パス」）
- いずれかの軸が「高い」
- hooks、実行スクリプト、依存関係、secret、認証・権限、外部投稿、破壊的操作に関係する
- marketplace 登録、plugin の追加・削除、skill の発動条件に影響するが、実環境での確認根拠が不足している
- required checks が未完了、失敗、取消しのいずれか
- 差分の意図、影響範囲、参照先、ロールバック方法を確認できない

それ以外で、全軸が最低または中程度なら人間レビュー不要と判定する。ただし、具体的なファイルと検証結果を根拠にコメントする。

## コメント形式

同じ head SHA に同内容の評価コメントが既にあれば重複投稿しない。コメントは必ず次の形式にする。

```markdown
## PR リスク評価

対象 commit: `<head SHA>`

| 軸 | リスク | 根拠 |
| --- | --- | --- |
| セキュリティ敏感パス | <該当なし / 該当> | <該当パスまたは該当理由。該当なしなら「敏感パスへの変更なし」> |
| 変更量 | <最低/中程度/高い> | <+XXX / -YYY 行、合計 ZZZ 行> |
| 配布物への影響・複雑度 | <最低/中程度/高い> | <marketplace / plugin / skill / hooks への影響> |
| 検証推奨度 | <最低/高い> | <静的検証・読み込み確認・未確認事項> |

**判定: 人間によるレビューが<必要 / 不要>**

<不要なら「安全ゲート通過後に自動 merge します」/ 必要なら具体的な理由 / merge を見送った場合はゲートの理由>
```

人間レビュー不要なら、まず「安全ゲート通過後に自動 merge します」とコメントする。merge 後にコメントを更新できない環境では、merge 成功を短い追記コメントで報告する。評価時から head SHA が変わったら、古い評価を流用せず再評価する。

## 自動 merge の安全ゲート

次をすべて確認できた場合だけ、repository が許可する merge method で merge する。

- PR が open かつ draft ではない
- 評価時から head SHA が変わっていない
- mergeable で conflict がない
- required checks がすべて成功し、pending / failed / cancelled がない
- branch protection が要求する approval を満たしている
- changes requested と未解決 review thread がない
- repository が auto-merge または通常 merge を許可している

merge 直前に PR の状態と head SHA を再取得する。変化があれば merge を中止し、必要なら再評価する。権限不足や一時的なエラーを、branch protection の迂回で解決しない。

## 完了報告

最初に「人間レビューが必要 / 不要」と merge 結果を述べ、セキュリティ敏感パスの判定、3軸の評価、PR コメント URL、merge を見送った場合の理由だけを簡潔に報告する。
