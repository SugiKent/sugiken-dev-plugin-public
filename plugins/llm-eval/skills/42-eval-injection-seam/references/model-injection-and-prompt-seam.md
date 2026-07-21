# モデル実注入と prompt override 差し替え口（seam）（本番コード無変更の A/B 基盤）

Phase 0 の技術的核心。**本番の挙動を一切変えずに**、eval からモデルとプロンプトを
差し替えられるようにする。

## 1. モデルの env 実注入（`EVAL_TARGET_MODEL`）

- **モデル名を決め打ちしない**。Step 0 でプロジェクトが実際に使っているモデル・provider・
  固有設定を検知し、以降のコード例の `<default-model>` はその検知結果で置き換える。
- まず**モデル定数の集約点**を作る/見つける（モデル文字列が各 agent に散っていれば
  1 ファイルに集約するリファクタが先）。
- 集約点で env を読む:

```ts
const DEFAULT_CHAT_MODEL = "<provider>/<default-model>"; // ← Step 0 で検知した現行モデル
// eval 専用 override。production では未設定なので常に DEFAULT が使われる。
// module load 時に一度だけ評価する（agent 構築後に env を変えても反映されない）。
const MODEL_OVERRIDE = process.env.EVAL_TARGET_MODEL;
export const CHAT_MODEL = MODEL_OVERRIDE ?? DEFAULT_CHAT_MODEL;
```

- **モデル固有の設定は override 時に自動で外す**。provider 固定ルーティングや
  reasoning effort は特定モデル専用の設定であることが多い。
  別モデルに同じ設定を付けると挙動が壊れるか無意味になる:

```ts
const IS_DEFAULT_FAMILY = CHAT_MODEL.startsWith("<provider>/<default-model-family>");
export function createChatModel() {
  if (!IS_DEFAULT_FAMILY) return client.chat(CHAT_MODEL); // 素の設定
  return client.chat(CHAT_MODEL, { /* Step 0 で検知したモデル固有設定 */ });
}
```

- **「ラベルだけ注入」の罠**: eval の report に `targetModel` を書くだけで実際の agent は
  固定モデルのまま、という半端な実装が起きやすい。report のモデル名は必ず**実際に使われた
  値**（集約点の export）から取る。
- config.json 用に `describeChatModelConfig()`（実際に使われた model / providerOptions /
  reasoningEffort / overriddenByEnv を返す関数）を集約点に置く。

## 2. prompt override 機構（`PROMPTS_OVERRIDE_FILE`）

最適化ループが候補プロンプトを注入するための差し替え口。

- **env にファイルパス**を渡す方式にする（CLI フラグより堅牢）。ESM の import hoisting により
  「argv を parse してから env を設定」は間に合わないことがある。subprocess 起動時に env を
  渡す設計なら常に安全。
- JSON 形式: `{ "<component名>": "<プロンプト全文>", ... }`。コンポーネント名は
  プロジェクトの prompt 単位（supervisor / 各 subagent 等）で固定の許可リストにする。
- 各 prompt module は共通ヘルパーを通す:

```ts
export const SUPERVISOR_INSTRUCTIONS = applyPromptOverride("supervisor", DEFAULT_TEXT);
```

- **fail fast（silent fallback 禁止）**: ファイル不存在 / JSON parse 失敗 / 許可リスト外のキー
  （typo）/ 値が非文字列 → すべて throw。「override が効いていないのに効いていると思い込む」
  のが最適化ループ最悪の事故（改善が全部無意味になる）。
- env 未設定時は default をそのまま返す = **production 挙動不変**。既存の prompt 内容を検証する
  テストが env 未設定で green のままであることが安全の証明になる。
- prompt が Agent 構築時（module load 時）に消費される場合、「env はプロセス起動時に設定
  されている必要がある」を必ずコメントに明記。

## 3. eval CLI の機械可読契約（`--cases` / `--json-out`）

最適化ループ（Python 等の外部プロセス）が eval を叩くための契約:

```
PROMPTS_OVERRIDE_FILE=/abs/x.json <eval コマンド> --target <t> --cases id1,id2 --json-out /abs/out.json
```

出力 JSON（この形式は**契約**。変えるときは全消費者を追従）:

```json
{
  "targetModel": "...", "judgeModel": "...", "promptsOverrideFile": "... or null",
  "cases": [
    { "target": "...", "caseId": "...", "pass": true, "score": 4,
      "reason": "judge の理由文", "structuralPass": true, "error": null }
  ]
}
```

- `score` は判定役の LLM（judge）未実行なら null。`reason` は構造的な不合格（structural fail）時は構造チェックの理由。
- `reason` がそのまま最適化の**テキストフィードバック**（GEPA の反省ステップ（reflection）材料）になるので、
  判定役には「何が減点要因か」を具体的に書かせておく。
- stdout ではなく**ファイル出力**（`--json-out`）にする（ログと混ざらない）。

## 4. 結合の end-to-end 検証（必須）

静的テストだけでは「本物の agent に届いているか」を証明できない。敷設したら必ず:

1. **fail fast 検証**: 許可リスト外キーの JSON で起動 → 明確なエラーで落ちること
2. **marker 実走検証**: default prompt 末尾に「応答冒頭に必ず『OVERRIDE_MARKER_42』と書く」を
   追記した override を作り、1 ケース実走 → **実応答の冒頭に marker が出る**こと
3. `--json-out` の中身が契約どおりで、`promptsOverrideFile` が記録されていること

これで「Python 側が生成した候補 → env → 生きた agent → 判定役 → 機械可読スコア」の
全経路が本物で動く証明になる。

## 落とし穴

- **worktree で並行開発する場合**: worktree は HEAD 起点なので main tree の未コミット変更を
  含まない。同じファイルを両方で触ると手動 3-way マージが要る。契約（JSON 形式・フラグ）を
  先に固定して受け渡すと独立開発できる。
- eval が共有状態（state）（DB seed）を使うなら **eval 実行は常に直列**。並行 SubAgent を使うときは
  「eval を実走できるのは 1 体だけ」を prompt に明記する。
