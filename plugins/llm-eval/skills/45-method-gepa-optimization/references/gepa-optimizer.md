# GEPA によるインクリメンタルなプロンプト自動最適化

## 手法の選定理由（他プロジェクトでも同じ判断でよい）

- 使うのは **GEPA**（arXiv:2507.19457。反省ステップ（reflection）ベースの進化的 prompt 最適化。
  パレート最前線（複数の評価軸で優れた候補の集合）で局所最適を回避、少ロールアウト（試行）で GRPO 比 +10-20% の報告）。
  論文著者らの **スタンドアロン `gepa` パッケージ（pip install gepa、DSPy 非依存・必須依存ゼロ）**
  を使う。候補選択・変異・採否の枠組みを自作しない（自作すると「証明されていない独自手法」になる）。
- **DSPy への全面移行はしない**: 評価対象は実プロダクションのエージェント（agent）実装であり、DSPy プログラム
  に書き直したら別物を最適化することになる。この 2 つ（DSPy 移行のコスト / GEPA 単体採用のコスト）
  を混同しない。
- **Eval Protocol（Fireworks）は最初は入れない**: EP の GEPATrainer は「データセット内の最初の
  system prompt 1 本」しか最適化できず、複数コンポーネント（supervisor + subagents）の同時最適化
  に合わない。FIREWORKS_API_KEY 必須。ただし **プロンプトだけで合格ゲートに届かないときの
  段階的な強化策（escalation）＝ RFT（同じ評価器（evaluator）を報酬にモデル自体を強化学習）** としては有力なので、
  eval CLI を HTTP ラップすれば EP の RemoteRolloutProcessor に載る形（純粋関数的 CLI）を保つ。

## gepa パッケージの使い方（実 API・調査済み）

- `gepa.optimize(seed_candidate, trainset, valset, adapter, reflection_lm, max_metric_calls, ...)`
- `seed_candidate` は `dict[str, str]`（コンポーネント名 → prompt 全文）→
  **複数 prompt の同時最適化が自然にできる**
- `reflection_lm` は litellm モデル id 文字列 or callable。litellm はローカル環境でビルドできない
  ことがあるので **optional extra に隔離**し、dry-run は callable の offline reflection で
  API キー不要にする
- `GEPAAdapter` に 2 メソッドを実装:
  - `evaluate(batch, candidate, capture_traces) -> EvaluationBatch(outputs, scores, trajectories)`
    — candidate を temp JSON に書き、`PROMPTS_OVERRIDE_FILE` env 付きで eval CLI を
    **直列 subprocess** 実行、`--json-out` を読んで score/5 を 0–1 正規化
    （error / 構造的な不合格（structural）は 0）、判定役の LLM（judge）の `reason` を実行の軌跡（trajectories）に格納
  - `make_reflective_dataset(...)` — 判定役の `reason` を `Feedback` として反省ステップに渡す
- `GEPAResult.best_candidate` を `best_prompts.json` に保存

## seed candidate の作り方

- TS の template literal をパースしない（脆い）。**`--seed-prompts <json>` で外から渡す**方式にし、
  seed JSON は tsx 等で prompt の export を import して書き出す（override JSON と同一形式）。

## インクリメンタル構築原則（最重要・必ず reflection に注入）

**「小さく書いて、ベースライン（現行モデルの実測）を超える振る舞いを 1 つずつ積み重ねる」**。

- 反省ステップ用の LM への指示に **「最小差分の編集のみ提案する。1 回の編集で 1 つの振る舞いだけを
  追加または削除する。全体のリライトは禁止」** を明記する。
- 1 iteration = 1 振る舞い変更として `optimizer/history.md` に記録
  （日時 / 対象 prompt / 変更概要 / 学習用データ（train）Δ / 検証用データ（holdout）Δ / 採用可否）。
- 効果が確認できない変更は積まない。「念のため」の指示は肥大化の温床。
- 理由: 一括リライトは「どの記述が効いているのか」を不明にし、変更容易性の低い複雑で
  長大な prompt を生む。積み上げ式なら各記述に「ベースラインを超えた」という存在理由が
  紐づき、将来削るときも安全。
- GEPA は元々「変異→スコアで採否」を繰り返すので、**変異の粒度を最小差分に絞る**だけで
  この原則に沿う。

## 運用の制約

- **目的関数は学習用データ分割のみ**。検証用データは収束後の汎化検証にだけ使う（過学習の歯止め）。
- eval subprocess は**常に直列**（共有 DB seed）。gepa 側に並列オプションがあっても使わない。
- 収束条件: 検証用データが N iteration 改善なし、または合格ゲート達成。
- 最終 prompt の diff は**人間がレビュー**（対話チェックポイント 6）。プロジェクトの
  プロンプト設計規約（思考法を書く / 重複排除 / 列挙禁止など）への適合と肥大化をチェック。
- 採用したら: prompt 反映 → prompt 内容を検証する既存テストを追従 → `evals/runs/` に最終結果を
  commit → README に結論を追記。

## CLI 設計（実績のある形）

```
run_gepa.py
  --components supervisor,family-memory   # 最適化対象（デフォルトは最重要 1 つ）
  --targets <eval target 名,...>
  --cases <id,...>                        # 省略時 splits.json の train を読む
  --seed-prompts ./seed_prompts.json
  --max-metric-calls 120                  # 予算
  --reflection-model <litellm id>         # 強いモデル（judge と同系でよい）
  --dry-run                               # fake evaluator + offline reflection で配線検証
```

- `--dry-run` は **API キー・DB・ネットワーク不要**で GEPA ループが 2〜3 iteration 回ることを
  確認できるようにする（結合前の配線検証・CI に置ける）。

## 最適化の投資先の決め方

失敗分類マップ（gap-map）（references/golden-dataset.md）の失敗分類から選ぶ。経験則:

- 「**正しい結果を作れているのに作法を間違える**」系（submit tool を呼ばず text に吐く、
  判別キー（discriminator）のキー名違い）は prompt 最適化で直る見込みが最も高い → 最優先
- 「推論自体が間違う」系（誤ったエンティティ（entity）解決、日付計算ミス）は prompt での改善余地はあるが
  モデル能力の限界のことがある → ゲート未達なら per-agent モデル分割 or RFT への段階的な強化策を検討
