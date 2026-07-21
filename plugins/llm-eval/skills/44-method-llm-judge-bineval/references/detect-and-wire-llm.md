# 既存 LLM の検知と判定役 LLM（judge）アダプタへの配線

判定役 LLM は **そのプロジェクトが既に使っている LLM を流用** する。評価のために新しいプロバイダを持ち込まない。

## 1. 検知（何を根拠に判定するか）

以下を走査して「プロバイダ / モデル / クライアント取得方法」を特定する。 **複数根拠が一致するものを採用**。

- **依存関係**: `package.json` / `requirements.txt` / `pyproject.toml`
  - `openai` → OpenAI / `@anthropic-ai/sdk` `anthropic` → Anthropic / `@google/generative-ai` `google-generativeai` → Google Gemini / `@azure/openai` → Azure OpenAI / `@aws-sdk/client-bedrock-runtime` `boto3(bedrock)` → Bedrock / `cohere-ai` → Cohere / `mistralai` → Mistral / `ollama` → Ollama(ローカル) / `ai`(Vercel AI SDK) や `langchain*` → **上位ラッパー**（内部プロバイダをさらに特定する）
- **ソース中のクライアント生成/呼び出し**: `new OpenAI(` / `new Anthropic(` / `anthropic.Anthropic(` / `OpenAI(` / `genai.GenerativeModel(` / `generateText(`(Vercel) / `ChatOpenAI(`(LangChain) など
- **既存の LLM ラッパーモジュール**: `src/lib/llm*`, `services/ai*`, `packages/*/llm*` 等に「モデル呼び出しを 1 箇所に集約した関数」があれば **それを最優先で再利用**（クライアント初期化・認証・リトライを再発明しない）
- **環境変数**: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`(or `GOOGLE_API_KEY`) / `AZURE_OPENAI_ENDPOINT`+`AZURE_OPENAI_API_KEY` / `OLLAMA_HOST` 等
- **モデル文字列**: `gpt-...`, `o...`, `claude-...`, `gemini-...`, `mistral-...`, `command-...` 等。最も新しく/主に使われているモデルを判定役の既定にする

判定は完了報告に「どの根拠で検知したか」を残す。 **曖昧・複数プロバイダ併用の場合のみ AskUserQuestion**。LLM 未使用なら、その旨を伝えて使いたいプロバイダを尋ねる。

## 2. アダプタ契約（プロバイダ差を閉じ込める唯一の点）

`eval/llm.ts` に、BINEVAL 本体が呼ぶ **単一関数** を実装する。プロバイダ依存コードは **ここだけ**。

```
askJSON({ model, system, user, schema, temperature }) -> object
```

- `schema`: 期待する JSON Schema（例 `{answer, explanation}` や質問生成の schema）。
- 返り値: schema に沿ってパース済みのオブジェクト。
- **決定性**: `temperature` を受けるモデルは 0 を渡す。撤廃モデルでは省略（アダプタ内で分岐）。
- **構造化出力**: プロバイダのネイティブ機能を使う（下記）。使えなければ「JSON だけ返す」指示 + 厳密パース + 失敗時 1 回再試行。

### 既存ラッパーを再利用する場合（最優先）

プロジェクトに集約済みの呼び出し関数があるなら、`askJSON` はその薄いラッパーにする:

```ts
// eval/llm.ts — 例: 既存 src/lib/llm の callModel を再利用
import { callModel } from "../src/lib/llm"; // ← 検知した既存ラッパー
export async function askJSON({ model, system, user, schema, temperature = 0 }) {
  const text = await callModel({ model, system, messages: [{ role: "user", content: user }],
    responseFormat: "json", temperature }); // ラッパーの引数に合わせる
  return JSON.parse(text); // ラッパーが構造化出力を持たない場合は system に「JSONのみ返す」を足す
}
```

### プロバイダ別の実装リファレンス（新規に薄く書く場合）

構造化出力の付け方と temperature の要点だけ示す。詳細は各 SDK のドキュメントに従う。

- **OpenAI（`openai`）**: `client.chat.completions.create({ model, temperature: 0, response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }, messages: [{role:"system",...},{role:"user",...}] })` → `choices[0].message.content` を JSON パース。旧モデルは `response_format: { type: "json_object" }` + system に「このスキーマの JSON のみ」を明記。一部 reasoning 系モデルは `temperature` 非対応 → 省略。
- **Anthropic（`@anthropic-ai/sdk`）**: `output_config.format` の JSON schema を使う。temperature は対応モデルのみ 0、撤廃モデルは省略。
- **Google Gemini（`@google/generative-ai` / `google-generativeai`）**: `generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0 }` → `response.text()` を JSON パース。
- **Azure OpenAI（`@azure/openai`）**: OpenAI と同じ `response_format`。deployment 名を model に使う。エンドポイント/キーは env から。
- **Bedrock（`@aws-sdk/client-bedrock-runtime` / boto3）**: 内部が Anthropic モデルなら Anthropic の JSON 手法、他モデルは該当形式。model は Bedrock の modelId。
- **Ollama（`ollama`, ローカル）**: `format: "json"`（または schema）+ `options: { temperature: 0 }`。ローカルなので CI では起動確認が要る。
- **Vercel AI SDK（`ai`）**: `generateObject({ model, schema, system, prompt, temperature: 0 })` が最も素直（`schema` は zod）。`model` は検知したプロバイダの provider() で作る。
- **LangChain**: `model.withStructuredOutput(schema)` を使い、検知した内部 LLM をそのまま渡す。

いずれも **返すのは `{answer:"yes"|"no", explanation}` 等のパース済みオブジェクト**。生文字列マッチはしない。

## 3. config への反映

`eval/config` は検知結果を保持する:

```ts
export const config = {
  provider: "openai",             // 検知したプロバイダ
  judgeModel: "gpt-4.1-mini",     // 検知した現行モデル（運用/評価者）
  referenceModel: "gpt-4.1",      // 任意: 同プロバイダの上位モデル。無ければ judgeModel と同じ
  genModel: "gpt-4.1",            // self-update で被評価出力を生成するモデル（通常は本番生成モデル）
  dimensions: ["coherence", "consistency", "fluency", "relevance"],
  scale: [1, 5],
  runs: 1, maxIter: 2, maxLessons: 10, epsilon: 0.05, concurrency: 4,
};
```

用途4（モデル変化への追従）は、ここの `judgeModel` / `referenceModel` を差し替えるだけで回帰チェックできる。アダプタがプロバイダ差を吸収するので、別プロバイダへ移行しても実行基盤（ハーネス）は不変。
