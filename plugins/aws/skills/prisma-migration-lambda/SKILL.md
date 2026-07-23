---
name: prisma-migration-lambda
description: "private subnet の RDS(PostgreSQL) に対して `prisma migrate deploy` を安全に流すための「マイグレーション用 Lambda」を構築するスキル。RDS が private isolated subnet にありローカル/CI から直接到達できないとき、VPC 内の Lambda に migrate を代行させ、GitHub Actions などから `aws lambda invoke` で起動する設計・手順・ハマりどころをまとめる。サーバ用イメージと同一イメージを CMD だけ差し替えて再ビルドを避ける方式、Lambda Web Adapter(LWA) の pass-through invoke、readiness を塞がないための「起動時 listen・request 時 migrate」分離、Secrets Manager からの DATABASE_URL 解決、CI 側の成否判定(FunctionError と body ok:true の二重チェック)を扱う。「マイグレーション Lambda」「migrate Lambda」「prisma migrate deploy を本番に」「private subnet の RDS に migration」「VPC 内から migrate」「Lambda Web Adapter pass-through」「aws lambda invoke で migration」等の発話・タスク要求時に使用。前提は Prisma + CDK(v2) + RDS(private subnet)。"
---

# Prisma マイグレーション用 Lambda 構築スキル

private subnet の RDS に `prisma migrate deploy` を流すための、VPC 内 Lambda を構築する。
Prisma を使い、RDS が private isolated subnet にある構成を前提とする。着手前に一読する。

以下では自プロジェクトのサービス名を `<service>`、ステージを `<stage>`（例 `prd` / `stg`）、
CDK スタックのアプリ本体を「サーバ Lambda」と呼ぶ。

---

## 0. なぜ専用 Lambda が要るのか（判断の起点）

RDS を private isolated subnet（インターネット egress も持たない）に置くと、**ローカル PC や CI ランナーからは
DB に直接到達できない**。この状態で `prisma migrate deploy` をどこから流すかが問題になる。

- 踏み台(bastion)/SSH トンネル → 運用・鍵管理コストが増える。
- RDS を public にする → セキュリティ上やらない。
- **VPC 内に置いた Lambda に migrate を代行させ、外から invoke するだけにする** ← 本スキルの方式。

DB に触れるのは VPC 内の Lambda だけに閉じ、CI は「invoke するトリガー」に徹する。

---

## 1. 中核の設計判断

### 1-1. サーバ用イメージと「同一イメージ・CMD だけ差し替え」

マイグレーション Lambda は、サーバ Lambda と**同じコンテナイメージ**を使い、起動 CMD だけを
migrate 用エントリに差し替える。

- 別イメージにしない。同一 `fromImageAsset` を使えば **イメージは再ビルドされず共有**され、
  「サーバとマイグレーションで Prisma schema / 生成 Client がズレる」事故が原理的に起きない。
- CDK では `DockerImageCode.fromImageAsset(root, { cmd: [...] })` の `cmd` だけを上書きする。

### 1-2. Lambda Web Adapter(LWA) の pass-through invoke

このイメージは HTTP サーバ(Fastify 等)+ LWA で動く前提。マイグレーション Lambda には API Gateway や
Function URL を付けず、**`aws lambda invoke` の payload を LWA が HTTP に変換して届ける** pass-through を使う。

- `AWS_LWA_PASS_THROUGH_PATH=/events` を設定すると、invoke の payload が `POST /events` として届く。
- readiness は TCP で十分なので `AWS_LWA_READINESS_CHECK_PROTOCOL=tcp`。

### 1-3. 「起動時に listen・request 時に migrate」を分離する（最重要）

**migrate 本体を起動時に走らせてはいけない。** LWA は「ポートが listen したか」で readiness を判定するため、
起動処理で migrate（数秒〜数十秒）を回すと readiness チェックを塞ぎ、invoke がタイムアウト/失敗する。

- 起動直後に即 listen して readiness を通す。
- migrate は **`POST /events` を受けた request 時**に初めて実行する。

### 1-4. DATABASE_URL は request 時に Secrets Manager から解決

接続情報は RDS のシークレット(Secrets Manager)を単一ソースにし、handler 内で組み立てる。
`connection_limit=1`、`sslmode=require` を付与する。ビルド時や環境変数への平文埋め込みはしない。

---

## 2. マイグレーション用エントリ（migrate ハンドラ）

`apps/server/src/migrate.ts` などに置く。要点だけ抜粋（一般化）。

```ts
import { execFileSync } from "node:child_process";
import Fastify, { type FastifyReply } from "fastify";
import { resolveDatabaseUrl } from "./runtime-env"; // Secrets Manager から DATABASE_URL を組む

const REPO_ROOT = "/app"; // Dockerfile の WORKDIR。schema は /app/prisma/schema.prisma
const app = Fastify({ logger: true });

// LWA readiness 用。起動直後に listen していれば通る。
app.get("/", async () => ({ ok: true }));

// invoke の payload の着地点。ここで初めて migrate を走らせる。
app.post("/events", async (_req, reply) => runMigrate(reply));

async function runMigrate(reply: FastifyReply) {
  try {
    await resolveDatabaseUrl(); // process.env.DATABASE_URL をセット
    const output = execFileSync(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
      { cwd: REPO_ROOT, env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    app.log.info({ output }, "prisma migrate deploy succeeded");
    return { ok: true, output };
  } catch (err) {
    // 失敗は握り潰さず、子プロセスの stdout/stderr も返して原因を追える形にする。
    const message = err instanceof Error ? err.message : String(err);
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
    app.log.error({ message, stdout: `${e.stdout ?? ""}`, stderr: `${e.stderr ?? ""}` }, "migrate failed");
    reply.code(500);
    return { ok: false, error: message, stdout: `${e.stdout ?? ""}`, stderr: `${e.stderr ?? ""}` };
  }
}

// 起動直後に listen（migrate はここでは走らせない）。
app.listen({ port: Number(process.env.PORT ?? 8080), host: "0.0.0.0" })
  .then(() => app.log.info("migrate lambda listening"))
  .catch((err) => { console.error(err); process.exit(1); });
```

migrate 後に**冪等な seed / backfill** を流したい場合は、`migrate deploy` 成功後に続けて呼ぶ
（新規のみ挿入・既存不変で、何度 invoke しても安全に保つ）。失敗はここでも握り潰さない。

---

## 3. Dockerfile（サーバと共有・要点）

サーバ Lambda 用の Dockerfile をそのまま使う。マイグレーション用に**追加で必要なのは CMD 差し替えだけ**
（CDK 側で行うので Dockerfile はサーバと同一で良い）。Prisma を動かすための不可欠点：

- LWA を extension として同梱（`COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:<ver> /lambda-adapter /opt/extensions/lambda-adapter`）。
- `pnpm install --frozen-lockfile --prod=false` — **prisma / tsx は devDependencies なので `--prod=false` で必ず入れる**。
  `--prod` で削ると本番イメージで `prisma` が無く migrate が動かない。
- `prisma generate --schema prisma/schema.prisma` を**ビルド時**に実行し、コンテナ OS 向けエンジンを焼き込む。
- `pg_dump` / `pg_restore` を使う予定（別アカウント移行など）があるときのみ、対応する `postgresql-client-NN` を入れる。
  マイグレーションだけなら不要。

---

## 4. CDK（マイグレーション Lambda 定義・一般化）

```ts
const migrateFn = new lambda.DockerImageFunction(this, "MigrateFn", {
  functionName: `<service>-migrate-${suffix}`, // CI の OIDC Role は名前 wildcard で invoke 許可する
  code: lambda.DockerImageCode.fromImageAsset(REPO_ROOT, {
    ...imageBuildOptions, // サーバと同じビルド設定を共有＝イメージ再ビルドされない
    cmd: ["pnpm", "--filter", "@<scope>/server", "exec", "tsx", "src/migrate.ts"], // ← CMD だけ差し替え
  }),
  architecture: lambda.Architecture.ARM_64,
  memorySize: 1024,
  timeout: cdk.Duration.minutes(15), // migrate は長くなり得るので余裕を持たせる
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  environment: {
    NODE_ENV: "production",
    PORT: "8080",
    AWS_LWA_PORT: "8080",
    AWS_LWA_READINESS_CHECK_PROTOCOL: "tcp",   // readiness は TCP で十分
    AWS_LWA_PASS_THROUGH_PATH: "/events",       // invoke payload を /events に届ける
    DB_SECRET_ARN: database.secret.secretArn,   // handler が Secrets Manager から解決
  },
});

// RDS のセキュリティグループにこの Lambda からの接続を許可し、シークレット読取を付与する。
database.connections.allowDefaultPortFrom(migrateFn, "allow migrate postgres");
database.secret.grantRead(migrateFn);

new cdk.CfnOutput(this, "MigrateFunctionName", { value: migrateFn.functionName });
```

IAM（CI 側）：GitHub OIDC の deploy Role に、この関数への `lambda:InvokeFunction` を
**関数名 wildcard（`<service>-migrate*`）**で許可しておく。stage ごとの関数名を個別列挙しなくて済む。

---

## 5. CI から invoke（GitHub Actions・成否判定が肝）

CDK deploy の**後段**で migrate Lambda を invoke する。**成否は 2 段でチェックする**：
(a) Lambda 自体のエラー `FunctionError`、(b) レスポンス body の `ok:true`。片方だけだと見逃す。

```yaml
- name: Run DB migrations (prisma migrate deploy via migration Lambda)
  run: |
    set -euo pipefail
    FN="<service>-migrate-${STAGE}"
    FN_ERROR="$(aws lambda invoke \
      --function-name "$FN" \
      --cli-binary-format raw-in-base64-out \
      --payload '{"source":"github-actions"}' \
      --query 'FunctionError' --output text \
      migrate-out.json)"

    echo "--- migration Lambda response ---"; cat migrate-out.json; echo

    # (a) Lambda 実行自体のエラー
    if [ "$FN_ERROR" != "None" ] && [ -n "$FN_ERROR" ]; then
      echo "::error::migration Lambda が FunctionError=$FN_ERROR を返しました"; exit 1
    fi
    # (b) body の ok:true（LWA pass-through で raw / escaped どちらの形でも拾う）
    if grep -q '"ok": *true' migrate-out.json || grep -q '\\"ok\\": *true' migrate-out.json; then
      echo "DB migration OK ($FN)"
    else
      echo "::error::migration が ok:true を返しませんでした（上のレスポンスを確認）"; exit 1
    fi
```

**なぜ二重チェックか**：LWA 経由の HTTP エラーは Lambda invoke としては「成功(FunctionError=None)」に見え得る。
body の `ok:true` を見ないと、migrate 失敗を素通りさせる。逆に body だけ見ても INIT 失敗等は拾えない。

---

## 6. デプロイ順序

**新コード（イメージ）を先にデプロイ → その後 migrate を invoke** の順を守る。

- 先に migrate して後からコードを入れ替えると、新カラム参照コードが来る前に古いコードが新スキーマを触る/その逆で
  一過性の 500 が出る。CDK deploy（イメージ更新）→ migrate invoke の順にすると窓が最小化する。

---

## 7. やってはいけない / ハマりどころ

- **migrate を起動時に走らせる** → readiness を塞いで invoke 失敗（§1-3）。必ず request 時。
- **`prisma migrate dev` を CI/Lambda で使う** → 非対話環境で対話を要求して失敗する。**必ず `migrate deploy`**。
- **`--prod` で prisma/tsx を削る** → イメージ内に prisma CLI が無く migrate 不能（§3）。
- **DATABASE_URL を環境変数に平文で焼く** → Secrets Manager から request 時解決に統一（§1-4）。
- **CI 成否を FunctionError だけで判定** → migrate 失敗を素通り（§5）。body の `ok:true` も見る。
- **失敗を握り潰す** → 子プロセスの stdout/stderr を必ずレスポンス/ログに出す。原因追跡が段違いに楽になる。
- **サーバと別イメージにする** → schema / 生成 Client のズレを招く。同一イメージ + CMD 差し替えを守る。
