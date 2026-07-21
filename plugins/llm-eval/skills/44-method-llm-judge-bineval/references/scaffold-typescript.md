# TypeScript スキャフォールド

BINEVAL 本体は **`eval/llm` アダプタの `askJSON()` だけ** を呼ぶ。プロバイダ差はアダプタに閉じる（検知と配線は `detect-and-wire-llm.md`）。以下は土台。プロジェクトの module 形式(ESM/CJS)・TS 設定に合わせて調整する。

## `eval/config.ts`

検知した既存 LLM を保持する（詳細 `detect-and-wire-llm.md`）。

```ts
export type Dimension = string;
export const config = {
  provider: "openai",           // 検知したプロバイダ（例: openai / anthropic / google / bedrock ...）
  judgeModel: "gpt-4.1-mini",   // 検知した現行モデル（運用/評価者）
  referenceModel: "gpt-4.1",    // 任意: cross-model 用の上位モデル。無ければ judgeModel と同じ
  genModel: "gpt-4.1",          // self-update で被評価出力を生成するモデル（通常は本番生成モデル）
  dimensions: ["coherence", "consistency", "fluency", "relevance"] as Dimension[],
  scale: [1, 5] as [number, number], // 表示スケール [a,b]。0-1 のままなら [0,1]
  runs: 1,          // 厳密比較は 2（2回平均）
  maxIter: 2,       // Phase3 反復上限。効果は 1-2 反復に集中。held-out 信号あれば early stopping
  maxLessons: 10,   // dedup 後に保持する教訓の上限
  epsilon: 0.05,    // cross-model 終了条件 |S_tgt - S_src| < eps
  concurrency: 4,
};
```

## `eval/llm.ts`（判定役 LLM（judge）アダプタ / プロバイダ依存はここだけ）

`detect-and-wire-llm.md` の契約に従う。 **既存ラッパーがあればそれを再利用**。無ければ検知プロバイダの SDK で薄く実装。返すのは schema に沿ってパース済みのオブジェクト。

```ts
// 契約: askJSON({model, system, user, schema, temperature}) -> object（パース済み）
// 例1: 既存ラッパー再利用（最優先）
import { callModel } from "../src/lib/llm";
export async function askJSON({ model, system, user, schema, temperature = 0 }:
  { model: string; system: string; user: string; schema: unknown; temperature?: number }) {
  const text = await callModel({ model, system, user, responseFormat: "json", temperature });
  return JSON.parse(text);
}

// 例2: 新規に薄く（OpenAI の場合）
// import OpenAI from "openai";
// const client = new OpenAI();
// export async function askJSON({ model, system, user, schema, temperature = 0 }) {
//   const r = await client.chat.completions.create({ model, temperature,
//     response_format: { type: "json_schema", json_schema: { name: "out", schema, strict: true } },
//     messages: [{ role: "system", content: system }, { role: "user", content: user }] });
//   return JSON.parse(r.choices[0].message.content!);
// }
```

Anthropic を使うプロジェクトなら `output_config.format` を使う（`detect-and-wire-llm.md` 参照）。

## `eval/meta-prompt.ts`

`references/meta-prompt.md` の本文を定数化（タスク非依存・不変）。`{{TASK_PROMPT}}` `{{DIMENSIONS}}` を差し込む。

```ts
export const META_PROMPT = `あなたは LLM-as-a-Judge の評価基準を設計する専門家です。... (meta-prompt.md 本文) ...`;
export const buildMetaPrompt = (t: string, dims: string[]) =>
  META_PROMPT.replace("{{TASK_PROMPT}}", t).replace("{{DIMENSIONS}}", dims.join(" / "));
```

## `eval/generate-questions.ts`（Phase 1）

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { askJSON } from "./llm";
import { buildMetaPrompt } from "./meta-prompt";

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    requirements: { type: "array", items: { type: "object", properties: {
      id: { type: "string" }, dimension: { type: "string" }, text: { type: "string" } },
      required: ["id", "dimension", "text"], additionalProperties: false } },
    questions: { type: "array", items: { type: "object", properties: {
      id: { type: "string" }, dimension: { type: "string" }, requirement_id: { type: "string" },
      text: { type: "string" }, violation_example: { type: "string" } },
      required: ["id", "dimension", "requirement_id", "text", "violation_example"], additionalProperties: false } },
  },
  required: ["requirements", "questions"], additionalProperties: false,
} as const;

export async function generateQuestions() {
  const taskPrompt = fs.readFileSync(path.join("eval", "task-prompt.md"), "utf8");
  const data: any = await askJSON({
    model: config.referenceModel,   // 質問生成は上位モデルで（無ければ judgeModel）
    system: "出力は指定 JSON スキーマに厳密に従うこと。",
    user: buildMetaPrompt(taskPrompt, config.dimensions),
    schema: QUESTION_SCHEMA,
  });
  const byDim: Record<string, any[]> = {};
  for (const q of data.questions) (byDim[q.dimension] ??= []).push(q);
  fs.mkdirSync(path.join("eval", "questions"), { recursive: true });
  for (const [dim, qs] of Object.entries(byDim))
    fs.writeFileSync(path.join("eval", "questions", `${dim}.json`),
      JSON.stringify({ dimension: dim, questions: qs }, null, 2));
  return data;
}
```

## `eval/evaluate.ts`（Phase 2）

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { askJSON } from "./llm";

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string", enum: ["yes", "no"] }, explanation: { type: "string" } },
  required: ["answer", "explanation"], additionalProperties: false,
} as const;

export type Question = { id: string; dimension: string; text: string; violation_example: string };
export function loadQuestions(): Question[] {
  const dir = path.join("eval", "questions");
  return fs.readdirSync(dir).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).questions);
}

async function askOne(model: string, x: string, y: string, q: Question) {
  return askJSON({
    model,
    system: `あなたは厳密な二値評価者です。次の 1 つの Yes/No 質問だけを独立に判定します。他の観点は考慮しません。
質問: ${q.text}
違反例（この場合 "no"）: ${q.violation_example}`,
    user: `# 入力 x\n${x}\n\n# 評価対象の出力 y\n${y}\n\n判定してください。`,
    schema: ANSWER_SCHEMA,
  }) as Promise<{ answer: "yes" | "no"; explanation: string }>;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export async function evaluate(x: string, y: string, model = config.judgeModel) {
  const questions = loadQuestions();
  const answers = await mapLimit(questions, config.concurrency, async (q) => {
    let yes = 0, expl = "";
    for (let r = 0; r < config.runs; r++) { const a = await askOne(model, x, y, q); yes += a.answer === "yes" ? 1 : 0; expl = a.explanation; }
    const f = yes / config.runs >= 0.5 ? 1 : 0;
    return { id: q.id, dimension: q.dimension, answer: f ? "yes" : "no", explanation: expl, f };
  });
  const [a, b] = config.scale; const scale = (raw: number) => raw * (b - a) + a;
  const dims: Record<string, { yes: number; total: number; raw: number; scaled: number }> = {};
  for (const ans of answers) { const d = (dims[ans.dimension] ??= { yes: 0, total: 0, raw: 0, scaled: 0 }); d.yes += ans.f; d.total += 1; }
  for (const d of Object.values(dims)) { d.raw = d.yes / d.total; d.scaled = scale(d.raw); }
  const overallRaw = answers.reduce((s, x) => s + x.f, 0) / answers.length;
  return { overall: { raw: overallRaw, scaled: scale(overallRaw) }, dimensions: dims,
    answers: answers.map(({ f, ...rest }) => rest) };
}
```

## `eval/optimize/*` / `eval/quality-check.ts`

`references/prompt-optimization.md` / `quality-checks.md` を TS 化。note-taker / updater も `askJSON` 経由で呼ぶ（構造化出力で教訓リスト・書換部分文字列を受け取る）。cross は source/target の $f$ 突合、self は失敗質問の教訓化。 **質問分解の再生成を反復に含める**。

## 実行例（README に記載）

```bash
tsx eval/generate-questions.ts                 # Phase1: T → 質問生成
tsx eval/quality-check.ts                       # 品質チェック
tsx -e "import('./eval/evaluate').then(m=>m.evaluate(X,Y).then(console.log))"  # 単発評価
```
