---
name: 42-eval-injection-seam
description: "本番コードを一切変えずに、eval からモデルとプロンプトを差し替えられる『注入 seam（縫い目）』を敷設するメタスキル。核心は (1) モデルの env 実注入（`EVAL_TARGET_MODEL` — ラベルではなく実際にモデルを差し替える。モデル固有設定は override 時に自動で外す）、(2) prompt override 機構（`PROMPTS_OVERRIDE_FILE` — env でファイルパスを渡し、許可リスト外キーや JSON 破損は silent fallback せず fail fast）、(3) eval CLI の機械可読契約（`--cases` / `--json-out` とケース単位の結果 JSON スキーマ）、(4) marker 実走による end-to-end 検証（override が本物の agent に届いている証明）。env 未設定時は完全に従来どおりで**本番挙動不変**。この seam は複数モデルの A/B 絶対評価や自動プロンプト最適化（45-method-gepa-optimization）の前提であり、ここで固定する CLI/JSON 契約が**評価手法を追加しても破綻しない共通インターフェース**になる。ディレクトリ構造は 40-eval-directory-setup、gold は 41-golden-set-construction に従う。「モデル注入」「EVAL_TARGET_MODEL」「prompt override」「PROMPTS_OVERRIDE_FILE」「本番コード無変更 A/B」「モデル差し替え」「プロンプト差し替え seam」「eval CLI 契約」「json-out」「override が効いているか検証」「モデル比較 A/B」等の発話・タスク要求時に使用。"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# モデル実注入と prompt override 差し替え口（seam）（本番コード無変更の A/B 基盤・手法共通契約）

**本番の挙動を一切変えずに**、eval からモデルとプロンプトを差し替えられるようにする基盤スキル。
この差し替え口があるからこそ、複数モデルを同じ確定した正解データ（gold）で絶対評価でき、プロンプト最適化ループが
候補プロンプトを生きた agent に注入できる。ここで固定する **CLI/JSON 契約**が、
評価手法を追加しても壊れない共通インターフェースになる。

## このスキルの位置付け（先に読む）

- 前提: `40-eval-directory-setup`（`evals/` 構造・run report スキーマ）と、確定正解データ（`41-golden-set-construction`）。
- この差し替え口を消費する側:
  - 複数モデルの A/B 絶対評価（`EVAL_TARGET_MODEL` を切り替えて回す）
  - `45-method-gepa-optimization` — subprocess で `PROMPTS_OVERRIDE_FILE` に候補を注入して回す
  - 任意の評価手法（`43` / `44` …）— 全て同じ eval CLI・同じ `--json-out` スキーマを叩く
- **モデル名を決め打ちしない**。プロジェクトが実際に使っているモデル・provider・固有設定を
  検知してから、以降のコード例の `<default-model>` をその検知結果で置き換える。

## 1. モデルの env 実注入（`EVAL_TARGET_MODEL`）

- まず**モデル定数の集約点**を作る/見つける（モデル文字列が各 agent に散っていれば
  1 ファイルに集約するリファクタが先）。
- 集約点で env を読む:

```ts
const DEFAULT_CHAT_MODEL = "<provider>/<default-model>"; // ← 検知した現行モデル
// eval 専用 override。production では未設定なので常に DEFAULT が使われる。
// module load 時に一度だけ評価する（agent 構築後に env を変えても反映されない）。
const MODEL_OVERRIDE = process.env.EVAL_TARGET_MODEL;
export const CHAT_MODEL = MODEL_OVERRIDE ?? DEFAULT_CHAT_MODEL;
```

- **モデル固有の設定は override 時に自動で外す**。provider 固定ルーティングや reasoning effort は
  特定モデル専用のことが多く、別モデルに同じ設定を付けると挙動が壊れるか無意味になる:

```ts
const IS_DEFAULT_FAMILY = CHAT_MODEL.startsWith("<provider>/<default-model-family>");
export function createChatModel() {
  if (!IS_DEFAULT_FAMILY) return client.chat(CHAT_MODEL); // 素の設定
  return client.chat(CHAT_MODEL, { /* 検知したモデル固有設定 */ });
}
```

- **「ラベルだけ注入」の罠**: eval report に `targetModel` を書くだけで実際の agent は固定モデルの
  まま、という半端な実装が起きやすい。report のモデル名は必ず**実際に使われた値**（集約点の
  export）から取る。config.json 用に `describeChatModelConfig()`（実 model / providerOptions /
  reasoningEffort / overriddenByEnv を返す）を集約点に置く（40 の config.json が消費）。

## 2. prompt override 機構（`PROMPTS_OVERRIDE_FILE`）

最適化ループが候補プロンプトを注入するための差し替え口。

- **env にファイルパス**を渡す方式（CLI フラグより堅牢）。ESM の import hoisting により
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

## 3. eval CLI の機械可読契約（`--cases` / `--json-out`）— 手法共通インターフェース

外部プロセス（最適化ループ等）が eval を叩くための契約。**この契約が「手法が増えても破綻しない」
共通面**なので、変えるときは全消費者を追従させる:

```
PROMPTS_OVERRIDE_FILE=/abs/x.json <eval コマンド> --target <t> --cases id1,id2 --json-out /abs/out.json
```

出力 JSON（40-eval-directory-setup の run report スキーマと同一の形。手法ごとに埋まる列が違うだけ）:

```json
{
  "targetModel": "...", "judgeModel": "... or null", "promptsOverrideFile": "... or null",
  "cases": [
    { "target": "...", "caseId": "...", "pass": true, "score": 4,
      "reason": "採点理由", "structuralPass": true, "error": null }
  ]
}
```

- `score` は判定役の LLM（judge）未実行なら null。`structuralPass` はコードによる照合（code-based）の結果。
  `reason` は構造的な不合格（structural fail）時は構造チェックの理由、判定役実行時は判定役の判断理由。
- `reason` がそのまま最適化の**テキストフィードバック**になるので、判定役には
  「何が減点要因か」を具体的に書かせておく。
- stdout ではなく**ファイル出力**（`--json-out`）にする（ログと混ざらない）。

### 新しい評価手法を足すときの約束（破綻させないために）

- **入力は確定正解データ（41）と CLI フラグだけ**を読む。手法固有の入力を増やさない。
- **出力は上記 `cases[]` スキーマに合わせる**。新しい採点軸を足すときは列を1つ追加する形にし、
  既存列の意味は変えない（後方互換）。判定不能な軸は null にする。
- モデル/プロンプトの差し替えは**この差し替え口経由のみ**（手法が独自にモデルを呼ばない）。
- こうすることで、A/B ランナー・失敗分類マップ（gap-map）集計・最適化ループ（45）は手法を意識せず同じ report を消費できる。

## 4. 結合の end-to-end 検証（必須）

静的テストだけでは「本物の agent に届いているか」を証明できない。敷設したら必ず:

1. **fail fast 検証**: 許可リスト外キーの JSON で起動 → 明確なエラーで落ちること
2. **marker 実走検証**: default prompt 末尾に「応答冒頭に必ず『OVERRIDE_MARKER_42』と書く」を
   追記した override を作り、1 ケース実走 → **実応答の冒頭に marker が出る**こと
3. `--json-out` の中身が契約どおりで、`promptsOverrideFile` が記録されていること

これで「候補プロンプト → env → 生きた agent → 採点 → 機械可読スコア」の全経路が本物で動く証明になる。

## 落とし穴

- **worktree で並行開発する場合**: worktree は HEAD 起点なので main tree の未コミット変更を
  含まない。同じファイルを両方で触ると手動 3-way マージが要る。契約（JSON 形式・フラグ）を
  先に固定して受け渡すと独立開発できる。
- eval が共有状態（state）（DB seed）を使うなら **eval 実行は常に直列**。並行 SubAgent を使うときは
  「eval を実走できるのは 1 体だけ」を prompt に明記する。
- モデルラベルだけ注入して実 agent は固定のまま（report は実際に使われた値から取る）。
