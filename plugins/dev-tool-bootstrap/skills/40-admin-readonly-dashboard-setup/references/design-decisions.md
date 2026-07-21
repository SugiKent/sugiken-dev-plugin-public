# 設計判断と「なぜ」

この admin 構成は、 個人開発 / 小規模 SaaS で「自分（運用者）だけが state を覗く」ための最小構成。 攻撃面を極限まで削るために以下の判断が積まれている。

## 1. 認証は better-auth magic link（passwordless）

- パスワード管理コスト・漏洩リスクなし
- 受信できる人 = ADMIN_EMAIL を握っている人 (= 自分)
- 2FA を別途張らなくても「メール受信できる」が事実上の 2nd factor
- 招待・ユーザ登録 UI 不要

## 2. 認可は ADMIN_EMAIL 一致（一人 admin）

- 「役割」「権限」「組織」のテーブルを増やさない
- env var で運用上 admin を差し替え可能
- 多人数 admin が必要になったら DB の `is_admin` flag 引きに昇格する (→ `env.ts` を差し替え)

## 3. 拒否時はすべて 404（存在秘匿）

| 状況 | 普通の選択 | このスキルの選択 | 理由 |
|---|---|---|---|
| 未認証で `/admin` を叩く | 401 + Login へリダイレクト | 404 | admin の存在を漏らさない |
| ADMIN_EMAIL じゃない session で叩く | 403 Forbidden | 404 | 一般ユーザに「admin が存在する」と教えない |
| 不正な URL を叩く | 404 (= 同じ) | 404 | 区別できない方が良い |
| POST/PUT/DELETE を投げる | 405 Method Not Allowed | 404 | 「ここに何かがある」と教えない |

「admin がそこにいる」事実そのものが攻撃の引き金になる。 全部 404 で潰す。

## 4. `/admin/login` は GET 1 本で magic link を発射する

普通の magic link は「フォームに email を入力 → POST → メールが届く」。 この設計だと:

- フォームが攻撃面 (CSRF, XSS, email enumeration)
- メール宛先がリクエストで操作できる (open relay リスク)

このスキルでは:

- フォームなし。 GET `/admin/login` を叩くだけで `ADMIN_EMAIL` (= 不変) に magic link が出る
- レスポンスは 404 (= ボタンの存在を隠す)
- 自分の URL を bookmark すればワンクリックでログインメールが届く
- 第三者が叩いても自分の inbox にしか届かない (= 害なし)

## 5. HTML レンダリングはタグドテンプレで自前

- React や Pug など外部テンプレを入れない
- バンドルゼロ、 SSR ゼロ、 JS ランタイムゼロ
- `html\`...\`` の interpolation は **全自動で escape**
- 例外を `raw()` で明示通すので、 grep で危険箇所が一発で出る
- 同期レンダリング → 単体テストが速い

## 6. レスポンスに restrictive CSP / X-Frame-Options を貼る

```
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; ...
X-Frame-Options: DENY
Cache-Control: private, no-store
Referrer-Policy: no-referrer
```

万一 XSS sink を作っても外部スクリプトロードを止める / iframe 埋め込みを止める / 履歴に PII を残さない。

## 7. READ-only catch-all で書き込みルート追加を機械的に塞ぐ

router の末尾に `adminRouter.all(/.*/, () => 404)` を置く。 これより上に書き込みルートを追加できる **仕様** ではあるが、 「READ-only である」をレビュー基準に置くための signaling。 PR で `adminRouter.post/.put/.delete` が出てきたら必ず止める。

## 8. クエリは Prisma の `select:` で必要列のみ

- 監査ログ的に「何を読んだか」が明確
- secret column (password hash, api token, oauth refresh token 等) を間違って画面に出さない
- `take:` を必ず付け、 全件返さない (= タイムアウトと dump 抑止)

## 9. URL パラメータの validation を厳密に

`event` / `fingerprint` / `id` の path / query は次のいずれかで必ず潰す:

- 文字種 regex (例: `[a-zA-Z0-9._-]{1,100}`)
- 長さ上限 (`.slice(0, 100)`)
- enum 一致 (`"24h" | "7d" | "30d"`)

外れたら 404 (= 形式エラーすら漏らさない)。 admin 経路は通常導線にないので、 不正なクエリ = ほぼ probe。

## 10. ログは `event: "admin.*"` で粒度を揃える

```
admin.access       — 成功通過
admin.rejected     — 拒否（reason: no_session / not_admin）
admin.login.send_failed — magic link 送信失敗
```

production の log を grep するときに admin 経路だけを抽出できる。 不審アクセスは `admin.rejected` の量で検知する。
