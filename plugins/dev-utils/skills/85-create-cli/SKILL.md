---
name: 85-create-cli
description: "個人開発プロジェクトで、アプリケーション動作確認のための初歩的なデータ作成や、ワーカー実行のキック等を行うための簡易 CLI を作成するスキル。`pnpm cli help` でヘルプが表示され、サブコマンド方式でデータ投入やジョブ実行を行う。「CLI」「cli 作成」「pnpm cli」「動作確認 CLI」「データ作成 CLI」「worker キック」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# 動作確認用 CLI 作成スキル

個人開発プロジェクトでは、開発中に「テストユーザーを 1 件作る」「特定のワーカーをローカルで 1 回だけ走らせる」といった軽い操作を頻繁に行う。これらを毎回 REPL や SQL で叩くのは効率が悪く、curl / Postman もセットアップが面倒。

このスキルは、 **そういった『動作確認のための初歩的な操作』を `pnpm cli <subcommand>` の形で実行できる CLI を導入する** ことを目的とする。

## 絶対方針

このスキルで作る CLI は、以下の構造に **必ず** 従う。例外を入れない（プロジェクト側の事情で逸脱が必要だと感じたら、ユーザーに確認してから判断する）。

1. **配置は monorepo root 直下の `DevScripts/` ディレクトリ**。`apps/` でも `packages/` でもない workspace 非参加ディレクトリにする。CLI は「アプリの一部」ではなく「運用補助スクリプト」として構造上で切り分ける。
2. **依存は monorepo root の `devDependencies` に集約**。`DevScripts/` 側に独立した node_modules を持たせない（`pnpm install` 1 発で済む状態を保つ）。
3. **エントリは `pnpm cli` の 1 コマンドだけ**。サブコマンド (`invite` / `message` / `picks` 等) で実行内容を切り替える。
4. **オプション解析は `node:util` の `parseArgs`**。`commander` / `yargs` / `oclif` 等の外部ライブラリは入れない。
5. **DB 書き込みは server / worker 側の既存ロジックを踏襲する**。CLI 内で route の transaction を写し取って使い、socket emit など CLI プロセス外で意味のない副作用だけを落とす。
6. **worker ジョブの実行は `spawn("pnpm", ["--filter", "<workspace>", "<script>"])` で子プロセス起動する**。CLI から worker 関数を import しない（workspace 解決と副作用ラッパーの分離のため）。
7. **本番環境で実行しない前提**。dev 専用のツール。

## ファイル構成

```
DevScripts/
├── package.json          # { "type": "module" } のみ。deps は持たない
├── tsconfig.json         # ../packages/typescript-config/node.json を相対 extend
├── cli.ts                # エントリ。サブコマンドを dispatch するだけ
├── commands/             # サブコマンドごとに 1 ファイル
│   ├── issueInvite.ts
│   ├── sendMessage.ts
│   └── runPicks.ts
└── lib/                  # prisma client / user resolver など共通
    ├── prisma.ts
    └── resolveUser.ts
```

### `DevScripts/package.json`

```json
{
  "name": "dev-scripts",
  "private": true,
  "version": "0.0.0",
  "type": "module"
}
```

`dependencies` は書かない。`@prisma/client` などは root から解決させる。

### `DevScripts/tsconfig.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../packages/typescript-config/node.json",
  "include": ["cli.ts", "commands/**/*.ts", "lib/**/*.ts"]
}
```

プロジェクトに `packages/typescript-config` がなければ、相応する node 用 base tsconfig を相対 extend する。

## root の `package.json` に追加するもの

```jsonc
{
  "scripts": {
    "cli": "tsx --env-file-if-exists=.env DevScripts/cli.ts"
  },
  "devDependencies": {
    "@prisma/client": "<project-pinned-version>",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0"
  }
}
```

- `@prisma/client` のバージョンはプロジェクトの prisma 版に合わせる
- `tsx` は **root の devDeps に置く**（workspace から借りない）

## エントリ雛形 — `DevScripts/cli.ts`

```ts
import { parseArgs } from "node:util"
import { issueInvite } from "./commands/issueInvite"
import { runPicks } from "./commands/runPicks"
import { sendMessage } from "./commands/sendMessage"
import { disconnect } from "./lib/prisma"

const USAGE = `Usage: pnpm cli <command> [options]

Commands:
  invite     Issue invitation code(s)
  message    Send a conversation message to a target user
  picks      Run the daily recommendations compute job
  help       Show this message
`

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${name} is required`)
  }
  return value
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE)
    return
  }

  switch (command) {
    case "invite": {
      const { values } = parseArgs({
        args: rest,
        options: {
          issuer: { type: "string" },
          "expires-in": { type: "string" },
          count: { type: "string" },
        },
        allowPositionals: true,
      })
      await issueInvite({
        // exactOptionalPropertyTypes: conditional spread でキーを生やす
        ...(typeof values.issuer === "string" ? { issuer: values.issuer } : {}),
        expiresInHours: values["expires-in"] ? Number(values["expires-in"]) : 24 * 30,
        count: values.count ? Number(values.count) : 1,
      })
      return
    }
    case "message": {
      const { values } = parseArgs({
        args: rest,
        options: {
          to: { type: "string" },
          message: { type: "string" },
          from: { type: "string" },
        },
        allowPositionals: true,
      })
      await sendMessage({
        to: requireString(values.to, "to"),
        message: requireString(values.message, "message"),
        ...(typeof values.from === "string" ? { from: values.from } : {}),
      })
      return
    }
    case "picks": {
      await runPicks()
      return
    }
    default:
      console.error(`unknown command: ${command}\n`)
      console.log(USAGE)
      process.exitCode = 1
  }
}

main()
  .catch((err: unknown) => {
    console.error(`[cli] error: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnect()
  })
```

## lib 雛形

### `DevScripts/lib/prisma.ts`

```ts
import { PrismaClient } from "@prisma/client"

export const prisma = new PrismaClient()

export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}
```

### `DevScripts/lib/resolveUser.ts`

`email` でも `id` でも user を引けるヘルパー。プロジェクトのスキーマに合わせて調整する。

```ts
import { prisma } from "./prisma"

export async function resolveUser(idOrEmail: string) {
  const value = idOrEmail.trim()
  if (!value) throw new Error("user identifier is empty")
  const user = value.includes("@")
    ? await prisma.user.findUnique({ where: { email: value }, select: { id: true, email: true } })
    : await prisma.user.findUnique({ where: { id: value }, select: { id: true, email: true } })
  if (!user) throw new Error(`user not found: ${value}`)
  return user
}
```

## worker ジョブ呼び出しの雛形 — `DevScripts/commands/runPicks.ts`

```ts
import { spawn } from "node:child_process"
import { resolve } from "node:path"

export async function runPicks(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, "..", "..")
  await new Promise<void>((ok, ng) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@repo/worker", "compute-recommendations"],
      { cwd: repoRoot, stdio: "inherit", env: process.env },
    )
    child.on("error", ng)
    child.on("exit", (code) =>
      code === 0 ? ok() : ng(new Error(`compute-recommendations exited with code ${code}`)),
    )
  })
}
```

- worker 側に既に存在する script (`pnpm --filter @repo/worker compute-recommendations` 等) をそのまま叩く
- import しない。プロセス分離することで Sentry / pino / DB プールを CLI 側に汚染させない

## DB 書き込みコマンドを足すときの規約

CLI 内で `prisma.conversation.create` 等を直接書く場合、**対応する server route のソースを開いて、その transaction ブロックの中身を CLI 用に写す**。具体的には:

- ペア id の正規化（`userAId < userBId` など）
- 楽観ロック相当の where 句（`where: { status: "pending", firstReplyAt: null }` で `updateMany`）
- 副次的な Notification 作成

これらを丸ごと写し、**socket emit / SSE push だけを削る**（CLI プロセス外なので意味がない）。サービス層の関数があるならそれを import して呼ぶ方が綺麗だが、route ハンドラ内に直接書かれている transaction は CLI から再利用できないので写すしかない。

## サブコマンド命名規則

- **動詞ベースの単語 1〜2 個**: `invite` / `message` / `picks` / `seed` 等
- **`<verb>:<entity>` 形式は使わない**（前バージョンの規約から変更）。`parseArgs` のサブコマンド扱いと相性が悪いため、フラットな単語にする
- 最初は 1〜3 個で十分。必要になったら都度追加する

## 実装手順

1. `DevScripts/` を作成し、`package.json` / `tsconfig.json` を上記雛形で配置する
2. root の `package.json` に `cli` script と `tsx` / `@types/node` / `@prisma/client` を追加する
3. `pnpm install` を root から実行する
4. `cli.ts` / `lib/prisma.ts` / 最初のサブコマンド 1 個を実装する
5. `pnpm cli help` を実行して動作確認する
6. `pnpm cli <最初のサブコマンド>` で end-to-end の動作を確認する
7. `tsc --noEmit` を `DevScripts/` 内で回して型が通ることを確認する
8. プロジェクトの AGENTS.md / README に「`pnpm cli help` を見ろ」と 1 行追記する

## 注意事項

- **CLI フレームワークを足さない**: `commander` / `yargs` / `oclif` 等は不要。`node:util` の `parseArgs` で完結する
- **`exactOptionalPropertyTypes: true` 環境では conditional spread**: parseArgs の戻り値は `string | undefined` なので、optional プロパティを持つ option 型に渡すときは `...(typeof values.x === "string" ? { x: values.x } : {})` でキーを生やす
- **本番環境で実行しないこと前提**: 認可チェックを省くなど、dev 専用の前提を CLI 内で堂々と置いてよい
- **既存のサービス層 / route ロジックを踏襲する**: CLI 内で独自の書き込み順序を作らない
- **socket / SSE / push などプロセス外通信は呼ばない**: CLI からは DB だけ更新し、リアルタイム通知は省く
