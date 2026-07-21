---
name: 01-railway-log-investigation
description: 個人開発プロジェクトで Railway 上に稼働している service (HTTP server / worker など) のログから HTTP 5xx や例外などのエラーを発見・調査し、`railway_logs_analysis/{timestamp}/report.md` に構造化レポートとしてまとめる Skill。「Railway のログを確認」「server のエラーを調べて」「500系を探して」「過去のデプロイを遡ってエラー調査」「Railway logs analysis」「最初に出たエラーを見つけて」などの発話・タスク要求時に使用。Railway CLI v4 のログ取得は単一デプロイメント内に閉じている制約を踏まえ、デプロイメントを過去に遡る形で実質的な日付 range を拡張する。
---

# Railway Log Investigation Skill

Railway 上の service ログから HTTP 5xx や例外などの障害痕跡を **過去にさかのぼって** 発見し、構造化レポート (`railway_logs_analysis/{timestamp}/report.md`) として残すための Skill。

## 起動ワード (自動トリガー)

- 「Railway のログ確認して」「server のエラーログ調べて」
- 「500系のエラーを探して」「最初に出たエラーを見つけて」
- 「過去のデプロイメントを遡ってエラー調査」
- 「Railway logs を分析してレポート作成」
- 「日付 range を伸ばしてエラーを観測」

## 前提

- `railway` CLI v4 以上 (`railway --version` で確認)
- `railway whoami` でログイン済み
- `jq` インストール済み (ローカルでの JSON 解析に必須)
- 対象 Railway プロジェクトに対する read 権限

## 最重要: Railway CLI のログ取得モデル

**Railway CLI v4 の `railway logs` には日付指定オプションが存在しない。** `--lines N` は「**最新の (もしくは指定した) 1 つのデプロイメント内** の最後 N 行」しか取れない。

つまり「日付 range を伸ばす」というユーザーの要求は、技術的には以下の 2 段階に翻訳される必要がある:

1. 同一デプロイ内で `--lines` を倍々に拡張 (例: 200 → 500 → 1000 → …) し、そのデプロイ全体のログを取得
2. それでも見つからなければ、`railway deployment list` で **過去のデプロイメントを 1 つずつ遡り**、各デプロイの `--lines 1000 --json <deploymentId>` を取得

`REMOVED` 状態のデプロイは Railway 側でログが既に削除されており、これ以上過去には物理的に遡れない。

## 標準手順

### Step 1: プロジェクトリンクと service 特定

```bash
# 必要なら link
railway whoami
railway status                          # link 済みか確認
railway link --project <project-name>   # 未 link なら (対話 prompt が出るが workspace/env は指示通りに)

# service 一覧
railway service status --all
```

調査対象の service 名 (HTTP API server / worker など) を確定する。複数 service がある場合はそれぞれに対して以降の手順を実行する。

### Step 2: 出力ディレクトリ準備

```bash
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p "railway_logs_analysis/$TS"
echo "$TS" > /tmp/railway_log_ts.txt
```

`.gitignore` に `railway_logs_analysis/` が含まれているか確認し、無ければ追記する (**必ず gitignore 対象にする** — トークンや個人情報が混入するリスクがあるため)。

### Step 3: ログ形式の偵察

実際のログフィールドを 50〜100 行ほどサンプル取得して `jq` でフィールド構造を確認する。

```bash
railway logs --service <svc> --lines 100 --json > "railway_logs_analysis/$TS/sample.json"
jq -r '.res.statusCode // empty' "railway_logs_analysis/$TS/sample.json" | sort | uniq -c
```

HTTP ステータスがどのキー (`.res.statusCode` / `.statusCode` / `.status` など) に入っているか、`level` のレベル分布、stderr 起因のノイズ (例: ORM の deprecation 警告など) がどう混ざるかを把握する。**Railway 側の `--filter @level:error` だけに依存すると、ORM の起動時警告などを誤検知するため、`statusCode` ベースでローカル再フィルタする方が信頼できる。**

### Step 4: デプロイメント一覧取得

```bash
railway deployment list --service <svc> --limit 50 --json \
  > "railway_logs_analysis/$TS/deployments.json"

# 非 REMOVED を新しい順に
jq -r '[.[] | select(.status == "SUCCESS" or .status == "FAILED" or .status == "SKIPPED")]
       | sort_by(.createdAt) | reverse
       | .[] | "\(.id)|\(.createdAt)|\(.status)"' \
       "railway_logs_analysis/$TS/deployments.json"
```

### Step 5: 過去デプロイへの再帰的拡張 (本 Skill の核)

`fetch_deps.sh` (テンプレートを後述) で全 SUCCESS/FAILED/SKIPPED デプロイを順次 fetch し、各デプロイの 5xx 件数を集計する。**5xx を発見した時点で停止せず**、すべてのアクセス可能デプロイをひと通り fetch することを推奨 (停止後だと「観測下限まで遡ったか」が読者から判定不能になるため)。

```bash
bash /tmp/fetch_deps.sh   # 本ファイル末尾のテンプレ参照
```

集計テーブルは `per_deployment_summary.tsv` に書き出す:

```
deployment_id  created_at  status  lines_fetched  fivexx_count  oldest_5xx_ts
```

### Step 6: 統計取得 (現稼働デプロイの詳細)

最新の SUCCESS デプロイについて以下を集計しレポートに含める:

```bash
F="railway_logs_analysis/$TS/dep_<date>_<shortid>.jsonl"
jq -r '.res.statusCode // empty' "$F" | sort | uniq -c | sort -rn   # ステータス分布
jq -r '.level // empty'           "$F" | sort | uniq -c | sort -rn   # レベル分布
jq -c 'select(.level == "error")' "$F"                                # error レコード全件
jq -c 'select(.res.statusCode != null and (.res.statusCode|tonumber) >= 500)' "$F"  # 5xx 抽出
```

### Step 7: レポート作成

`railway_logs_analysis/{TS}/report.md` を以下のセクション構成で生成する:

- **TL;DR**: 5xx が見つかった / 見つからない、最古のタイムスタンプ
- **調査手順**: 何をどの順で実行したか (再現性のため)
- **デプロイメント別サマリ**: マークダウン表で全デプロイの行数・5xx 件数を提示
- **範囲拡張のロジック**: `--lines` の試行履歴・REMOVED でカバー外になった範囲
- **現稼働デプロイの詳細統計**: ステータス分布、レベル分布、特異点 (401 など) の生 JSON
- **結論と推奨アクション**: アラート整備、ログ外部転送 (BetterStack / Axiom / Datadog) など
- **生成物一覧**: 同ディレクトリ内ファイルの説明テーブル

レポートの宛先は将来の自分または別の開発者なので、各 jq コマンド・取得行数・取得時刻を残し「もう一度同じ調査が走る前提」で書く。

## 共通の罠

### 1. `level=error` の誤検知

Node.js 系の HTTP framework (Fastify など) は起動時に ORM やプラグインの deprecation 警告を stderr に吐くことがあり、Railway はそれを `level: "error"` として分類する。`--filter @level:error` だけでは「真のエラー」と区別できないため、**必ず `statusCode` ベースで再フィルタすること**。

### 2. `REMOVED` 状態のデプロイログは取れない

`railway deployment list` で `status == "REMOVED"` のものは fetch しても `lines_fetched=0`。これは Railway 側のログ保持期間切れであり、ローカルから取り戻す手段はない。レポートには「ここから先は物理的に遡れない」と明記する。

### 3. `--lines` の見かけの上限

`--lines 500` を指定しても、デプロイメントが起動からまだ短時間しか経っていない場合は、その総ログ行数しか返らない (例: 283 行)。これは正常動作。`oldest timestamp == デプロイ起動時刻` であればそのデプロイは完全に取れている。

### 4. service link を強要しない

`railway logs --service <name>` を毎回付ければ `railway service link` は不要。`railway link` でプロジェクトと環境だけ link されていれば動く。

### 5. ロガーのネスト構造を見落とさない

framework によって `statusCode` の格納場所は異なる。たとえば Fastify + Pino では `request completed` ログは `.res.statusCode` に、独自エラーハンドラのログは `.statusCode` 直下に入る、というケースがある。プロジェクトのロガー設計に合わせて以下のように両方を救う:

```bash
jq -c 'select(
  (.res.statusCode // .statusCode // 0 | tonumber) >= 500
)' "$F"
```

## fetch_deps.sh テンプレート

```bash
#!/bin/bash
set -u
TS=$(cat /tmp/railway_log_ts.txt)
OUTDIR="railway_logs_analysis/$TS"
SVC="${SVC:?SVC environment variable is required (e.g. SVC=api)}"
LINES="${LINES:-1000}"
SUMMARY="$OUTDIR/per_deployment_summary.tsv"

printf "deployment_id\tcreated_at\tstatus\tlines_fetched\tfivexx_count\toldest_5xx_ts\n" > "$SUMMARY"

jq -r '[.[] | select(.status == "SUCCESS" or .status == "FAILED" or .status == "SKIPPED")]
  | sort_by(.createdAt) | reverse
  | .[] | "\(.id)|\(.createdAt)|\(.status)"' \
  "$OUTDIR/deployments.json" > "$OUTDIR/_dep_order.txt"

while IFS='|' read -r ID CREATED STATUS; do
  [ -z "$ID" ] && continue
  FILE="$OUTDIR/dep_${CREATED:0:10}_${ID:0:8}.jsonl"
  echo "--- Fetching $ID ($CREATED $STATUS)"
  railway logs --service "$SVC" --lines "$LINES" --json "$ID" \
    > "$FILE" 2> "${FILE}.err"
  L=$(wc -l < "$FILE" | tr -d ' ')
  X=$(jq -c 'select((.res.statusCode // .statusCode // 0 | tonumber) >= 500)' "$FILE" 2>/dev/null | wc -l | tr -d ' ')
  O=$(jq -c 'select((.res.statusCode // .statusCode // 0 | tonumber) >= 500)' "$FILE" 2>/dev/null \
       | jq -r '.timestamp' 2>/dev/null | sort | head -1)
  printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$ID" "$CREATED" "$STATUS" "$L" "$X" "${O:-NONE}" >> "$SUMMARY"
  echo "    lines=$L, 5xx=$X, oldest_5xx=${O:-NONE}"
done < "$OUTDIR/_dep_order.txt"

echo
echo "=== Summary ==="
column -t -s $'\t' "$SUMMARY"
```

`SVC` 環境変数で対象 service 名を渡す前提とする (`SVC=api bash /tmp/fetch_deps.sh`)。プロジェクト固有のデフォルト値を埋め込まない。

## 想定する成果物 (ディレクトリ構成)

```
railway_logs_analysis/{TS}/
├── report.md                        # 人間向けレポート (必ず作る)
├── deployments.json                 # railway deployment list の生 JSON
├── _dep_order.txt                   # 調査順
├── per_deployment_summary.tsv       # 集計表
├── dep_<date>_<shortid>.jsonl       # 各デプロイのログ (空ファイルは REMOVED 相当)
└── sample.json                      # ログ形式偵察用サンプル
```

## アンチパターン

| ❌ やってはいけないこと | ✅ 代わりにやること |
|---|---|
| `railway logs --lines 100000` で全期間取ろうとする | `railway deployment list` でデプロイ単位に分割して取る |
| `--filter @level:error` だけで判定 | `statusCode >= 500` でローカル再フィルタ |
| 5xx が見つかったら即停止して報告 | 観測下限 (REMOVED 境界) まで遡って「ここまでは無い」を確定する |
| `railway_logs_analysis/` をコミット | 必ず `.gitignore` に追加 (個人情報・トークン混入リスク) |
| デプロイ ID なしで `railway logs` を連発 | 過去デプロイは ID 必須。`<deploymentId>` を引数に渡す |
| 「日付 range を指定して取得」と勘違い | Railway logs に日付指定はない。デプロイメント遡行が唯一の方法 |

## 連携

- 5xx が大量に見つかったら、原因分析を Architect / Security Analyst 系の上位 agent に依頼する (codex / sub-agent 経由)
- 認証関連の 4xx 多発の場合は、server 側の auth 周りと client 側の token refresh ロジックを併せて読む
- 長期可視性を本格的に上げたい場合は、Railway のログ転送設定 (BetterStack / Axiom / Datadog 等) や、軽量な自前 error tracker (`01-mini-sentry-setup` を参照) をレポート末尾で推奨する
