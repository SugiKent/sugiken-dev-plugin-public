---
name: 86-dev-login-bypass
description: "個人開発プロジェクトで、開発環境限定の『メール認証なし簡易ログイン』(`/login/dev`) をすぐに構築するスキル。一覧から選んだ既存ユーザーへ、既存の認証パイプライン(Better Auth magic-link capture 等)を再利用して 1 クリックで実セッションを確立する。サーバ `NODE_ENV` + クライアント `import.meta.env.DEV` の多層ガードで本番には存在させない。「開発用ログイン」「dev ログイン」「/login/dev」「メール認証なしログイン」「バイパスログイン」「簡易ログイン」「magic-link capture でログイン」「ユーザー切り替えログイン」等のリクエスト時に使用。"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# 開発用簡易ログイン (`/login/dev`) 構築スキル

個人開発で認証付きアプリを作っていると、「admin で見たい」「採用担当で見たい」「CS で見たい」と **ユーザーを切り替えながら動作確認** したい場面が頻発する。だが本番同様にメールを送って magic-link を踏む運用は dev では重すぎる。

このスキルは、 **開発環境限定で「一覧から選んだ既存ユーザーへ 1 クリックでログインできる」入口 `/login/dev` を導入する** ことを目的とする。鍵は **新しい認証経路を作らないこと**。既存の本番セッション確立パイプラインをそのまま再利用し、その「入口だけ」を dev 用に差し替える。

## 前提スタック

このスキルは full-ts-template 系（個人開発の Web リファレンス）を前提に書かれている:

- サーバ: **Fastify** + **Better Auth**（`magicLink` プラグイン・`emailAndPassword` 無効）
- DB: **Prisma**（Postgres）。マルチテナントは `Organization` / `Member` / `User.platformRole`
- クライアント: **React** + **React Router** + **Vite**（`import.meta.env.DEV` が本番ビルドで静的に `false` 置換される）

スタックが違う場合（password 認証・Salesforce SSO・テナント無し等）は、後述「### プロジェクト固有の適応ポイント」に従って **入口だけ** 差し替える。**絶対方針（多層ガード・パイプライン再利用・別プレフィックス）は変えない。**

## 絶対方針

逸脱が必要だと感じたら、ユーザーに確認してから判断すること。

1. **新しい認証経路を作らない**。本番のセッション確立パイプライン（このスタックでは magic-link verify）を **そのまま** 通す。Better Auth の内部 API を叩いて Cookie を自前 set するような「近道」は禁止。実運用の無効化/削除ユーザー拒否・active organization 注入（`session.create.before`）を **バイパスしない** ため。
2. **多層ガードで本番に存在させない**。
   - サーバ: dev ログイン用プラグインを `app.ts` で `process.env.NODE_ENV !== "production"` のときだけ登録（既存の dev 分岐＝`storage` / `dev-error-log` と同じ判定に揃える）。本番では route 自体が存在せず 404。
   - クライアント: `/login/dev` ルートと `DevLoginPage` の import を `import.meta.env.DEV` で分岐。本番ビルドに **バンドルされない**（`lazy` の動的 import ごと落とす）。
   - **環境変数フラグ（`ENABLE_DEV_LOGIN` 等）を新設しない**。判定点が増えるだけ。既存の `NODE_ENV` 分岐に揃える。
3. **Better Auth catch-all と衝突しない別プレフィックス** `/api/dev/login/...` に置く。`/api/auth/*` の下に潜らせない。
4. **ボタンはアンカー遷移（full-page navigation）**。SPA の `<Link>` ではなく素の `<a href>` で遷移し、redirect 経由の `Set-Cookie` を確実に効かせる（招待受諾フローと同じ流儀）。
5. **無効化・削除ユーザーは一覧から除外し、セッション確立時も弾く**。サイレント成功にしない（存在しない userId は明示的に 400）。
6. **dev 専用ツール。E2E テストでは使わない**（CLI と同じ扱い・AGENTS.md ルール 12/13 準拠）。

## 構成（触るファイル）

```
apps/server/src/
├── auth/auth.ts                 # capture ヘルパーが無ければ追加（既にあれば再利用）
├── services/dev-login-service.ts   # ★新規: 一覧取得 + セッション確立
├── plugins/dev-login.ts            # ★新規: /api/dev/login/* の Fastify ルート
└── app.ts                          # dev 分岐に registerDevLogin(fastify) を 1 行追加

apps/client/src/
├── pages/DevLoginPage.tsx          # ★新規: ユーザー一覧 + ログインボタン
└── App.tsx                         # import.meta.env.DEV のときだけ /login/dev を登録
```

---

## Step 1: 既存のセッション確立機構を読む（書く前に読む）

**まず既存コードを読んで「本番ログインがどうセッションを張っているか」を把握する。** ここを誤ると方針 1 を破る。

```bash
# magic-link capture 機構が既にあるか（招待受諾フロー等で導入済みのことが多い）
grep -rn "createMagicLinkCapture\|takeCapturedMagicLinkUrl\|signInMagicLink\|captureKey" apps/server/src/auth
# セッション生成時のガード（無効化/削除拒否・active org 注入）
grep -rn "session:\s*{" apps/server/src/auth/auth.ts
grep -rn "create:\s*{" apps/server/src/auth/auth.ts
# dev 限定の登録分岐（ここに相乗りする）
grep -rn "NODE_ENV.*production\|registerDev" apps/server/src/app.ts
```

- **capture ヘルパーが既にある** → そのまま再利用する（Step 2 のヘルパー追加は不要）。
- **無い** → Step 2 で `auth.ts` に追加する。

## Step 2: magic-link verify URL の capture 機構（auth.ts・無ければ追加）

Better Auth の magic-link は per-call で verify URL を返さず `sendMagicLink` コールバックに渡すだけ。メール送信せず URL を **同期的に捕捉** して即 redirect するため、`metadata.captureKey` 経由のレジストリを使う。

```ts
// apps/server/src/auth/auth.ts （capture ヘルパーが無い場合のみ追加）

/**
 * magic-link verify URL のキャプチャ機構。
 * Better Auth の magic-link は URL を sendMagicLink に渡すのみで戻り値にしない。
 * captureKey を持つ呼び出しだけ「メール送信せず URL をこのレジストリへ格納」する。
 * 取り出し後は必ず削除（残留させない）。
 */
const magicLinkUrlCaptures = new Map<string, string>();

export function createMagicLinkCapture(key: string): void {
  magicLinkUrlCaptures.set(key, "");
}

export function takeCapturedMagicLinkUrl(key: string): string | null {
  const url = magicLinkUrlCaptures.get(key);
  magicLinkUrlCaptures.delete(key);
  return url === undefined || url === "" ? null : url;
}
```

`magicLink` プラグインの `sendMagicLink` 先頭に、capture 分岐を **通常ログイン分岐より前に** 置く:

```ts
magicLink({
  // ...既存設定...
  sendMagicLink: async ({ email, url, metadata }) => {
    // captureKey があればメール送信せず URL を捕捉（dev ログイン / 招待受諾の即時 redirect 用）。
    const captureKey = (metadata as { captureKey?: unknown } | undefined)?.captureKey;
    if (typeof captureKey === "string" && magicLinkUrlCaptures.has(captureKey)) {
      magicLinkUrlCaptures.set(captureKey, url);
      return;
    }
    // ...以降は通常ログイン（実メール送信・列挙防止）...
  },
}),
```

> ⚠️ `session.create.before` フック（無効化/削除拒否・active org 注入）は **触らない**。dev ログインはこのフックを通ることでセッションの正当性を本番と揃える。これが方針 1 の本体。

## Step 3: Service — `apps/server/src/services/dev-login-service.ts`（新規）

テナントコンテキストも認証コンテキストも持たない **dev 専用入口**。`listLoginableUsers`（一覧）と `establishSession`（セッション確立）の 2 つだけ。

```ts
import { randomUUID } from "node:crypto";
import { auth, createMagicLinkCapture, takeCapturedMagicLinkUrl } from "../auth/auth";
import { prisma } from "../lib/prisma";

// 組織ロールの日本語表示（プロジェクトの既存ラベルに合わせる。マルチテナントでなければ削除可）。
const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  recruiter: "採用担当",
  interviewer: "面接官",
};
const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

export type DevLoginUserEntry = {
  userId: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
};
export type DevLoginTenantGroup = {
  organizationId: string;
  organizationName: string;
  users: DevLoginUserEntry[];
};
export type DevLoginCsEntry = { userId: string; name: string; email: string };
export type DevLoginListing = { tenants: DevLoginTenantGroup[]; csUsers: DevLoginCsEntry[] };

export const DevLoginService = {
  /**
   * ログイン可能ユーザーを一覧する。無効化(disabledAt)・削除(deletedAt)は除外。
   * マルチテナントなら Member 単位で展開し組織ごとにグルーピング。CS は Member を持たない別枠。
   */
  async listLoginableUsers(): Promise<DevLoginListing> {
    const members = await prisma.member.findMany({
      where: { user: { disabledAt: null, deletedAt: null } },
      select: {
        role: true,
        organization: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: [{ organization: { name: "asc" } }, { user: { email: "asc" } }],
    });

    const groupsByOrg = new Map<string, DevLoginTenantGroup>();
    for (const m of members) {
      let group = groupsByOrg.get(m.organization.id);
      if (group === undefined) {
        group = { organizationId: m.organization.id, organizationName: m.organization.name, users: [] };
        groupsByOrg.set(m.organization.id, group);
      }
      group.users.push({
        userId: m.user.id,
        name: m.user.name ?? m.user.email,
        email: m.user.email,
        role: m.role,
        roleLabel: roleLabel(m.role),
      });
    }

    // テナント非依存の特別枠（このプロジェクトでは platformRole="cs"）。無ければこのブロックごと削除。
    const csRows = await prisma.user.findMany({
      where: { platformRole: "cs", disabledAt: null, deletedAt: null },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
    });
    const csUsers: DevLoginCsEntry[] = csRows.map((u) => ({
      userId: u.id,
      name: u.name ?? u.email,
      email: u.email,
    }));

    return { tenants: [...groupsByOrg.values()], csUsers };
  },

  /**
   * 選択ユーザーの実セッションを確立し verify URL を返す（呼び出し側が redirect）。
   * 既存の magic-link capture を再利用: 対象 email で短命リンクを発行→メール送らず URL 捕捉。
   * 存在しない/無効化/削除はここで弾いて null（サイレント成功にしない）。
   */
  async establishSession(userId: string): Promise<{ verifyUrl: string } | null> {
    if (typeof userId !== "string" || userId.length === 0) return null;

    const user = await prisma.user.findFirst({
      where: { id: userId, disabledAt: null, deletedAt: null },
      select: { email: true },
    });
    if (user === null) return null;

    const captureKey = randomUUID();
    createMagicLinkCapture(captureKey);
    let verifyUrl: string | null;
    try {
      await auth.api.signInMagicLink({
        headers: new Headers(), // サーバ起点・存在確認済みのため空でよい
        body: {
          email: user.email,
          callbackURL: "/admin", // ログイン後の遷移先。プロジェクトに合わせる
          metadata: { captureKey, kind: "dev-login" },
        },
      });
    } finally {
      // throw しても Map エントリを残さない（メモリリーク防止）
      verifyUrl = takeCapturedMagicLinkUrl(captureKey);
    }
    if (verifyUrl === null) return null; // 捕捉失敗（disableSignUp 等）。サイレントにしない
    return { verifyUrl };
  },
};
```

## Step 4: Plugin — `apps/server/src/plugins/dev-login.ts`（新規）

```ts
import type { FastifyInstance } from "fastify";
import { DevLoginService } from "../services/dev-login-service";

const DEV_LOGIN_PREFIX = "/api/dev/login";

/**
 * 開発環境限定のメール認証なしログイン用プラグイン。
 * app.ts で NODE_ENV !== "production" のときだけ登録される（多層ガードのサーバ側）。
 * Better Auth catch-all (/api/auth/*) と衝突しない別プレフィックスに置く。
 */
export function registerDevLogin(app: FastifyInstance): void {
  app.get(`${DEV_LOGIN_PREFIX}/users`, async (_req, reply) => {
    reply.send(await DevLoginService.listLoginableUsers());
  });

  app.get(`${DEV_LOGIN_PREFIX}/as`, async (req, reply) => {
    const userId = (req.query as { userId?: unknown } | undefined)?.userId;
    if (typeof userId !== "string" || userId.length === 0) {
      reply.status(400).send({ error: "userId が指定されていません" });
      return;
    }
    const result = await DevLoginService.establishSession(userId);
    if (result === null) {
      reply.status(400).send({ error: "指定ユーザーではログインできません（存在しない・無効化・削除）" });
      return;
    }
    reply.redirect(result.verifyUrl); // verify でセッション Cookie が確立する
  });
}
```

## Step 5: サーバ登録 — `apps/server/src/app.ts`（既存の dev 分岐に相乗り）

```ts
import { registerDevLogin } from "./plugins/dev-login";

// ...buildApp() 内、既に存在する dev 限定分岐に 1 行足すだけ...
if (process.env.NODE_ENV !== "production") {
  registerDevFileRoute(fastify); // 既存
  registerDevLogin(fastify);     // ★追加
}
```

## Step 6: クライアント — `apps/client/src/pages/DevLoginPage.tsx`（新規）

`/api/dev/login/users` を fetch して一覧表示。各行の「ログイン」は **素の `<a href>`**（full-page navigation）で `/api/dev/login/as?userId=...` へ。デザインはプロジェクトの `docs/DESIGN.MD` のトークン（`bg-surface` / `text-foreground` 等）に合わせる。

```tsx
import { useEffect, useState } from "react";

type DevLoginUserEntry = { userId: string; name: string; email: string; role: string; roleLabel: string };
type DevLoginTenantGroup = { organizationId: string; organizationName: string; users: DevLoginUserEntry[] };
type DevLoginCsEntry = { userId: string; name: string; email: string };
type DevLoginListing = { tenants: DevLoginTenantGroup[]; csUsers: DevLoginCsEntry[] };

export function DevLoginPage() {
  const [listing, setListing] = useState<DevLoginListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/dev/login/users");
        if (!res.ok) throw new Error(`一覧の取得に失敗しました (${res.status})`);
        const data = (await res.json()) as DevLoginListing;
        if (active) setListing(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "一覧の取得に失敗しました");
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">開発用ログイン</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            開発環境限定です。メール認証を経ずに、選んだユーザーのセッションを確立します。
          </p>
        </header>

        {error !== null && <p aria-live="polite" className="text-sm text-danger">{error}</p>}
        {listing === null && error === null && <p className="text-sm text-muted-foreground">読み込み中…</p>}

        {listing !== null && (
          <div className="flex flex-col gap-8">
            {listing.tenants.map((group) => (
              <section key={group.organizationId}>
                <h2 className="mb-3 text-sm font-semibold text-foreground">{group.organizationName}</h2>
                <ul className="flex flex-col gap-2">
                  {group.users.map((user) => (
                    <DevLoginRow key={`${group.organizationId}:${user.userId}`}
                      name={user.name} email={user.email} sub={user.roleLabel} userId={user.userId} />
                  ))}
                </ul>
              </section>
            ))}

            {listing.csUsers.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-foreground">CS（プラットフォーム）</h2>
                <ul className="flex flex-col gap-2">
                  {listing.csUsers.map((cs) => (
                    <DevLoginRow key={`cs:${cs.userId}`} name={cs.name} email={cs.email} sub="CS" userId={cs.userId} />
                  ))}
                </ul>
              </section>
            )}

            {listing.tenants.length === 0 && listing.csUsers.length === 0 && (
              <p className="text-sm text-muted-foreground">ログイン可能なユーザーがいません。</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function DevLoginRow(props: { name: string; email: string; sub: string; userId: string }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{props.name}</p>
        <p className="truncate text-xs text-muted-foreground">{props.email} ・ {props.sub}</p>
      </div>
      {/* full-page navigation（SPA Link ではなく素の anchor）で Set-Cookie を効かせる */}
      <a href={`/api/dev/login/as?userId=${encodeURIComponent(props.userId)}`}
        className="shrink-0 rounded-[var(--radius-card)] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        ログイン
      </a>
    </li>
  );
}
```

## Step 7: ルート登録 — `apps/client/src/App.tsx`（dev ビルド限定）

`import.meta.env.DEV` は本番ビルドで静的に `false` 置換されるため、`lazy` 自体が評価されず `DevLoginPage` の動的 import がバンドルに含まれない。

```tsx
import { Suspense, lazy } from "react";

// 本番ビルドでは import.meta.env.DEV が false に置換され、この lazy ごと落ちる（多層ガードのクライアント側）。
const DevLoginPage = import.meta.env.DEV
  ? lazy(() => import("@/pages/DevLoginPage").then((m) => ({ default: m.DevLoginPage })))
  : null;

// ...<Routes> 内、公開ルート付近に...
{import.meta.env.DEV && DevLoginPage !== null && (
  <Route
    path="/login/dev"
    element={
      <Suspense fallback={null}>
        <DevLoginPage />
      </Suspense>
    }
  />
)}
```

## Step 8: 多層ガードをテストで固定する

「本番相当ではエンドポイントが存在しない / セッション確立が無効化ユーザーを弾く」を **意図として** テストする（AGENTS.md ルール 8）。

- `plugins/dev-login.test.ts`: `NODE_ENV` を `production` にして `buildApp()` → `GET /api/dev/login/users` が 404、`development` では 200 になること。
- `services/dev-login-service.test.ts`: `establishSession` が存在しない userId / 無効化(`disabledAt`) / 削除(`deletedAt`) ユーザーで `null` を返すこと。有効ユーザーで `verifyUrl` を返すこと。一覧が無効化/削除を除外し、テナントごと + CS 別枠でグルーピングすること。

---

## プロジェクト固有の適応ポイント

スタックが前提と違う場合、**入口だけ** 差し替える。方針（多層ガード・パイプライン再利用・別プレフィックス・full-page 遷移）は不変。

- **認証が magic-link でない（password / SSO 等）**: Step 2 の capture は使わず、`establishSession` を「本番ログインが Cookie を張る経路」に置き換える。例えば password 認証なら `auth.api.signInEmail` 相当を dev 既知パスワードで呼ぶ。**本番のセッション発行 API を通すこと**（自前 Cookie 生成はしない）。Salesforce SSO 等で外部 IdP 必須なら、dev 用の Better Auth credential provider を別途用意する設計判断が要る → ユーザーに確認する。
- **マルチテナントでない（Organization / Member が無い）**: `listLoginableUsers` を `prisma.user.findMany({ where: { disabledAt: null, deletedAt: null } })` のフラットな一覧にし、`tenants` グルーピングと CS 別枠を削る。`DevLoginListing` も単純な配列にする。
- **CS / platformRole が無い**: Service と Page の CS セクションを丸ごと削除する。
- **無効化/削除カラムが無い**: `disabledAt` / `deletedAt` の where 条件を、プロジェクトの「ログイン可能」判定（例: `status: "active"`）に置き換える。**「全ユーザーが対象」で済ませず、本番のログイン可否条件に揃える**。
- **クライアントが Vite でない（Next.js 等）**: `import.meta.env.DEV` を `process.env.NODE_ENV !== "production"` 相当に置き換え、本番ビルドに **コードが含まれない** ことを必ず確認する（tree-shaking されない場合はルート定義ごと分岐で落とす）。

## 実装手順まとめ

1. **読む**: Step 1 のコマンドで既存のセッション確立機構と dev 分岐を把握する。
2. capture が無ければ Step 2 で `auth.ts` にヘルパー + `sendMagicLink` 分岐を追加。
3. Step 3〜4 で Service / Plugin を新規作成。
4. Step 5 / 7 で `app.ts`（サーバ）と `App.tsx`（クライアント）に dev 限定登録を 1 箇所ずつ追加。
5. Step 6 で `DevLoginPage` を作成。文言・色は `docs/DESIGN.MD` に従う。
6. Step 8 で多層ガードと除外ロジックをテストで固定。
7. `tsc --noEmit` を server / client それぞれで通す。
8. dev サーバを起動し `/login/dev` を開いて、各ユーザーで実際にログインできることを手で確認する。

## やってはいけないこと

- **Better Auth の内部 API でセッションを直接 insert して Cookie を自前 set する**: `session.create.before` の無効化/削除拒否・active org 注入をバイパスし、dev だけ本番と挙動が乖離する。必ず verify URL を踏ませる。
- **`/api/auth/*` の下に dev route を潜らせる**: Better Auth catch-all と衝突する。別プレフィックス必須。
- **SPA の `<Link>` でログインボタンを作る**: redirect 経由の `Set-Cookie` が効かず「押しても入れない」になる。素の `<a href>`。
- **`ENABLE_DEV_LOGIN` 等の環境変数フラグを新設する**: 判定点が増える。既存の `NODE_ENV` / `import.meta.env.DEV` 分岐に揃える。
- **存在しない/無効化ユーザーをサイレントに 200 で流す**: 明示的に 400 / `null` を返す（AGENTS.md ルール 10）。
- **E2E テストでこの入口を使う**: dev 専用ツール。E2E は本番同等の経路（招待→magic-link 等）で書く（AGENTS.md ルール 12/13・CLI と同じ扱い）。
- **cloudflared 公開時の `BETTER_AUTH_URL`**: verify URL の origin は `BETTER_AUTH_URL` 基準。公開して試すときはこれを公開オリジンに合わせないと redirect 先がローカルを指す（招待フローと共通の運用前提）。本スキルの対象外だが、ハマったらここを疑う。
