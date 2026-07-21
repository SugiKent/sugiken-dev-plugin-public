---
name: 43-method-code-based-scoring
description: "eval の『決定的な軸（正解が一意なもの）』を、LLM-judge を介さずコードで機械照合する評価手法を敷設するスキル。呼ぶべき tool/agent 名・出力 type・status・ISO 日時のように正解が一意な軸は、judge より強く・安く・ブレない構造照合で採点する。gold（41-golden-set-construction）の `expected` に決定的軸の語彙（`acceptableFirstTools` 許容集合 / `mustNotCall` 禁止集合 / `expectedType`・`expectedStatus` 厳密一致 / `expectNoSuggestion` 捏造検知）を書き、structural fail のケースは LLM-judge をスキップしてコストを節約する。出力は 42-eval-injection-seam が定める run report スキーマ（`structuralPass` 列）に合わせるので、LLM-judge（44）や最適化（45）と同じ土俵で共存できる。llm-eval プラグインの『評価手法』の1つで、曖昧な軸は 44-method-llm-judge-bineval が担当する。「code-based 判定」「構造照合」「決定的な軸」「structural check」「tool 名の照合」「acceptableFirstTools」「mustNotCall」「expectedType」「機械照合」「judge を使わない採点」「捏造検知」等の発話・タスク要求時に使用。"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# コードによる照合（code-based）（決定的な軸の機械採点）— 評価手法

llm-eval プラグインの**評価手法の1つ**。正解が一意に決まる軸を、判定役の LLM（judge）を介さず
コードで構造照合して採点する。判定役より**強く・安く・ブレない**。曖昧な軸（自然文の質など）は
`44-method-llm-judge-bineval` が担当し、両者は同じ run report の上で共存する。

## このスキルの位置付け（先に読む）

- 前提: `40-eval-directory-setup`（run report スキーマ）/ `41-golden-set-construction`（確定した正解データ（gold）と expected）/
  `42-eval-injection-seam`（eval CLI 契約・モデル注入）。
- **判定方式の分離**が中心思想: 決定的な軸は必ずこの手法（コード照合）で採る。判定役のブレ（κ）を
  ノイズとして受けない。1 つのケースで決定的軸と曖昧軸が混在するときは、この手法で `structuralPass`
  を出し、構造的な不合格（structural fail）なら判定役をスキップする（コスト節約）。

## 判定方式の分離（どの軸をこの手法で採るか）

| 軸の性質 | 例 | 採点 |
|---|---|---|
| 正解が一意（決定的） | 呼ぶべき tool/agent 名、出力 type、status、ISO 日時 | **この手法（コード照合）** |
| 曖昧（品質の程度） | 自然文の質、抽出内容の妥当性、draft の充実度 | `44-method-llm-judge-bineval` |

## expected の決定的軸ボキャブラリ（確定正解データに書く）

`41-golden-set-construction` で `expected` を確定する際、決定的な軸はこの語彙で書く。
この手法はこれらを読んで `structuralPass` を出す:

- `acceptableFirstTools: [...]` — 最初の委譲先の許容集合（別解が同等に正しければ複数入れる）
- `mustNotCall: [...]` — 全期間で 1 度も呼ばれてはならない tool（敵対的（adversarial）テストの主武器）
- `expectedType` / `expectedStatus` — 出力の判別キー（discriminator）を厳密一致で照合
- `expectNoSuggestion: true` — 「出さないことが正解」ケース（捏造検知）

別解が同等に正しいなら**許容集合を広げる**（`acceptableFirstTools` に複数入れる）か、
その軸自体を判定基準（criteria）に委ねる。「唯一の正解」に絞れる軸だけをここで固く照合する。

## 採点ロジックの原則

- **構造的な不合格は即 fail**（判定役スキップ）。正しい結論を出していても、呼ぶべき tool を
  呼ばない・呼んではいけない tool を呼ぶ・type/status を外すなら不合格。tool 呼び出しの作法（tool-calling discipline）や
  出力契約の遵守は決定的軸として固く採る。
- 照合は**厳密一致 or 集合包含**で書く（曖昧さを持ち込まない）。日時は ISO 正規化してから比較。
- 出力は `42-eval-injection-seam` の run report スキーマに合わせる:
  `structuralPass`（この手法の結果）を埋め、判定に関与しない `score` 列は判定役に委ねる（未実行なら null）。
- 構造的な不合格の `reason` には「何を照合して外れたか」を具体的に書く
  （最適化 45 のテキストフィードバックになる）。

## この手法が最も効くケース（失敗分類マップ（gap-map）分類との対応）

- 「**正しい結果を作れているのに作法を間違える**」系 — submit tool を呼ばず text に吐く、
  判別キーのキー名違い、status 誤選択 — はこの手法で明確に検出でき、かつ最適化（45）で
  直る見込みが最も高い。失敗分類マップ（41）でこの分類が多い評価対象（target）は、この手法の照合を厚くする。

## やってはいけないこと

- 決定的な軸（tool 名・type・日時）を判定役に判定させる（判定役のブレを持ち込む）
- 別解が同等に正しいのに単一正解で照合して誤 fail する（許容集合を広げるか判定役に委ねる）
- run report スキーマを独自拡張する（`structuralPass` 列に埋め、共通契約を守る）
