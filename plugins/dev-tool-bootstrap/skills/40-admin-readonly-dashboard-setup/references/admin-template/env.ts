// admin 専用 email の解決。
// `ADMIN_EMAIL` env で上書き可能。未設定時はビルド時定数 (= ソースコードに焼き込まれた既知 email)。
// この email に一致する session のみ admin ルートを通過できる。
//
// 「だれを admin にするか」をプロジェクトごとに変えるためのフック。
// SaaS 多人数 admin が必要になったら、ここを「DB の `is_admin = true` 引き」等に差し替える。

const DEFAULT_ADMIN_EMAIL = "REPLACE_ME@example.com";

export function getAdminEmail(): string {
  const raw = process.env.ADMIN_EMAIL;
  return raw && raw.length > 0 ? raw : DEFAULT_ADMIN_EMAIL;
}
