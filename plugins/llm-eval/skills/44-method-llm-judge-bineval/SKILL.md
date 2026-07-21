---
name: 44-method-llm-judge-bineval
description: "eval の『曖昧な軸（品質の程度・自然文の質・抽出内容の妥当性）』を LLM-as-a-Judge で採点する評価手法を敷設するスキル。手法は有効性が示されている BINEVAL(Cho et al., 『Ask, Don't Judge: Binary Questions for Interpretable LLM Evaluation and Self-Improvement』, arXiv:2606.27226)に則る。全体的スコア判断ではなく、タスクプロンプトから Yes/No の二値質問セットをメタプロンプトで自動生成し(要約→分解の2ステップ・違反例つき)、各質問に独立回答して集約スコア化し、質問レベルのフィードバックで評価者/生成器プロンプトを反復改善する(cross-model update / self update)3フェーズを一式スキャフォールドする。評価者(Judge)LLM は、そのプロジェクトが既に使っている LLM をコードから検知して流用する。judge には gold(41-golden-set-construction)の expected を reference として渡し(reference-based judging)、出力は 42-eval-injection-seam の run report スキーマ(`score`/`reason` 列)に合わせる。決定的な軸は judge を介さず 43-method-code-based-scoring が採り、この手法は曖昧な軸専用。llm-eval プラグインの『評価手法』の1つ。「LLM as a Judge」「LLM-as-a-judge」「LLM ジャッジ」「AI 評価」「BINEVAL」「binary question decomposition」「二値質問」「rubric 評価」「G-Eval」「UniEval」「評価者プロンプト」「judge プロンプト」「出力品質を自動評価」「曖昧な軸の採点」「judge criteria」「モデル変更の追従」等の発話・タスク要求時に使用。構築は TypeScript 限定、references/ に同梱。"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# LLM-as-a-Judge (BINEVAL) — 曖昧な軸の評価手法

このスキルは、有効性が確立している **BINEVAL** 手法（Cho et al., "Ask, Don't Judge: Binary Questions for Interpretable LLM Evaluation and Self-Improvement", arXiv:2606.27226v1）に則った LLM-as-a-Judge を、現在のプロジェクトに **初期化(スキャフォールド)** するスキル。llm-eval プラグインの**評価手法の1つ**で、**曖昧な軸（品質の程度）専用**。正解が一意な決定的軸は `43-method-code-based-scoring` が採り、判定役の LLM（judge）のブレ（κ）を持ち込まない。

## llm-eval プラグイン内での位置付け（先に読む）

- 前提となる基盤:
  - `40-eval-directory-setup` — run report スキーマ（この手法は `score` / `reason` 列を埋める）
  - `41-golden-set-construction` — 確定した正解データ（gold）の `expected` を **参照（reference）** として判定役に渡す（正解参照方式の判定, reference-based judging）
  - `42-eval-injection-seam` — eval CLI 契約 / モデル注入。判定役の出力は共通 report スキーマに合わせる
- 役割分担: **決定的な軸（tool 名・type・status・日時）は 43-method-code-based-scoring** が構造チェック（structural）で採り、
  構造的な不合格（structural fail）のケースは判定役をスキップする。この手法は**自然文の質・抽出の妥当性・下書き（draft）の充実度**など
  「唯一の正解に絞れない曖昧な軸」だけを採点する。
- プロンプト自動最適化（`45-method-gepa-optimization`）は、この手法が出す `score` / `reason` を報酬・
  テキストフィードバックとして消費する。判定役には「何が減点要因か」を具体的に書かせておく。

## このスキルの位置付け（最重要・先に読む）

- これは **「評価を今すぐ 1 回まわす」ためのものではない**。 **各プロジェクトに『BINEVAL 準拠の LLM-as-a-Judge 基盤』を敷設する** ためのものである。
- 生成物は **あくまでセットアップ**（評価用プロンプト（meta-prompt）・評価器・スコアリング・最適化ループ・品質チェック・各用途の実行基盤（ハーネス））だが、 **手法の仕様は正確に実装** する（近似で妥協しない）。
- **判定役の LLM は、そのプロジェクトが既に使っている LLM を検知して流用する**（後述 Step 0）。評価のために新しいプロバイダを持ち込まない。
- 敷設した基盤は、次の **5 用途** のいずれにも使える形にする（後述、`references/use-cases.md`）:
  1. **CI に組み込まれるもの** — PR ごとに出力品質を二値スコアでゲートする
  2. **プロダクト内で動作するもの** — 生成物を出す前に inline で自己評価する
  3. **手元マシン内で改善のために用いるもの** — ローカルでスコアを見ながら改善する
  4. **モデルの変化への追従** — 評価器/被評価モデルを差し替えたときの挙動差を検出する
  5. **プロンプトのアップデートを評価・改善していくためのもの** — 生成プロンプトを反復改善する

## BINEVAL とは（1 段落で）

評価を「全体を一括で判断する方式（holistic judge）」ではなく「小さく検証可能な Yes/No 質問」に変換する。タスクプロンプト $T$ を評価用プロンプトで二値質問 $Q=\{q_1..q_N\}$ に分解し、判定役が各質問に **独立に** 回答して「はい」の割合をスコアとする。訓練不要・タスク非依存（評価用プロンプトは共通、変えるのは $T$ だけ）。各失敗質問がエラー種別を直接指すため、フィードバックがそのままプロンプト改善に使える。

数式・3 フェーズの仕様は **`references/methodology.md`**（実装の土台）。

## 敷設される 3 フェーズ

| フェーズ | 内容 | 参照 |
|---|---|---|
| **Phase 1: 二値質問生成** | 評価用プロンプト $M$ でタスクプロンプト $T$ を要件 $R$ に要約(Step1)→ 各要件を違反例つき二値質問に分解(Step2)。評価次元 $D$ で整理 | `references/meta-prompt.md` |
| **Phase 2: 二値評価とスコアリング** | 各質問に独立回答 $f_E(x,y,q_i)\in\{0,1\}$ + 自然言語説明 $e_i$。次元スコア/全体スコア、$[a,b]$ へのアフィン変換 | `references/evaluator.md` |
| **Phase 3: 反復的プロンプト最適化** | cross-model update(強い参照モデルとの不一致を教訓化)/ self update(失敗質問を教訓化)。note-taker → dedup → updater の 5 ステップ | `references/prompt-optimization.md` |

質問設計の確認（yes-rate spread / inter-question 相関 φ / pairwise coverage）は **`references/quality-checks.md`**。

## 判定役の LLM とスタック方針

- **判定役の LLM は、そのプロジェクトが既に使っている LLM を検知して流用する**（Step 0 で検知、`references/detect-and-wire-llm.md`）。OpenAI / Anthropic / Google / Azure / Bedrock / Ollama など、プロバイダは問わない。既存の LLM クライアント/ラッパーがあれば **それを再利用** する。
- **構築は TypeScript 限定**（`references/scaffold-typescript.md`）。Python では敷設しない。
- プロバイダ差は **`eval/llm` アダプタ 1 箇所に閉じ込める**。BINEVAL 本体はアダプタの `askJSON()` だけを呼ぶ。
- **二値回答は構造化出力で強制**（`{answer: "yes"|"no", explanation}`）。プロバイダの JSON モード/function calling を使い、無ければ厳密 JSON パース + 再試行。
- **温度**: ランダム性を抑えるため、対応するモデルでは `temperature: 0`。撤廃されているモデル（一部の最新モデル）では省略する。分岐はアダプタに持たせる。

---

# 実行手順

## Step 0: 既存 LLM の検知と設定確認（必須・最初に実行）

### 0-a. プロジェクトが使っている LLM を検知する（`references/detect-and-wire-llm.md`）

コードベースを走査し、 **現在使われている LLM プロバイダ・モデル・クライアント初期化パターン** を特定する:

- 依存関係（`package.json` / `requirements.txt` / `pyproject.toml`）: `openai` / `@anthropic-ai/sdk` / `anthropic` / `@google/generative-ai` / `google-generativeai` / `@azure/openai` / `@aws-sdk/client-bedrock-runtime` / `cohere-ai` / `mistralai` / `ollama` / `ai`(Vercel AI SDK) / `langchain` 等
- ソース中のクライアント生成・呼び出し（`new OpenAI(`, `new Anthropic(`, `genai.GenerativeModel(`, `bedrock` 等）と **既存の LLM ラッパーモジュール**（`lib/llm`, `services/ai` 等）
- 環境変数（`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `AZURE_OPENAI_*` 等）
- コード中のモデル文字列（`gpt-...`, `claude-...`, `gemini-...`, `o...` 等）

検知結果（プロバイダ / モデル / クライアント取得方法）をユーザーに提示する。 **既存ラッパーがあれば流用を最優先**。複数プロバイダが見つかる/曖昧な場合のみ AskUserQuestion で確認する。検知できない（LLM 未使用）場合は、その旨を伝えて使いたいプロバイダを尋ねる。

### 0-b. 設定確認（AskUserQuestion, 1 回でまとめて）

1. **評価対象タスク($T$)**: 何を評価するか（要約 / 対話応答 / 命令追従 / RAG 回答 / 分類 / 独自）。具体的なタスクプロンプトまたは要件があれば受け取る。無ければ「後で `task-prompt.md` に記述」を選ばせ雛形だけ敷く。
2. **対象用途(複数選択可)**: 上記 5 用途のうちどれを敷くか。選んだものだけ実行基盤を取り込む。
3. **判定役モデル構成**（検知結果を既定として提示）:
   - **判定役（運用）モデル**: 既定 = **検知した現行モデル**（CI / プロダクトで回す判定役）
   - **reference(参照/強)モデル**（cross-model update 用・任意）: 同一プロバイダに上位モデルがあればそれ、無ければ判定役と同一。単一で良ければ参照モデル＝判定役。

> **Step 0 の意義**: 評価用プロンプトはタスク非依存だが、 **Phase 1 で生成される質問セットは $T$ に依存** する。$T$・次元・判定役の構成（＝検知した既存 LLM）を確定してから敷設する。

## Step 1: ディレクトリ骨格を敷く

`references/scaffold-typescript.md` を土台に、以下を配置する（monorepo なら適切な package 配下、単一なら `src/` 配下）。

```
<repo>/eval/                         # LLM-as-a-Judge 基盤のルート
├── task-prompt.md                   # 評価対象タスク T（人間が編集する唯一の入力）
├── llm.ts                           # 既存 LLM を再利用する Judge アダプタ（askJSON）※プロバイダ差はここだけ
├── config.ts                        # 検知したプロバイダ/モデル・次元・[a,b] スケール等
├── meta-prompt.ts                   # タスク非依存メタプロンプト M（触らない）
├── generate-questions.ts            # Phase 1: T → 二値質問セット Q（要約→分解）
├── questions/<dimension>.json        # 生成された Q（次元ごと・違反例つき JSON）
├── evaluate.ts                      # Phase 2: f_E(x,y,q_i) + 説明、次元/全体スコア、アフィン変換
├── optimize/
│   ├── cross-model-update.ts        #   参照モデルとの不一致 → 教訓 → プロンプト書換
│   └── self-update.ts               #   失敗質問 → 教訓 → 生成プロンプト書換
├── quality-check.ts                 # yes-rate spread / φ 相関 / pairwise coverage
└── README.md                        # 運用手順（人間向け）
```

選ばれた用途の実行基盤を `eval/harnesses/` に配置（`references/use-cases.md`）。

## Step 2: 手法を正確に実装する

references を土台にしつつ、 **以下の仕様を曲げない**:

1. **Judge アダプタで既存 LLM を再利用**（`detect-and-wire-llm.md`）。`eval/llm` の `askJSON({model, system, user, schema})` が唯一のプロバイダ依存点。BINEVAL 本体（generate/evaluate/optimize）は全てこれ経由で呼ぶ。既存ラッパーがあればその中で呼ぶ。
2. **評価用プロンプトは 2 ステップ**（`meta-prompt.md`）: $T$ を明示要件 $R$ に **要約** → 各 $r_k$ を **1 つ以上の二値質問** に分解。複数サブタスクは別質問に割り、 **各質問に違反例を必ず付与**。「はい」=充足 /「いいえ」=違反。次元 $D$ で整理。 **$M$ はタスク非依存**（変えるのは `task-prompt.md` だけ）。
3. **評価は質問ごとに独立**（`evaluator.md`）。$f_E(x,y,q_i)\in\{0,1\}$ と説明 $e_i$ を **同時に** 返す。構造化出力で `{answer, explanation}` を強制。
4. **スコアは「はい」の割合**。次元 $S_d=\frac{1}{|Q_d|}\sum f_E$、全体 $S=\frac{1}{N}\sum f_E$、$S'=S\cdot(b-a)+a$（1–5 なら $S'=S\cdot4+1$）。
5. **最適化は既定 `MAX_ITER=2`**（`prompt-optimization.md`）。教訓は dedup 後 ≤10、書換は局所的に。 **質問分解の再生成も更新対象に含める**。held-out 信号があれば early stopping。

## Step 3: Phase 1 を 1 度だけ走らせて質問セットを生成（セットアップの一部）

`task-prompt.md` に $T$ が入っている場合のみ、`generate-questions` を 1 度実行して `questions/<dimension>.json` を生成する（基盤の初期状態を作る **セットアップ行為**）。$T$ 未記入なら雛形だけ残し、README に「$T$ を書いてから実行」と記す。

生成後、`quality-check` を走らせ spread / φ / coverage を確認。 **spread が無い・相関が高すぎる** など質問設計が弱い兆候があれば README に残し、必要なら質問を分割/多様化する。

## Step 4: 選ばれた用途の実行基盤を敷く

`references/use-cases.md` から選択分を配置し README 節を書く:
- 用途1(CI): 閾値ゲート・差分評価。GitHub Actions 雛形。
- 用途4(モデル追従): 判定役/参照モデルを差し替えて次元スコア差 $|S^{tgt}-S^{src}|$ を出す回帰チェック。
- 用途5(プロンプト改善): self-update を回して改善量を出す。

---

# 完了報告（必須）

- 敷設したファイル一覧と配置先
- **検知した既存 LLM**（プロバイダ / モデル / 再利用したクライアント）と、判定根拠（依存・import・env・モデル文字列のどれで検知したか）
- 選択された言語・5 用途のうち敷いたもの・判定役/参照モデル構成
- Phase 1 を実行したか（$T$ の有無）。実行した場合は生成された次元と質問数、quality-check の所見
- 人間が次にやること（$T$ の記入 / API キー確認 / 閾値調整 / CI 有効化）

---

# 参照ファイル

- `references/methodology.md` — 手法の仕様（3 フェーズ・全数式）。 **最初に読む**
- `references/detect-and-wire-llm.md` — 既存 LLM の検知と Judge アダプタへの配線
- `references/meta-prompt.md` — タスク非依存の評価用プロンプト $M$ と質問スキーマ・生成例
- `references/evaluator.md` — 二値評価 $f_E$ とスコアリングの実装仕様
- `references/prompt-optimization.md` — cross-model / self update の 5 ステップと擬似コード
- `references/quality-checks.md` — spread / φ 相関 / coverage の算出と判定
- `references/scaffold-typescript.md` — TypeScript 実装テンプレ
- `references/use-cases.md` — 5 用途の実行基盤（CI / product / local / model-tracking / prompt-opt）
