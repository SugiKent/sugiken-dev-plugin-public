# evals/ ディレクトリ設計と冪等性の担保

## 原則

- **コードとデータ/資産を分離する**: eval を「実行するコード」（runner / 判定役の LLM（judge） / 評価対象（target））は
  既存のパッケージ（例: `apps/eval/`）に残し、「人間検証済みデータ（gold）と分析結果」は
  repo root の `evals/` に住まわせる。確定した正解データ（gold）は人間の意思決定の成果物であり、コードより長寿命。
- **run 結果は commit する**。gitignore の揮発置き場に出すと「過去にどの条件で何点だったか」が
  消え、改善の証明ができなくなる。1 run 数十 KB なのでコストは無視できる。

## 構造

```
evals/
├── README.md            # 運用手順・合格ゲート定義・中心思想・フェーズ計画（方針転換も追記）
├── datasets/            # ★ gold（人間検証済み・唯一の正）。runner がここを読む
│   ├── SCHEMA.md        # ケースの書き方・target 別の expected 形式・gold 昇格基準
│   ├── POLICY.md        # 人間が確定した製品判断基準集（レビュー決定の一般化先）
│   ├── SILVER_REVIEW.md # Silver→Gold レビュー資料（決定後は記録として保持）
│   ├── splits.json      # train/holdout 分割の明示固定
│   └── <target>/*.yaml  # 1 ケース = 1 ファイル
├── runs/                # ★ タイムスタンプ付き結果（commit する未来資産）
│   └── <timestamp>/
│        ├── config.json # 入力条件の刻印（下記）
│        ├── report.{md,json}
│        └── gap-map.md  # 失敗分類（Phase 2 で作る）
└── optimizer/
     ├── history.md      # 最適化 iteration の採用/棄却台帳（1 行 = 1 振る舞い変更）
     └── <GEPA ハーネス一式>  # references/gepa-optimizer.md 参照
```

## config.json（冪等性の刻印）

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
  "judgeModel": "judge のモデル id",
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
- LLM の非決定性は消せないので、判定役を 2 回回して判定役間の κ（Cohen's kappa）を出す
  `--agreement` 相当の仕組みで**揺れの範囲を監視**する（κ が低い評価対象は expected か
  判定基準（criteria）が曖昧なサイン）。

## splits.json

```json
{
  "_comment": "APO は train のみで改善し holdout で汎化検証（過学習の歯止め）",
  "seed": 20260712,
  "targets": {
    "<target>": { "train": ["case-id", ...], "holdout": ["case-id", ...] }
  }
}
```

- **case id の明示列挙**で固定する（実行時のランダム分割は再現性がない）。
- 分割は決定論（例: sha256(seed:target:id) の下位ビット）+ **層化**: 各評価対象の
  エッジケース / 敵対的（adversarial）が検証用データ（holdout）にも必ず入るようにする（normal だけの検証用データは汎化検証にならない）。
- 目安 学習用データ（train）70% / 検証用データ 30%。
- 整合の機械検証を必ず用意する: 全ケースが学習用データ xor 検証用データ に exactly-once /
  splits にあって dataset に無い id が無い / silver タグ残存なし。

## runner の変更点

- dataset loader の読み先を `evals/datasets/` に向ける（既存パスから git mv で移設）
- run 出力先を `evals/runs/<timestamp>/` に変更し、report と一緒に config.json を書く
- 旧結果ディレクトリ（gitignored）は残置してよい（過去の遺物）
