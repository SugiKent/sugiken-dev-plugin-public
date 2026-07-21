---
name: 35-architect-security
description: "コードを脆弱性に対して堅牢化（ハードニング）するスキル。ユーザー入力・認証・データ保存・外部連携を扱うときに使用する。信頼できないデータを受け取る機能、ユーザーセッションを管理する機能、サードパーティサービスと連携する機能を構築するあらゆる場面で使用する。「セキュリティ」「ハードニング」「脆弱性」「security」「hardening」「脅威モデリング」「threat model」「STRIDE」「OWASP」「SQL injection」「XSS」「SSRF」「CSRF」「認証」「認可」「authentication」「authorization」「input validation」「入力検証」「rate limiting」「secrets 管理」「npm audit」「LLM セキュリティ」「prompt injection」「セキュリティレビュー」等の発話・タスク要求時に使用。"
---

# セキュリティとハードニング

## 概要

Web アプリケーションのためのセキュリティ・ファーストな開発プラクティス。あらゆる外部入力を敵対的なものとして扱い、あらゆるシークレットを神聖なものとして守り、あらゆる認可チェックを必須のものとして扱う。セキュリティは「フェーズ」ではない — ユーザーデータ・認証・外部システムに触れるすべての行に課せられる「制約」である。

## いつ使うか

- ユーザー入力を受け取るあらゆるものを構築するとき
- 認証（authentication）や認可（authorization）を実装するとき
- 機密データを保存・送信するとき
- 外部 API やサービスと連携するとき
- ファイルアップロード・webhook・コールバックを追加するとき
- 決済データや PII（個人を特定できる情報）を扱うとき

## プロセス: まず脅威モデリング（Threat Model First）

脅威モデルなしに後付けで対策を貼り付けるのは当て推量にすぎない。ハードニングの前に、5 分だけ攻撃者になりきって考える:

1. **信頼境界（trust boundary）を洗い出す。** 信頼できないデータがどこからシステムに入ってくるか? HTTP リクエスト、フォームフィールド、ファイルアップロード、webhook、サードパーティ API、メッセージキュー、そして **LLM の出力**。すべての境界が攻撃面（attack surface）である。
2. **資産（asset）に名前をつける。** 盗む・壊す価値があるものは何か? 認証情報、PII、決済データ、管理者操作、送金処理。
3. **各境界に STRIDE を当てる** — 儀式ではなく、手早いレンズとして:

| 脅威 | 問い | 典型的な緩和策 |
|---|---|---|
| **S**poofing（なりすまし） | ユーザー / サービスになりすませるか? | 認証、署名検証 |
| **T**ampering（改ざん） | 転送中・保存中にデータを書き換えられるか? | 完全性チェック、パラメータ化クエリ、HTTPS |
| **R**epudiation（否認） | 後から操作を否認できるか? | セキュリティイベントの監査ログ |
| **I**nformation disclosure（情報漏洩） | データが漏れるか? | 暗号化、フィールド allowlist、汎用的なエラー |
| **D**enial of service（サービス妨害） | 過負荷で潰せるか? | レート制限、入力サイズ上限、タイムアウト |
| **E**levation of privilege（権限昇格） | 本来持つべきでない権限を得られるか? | 認可チェック、最小権限 |

4. **ユースケースの隣に「悪用ケース（abuse case）」を書く。** 各機能について「これをどう悪用するか?」を問い、それを最初のテストにする。

ある機能の信頼境界を言葉にできないなら、それを守る準備はまだできていない。これは OWASP **A04: Insecure Design（安全でない設計）** にあたる — 多くの侵害はコードではなく設計から始まる。

## 三段階の境界システム（Three-Tier Boundary System）

### 常に行う（例外なし）

- **すべての外部入力を境界で検証する**（API ルート、フォームハンドラ）
- **すべての DB クエリをパラメータ化する** — ユーザー入力を SQL に文字列連結しない
- **出力をエンコードして XSS を防ぐ**（フレームワークの自動エスケープを使い、迂回しない）
- 外部通信はすべて **HTTPS** を使う
- **パスワードを bcrypt / scrypt / argon2 でハッシュ化する**（平文で保存しない）
- **セキュリティヘッダを設定する**（CSP、HSTS、X-Frame-Options、X-Content-Type-Options）
- セッションには **httpOnly / secure / sameSite クッキー** を使う
- リリースのたびに **`npm audit`**（または同等のもの）を実行する

### まず確認する（人間の承認が必要）

- 新しい認証フローの追加、または認証ロジックの変更
- 新しいカテゴリの機密データ（PII、決済情報）の保存
- 新しい外部サービス連携の追加
- CORS 設定の変更
- ファイルアップロードハンドラの追加
- レート制限・スロットリングの変更
- 昇格された権限やロールの付与

### 決して行わない

- **シークレットをバージョン管理にコミットしない**（API キー、パスワード、トークン）
- **機密データをログに出さない**（パスワード、トークン、クレジットカード番号の全桁）
- **クライアント側の検証をセキュリティ境界として信頼しない**
- **利便性のためにセキュリティヘッダを無効化しない**
- **`eval()` や `innerHTML` をユーザー提供データと共に使わない**
- **セッションをクライアントからアクセス可能なストレージに保存しない**（認証トークンを localStorage に置かない）
- **スタックトレースや内部エラーの詳細をユーザーに見せない**

## OWASP Top 10 の予防パターン

以下はランキングではなく予防パターンである。2021 年版の順序については `references/security-checklist.md` のクイックリファレンス表を参照。

### インジェクション（SQL, NoSQL, OS コマンド）

```typescript
// 悪い例: 文字列連結による SQL インジェクション
const query = `SELECT * FROM users WHERE id = '${userId}'`;

// 良い例: パラメータ化クエリ
const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// 良い例: パラメータ化された入力を使う ORM
const user = await prisma.user.findUnique({ where: { id: userId } });
```

### 認証の不備（Broken Authentication）

```typescript
// パスワードのハッシュ化
import { hash, compare } from 'bcrypt';

const SALT_ROUNDS = 12;
const hashedPassword = await hash(plaintext, SALT_ROUNDS);
const isValid = await compare(plaintext, hashedPassword);

// セッション管理
app.use(session({
  secret: process.env.SESSION_SECRET,  // コードではなく環境変数から
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,     // JavaScript からアクセス不可
    secure: true,       // HTTPS のみ
    sameSite: 'lax',    // CSRF 対策
    maxAge: 24 * 60 * 60 * 1000,  // 24 時間
  },
}));
```

### クロスサイトスクリプティング（XSS）

```typescript
// 悪い例: ユーザー入力を HTML としてレンダリング
element.innerHTML = userInput;

// 良い例: フレームワークの自動エスケープを使う（React はデフォルトでこれを行う）
return <div>{userInput}</div>;

// どうしても HTML をレンダリングする必要があるなら、まずサニタイズする
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userInput);
```

### アクセス制御の不備（Broken Access Control）

```typescript
// 認証（authentication）だけでなく、常に認可（authorization）をチェックする
app.patch('/api/tasks/:id', authenticate, async (req, res) => {
  const task = await taskService.findById(req.params.id);

  // 認証済みユーザーがこのリソースの所有者であることをチェックする
  if (task.ownerId !== req.user.id) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Not authorized to modify this task' }
    });
  }

  // 更新を実行
  const updated = await taskService.update(req.params.id, req.body);
  return res.json(updated);
});
```

### セキュリティ設定ミス（Security Misconfiguration）

```typescript
// セキュリティヘッダ（Express では helmet を使う）
import helmet from 'helmet';
app.use(helmet());

// Content Security Policy
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],  // 可能なら厳しくする
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
  },
}));

// CORS — 既知のオリジンに限定する
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true,
}));
```

### 機密データの露出（Sensitive Data Exposure）

```typescript
// API レスポンスに機密フィールドを決して返さない
function sanitizeUser(user: UserRecord): PublicUser {
  const { passwordHash, resetToken, ...publicFields } = user;
  return publicFields;
}

// シークレットには環境変数を使う
const API_KEY = process.env.STRIPE_API_KEY;
if (!API_KEY) throw new Error('STRIPE_API_KEY not configured');
```

### サーバサイドリクエストフォージェリ（SSRF）

サーバがユーザーの影響下にある URL を fetch するたび — webhook、「URL からインポート」、画像プロキシ、リンクプレビューなど — 攻撃者はそれを内部サービス（クラウドのメタデータ、`localhost`、プライベート IP）に向けられる。

```typescript
// 悪い例: ユーザーが渡したものを何でも fetch する
await fetch(req.body.webhookUrl);

// 良い例: スキーム + ホストを allowlist し、解決された IP のいずれかがプライベートなら拒否、リダイレクトも禁止する
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

const ALLOWED_HOSTS = new Set(['hooks.example.com']);

async function assertSafeUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('https only');
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error('host not allowed');
  // すべてのレコードを解決する。1 つでもプライベート / 予約済みアドレスがあればチェックに失敗させる。
  const addrs = await lookup(url.hostname, { all: true });
  if (addrs.some((a) => ipaddr.parse(a.address).range() !== 'unicast')) {
    throw new Error('private/reserved IP');
  }
  return url;
}

await fetch(await assertSafeUrl(req.body.webhookUrl), { redirect: 'error' });
```

`range() !== 'unicast'` のチェックは、ループバック、リンクローカル `169.254.169.254`（クラウドメタデータ、SSRF の最頻ターゲット）、プライベート、ユニークローカルの各レンジを IPv4 / IPv6 横断でカバーする。

**注意 — これでも TOCTOU のギャップが残る。** `fetch` はチェックの後に再び DNS を解決するため、短い TTL のレコードを使う攻撃者は、検証と接続の間に内部 IP へ rebind できる。リスクの高い面では、一度だけ解決して固定（pin）した IP に接続するか、フィルタリングエージェント（`request-filtering-agent` / `ssrf-req-filter`）を前段に置く。

## 入力検証パターン

### 境界でのスキーマ検証

```typescript
import { z } from 'zod';

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.string().datetime().optional(),
});

// ルートハンドラで検証する
app.post('/api/tasks', async (req, res) => {
  const result = CreateTaskSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: result.error.flatten(),
      },
    });
  }
  // ここで result.data は型付け済み・検証済みになっている
  const task = await taskService.create(result.data);
  return res.status(201).json(task);
});
```

### ファイルアップロードの安全性

```typescript
// ファイルタイプとサイズを制限する
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function validateUpload(file: UploadedFile) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new ValidationError('File type not allowed');
  }
  if (file.size > MAX_SIZE) {
    throw new ValidationError('File too large (max 5MB)');
  }
  // ファイル拡張子を信頼しない — 重要ならマジックバイトをチェックする
}
```

## npm audit の結果のトリアージ

すべての audit 検出が即座の対応を必要とするわけではない。次の判断ツリーを使う:

```
npm audit が脆弱性を報告した
├── 深刻度: critical または high
│   ├── 脆弱なコードはアプリで到達可能か?
│   │   ├── はい --> 即座に修正（依存の更新・パッチ・置き換え）
│   │   └── いいえ（dev 専用 dep、未使用のコードパス）--> 早めに修正、ただしブロッカーではない
│   └── 修正は利用可能か?
│       ├── はい --> パッチ適用版に更新する
│       └── いいえ --> 回避策を探す、依存の置き換えを検討、またはレビュー期日付きで allowlist に追加
├── 深刻度: moderate
│   ├── 本番で到達可能? --> 次のリリースサイクルで修正
│   └── dev 専用? --> 都合のよいときに修正、バックログで追跡
└── 深刻度: low
    └── 追跡し、通常の依存更新の際に修正
```

**重要な問い:**
- その脆弱な関数は、実際に自分のコードパスで呼ばれているか?
- その依存はランタイム依存か、それとも dev 専用か?
- デプロイ文脈を踏まえて、その脆弱性は悪用可能か?（例: クライアント専用アプリにおけるサーバサイド脆弱性）

修正を先送りするときは、その理由を記録し、レビュー期日を設定する。

### サプライチェーン衛生（Supply-Chain Hygiene）

`npm audit` は既知の CVE は捉えるが、悪意あるパッケージやタイポスクワット（typosquat）は捉えない。加えて:

- **ロックファイルをコミットし、CI では `npm ci`（`npm install` ではなく）でインストールする** — 再現可能なビルド、サイレントなバージョンドリフトの防止。
- **新しい依存を追加する前にレビューする** — メンテナンス状況、ダウンロード数、本当にそこにある価値があるか。依存はすべて攻撃面である（OWASP **A06: Vulnerable Components**、**LLM03: Supply Chain**）。
- **見慣れないパッケージの `postinstall` スクリプトに警戒する** — インストール時に任意コードを実行する。
- **タイポスクワットに注意する** — `cross-env` と `crossenv`、`react-dom` と `reactdom`。

## レート制限

```typescript
import rateLimit from 'express-rate-limit';

// 一般的な API のレート制限
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分
  max: 100,                   // ウィンドウあたり 100 リクエスト
  standardHeaders: true,
  legacyHeaders: false,
}));

// 認証エンドポイントにはより厳しい制限
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,  // 15 分あたり 10 回まで
}));
```

## シークレット管理

```
.env ファイル:
  ├── .env.example  → コミットする（プレースホルダ値のテンプレート）
  ├── .env          → コミットしない（本物のシークレットを含む）
  └── .env.local    → コミットしない（ローカルの上書き）

.gitignore には次を含めること:
  .env
  .env.local
  .env.*.local
  *.pem
  *.key
```

**コミット前に必ずチェックする:**
```bash
# 誤ってステージされたシークレットがないかチェックする
git diff --cached | grep -i "password\|secret\|api_key\|token"
```

**シークレットを一度でもコミットしたら、ローテーションする。** 行を削除したり履歴を書き換えたりするだけでは不十分 — リモートに到達した瞬間に侵害されたものとみなす。まずキーを失効・再発行し、その後で履歴から消す。

## AI / LLM 機能のセキュリティ確保

アプリが LLM を呼び出すなら — チャットボット、要約、エージェント、RAG — 新たな攻撃面を継承する。これを [OWASP Top 10 for LLM Applications (2025)](https://genai.owasp.org/llm-top-10/) に対応づける:

- **すべてのモデル出力を信頼できない入力として扱う（LLM05: Improper Output Handling）。** LLM の出力を `eval`、SQL、シェル、`innerHTML`、ファイルパスへそのまま渡さない。生のユーザー入力と全く同じように検証・エンコードする。
- **プロンプトはハイジャックされうると想定する（LLM01: Prompt Injection）。** コンテキストウィンドウ内の信頼できないテキスト — ユーザーメッセージ、取得した Web ページ、PDF — は指示を運びうる。システムプロンプトはセキュリティ境界ではない。権限はプロンプトではなくコードで強制する。
- **シークレットや他ユーザーのデータをプロンプトに入れない（LLM02 / LLM07）。** コンテキストにあるものは何でもエコーバックされうる。API キー、テナント横断のデータ、システムプロンプト全文を、モデルが復唱できる場所に置かない。
- **ツールとエージェントの権限を制約する（LLM06: Excessive Agency）。** ツールを最小限にスコープし、破壊的・不可逆な操作には確認を要求し、すべてのツール引数を検証する。
- **消費量を制限する（LLM10: Unbounded Consumption）。** トークン数・リクエストレート・ループ / 再帰の深さに上限を設け、細工された入力でコストを膨らませたりシステムをハングさせたりできないようにする。
- **取得データを隔離する（LLM08: Vector and Embedding Weaknesses）。** RAG では、ベクトルストアを信頼境界として扱う: テナントごとに embedding を分割して、あるユーザーが他者のデータを取得できないようにし、インデックス前に文書を検証して、汚染されたコンテンツが回答を誘導できないようにする。

```typescript
// 悪い例: モデル出力をコマンドやマークアップとして信頼する
const sql = await llm.generate(`Write SQL for: ${userQuestion}`);
await db.query(sql);                                   // 任意のクエリ実行
container.innerHTML = await llm.reply(userMessage);   // モデル経由の格納型 XSS

// 良い例: モデル出力はデータ — 防御的にパースし、検証し、エンコードする
let intent;
try {
  intent = CommandSchema.parse(JSON.parse(await llm.replyJson(userMessage)));
} catch {
  throw new ValidationError('unexpected model output'); // JSON.parse またはスキーマ検証の失敗
}
await runAllowlistedAction(intent.action, intent.params);
container.textContent = await llm.reply(userMessage);
```

## セキュリティレビューチェックリスト

```markdown
### 認証（Authentication）
- [ ] パスワードを bcrypt / scrypt / argon2 でハッシュ化（salt rounds ≥ 12）
- [ ] セッショントークンが httpOnly / secure / sameSite
- [ ] ログインにレート制限あり
- [ ] パスワードリセットトークンに有効期限あり

### 認可（Authorization）
- [ ] すべてのエンドポイントでユーザー権限をチェック
- [ ] ユーザーは自分のリソースにのみアクセス可能
- [ ] 管理者操作には admin ロールの検証が必要

### 入力（Input）
- [ ] すべてのユーザー入力を境界で検証
- [ ] SQL クエリはパラメータ化済み
- [ ] HTML 出力はエンコード / エスケープ済み
- [ ] サーバサイドの URL fetch は allowlist 化（内部サービスへの SSRF なし）

### データ（Data）
- [ ] コードやバージョン管理にシークレットなし
- [ ] 機密フィールドを API レスポンスから除外
- [ ] PII は保存時に暗号化（該当する場合）

### インフラ（Infrastructure）
- [ ] セキュリティヘッダ設定済み（CSP、HSTS など）
- [ ] CORS は既知のオリジンに限定
- [ ] 依存の脆弱性を audit 済み
- [ ] エラーメッセージが内部を露出しない

### サプライチェーン（Supply Chain）
- [ ] ロックファイルをコミット済み、CI は `npm ci` でインストール
- [ ] 新しい依存をレビュー済み（メンテナンス、ダウンロード数、postinstall スクリプト）

### AI / LLM（使用している場合）
- [ ] モデル出力を信頼できないものとして扱う（eval / SQL / innerHTML / shell なし）
- [ ] シークレットや他ユーザーのデータをプロンプトに入れない
- [ ] ツール / エージェントの権限をスコープ化、破壊的操作には確認を要求
```

## 関連項目（See Also）

詳細なセキュリティチェックリストとコミット前の検証手順については `references/security-checklist.md` を参照。

信頼境界の設計（関心の分離・DIP による外部依存の隔離・契約による入力検証）の判断基準は `35-architect-principle` を参照。堅牢な境界は、まず健全な設計構造の上に成り立つ。

## よくある言い訳（Common Rationalizations）

| 言い訳 | 現実 |
|---|---|
| 「これは社内ツールだからセキュリティは関係ない」 | 社内ツールも侵害される。攻撃者は最も弱い環を狙う。 |
| 「セキュリティは後で足す」 | セキュリティの後付けは作り込みの 10 倍難しい。今足せ。 |
| 「誰もこれを攻撃しようとはしない」 | 自動スキャナが見つける。隠蔽によるセキュリティはセキュリティではない。 |
| 「フレームワークがセキュリティを面倒見てくれる」 | フレームワークは道具を提供するが保証はしない。正しく使うのは自分の責任。 |
| 「ただのプロトタイプだから」 | プロトタイプは本番になる。初日からセキュリティの習慣を。 |
| 「ここで脅威モデリングは大げさ」 | 「自分ならどう攻撃するか?」を 5 分考えるだけで、後からどんな対策でも塞げない設計上の欠陥を防げる。 |
| 「ただの LLM 出力、ただのテキストだ」 | その「テキスト」は SQL 文にも script タグにもシェルコマンドにもなりうる。あらゆる信頼できない入力として扱え。 |

## 危険信号（Red Flags）

- ユーザー入力が DB クエリ・シェルコマンド・HTML レンダリングに直接渡されている
- ソースコードやコミット履歴にシークレット
- 認証・認可チェックのない API エンドポイント
- CORS 設定の欠如、またはワイルドカード（`*`）オリジン
- 認証エンドポイントにレート制限なし
- スタックトレースや内部エラーがユーザーに露出
- 既知の critical 脆弱性を持つ依存
- サーバがユーザー提供 URL を allowlist なしで fetch している（SSRF）
- LLM / モデル出力がクエリ・DOM・シェル・`eval` に渡されている
- シークレット・PII・システムプロンプト全文が LLM コンテキストウィンドウに置かれている

## 検証（Verification）

セキュリティ関連のコードを実装した後:

- [ ] `npm audit` で critical / high の脆弱性がない
- [ ] ソースコードや git 履歴にシークレットがない
- [ ] すべてのユーザー入力がシステム境界で検証されている
- [ ] 保護されたすべてのエンドポイントで認証・認可がチェックされている
- [ ] レスポンスにセキュリティヘッダが存在する（ブラウザの DevTools で確認）
- [ ] エラーレスポンスが内部の詳細を露出しない
- [ ] 認証エンドポイントでレート制限が有効
- [ ] サーバサイドの URL fetch が allowlist に対して検証されている（SSRF なし）
- [ ] LLM / モデル出力が使用前に検証・エンコードされている（AI 機能がある場合）
