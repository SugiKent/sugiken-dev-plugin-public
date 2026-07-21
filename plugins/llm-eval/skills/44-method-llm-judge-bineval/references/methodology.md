# BINEVAL の手法（実装に必要な部分のみ）

出典: Cho et al., "Ask, Don't Judge: Binary Questions for Interpretable LLM Evaluation and Self-Improvement"（Capital One / ICML 2026 Workshop, arXiv:2606.27226v1）。フレームワーク名 **BINEVAL**（本文表記 BinEval）。

このファイルは実装の土台。数式・設計原則を曲げないこと。※ 論文のベンチマーク結果・相関数値は手法の実行に不要なため本スキルには含めない（手法の仕様のみを記載する）。

## 全体像

評価を「全体を一括で判断する方式（holistic judge）」ではなく「小さく検証可能な yes/no 質問」に変換し、判定を集約して **解釈可能・多次元** のスコアにする。訓練不要・タスク非依存。3 コンポーネント:

1. **二値質問生成** — 評価用プロンプト（meta-prompt）がタスクプロンプトを評価次元ごとの原子的な（atomic, これ以上分解できない）質問に分解
2. **二値評価とスコアリング** — 判定役が各質問に **独立に** 回答し、次元別/全体スコアに集約
3. **2 フェーズ最適化ループ** — 質問レベルのフィードバックで判定役プロンプトと生成プロンプトを改善

各失敗した質問がそのままエラー種別を指すため、フィードバックがそのまま是正に使える（actionable）＝要約器/判定役プロンプトの是正に直結。

---

## Phase 1: 二値質問生成（§3.1）

入力はタスクプロンプト $T$（要約指示・対話システムプロンプト・命令追従仕様など任意の生成要件）。評価用プロンプト $M$ で分解関数を実行:

$$Q = F_{\text{LLM}}(T; M) = \{q_1, q_2, \ldots, q_N\}$$

$M$ は 2 ステップ分解を指示する。

- **Step 1 — Summarize**: $T$ を明示的な要件集合 $R=\{r_1,\ldots,r_K\}$ に要約。各 $r_k$ は個別の評価基準（重要情報を含むか / フォーマット制約に従うか等）。細かい分解の前にタスク全体の一貫した表現を作るのが目的。
- **Step 2 — Decompose**: 各 $r_k$ に対し 1 つ以上の二値質問を生成。「はい」=充足 / 「いいえ」=違反。設計原則:
  - 複数サブタスクを暗黙に含む要件は **別々の質問に分解**
  - 各質問に **簡潔な違反例(violation example)** を付与し否定ケースを明確化

質問は評価次元で整理:

$$Q = \bigcup_{d \in D} Q_d$$

$D$ は coherence / consistency / fluency / relevance 等。 **評価用プロンプト $M$ はタスク非依存**: タスクが変わっても同じ $M$、変えるのは $T$ だけ。

---

## Phase 2: 二値評価とスコアリング（§3.2）

判定役 LLM $E$ が、入力 $x$、出力 $y$、各質問 $q_i$ に対し独立に回答:

$$f_E(x, y, q_i) \in \{0, 1\}$$

$1$=「はい」/ $0$=「いいえ」。判定と同時に自然言語の説明 $e_i$ を生成（解釈可能性を担保）。

次元スコア:
$$S_d(x, y) = \frac{1}{|Q_d|} \sum_{q_i \in Q_d} f_E(x, y, q_i)$$

全体スコア:
$$S(x, y) = \frac{1}{N} \sum_{i=1}^{N} f_E(x, y, q_i)$$

両スコアは $[0,1]$、1=全基準充足。他フレームワークとの比較用にアフィン変換で $[a,b]$ へ:
$$S'(x, y) = S(x, y) \cdot (b - a) + a$$

1–5 スケールなら $S'=S\cdot4+1$（例: 3/7≈0.43 → 1.57）。

> **決定性**: 論文はランダム性排除のため temperature=0（対応モデルのみ）。実装の温度分岐は `evaluator.md` 参照。

---

## Phase 3-a: Cross-Model Prompt Update（§3.3 / Algorithm 1）

強い参照モデル(source $E_{\text{src}}$)と改善対象の運用モデル(target $E_{\text{tgt}}$)の、特定質問への回答 **不一致** を改善シグナルにする。全体的な（holistic）スコア差と違い **どの基準が不整合か** を特定できる。モデル系列移行時の追従にも有用。$P_E^{(t)}$ はターゲット判定役プロンプト(反復 $t$)。

各反復 $t$ の 5 ステップ:

1. **Evaluate**: 各テストケース $(x_j,y_j)$ を両モデルで評価。
   $$A_j^{\text{src}} = \{f_{E_{\text{src}}}(x_j, y_j, q_i)\}_{i=1}^{N}, \quad A_j^{\text{tgt}} = \{f_{E_{\text{tgt}}}(x_j, y_j, q_i; P_E^{(t-1)})\}_{i=1}^{N}$$
   **収束判定**（各次元スコアはテストケース平均）:
   $$S_d = \frac{1}{|Q_d|}\sum_{q_i \in Q_d}\text{mean}_j[A_j(q_i)], \qquad |S_d^{\text{tgt}} - S_d^{\text{src}}| < \epsilon\ \ \forall d \Rightarrow \text{収束}$$
   「全次元で target が source に許容誤差 $\epsilon$ 内で一致、または target が source を上回る」で終了。
2. **Identify disagreements**: $\Delta_j = \{q_i : A_j^{\text{src}}(q_i) \neq A_j^{\text{tgt}}(q_i)\}$
3. **Extract lessons**: note-taker LLM $L_{\text{note}}$ が各不一致を文脈付きで分析し汎化教訓を抽出。
   $$L_j = L_{\text{note}}(x_j, y_j, A_j^{\text{src}}, A_j^{\text{tgt}}, \Delta_j)$$
4. **Semantic dedup**: セマンティック重複排除。 **最大 10 個のユニーク教訓を保持**。
   $$\text{Dedup}(\ell_{\text{new}}, M) = \begin{cases} \text{merge}(\ell_{\text{new}}, \ell_k) & \ell_{\text{new}} \sim \ell_k \\ \text{add}(\ell_{\text{new}}) & \text{otherwise} \end{cases}$$
5. **Update prompt**: 形式的には各 $\ell_k$ で $P_E^{(t)} \leftarrow P_E^{(t)}.\text{replace}(s_k, s_k')$（updater LLM が関連部分文字列 $s_k$ を修正 $s_k'$ に置換）。 **実運用では保持した全教訓を 1 回の LLM 呼び出しでまとめて反映** し、 **self-update では質問分解も再生成** する。

**早期終了**: 最大 5 反復まで回し、検証用データ（held-out, テスト集合）の相関が前反復より下がったら停止。

## Phase 3-b: Self Prompt Update（§3.4）

生成プロンプト $P_G$ を BINEVAL の失敗質問で反復改善する。

1. **Generate**: $y_j^{(t)} = L_G(x_j; P_G^{(t)})$
2. **Evaluate**: 失敗質問と説明を収集 $E_j = \{(q_i,e_i): f_E(x_j,y_j^{(t)},q_i)=0\}$。（判定役プロンプトの self-update では、人間スコアとの乖離が大きい項目 $|s_{\text{model}}-s_{\text{human}}|>0.3$ を対象にする）
3. **Extract lessons**: $L_j = L_{\text{note}}(x_j, y_j^{(t)}, E_j)$
4. **Deduplicate and update**: 同じ dedup(≤10) と書換を $P_G$ に適用。終了は評価エラー消滅 or 最大反復到達。

---

## 質問設計の指針（実装で守ること）

良い質問セットにするための操作的な原則:

- 各質問は **単一の検証可能特性** に集中させる（1 質問 = 1 チェック）。
- 質問は互いに **低相関** になるよう設計する（異なる側面を測る）。
- 質問は **異なる失敗モード** を狙って多様化する（列挙して再現率（recall）を上げる）。

これらが満たされているかは `quality-checks.md` の指標で確認する。

## 設定ノブ（config に効く運用パラメータ）

- **温度**: ランダム性排除のため temperature=0（対応モデルのみ。分岐は `evaluator.md`）。
- **反復回数**: 効果はほぼ 1〜2 反復に集中する。検証用データの信号があれば早期終了（early stopping）で最良の反復を選ぶ（既定 `MAX_ITER=2`）。
- **教訓保持**: dedup 後に最大 10 個。
- **質問再生成**: self-update では評価器プロンプトだけでなく質問分解も再生成する。
