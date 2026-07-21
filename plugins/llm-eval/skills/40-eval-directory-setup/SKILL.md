---
name: 40-eval-directory-setup
description: "LLM エージェント/生成機能を持つプロジェクトに、評価手法に依存しない eval 基盤の『ディレクトリ構造と冪等性の刻印』を敷設するメタスキル。gold データセット・run 結果・optimizer 台帳を repo root の `evals/` に分離配置し、各 run に入力条件（dataset hash / gitSha / モデル設定 / judge / split seed）を `config.json` として刻んで『同一条件の再実行か』を機械判定可能にする。run 結果は commit して未来資産化し、train/holdout の分割を `splits.json` で明示固定する。この構造は code-based 照合・LLM-judge・GEPA 最適化など**どの評価/最適化手法にも共通の土台**であり、手法スキル（43-method-code-based-scoring / 44-method-llm-judge-bineval / 45-method-gepa-optimization 等）が全てこの上に乗る。ディレクトリ設計・冪等性が定まった後は 41-golden-set-construction で gold を構築し、42-eval-injection-seam でモデル/プロンプトの差し替え口を実装する。「eval ディレクトリ設計」「evals ディレクトリ」「config.json 冪等」「run 資産化」「splits.json」「train/holdout 分割」「dataset hash」「評価基盤の初期セットアップ」「gold データセットの置き場所」等の発話・タスク要求時に使用。"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# eval ディレクトリ構造と冪等性の初期セットアップ（手法非依存の土台）

LLM エージェント/生成機能の評価を **再現可能・冪等・未来資産化** された形で回すための
**ディレクトリ構造と run の刻印**を敷設する基盤スキル。ここで決めるのは
「確定した正解データ（gold）/ run 結果 / optimizer 台帳をどこに置き、各 run に何を刻むか」だけであり、
**具体的な評価手法（何を正解とみなし、どう採点するか）には一切依存しない**。

## このスキルの位置付け（先に読む）

- llm-eval プラグインの **一番下の土台**。この上に:
  - `41-golden-set-construction` — 人間検証済み確定正解データ（唯一の正）を構築する
  - `42-eval-injection-seam` — 本番コード無変更でモデル/プロンプトを差し替える口を作る
  - 手法スキル（`43-method-code-based-scoring` / `44-method-llm-judge-bineval` /
    `45-method-gepa-optimization` …）— それぞれの採点/最適化ロジック
  が乗る。**手法が増えても、全手法が同じ `evals/` 構造・同じ `config.json` 契約・
  同じ run report スキーマを共有する**ので破綻しない。手法追加時にこのディレクトリ設計は変えない。
- 生成物は `evals/` ディレクトリ雛形と、runner が run ごとに `config.json` を書く仕組み。
- **本番コードの挙動は変えない**（評価は `evals/` に閉じる）。

## 原則

- **コードとデータ/資産を分離する**: eval を「実行するコード」（runner / 判定役の LLM（judge） / 評価対象（target））は
  既存のパッケージ（例: `apps/eval/`）に残し、「人間検証済みデータ（gold）と分析結果」は
  repo root の `evals/` に住まわせる。確定正解データは人間の意思決定の成果物であり、コードより長寿命。
- **run 結果は commit する**。gitignore の揮発置き場に出すと「過去にどの条件で何点だったか」が
  消え、改善の証明ができなくなる。1 run 数十 KB なのでコストは無視できる。

## 構造

```
evals/
├── README.md            # 運用手順・合格ゲート定義・中心思想・フェーズ計画（方針転換も追記）
├── datasets/            # ★ gold（人間検証済み・唯一の正）。runner がここを読む → 41-golden-set-construction
│   ├── SCHEMA.md        # ケースの書き方・target 別の expected 形式・gold 昇格基準
│   ├── POLICY.md        # 人間が確定した製品判断基準集（レビュー決定の一般化先）
│   ├── SILVER_REVIEW.md # Silver→Gold レビュー資料（決定後は記録として保持）
│   ├── splits.json      # train/holdout 分割の明示固定
│   └── <target>/*.yaml  # 1 ケース = 1 ファイル
├── runs/                # ★ タイムスタンプ付き結果（commit する未来資産）
│   └── <timestamp>/
│        ├── config.json # 入力条件の刻印（下記）
│        ├── report.{md,json}  # 手法非依存の共通スキーマ（下記）
│        └── gap-map.md  # 失敗分類（41-golden-set-construction / ベースライン計測で作る）
└── optimizer/
     ├── history.md      # 最適化 iteration の採用/棄却台帳（1 行 = 1 振る舞い変更）
     └── <最適化ハーネス一式>  # 45-method-gepa-optimization 参照
```

## config.json（冪等性の刻印・全手法共通）

**「同一条件の再実行か」を後から機械判定できる**ことが冪等性の実体。各 run に必ず書く:

```json
{
  "createdAt": "ISO8601",
  "target": {
    "model": "実際に使われたモデル id",
    "providerOptions": "モデル固有設定 or null",
    "reasoningEffort": "設定値 or null",
    "overriddenByEnv": true
  },
  "judgeModel": "judge のモデル id（LLM-judge 手法を使う場合。使わなければ null）",
  "dataset": {
    "root": "datasets の絶対パス",
    "fileCount": 70,
    "hash": "datasets 配下全ファイルの sha256（相対パス+内容を連結してハッシュ）",
    "splitSeed": 20260712
  },
  "gitSha": "HEAD の sha",
  "gitDirty": true,
  "nodeVersion": "..."
}
```

- dataset hash は「相対パス + \0 + ファイル内容 + \0」をソート順に連結して sha256。
  ケースを 1 文字でも変えると hash が変わる = 「同じデータで測ったか」が機械判定できる。
- `target` のモデル情報は **実際に使われた値**から取る（42-eval-injection-seam の
  `describeChatModelConfig()` 相当）。ラベルだけ書くと「注入したつもりで固定モデルのまま」事故になる。
- `judgeModel` は判定役 LLM（LLM-judge）系手法（44）を使う run のみ。コードによる照合（code-based）（43）だけの run では null。

## run report スキーマ（手法非依存の共通契約）

**どの評価手法も、ケース単位で同じ形の結果を吐く**。これが「手法が増えても破綻しない」核心。
report.json の 1 ケースは最低限この形:

```json
{ "target": "...", "caseId": "...", "pass": true, "score": 4,
  "reason": "採点理由（judge 理由 or structural fail 理由）", "structuralPass": true, "error": null }
```

- `structuralPass` はコード照合（43）の結果。`score` は判定役（44）の結果で、
  判定役を回さない run では null。手法ごとに埋める列が違うだけで**スキーマは1つ**。
- この report を最適化手法（45）や失敗分類マップ（gap-map）集計が消費する。**契約を変えるときは全消費者を追従**
  （詳細な CLI/JSON 契約は 42-eval-injection-seam が保持する）。

## splits.json（学習用データ（train）/検証用データ（holdout）の明示固定）

```json
{
  "_comment": "最適化は train のみで改善し holdout で汎化検証（過学習の歯止め）",
  "seed": 20260712,
  "targets": {
    "<target>": { "train": ["case-id", ...], "holdout": ["case-id", ...] }
  }
}
```

- **case id の明示列挙**で固定する（実行時のランダム分割は再現性がない）。
- 分割は決定論（例: sha256(seed:target:id) の下位ビット）+ **層化**: 各評価対象の
  エッジケース / 敵対的（adversarial）が検証用データにも必ず入るようにする（normal だけの検証用データは汎化検証にならない）。
- 目安 学習用データ 70% / 検証用データ 30%。
- 整合の機械検証を必ず用意する: 全ケースが学習用データ xor 検証用データ に exactly-once /
  splits にあって dataset に無い id が無い / silver タグ残存なし（下書きケース（silver, レビュー前）は 41 で扱う）。

## runner への最小変更

- dataset loader の読み先を `evals/datasets/` に向ける（既存パスから `git mv` で移設）
- run 出力先を `evals/runs/<timestamp>/` に変更し、report と一緒に config.json を書く
- 旧結果ディレクトリ（gitignored）は残置してよい（過去の遺物）

## やってはいけないこと

- run 結果を gitignore に置きっぱなしにする（config.json ごと commit して資産化する）
- config.json の target モデル名を「ラベル」で書く（実際に使われた値から取る）
- 実行時ランダム分割（splits.json に case id を明示列挙して固定する）
- ディレクトリ構造を手法ごとに変える（全手法が同じ `evals/` 構造・同じ report スキーマを共有する）
