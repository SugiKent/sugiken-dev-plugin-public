// HTML レンダリング基盤。
// - タグドテンプレ `html\`...\`` で auto-escape されたチャンクを組み立てる
// - エスケープ回避は `raw()` を明示的に通す (= 危険箇所がレビューで grep できる)
// - layout は restrictive CSP / X-Frame-Options DENY / Cache-Control private で固める
// - 依存は express の Response 型だけ。 ORM / app domain 知識ゼロ。

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const RAW_BRAND = Symbol("admin.raw");

type RawHtml = { readonly [RAW_BRAND]: true; readonly value: string };

function isRaw(v: unknown): v is RawHtml {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<symbol, unknown>)[RAW_BRAND] === true
  );
}

export function raw(s: string): RawHtml {
  return { [RAW_BRAND]: true, value: s };
}

type Interpolatable =
  | string
  | number
  | boolean
  | null
  | undefined
  | RawHtml
  | readonly Interpolatable[];

function renderValue(v: Interpolatable): string {
  if (v === null || v === undefined || v === false || v === true) return "";
  if (isRaw(v)) return v.value;
  if (Array.isArray(v)) {
    return (v as readonly Interpolatable[]).map(renderValue).join("");
  }
  if (typeof v === "number") return escapeHtml(String(v));
  if (typeof v === "string") return escapeHtml(v);
  return "";
}

export function html(
  strings: TemplateStringsArray,
  ...values: Interpolatable[]
): RawHtml {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += renderValue(values[i]);
  });
  return raw(out);
}

const baseCss = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    margin: 0;
    background: #f6f6f4;
    color: #1c1c1c;
  }
  header {
    padding: 12px 24px;
    background: #1c1c1c;
    color: #f6f6f4;
    display: flex;
    gap: 16px;
    align-items: baseline;
  }
  header a { color: #f6f6f4; text-decoration: none; }
  header a:hover { text-decoration: underline; }
  header .brand { font-weight: 600; margin-right: 12px; }
  main { padding: 24px; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  table { border-collapse: collapse; width: 100%; background: #fff; font-size: 13px; }
  th, td { border: 1px solid #e4e4e0; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f0efec; font-weight: 600; }
  tr:nth-child(even) td { background: #fafaf8; }
  code, pre, .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
  pre {
    background: #1c1c1c;
    color: #f6f6f4;
    padding: 12px;
    border-radius: 4px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .sparkline { font-size: 18px; letter-spacing: 1px; line-height: 1; }
  .card { background: #fff; border: 1px solid #e4e4e0; padding: 16px; border-radius: 4px; margin-bottom: 16px; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; background: #e4e4e0; font-size: 11px; }
  .badge-warn { background: #ffe9b8; }
  .badge-err { background: #ffd4d4; }
  .muted { color: #888; }
  ul.menu { list-style: none; padding: 0; }
  ul.menu li { margin: 8px 0; }
  ul.menu a { font-size: 15px; }
  .filter { margin-bottom: 12px; }
  .filter a { margin-right: 8px; }
  .filter a.active { font-weight: 700; }
`;

// 追加セクションを生やしたら navLinks に足す。
const navLinks: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Home" },
  { href: "/admin/users", label: "Users" },
];

export function layout(title: string, body: RawHtml): RawHtml {
  return raw(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · admin</title>
<style>${baseCss}</style>
</head>
<body>
<header>
  <span class="brand">admin</span>
  ${navLinks
    .map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`)
    .join("\n  ")}
</header>
<main>
<h1>${escapeHtml(title)}</h1>
${body.value}
</main>
</body>
</html>`);
}

export function renderHtml(
  res: import("express").Response,
  page: RawHtml,
): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  );
  res.type("html").send(page.value);
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

// 数値 bucket を ASCII (Unicode block) で棒グラフ化する。
// HTML inert な文字のみで構成すること (raw 出力するため)。
const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export function renderSparkline(buckets: readonly number[]): string {
  if (buckets.length === 0) return "";
  const max = Math.max(...buckets);
  if (max === 0) return SPARK_CHARS[0].repeat(buckets.length);
  return buckets
    .map((v) => {
      if (v <= 0) return " ";
      const ratio = v / max;
      const idx = Math.min(
        SPARK_CHARS.length - 1,
        Math.max(0, Math.ceil(ratio * SPARK_CHARS.length) - 1),
      );
      return SPARK_CHARS[idx];
    })
    .join("");
}
