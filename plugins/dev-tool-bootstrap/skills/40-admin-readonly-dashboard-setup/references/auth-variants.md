# 認証方式の差し替え

このスキルのデフォルトは **better-auth の magic link plugin** を使う前提。 これは「passwordless + 自分のメールが事実上の 2nd factor」が個人開発で最強コストパフォーマンスだから。

ただし他の認証方式に乗せ替える場合の指針を以下に置く。

## どの方式でも変えてはいけないこと

1. **拒否レスポンスは常に 404** (401/403 を使わない)
2. **ADMIN_EMAIL 一致チェックは認可層で必ず通す** (= `requireAdmin` 相当の middleware が必要)
3. **`/admin/login` 相当のエントリは、入力をクエリから受け取らない** (enumeration / open relay 防止)
4. **ログ event 名は `admin.access` / `admin.rejected` / `admin.login.*`** に揃える

## (1) better-auth magic link (default)

server で `auth.ts` 等に:

```ts
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";

export const auth = betterAuth({
  database: ...,                       // prisma adapter / drizzle adapter
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMail(email, "Admin login", `Login: ${url}`);
      },
    }),
  ],
});
```

`/admin/login` で `auth.api.signInMagicLink({ body: { email, callbackURL } })` を呼ぶ。

## (2) better-auth Email OTP

magic link メールが届かない端末（社内 SMTP 制限など）向け。 6 桁 OTP をメールで送り、 admin 側で手で入力する。 ただし入力フォームが必要になる → `/admin/login` の 404 stealth が崩れる。 trade-off。

```ts
import { emailOTP } from "better-auth/plugins/email-otp";

plugins: [
  emailOTP({
    sendVerificationOTP: async ({ email, otp, type }) => {
      await sendMail(email, "Admin OTP", `Code: ${otp}`);
    },
  }),
];
```

`/admin/login` は GET で OTP 発射 + 404、 別経路（404 を返さない場所 = trade-off）に OTP 入力フォームを置く。

## (3) Basic Auth（最小実装）

メール送信インフラが無い / 完全 offline で運用したい場合。

```ts
// admin/middleware.ts のみで完結。 better-auth 不要。
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  const expected =
    "Basic " +
    Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString("base64");
  if (!header || header !== expected) {
    res.status(404).type("html").send("<h1>Not Found</h1>");
    return;
  }
  next();
}
```

**注意**: ブラウザの Basic Auth ダイアログは「ここに認証要求がある = admin 存在の漏洩」を完全には隠せない (`WWW-Authenticate` を返さないと 404 のまま終わる)。 401 を返さずに 404 のまま return すると、 ブラウザ側で credentials prompt が出ないため UX 不便。 → Basic Auth 採用時はステルス性を捨てる。

ADMIN_USER / ADMIN_PASS は **bcrypt / argon2 ハッシュで保存し、 比較は `timingSafeEqual`** を使う。

## (4) Cloudflare Access / IAP (zero-trust 前段)

ルート全体を Cloudflare Access の access-policy で守る。 アプリ側は受け取った `CF-Access-Authenticated-User-Email` ヘッダで認可するだけ。

```ts
export async function requireAdmin(req, res, next) {
  const email = req.header("CF-Access-Authenticated-User-Email");
  if (!email || email !== getAdminEmail()) {
    res.status(404).type("html").send("<h1>Not Found</h1>");
    return;
  }
  next();
}
```

- Pros: 認証ロジック自前で書かなくて済む。 デバイス証明 / IP allowlist / 2FA を Cloudflare 側で組める。
- Cons: ベンダロックイン。 ローカル dev で動かすには bypass 経路が必要 (= 漏らすと事故)。

## (5) OAuth (GitHub / Google) で単一 admin

better-auth の OAuth plugin を使い、 「OAuth 完了後の email が ADMIN_EMAIL 一致のときだけ session を発行」する。

```ts
plugins: [
  oauth({
    google: { clientId, clientSecret },
    onProfile: async (profile) => {
      if (profile.email !== getAdminEmail()) {
        throw new Error("not admin");  // session を作らせない
      }
      return { id: profile.sub, email: profile.email };
    },
  }),
];
```

`/admin/login` を一切作らず、 `/api/auth/google` のような既存 OAuth エントリを admin 自身が叩いて入る運用も可能。

## 多人数 admin が必要になったら

`getAdminEmail()` を返す関数を「admin email list の `Set` を返す」関数に変える:

```ts
// env.ts
export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim());
  return list.length > 0 && list.includes(email);
}
```

middleware:

```ts
if (!isAdminEmail(session.user.email)) { notFound(res); return; }
```

それでも email 一致だけに留め、 DB の `is_admin` flag に昇格させるのは「人が 5 人以上」を超えてから。
