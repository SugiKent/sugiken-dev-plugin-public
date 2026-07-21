# セキュリティチェックリスト

Web アプリケーションセキュリティのクイックリファレンス。`35-architect-security` スキルと併せて使用する。

## 目次

- [脅威モデリング（まずここから）](#脅威モデリングまずここから)
- [コミット前チェック](#コミット前チェック)
- [認証（Authentication）](#認証authentication)
- [認可（Authorization）](#認可authorization)
- [入力検証（Input Validation）](#入力検証input-validation)
- [セキュリティヘッダ（Security Headers）](#セキュリティヘッダsecurity-headers)
- [CORS 設定](#cors-設定)
- [データ保護（Data Protection）](#データ保護data-protection)
- [依存のセキュリティ（Dependency Security）](#依存のセキュリティdependency-security)
- [AI / LLM セキュリティ](#ai--llm-セキュリティ)
- [エラーハンドリング（Error Handling）](#エラーハンドリングerror-handling)
- [OWASP Top 10 クイックリファレンス](#owasp-top-10-クイックリファレンス)
- [OWASP Top 10 for LLMs クイックリファレンス](#owasp-top-10-for-llms-クイックリファレンス)

## 脅威モデリング（まずここから）

対策に手を伸ばす前に、5 分だけ攻撃者になりきって考える:

- [ ] 信頼境界を洗い出した（リクエスト、アップロード、webhook、サードパーティ API、LLM 出力）
- [ ] 資産に名前をつけた（認証情報、PII、決済データ、管理者操作、送金処理）
- [ ] 各境界に STRIDE を当てた（Spoofing、Tampering、Repudiation、Info disclosure、DoS、Elevation）
- [ ] ユースケースの隣に悪用ケースを書いた（「これをどう悪用するか?」）

## コミット前チェック

- [ ] コードにシークレットがない（`git diff --cached | grep -i "password\|secret\|api_key\|token"`）
- [ ] `.gitignore` が次をカバーしている: `.env`、`.env.local`、`*.pem`、`*.key`
- [ ] `.env.example` はプレースホルダ値を使っている（本物のシークレットではない）

## 認証（Authentication）

- [ ] パスワードを bcrypt（≥12 rounds）、scrypt、または argon2 でハッシュ化
- [ ] セッションクッキー: `httpOnly`、`secure`、`sameSite: 'lax'`
- [ ] セッションの有効期限を設定（妥当な max-age）
- [ ] ログインエンドポイントにレート制限（15 分あたり ≤10 回）
- [ ] パスワードリセットトークン: 時間制限付き（≤1 時間）、単回使用
- [ ] 失敗の繰り返しでアカウントロックアウト（任意、通知付き）
- [ ] 機密操作に MFA をサポート（任意だが推奨）

## 認可（Authorization）

- [ ] 保護されたすべてのエンドポイントで認証をチェック
- [ ] すべてのリソースアクセスで所有権 / ロールをチェック（IDOR を防ぐ）
- [ ] 管理者エンドポイントには admin ロールの検証が必要
- [ ] API キーは必要最小限の権限にスコープ化
- [ ] JWT トークンを検証（署名、有効期限、issuer）

## 入力検証（Input Validation）

- [ ] すべてのユーザー入力をシステム境界で検証（API ルート、フォームハンドラ）
- [ ] 検証は allowlist を使う（denylist ではない）
- [ ] 文字列長を制約（min/max）
- [ ] 数値の範囲を検証
- [ ] メール・URL・日付の形式を適切なライブラリで検証
- [ ] ファイルアップロード: タイプ制限、サイズ制限、内容の検証
- [ ] SQL クエリをパラメータ化（文字列連結なし）
- [ ] HTML 出力をエンコード（フレームワークの自動エスケープを使う）
- [ ] リダイレクト前に URL を検証（オープンリダイレクトを防ぐ）
- [ ] サーバサイドの URL fetch を allowlist 化、プライベート / 予約済み IP をブロック（SSRF を防ぐ）

## セキュリティヘッダ（Security Headers）

```
Content-Security-Policy: default-src 'self'; script-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0  (無効化、CSP に依拠する)
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## CORS 設定

```typescript
// 制限的（推奨）
cors({
  origin: ['https://yourdomain.com', 'https://app.yourdomain.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

// 本番では決して使わない:
cors({ origin: '*' })  // すべてのオリジンを許可してしまう
```

## データ保護（Data Protection）

- [ ] 機密フィールドを API レスポンスから除外（`passwordHash`、`resetToken` など）
- [ ] 機密データをログに出さない（パスワード、トークン、クレジットカード番号の全桁）
- [ ] PII を保存時に暗号化（規制で要求される場合）
- [ ] すべての外部通信で HTTPS
- [ ] データベースバックアップを暗号化

## 依存のセキュリティ（Dependency Security）

```bash
# 依存を audit
npm audit

# 可能な範囲で自動修正
npm audit fix

# critical 脆弱性をチェック
npm audit --audit-level=critical

# 依存を最新に保つ
npx npm-check-updates
```

**サプライチェーン衛生**（`npm audit` は悪意あるパッケージは捉えない）:
- [ ] ロックファイルをコミット、CI は `npm ci`（`npm install` ではなく）でインストール
- [ ] 新しい依存をレビュー（メンテナンス、ダウンロード数、`postinstall` スクリプト）
- [ ] タイポスクワットがない（`cross-env` と `crossenv`、`react-dom` と `reactdom`）

## AI / LLM セキュリティ

LLM を呼び出すあらゆる機能（チャットボット、要約、エージェント、RAG）について:

- [ ] モデル出力を信頼できないものとして扱う — `eval` / SQL / シェル / `innerHTML` / ファイルパスへ渡さない
- [ ] プロンプトインジェクションを想定し、権限はシステムプロンプトではなくコードで強制する
- [ ] シークレット・テナント横断データ・システムプロンプト全文をコンテキストウィンドウから外す
- [ ] ツール / エージェントの権限をスコープ化、破壊的・不可逆な操作には確認を要求
- [ ] トークン・レート・再帰 / ループの上限を設定（消費量を制限）

## エラーハンドリング（Error Handling）

```typescript
// 本番: 汎用的なエラー、内部情報なし
res.status(500).json({
  error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' }
});

// 本番では決して:
res.status(500).json({
  error: err.message,
  stack: err.stack,         // 内部を露出する
  query: err.sql,           // データベースの詳細を露出する
});
```

## OWASP Top 10 クイックリファレンス

| # | 脆弱性 | 予防 |
|---|---|---|
| 1 | Broken Access Control | すべてのエンドポイントで認証チェック、所有権検証 |
| 2 | Cryptographic Failures | HTTPS、強いハッシュ、コードにシークレットを置かない |
| 3 | Injection | パラメータ化クエリ、入力検証 |
| 4 | Insecure Design | 脅威モデリング、spec 駆動開発 |
| 5 | Security Misconfiguration | セキュリティヘッダ、最小権限、依存の audit |
| 6 | Vulnerable Components | `npm audit`、依存を最新に、依存を最小限に |
| 7 | Auth Failures | 強いパスワード、レート制限、セッション管理 |
| 8 | Data Integrity Failures | 更新 / 依存の検証、署名済みアーティファクト |
| 9 | Logging Failures | セキュリティイベントをログに、シークレットはログに出さない |
| 10 | SSRF | URL の検証 / allowlist、外向きリクエストの制限 |

## OWASP Top 10 for LLMs クイックリファレンス

LLM 機能を持つアプリ向け。[OWASP GenAI Security Project](https://genai.owasp.org/llm-top-10/) を参照。

| ID | リスク | 予防 |
|---|---|---|
| LLM01 | Prompt Injection | システムプロンプトを境界として信頼しない、権限はコードで強制 |
| LLM02 | Sensitive Information Disclosure | シークレット / PII をプロンプトから外す、出力をフィルタ |
| LLM03 | Supply Chain | モデル・データセット・プラグインを依存と同様に精査 |
| LLM04 | Data and Model Poisoning | 信頼できるモデルソースを使い完全性を検証、fine-tuning / RAG データを精査 |
| LLM05 | Improper Output Handling | モデル出力を信頼できないものとして扱う、検証・パラメータ化・エンコード |
| LLM06 | Excessive Agency | ツール権限をスコープ化、破壊的操作を確認 |
| LLM07 | System Prompt Leakage | システムプロンプトは漏れると想定、シークレットを入れない |
| LLM08 | Vector and Embedding Weaknesses | RAG embedding をテナントごとに分割、インデックス前に文書を検証 |
| LLM09 | Misinformation | 回答を出典で裏付け、重要な主張を検証、人間を介在させる |
| LLM10 | Unbounded Consumption | トークン・リクエストレート・ループ / 再帰の深さに上限 |
