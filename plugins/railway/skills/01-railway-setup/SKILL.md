---
name: 01-railway-setup
description: "個人開発プロジェクトを Railway にデプロイ・運用する際に繰り返し詰まる落とし穴をまとめたスキル。「Railway」「自動 deploy」「GitHub と接続」「railway.json」「railpack.json」「Railway service」「monorepo deploy」「Railway region」等の発話・タスク要求時に使用。Railway CLI で出来ない操作（既存 service の GitHub 接続、railwayConfigFile の付与、region 変更など）の GraphQL API 手順、GitHub App 許可、railway.json / railpack.json の配置と紐付けルール、Railpack ゼロコンフィグの限界（Prisma generate を必ず明記）、region drift の検出、monorepo の watchPatterns Tips を提供する。"
---

# Railway 運用スキル

個人開発で Railway を触るときに繰り返し詰まる箇所を、再現可能な手順としてまとめる。Railway を触る前に一読する。


---

## 1. 既存 service の GitHub 接続は CLI では出来ない

- `railway add --repo <repo>` は **新規 service 作成**専用。既存 service には適用できない。
- 既存 service を GitHub repo に紐付ける場合は **GraphQL API の `serviceConnect` mutation** を使う。

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.railway/config.json'))['user']['token'])")

curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation($id:String!,$input:ServiceConnectInput!){serviceConnect(id:$id,input:$input){id name}}","variables":{"id":"<SERVICE_ID>","input":{"repo":"<OWNER/REPO>","branch":"main"}}}'
```

接続成功後は **main への push で自動 deploy**（Railway デフォルト）。追加設定は不要。

`<SERVICE_ID>` は `railway status --json` の `serviceInstances.edges[].node.serviceId` で取得できる。

---

## 2. GitHub App の repo 許可が事前条件

`serviceConnect` 実行時に `User does not have access to the repo` が返るのは、Railway GitHub App がその repo にインストールされていないため。API token の権限とは別問題。

**確認と許可の手順**:

1. installationId を取得:
   ```bash
   curl -s -X POST https://backboard.railway.com/graphql/v2 \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"query":"query { githubRepos { fullName installationId } }"}'
   ```
2. ブラウザで `https://github.com/settings/installations/{installationId}` を開く
3. **Repository access** → 対象 repo を追加（または All repositories）
4. リトライ

**注意**: `githubRepos` の listing はキャッシュされる。許可直後に一覧に出ていなくても `serviceConnect` は通る。listing を判断材料にせず実際の mutation で確かめる。

---

## 3. `railway.json` / `railpack.json` 配置と紐付けの原則

Railway の config-as-code は **どこに置いたかだけでは効かない**。次のいずれかが満たされていないと、Railway は完全自動検出（Railpack ゼロコンフィグ）にフォールバックする。

| ファイル | 想定 | 自動で読まれる条件 |
|---|---|---|
| `railway.json`（`services` キーを持つ project-level config） | プロジェクト全体の宣言 | **リポジトリルート**に置かれている、かつ Railway 起動時にテンプレ import 経路を通る |
| `railpack.json` / `nixpacks.toml` 等の service-level config | 個別 service のビルド／起動定義 | service 設定の `railwayConfigFile` が **その相対パスを指している** |

### 3.1 `railway.json` はサブディレクトリだと無視される

`infra/railway.json` のようなサブディレクトリ配置は **稼働中 service には反映されない**。`region` / `resources` / `buildCommand` / `startCommand` / `healthcheckPath` / `restartPolicyType` がすべて未適用となり、deploy meta の builder は自動検出（RAILPACK 等）になる。

新規プロジェクトで Railway を使う場合は最初からルートに `railway.json` を置く。

> ⚠️ `infra/railway.json` を README で「設定の正本」と扱っているプロジェクトは要注意。**ドキュメント上の正本に過ぎず、稼働 service には何の効力もない**。実体は §4 / §6 / §9 のいずれかで明示している分だけ。

### 3.2 `railpack/*.json` を複数 service 用に分けている場合

例: `infra/railpack/server.json` / `infra/railpack/worker.json` / `infra/railpack/client.json` のように service ごとに分けているケース。**何もしないと 1 つも読まれない**。

→ §4「`railwayConfigFile` を service ごとに明示する」を必ず実行する。

---

## 4. `railwayConfigFile` を service ごとに明示しないと railpack/* は読まれない（最重要）

これが本スキル一番の落とし穴。リポジトリに `infra/railpack/server.json` を置いて build / start を細かく定義しても、**service 設定の `railwayConfigFile` がそのパスを指していない限り Railway は読まない**。

### 4.1 現状の確認

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.railway/config.json'))['user']['token'])")

# service の現在の config-as-code 設定を確認
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"query($id:String!){service(id:$id){serviceInstances{edges{node{railwayConfigFile rootDirectory builder buildCommand startCommand}}}}}","variables":{"id":"<SERVICE_ID>"}}'
```

`railwayConfigFile: null` なら **完全自動検出で動いている**（= railpack/*.json は無視されている）。

### 4.2 設定 mutation

```bash
ENV_ID="<ENVIRONMENT_ID>"   # railway status の environment や ~/.railway/config.json から取得

curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { serviceInstanceUpdate(serviceId: \\\"<SERVICE_ID>\\\", environmentId: \\\"$ENV_ID\\\", input: { railwayConfigFile: \\\"infra/railpack/server.json\\\" }) }\"}"
# → {"data":{"serviceInstanceUpdate":true}} が返れば成功
```

**`environmentId` を必ず渡す**。production 環境にだけ設定したい等の場合に環境ごとに分かれているため。`railway status` で見える環境 ID をそのまま使う。

### 4.3 反映確認

設定後の検証はこの順:

1. 直後に同じ query を打って `railwayConfigFile` が文字列で入っていることを見る
2. 次の deploy 後、deploy meta の `configFile` フィールドに `/infra/railpack/server.json` のようなパスが入っていることを見る（後述 §7）

---

## 5. Railpack ゼロコンフィグの限界 — Prisma generate / migrate を必ず書く

Railpack の自動検出は `pnpm install` 相当までしかしない。**Prisma の `prisma generate` のような「生成系の build ステップ」は勝手にやらない**。

### 5.1 何が起きるか

`@prisma/client` パッケージ自体は install されるが、ユーザー schema から生成される `PrismaClient` クラス（`node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/` 配下）は generate しない限り存在しない。結果として:

```
SyntaxError: The requested module '@prisma/client' does not provide an export named 'PrismaClient'
```

でランタイムで死ぬ。「ビルドは成功した／起動でクラッシュ」という最も気付きにくい落ち方をする。

### 5.2 railpack.json への記述例

```json
{
  "$schema": "https://schema.railpack.com",
  "steps": {
    "install": {
      "commands": ["corepack enable", "pnpm install --frozen-lockfile"]
    },
    "build": {
      "inputs": [{ "step": "install" }],
      "commands": [
        "pnpm exec prisma generate --schema=./prisma/schema.prisma",
        "pnpm --filter @repo/server build"
      ]
    }
  },
  "deploy": {
    "startCommand": "pnpm --filter @repo/server start"
  }
}
```

> 関連: Prisma × pnpm workspace のセットアップ規約（ローカル / CI 視点の規約。Railway デプロイ時も `pnpm exec prisma generate --schema=./prisma/schema.prisma` を **build step に必ず明記する** という規約を併用する）。

### 5.3 Prisma 以外の典型例

同じ原則で必ず build step に書くもの:

- `prisma generate`（クライアント生成）
- `pnpm --filter <pkg> build`（TypeScript / Vite ビルド）
- 翻訳生成 / OpenAPI 生成 / proto コンパイル等のコードジェネ
- start 直前に必要な migrate（`prisma migrate deploy` は start 側で実行する設計が多いが、起動時 env で migrate するなら schema バリデーションが先に走る点に注意）

---

## 6. Region drift — `railway.json` の region 宣言は稼働 service に効かない

`infra/railway.json` に `"region": "asia-southeast1"` と宣言していても、**既に稼働している service には何の影響もない**。service が UI / API で別 region に変更されていても気付けない。

### 6.1 確認

```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"query($id:String!){service(id:$id){serviceInstances{edges{node{region multiRegionConfig}}}}}","variables":{"id":"<SERVICE_ID>"}}'
```

deploy meta にも `multiRegionConfig` が乗っており、`{"europe-west4-drams3a":{"numReplicas":1}}` のように具体的な region key が確認できる。

### 6.2 個人開発の規約（CLAUDE.md「Railwayセットアップ鉄則」連動）

- **日本に近い region** を選ぶ → `asia-southeast1`（Singapore）を第一候補
- 既存 service が別 region になっていたら GraphQL で戻す
- 規約と乖離している場合、deploy のたびに `serviceInstance.region` を check するチェックリストを §7 の検証フローに含める

### 6.3 変更 mutation（必要時）

```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { serviceInstanceUpdate(serviceId: \\\"<SERVICE_ID>\\\", environmentId: \\\"$ENV_ID\\\", input: { region: \\\"asia-southeast1\\\" }) }\"}"
```

region 変更は **次の deploy で実際に再配置される**。CDN / DB との接続レイテンシが変わるので、変更したら deploy ログ・healthcheck を必ず見届ける。

---

## 7. Deploy 反映の検証フロー（必読）

config-as-code を変えたら、**deploy meta を見て本当に反映されたか確認する** までを 1 セットにする。「mutation が `true` を返した」だけでは反映を保証しない（次の deploy までは旧設定が動いている）。

### 7.1 最新 deploy の meta を見る

```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\":\"query { deployments(first: 3, input: { serviceId: \\\"<SERVICE_ID>\\\", environmentId: \\\"$ENV_ID\\\" }) { edges { node { id status createdAt meta } } } }\"}"
```

`meta` に乗る主要キー:

| キー | 何を確認するか |
|---|---|
| `configFile` | `/infra/railpack/server.json` 等のパスが入っていれば §4 が反映済み |
| `commitHash` | 自分の最新コミットになっているか（古いままなら deploy 走ってない） |
| `serviceManifest.deploy.startCommand` | railpack の `deploy.startCommand` が入っているか |
| `multiRegionConfig` | §6 の region が期待値になっているか |
| `railpackInfo.metadata` | `nodePackageManager: pnpm` / `nodeUsesCorepack: true` 等が出ているか |
| `status` | `SUCCESS` で止まっているか（`CRASHED` / `REMOVED` の連鎖になっていないか） |

### 7.2 runtime ログを見る

build success ≠ 起動成功。Prisma 系のように **build 通って run で死ぬ** ケースがあるので必ず runtime ログを直接見る:

```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\":\"query { deploymentLogs(deploymentId: \\\"<DEPLOYMENT_ID>\\\", limit: 80) { message severity timestamp } }\"}"
```

`deploymentId` は §7.1 で取れる。`severity: error` 行を必ずチェック。

### 7.3 チェックリスト（railpack/* を弄ったら毎回）

1. ✅ commit & push 完了
2. ✅ `deployments(first:1).meta.commitHash` が最新 commit と一致
3. ✅ `deployments(first:1).meta.configFile` が期待のパス
4. ✅ `deployments(first:1).status == "SUCCESS"`
5. ✅ runtime logs に `error` severity が無い
6. ✅ healthcheck (`/api/health` 等) が 200 を返す

ここまで踏まないと「直したつもり」になる。

---

## 8. API token の在り処

`~/.railway/config.json` の `user.token` フィールド。CLI でできない操作（`serviceConnect`, `serviceInstanceUpdate`, `githubRepos` listing 等）を直接 GraphQL で叩くときに使う。

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/.railway/config.json'))['user']['token'])")
```

`railway login` 済みであればこのファイルが生成されている。

同ファイルから `<PROJECT_ID>` / `<ENVIRONMENT_ID>` / `<SERVICE_ID>` も取れる（`projects.<cwd>.project / environment / service`）。

---

## 9. Monorepo での無駄 build 抑制

複数 service を同じ repo に接続している場合、`main` への push 時に **全 service が再 build される**。例えば `apps/client` しか触っていない commit でも server / worker のビルドが走る。

これを避けたい場合は service ごとに `watchPatterns` を設定する。

```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation($sid:String!,$eid:String!,$input:ServiceInstanceUpdateInput!){serviceInstanceUpdate(serviceId:$sid,environmentId:$eid,input:$input)}","variables":{"sid":"<SERVICE_ID>","eid":"<ENVIRONMENT_ID>","input":{"watchPatterns":["apps/client/**","packages/**","pnpm-lock.yaml","package.json"]}}}'
```

**パターン設計の指針**:
- 自分の app 配下（例: `apps/client/**`）
- 共有 package（例: `packages/**`）
- `prisma/schema.prisma` を使う service なら `prisma/**` も追加
- `infra/railpack/<service>.json` を変えたときに deploy したいなら `infra/railpack/<service>.json` も追加
- ルートの lockfile（`pnpm-lock.yaml` / `package-lock.json` / `bun.lock` 等）
- ルートの `package.json`

依存解決に関わるファイルは全 service に共通で含める。

---

## 10. 便利な GraphQL クエリ集

### Project 全体の deploy 状態
```bash
railway status --json
```
Service ID / 最新 deploy status / 公開ドメイン / image など一通り取れる。

### Project 全 service の builder / source / config-as-code 状況
```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"query($id:String!){project(id:$id){name services{edges{node{id name serviceInstances{edges{node{builder railwayConfigFile rootDirectory source{repo image}}}}}}}}}","variables":{"id":"<PROJECT_ID>"}}'
```

「Postgres が公式 image / 独自 Dockerfile どちらで動いているか」「server の builder が NIXPACKS / RAILPACK / DOCKERFILE どれか」「railpack/*.json が読まれる状態か」を 1 query で俯瞰できる。プロジェクト diagnosis の最初に必ず叩く。

### service の repoTriggers 確認（GitHub 接続済みか）
```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"query($id:String!){project(id:$id){services{edges{node{id name repoTriggers{edges{node{repository branch}}}}}}}}","variables":{"id":"<PROJECT_ID>"}}'
```

### mutation の引数仕様を調べる（API 変更時の自己診断）
```bash
curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"query{__type(name:\"ServiceInstanceUpdateInput\"){inputFields{name type{name kind ofType{name kind}}}}}"}'
```

`serviceInstanceUpdate` の `input` に渡せる field 一覧（`railwayConfigFile` / `rootDirectory` / `region` / `watchPatterns` / `buildCommand` / `startCommand` 等）が返る。Railway 側で input schema が更新された時に自分で調べ直すための足場。

---

## 自動起動

<auto_invoke>
<trigger_phrases>
- "Railway"
- "railway"
- "railway.json"
- "railpack.json"
- "railpack"
- "railwayConfigFile"
- "railway deploy"
- "railway service"
- "Railway 接続"
- "Railway GitHub"
- "GitHub と接続"
- "自動 deploy"
- "auto deploy"
- "serviceConnect"
- "serviceInstanceUpdate"
- "monorepo deploy"
- "watchPatterns"
- "Railway region"
- "asia-southeast1"
- "prisma generate"
- "Railway crash"
</trigger_phrases>
</auto_invoke>
