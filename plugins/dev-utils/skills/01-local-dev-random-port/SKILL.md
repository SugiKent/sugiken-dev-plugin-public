---
name: 01-local-dev-random-port
description: "個人開発プロジェクトでローカル開発時に host (mac) 側へ露出する port を、通例値ではなくランダムな高位 port に割り当てるためのスキル。docker compose のミドルウェア（Postgres / MySQL / Redis / MongoDB など）だけでなく、client の Vite dev server（既定 5173）や server（Fastify / Express などの API サーバ、既定 3000 / 8080）の port も対象とする。「docker compose」「docker-compose.yml」「postgres」「mysql」「redis」「mongo」「vite」「dev server」「Fastify」「Express」「ローカル DB」「ローカルキャッシュ」「ポート」「port」等の発話・タスク要求時に使用。複数プロジェクト同時起動時の port 衝突や、ホストにすでに同じ DB / dev server が動いている場合の事故を防ぐ。"
---

# ローカル開発 host port ランダム化スキル

個人開発でローカル開発環境を立てるとき、 **host (mac) 側に露出する port を、通例値（5432, 6379, 5173, 3000 など）ではなく、ランダムな高位 port に割り当てる** ためのスキル。

対象は次の 3 系統すべて:

1. **ミドルウェア（docker compose）** — Postgres 5432 / Redis 6379 / MySQL 3306 / MongoDB 27017 など
2. **client（Vite dev server）** — 既定 5173
3. **server（API サーバ）** — Fastify / Express など、既定 3000 / 8080 / 4000 など

理由は単純で、 **複数プロジェクトを並行で動かすときに必ず衝突するから** 。個人開発では同時に 3〜5 プロジェクト触ることも珍しくなく、毎回「あれ、どの compose / dev server が動いてるんだっけ」と止めて回るのは時間の無駄。さらに、ホスト Mac に Homebrew で `postgresql` / `redis` を入れている、別プロジェクトの Vite が 5173 を握っている、といった状況で通例 port が完全に被って起動失敗する。

docker container 側の port は変えない（イメージ標準のまま）。 **host 側に出る port だけランダム化** する。

---

## 0. 大原則

host 側に露出する port を書くときは:

1. **host 側 port は `30000-49151` の高位 port からランダムに 1 つ選ぶ**
2. **container 側 port / プロセス内部の概念上のデフォルトは変えない** （Postgres は 5432、Redis は 6379 など。docker の場合は container 側、Vite / server の場合は「標準ではこの port」という前提）
3. 選んだ host port は **`.env` / `.env.example` 経由で参照** し、 アプリ側の `DATABASE_URL` / `REDIS_URL` / `VITE_PORT` / `PORT` / `VITE_API_URL` などと整合させる
4. プロジェクト内で **一度決めた port は固定** する（毎回ランダムだとチーム共有・再起動で壊れる。「初回ランダム生成 → 以降固定」が正解）

```yaml
# 悪い例: host port が通例値、他プロジェクトと衝突する
services:
  db:
    image: postgres:16
    ports:
      - "5432:5432"   # ← host も 5432。NG

# 良い例: host port を高位ランダム値に
services:
  db:
    image: postgres:16
    ports:
      - "${POSTGRES_HOST_PORT:-34521}:5432"  # ← host だけランダム、container は標準のまま
```

```ts
// 悪い例: Vite dev server が既定 5173 のまま。別プロジェクトの Vite と衝突する
// vite.config.ts
export default defineConfig({ server: { port: 5173 } })  // NG

// 良い例: env から受けてランダム高位 port を既定にする
export default defineConfig({
  server: { port: Number(process.env.VITE_PORT) || 38211 },
})
```

```ts
// 悪い例: API サーバが既定 3000 のまま
app.listen({ port: 3000 })  // NG

// 良い例: env から受けてランダム高位 port を既定にする
app.listen({ port: Number(process.env.PORT) || 36740 })
```

---

## 1. port 採番ルール

### 採番範囲: `30000-49151`

- **`< 1024`**: privileged port、避ける
- **`1024-29999`**: 各種サービスが使っている可能性、避ける
- **`30000-49151`**: 安全な高位 port、ここから選ぶ
- **`49152-65535`**: Linux/macOS の ephemeral port 範囲、OS が一時 port として使うので避ける（被ると稀に起動失敗する）

### 採番手順

```bash
# 30000-49151 の範囲からランダムに 1 つ
echo $((30000 + RANDOM % 19151))
```

採番した値は **`.env` と `.env.example` の両方に記録** する（[[01-env-vars-setup]] と合わせる）。
host port は **必ず env var 経由で指定可能な状態にする** （`${POSTGRES_HOST_PORT:-...}` / `process.env.VITE_PORT || ...` / `process.env.PORT || ...` のような形）。 default 値を直書きするのは「初回 onboarding をスムーズにするため」であり、運用上は env var で上書きできることが第一義。 default 値だけハードコードして env 参照を消すのは NG。

### ミドルウェア・client・server をまとめて採番する

1 プロジェクトには通例 **ミドルウェア複数 + Vite + server** が同居する。それぞれ別の値を採番し、 **同一プロジェクト内で値が重複しないようにする** 。

```bash
# 例: Postgres / Redis / Vite / server の 4 個を重複なく採番
shuf -i 30000-49151 -n 4
```

採番結果の割り当て例:

| 用途 | env var | 採番値（例） |
|------|---------|------------|
| Postgres host port | `POSTGRES_HOST_PORT` | 34521 |
| Redis host port | `REDIS_HOST_PORT` | 41203 |
| Vite dev server | `VITE_PORT` | 38211 |
| API server | `PORT` | 36740 |

### 採番値の衝突確認（必須）

採番値はあくまで「30000-49151 範囲から確率的に空いていそうな値」でしかなく、衝突しないことは保証されない。 **採番直後に必ず実際にその port が使えるかを確認** する。確認方針は次のいずれか:

- **実起動による確認（推奨）**:
  - ミドルウェア: 採番後、その値を `.env` に入れた状態で実際に `docker compose up -d` を試み、当該 service が `Up` 状態かつ `docker compose ps` の PORTS 欄に採番値が現れるかを見る。
  - client / server: 採番値を `.env` に入れた状態で `pnpm dev` 等を起動し、ログに出る URL / listen port が採番値であること、`http://localhost:<PORT>` に到達できることを確認する。
  - host 側で `lsof -i :<PORT>` / `nc -z localhost <PORT>` を併用してもよい。
- **横断スキャンはしない**: ホスト上の「他プロジェクトを全部見て port マップを作る」のような網羅的調査はしない。確認の責任範囲はあくまで「いま起動しようとしているこのプロジェクト」に閉じる。

### port の取得・確認が失敗した場合: fail させる

採番値が衝突していた、または起動時に bind できなかった場合（`bind: address already in use` / `EADDRINUSE` 系のエラー、`docker compose up` で当該 service だけ `Exited` になった、Vite / server が `Port is already in use` で落ちた等）は、 **その状態のまま強制スタートさせない** 。 具体的には以下を **やらない** :

- 別の port にこっそり差し替えて起動を続行する（ユーザーが気付かないうちに前提が変わる）
- Vite の「指定 port が埋まっていたら次の空き port を自動で使う」挙動（`strictPort: false`）に任せて起動を続行する
- `restart: always` 等で再試行ループに入れて成功するまで回す
- `network_mode: host` 等にして port 衝突を迂回する
- エラーを握り潰して「起動した（ように見える）」と報告する

代わりに **明示的に fail させ** 、ユーザーに以下を提示して判断を仰ぐ:

1. どの port がどう衝突したか（採番値・該当 service 名 / プロセス名・取得したエラーメッセージ）
2. `lsof -i :<PORT>` 等で衝突相手の特定を促す
3. 採番値の再生成（§1 採番手順を再実行）か、衝突相手側を止めるか、ユーザー側に選択肢を渡す

> Vite は既定で `strictPort: false`（埋まっていたら勝手にズラす）。 **本スキルでは `strictPort: true` を必須** とする。 こっそりズレると `VITE_API_URL` 等の前提が崩れ、衝突を握り潰したのと同じ事故になる。

「動いていればよし」ではなく、 **port 設定が想定通りに通っていることを起動成功で確認できるまでが採番作業** という方針を取る。

---

## 2. ミドルウェア（`docker-compose.yml`）の書き方

### 基本形（host port を env 経由で受ける）

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapp_dev
    ports:
      - "${POSTGRES_HOST_PORT:-34521}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_HOST_PORT:-41203}:6379"
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

ポイント:
- `${VAR:-default}` 形式で env から受ける。env が無くてもデフォルト値で起動する
- デフォルト値は採番時に決めた値を直書き（同じプロジェクトでは固定）
- container 側（`:5432`, `:6379`）は **絶対に変えない** 。中で動くプロセスのデフォルト port をそのまま使う

---

## 3. client（Vite dev server）の書き方

`vite.config.ts` で `server.port` を env から受け、 `strictPort: true` を付ける。

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: Number(process.env.VITE_PORT) || 38211, // 採番した値を default に
    strictPort: true, // 埋まっていたら勝手にズラさず fail させる（§1 参照）
  },
});
```

ポイント:
- `VITE_PORT`（または `PORT`）を env から受け、採番値を default にする
- **`strictPort: true` は必須** 。 Vite 既定の「自動でズラす」挙動は衝突の握り潰しになるため禁止
- `package.json` の `dev` script に `--port` をハードコードしない（env と二重管理になる）。 config 側で env を読むのが正

---

## 4. server（API サーバ）の書き方

Fastify / Express などは `PORT` を env から受け、採番値を default にする。

```ts
// Fastify の例
const port = Number(process.env.PORT) || 36740; // 採番した値を default に
await app.listen({ port, host: "0.0.0.0" });
```

```ts
// Express の例
const port = Number(process.env.PORT) || 36740;
app.listen(port, () => console.log(`listening on http://localhost:${port}`));
```

ポイント:
- `PORT` を env から受け、採番値を default にする
- **本番（Railway / Cloud Run 等）では platform が `PORT` を注入する** ので、 `process.env.PORT` を優先する形（`process.env.PORT || <採番値>`）にしておけば本番でもそのまま動く。 採番値はあくまでローカル default
- client が server を叩く URL（`VITE_API_URL` など）の port は、 server の採番値と整合させる

---

## 5. `.env` / `.env.example` 側

[[01-env-vars-setup]] のルールに従い、 root（または各 workspace）の `.env` / `.env.example` 両方に書く。

```dotenv
# --- Local dev host ports (random, do not change without reason) ---
POSTGRES_HOST_PORT=34521
REDIS_HOST_PORT=41203
VITE_PORT=38211
PORT=36740

# --- Connection strings (use host ports above) ---
DATABASE_URL=postgresql://postgres:postgres@localhost:34521/myapp_dev
REDIS_URL=redis://localhost:41203

# --- client → server ---
VITE_API_URL=http://localhost:36740
```

ポイント:
- `DATABASE_URL` / `REDIS_URL` の **host port は採番した値で書く** （localhost からの接続なので host 側 port が見える）
- `VITE_API_URL` 等、client が host 経由で server を叩く URL の port は **server の採番値** に合わせる
- container 同士の接続（compose 内 service 間）は **container 標準 port をそのまま使う** （`postgres://db:5432/...` のように service 名で繋ぐ）
- 採番した port には **「触らない」** ことを 1 行コメントで明示しておく

### アプリ起動経路と port の対応

| 起動経路 | 接続先 | 使う port |
|---------|--------|----------|
| `pnpm dev`（Vite, host から） | `localhost` | `VITE_PORT`（採番値） |
| `pnpm dev`（server, host から） | `localhost` | `PORT`（採番値） |
| client → server（host 経由） | `localhost` | server の採番値（`VITE_API_URL`） |
| `pnpm dev` → DB（host から） | `localhost` | DB host port（採番値） |
| compose 内の別 service から | service 名（例: `db`） | container 標準 port |
| 本番（Railway 等） | managed DB / platform 注入 PORT | provider が払い出す値 |

---

## 6. 既存プロジェクトのリファクタ手順

既に `5432:5432` / Vite 5173 / server 3000 のようになっているのを直すとき:

1. **採番**: 必要な host port をまとめてランダムに決める（§1。ミドルウェア + Vite + server を一括で）
2. **ミドルウェア**: `docker-compose.yml` の `host:container` の host 側だけ env 参照に書き換える（§2）
3. **client**: `vite.config.ts` を `server.port` env 参照 + `strictPort: true` に書き換える（§3）
4. **server**: listen port を `process.env.PORT || <採番値>` に書き換える（§4）
5. **`.env` / `.env.example`**: `POSTGRES_HOST_PORT` / `VITE_PORT` / `PORT` 等を追加、 `DATABASE_URL` / `VITE_API_URL` の port も更新（§5）
6. **動作確認（採番値の衝突チェックを兼ねる）**:
   ```bash
   docker compose down
   docker compose up -d
   docker compose ps                # 全 service が Up かつ host port が採番値になっているか確認
   psql "$DATABASE_URL" -c '\l'     # 実際につながるか
   pnpm dev                         # Vite / server が採番値で listen しているか（ログの URL を確認）
   ```
   - いずれかが `Exited` / `Restarting` ループ、`bind: address already in use` / `EADDRINUSE` / `Port is already in use` を出している場合は、 **そのまま運用を続行せずに fail とみなす** 。 §1「採番値の衝突確認」「fail させる」の方針に従い、採番値の再生成または衝突相手の停止をユーザーに判断させる。
7. **README / docs 更新**: README に `localhost:5432` / `localhost:5173` / `localhost:3000` 等が直書きされていれば、 `.env` を参照する形に書き換える（ハードコードしない）

---

## 7. やってはいけないこと

- **host 側を `5432` / `6379` / `3306` / `27017` / `5173` / `3000` のまま にする** 。他プロジェクト・ホスト側 DB / 別 Vite と衝突する。
- **container 側 port まで変える** 。中で動くプロセスはデフォルト port で listen しているので、ここを動かすと `command:` や `healthcheck:` まで全部直す羽目になる。host 側だけ変える。
- **Vite の `strictPort` を `false`（既定）のままにする** 。 埋まっていたら勝手に次の port にズレ、 `VITE_API_URL` 等の前提が崩れる。 `strictPort: true` で fail させる。
- **毎回ランダム採番し直す** 。一度決めたら固定。再起動・他人の clone で `.env` 更新を強要するのは事故の元。
- **採番値をコード / compose に直書きして `.env` に持たない** 。アプリ側 `DATABASE_URL` / `VITE_API_URL` と二重管理になり、片方変えてもう片方忘れる。
- **`49152-65535` から採番する** 。 OS の ephemeral port と被って稀に起動失敗する。 `30000-49151` から取る。
- **本番の Railway / Supabase 等の managed DB 接続文字列・platform 注入 PORT にこのローカル採番値を流用する** 。あくまでローカル用。本番は provider が払い出す値 / 注入する `PORT` を使う（server は `process.env.PORT` 優先にしておく）。
- **port 衝突を握り潰して強制的に起動を続行する** 。 別 port にこっそり差し替える / Vite の自動ズラしに任せる / `restart: always` で成功するまで回す / `network_mode: host` で迂回する / エラーを無視して「動いた」と報告する、のいずれも禁止。 衝突したら明示的に fail させ、ユーザーに採番再生成 or 衝突相手の停止を判断させる（§1「fail させる」参照）。
- **host port を env var 経由ではなく直書きで固定する** 。 default 値は書いてよいが、必ず `${POSTGRES_HOST_PORT:-...}` / `process.env.PORT || ...` のように env で上書き可能な形にする。 env 参照を消すと、衝突時にユーザー側で port を差し替える手段が無くなる。

---

## 8. よくある質問

**Q. host port を完全に書かず、 docker / Vite に自動採番させたいのはダメ?**
- 起動のたびに変わるので、 `.env` の `DATABASE_URL` / `VITE_API_URL` と整合させられない。 **固定したランダム値** が個人開発では最適解。

**Q. `expose:` で済む場合は?**
- compose 内 service からしか繋がない（host から直接叩かない）ものは `ports:` を書かず `expose:` だけでよい。その場合 host port は不要。「DBeaver で見たい」「psql で繋ぎたい」用途があれば `ports:` を書く。

**Q. server は本番で `PORT` を platform が注入する。ローカル採番値と矛盾しない?**
- `process.env.PORT || <採番値>` の順にしておけば、ローカルでは `.env` の採番値、本番では platform 注入値が使われる。矛盾しない。

**Q. チーム開発でも同じ?**
- チーム開発でも有効。 `.env.example` に採番値を入れておけば clone 後そのまま動く。各メンバーのマシンに既存 Postgres / Vite があっても衝突しない。

---

## 関連スキル

- [[01-env-vars-setup]] — `.env` / `.env.example` の更新ルール。採番した port を env に書くときに従う。

---

## 自動起動

<auto_invoke>
<trigger_phrases>
- "docker compose"
- "docker-compose"
- "docker-compose.yml"
- "compose.yml"
- "compose.yaml"
- "postgres"
- "postgresql"
- "mysql"
- "mariadb"
- "redis"
- "mongo"
- "mongodb"
- "vite"
- "vite.config"
- "dev server"
- "Fastify"
- "Express"
- "listen port"
- "ローカル DB"
- "ローカルキャッシュ"
- "ローカル開発環境"
- "DB コンテナ"
- "Redis コンテナ"
- "ポート"
- "port"
- "5432"
- "6379"
- "3306"
- "27017"
- "5173"
- "3000"
</trigger_phrases>
</auto_invoke>
