# OpenSpec plugin

日本語化した OpenSpec ワークフロースキルに、関連する spec・進行中 change を一覧する Claude Code mod を同梱しています。

## インストールと確認

```sh
claude plugin install openspec@sugiken-dev-public
# インストール済みの場合
claude plugin update openspec@sugiken-dev-public
```

ローカルのソースを試す場合は、開発対象のプロジェクトルートから起動します。

```sh
claude --plugin-dir /absolute/path/to/sugiken-dev-plugins-public/plugins/openspec
```

Claude Code CLI v2.1.287 以降が必要です。起動後、`/plugin` の mod 一覧で `openspec` が読み込まれていることを確認してください。インストール済みのセッションでは `/reload-plugins` または再起動で更新を読み込みます。

## 自動表示

エージェントが `openspec/` 配下のファイルを読み取り・編集し始めると、**ツールの実行前**に OpenSpec ペインを開きます。ファイルの生成も対象です。プロジェクト内のソースファイルから関連する仕様を判定できた場合も、自動表示します。自動表示はプロンプトからキーボードフォーカスを奪いません。

右ペインの希望幅は、測定した画面幅の約30%です。画面幅が変わると指定を更新します。Claude の最低幅・配置ルール、ユーザーがドラッグ等で調整した幅が優先されるため、常に30%になるわけではありません。右側への配置は fullscreen の広い端末で利用できます。狭い端末の自動表示は保留され、手動で開くとプロンプト上側に表示されることがあります。

- `/openspec-pane`：開く。操作用フォーカスをペインへ移します。
- `/openspec-pane refresh`：文書と対応表を読み直して開きます。
- `/openspec-pane off`：閉じて、このセッションの自動表示を止めます。
- `/openspec-pane on`：自動表示を再開して開きます。

ペイン内の「閉じる」や Claude 側の閉じる操作でも自動表示を停止します。Esc はプロンプトにフォーカスを戻します。

ペインには、最上部に Haiku へのリクエスト状態（未実行・リクエスト中・応答あり・失敗とその理由・スキップ理由）、対象の change、Haiku によるまとめ、最下部に mod の version を表示します。spec や change の本文、参照ファイルパスは表示しません。

ファイル操作後とターン終了時に情報を更新します。

## 影響と意外な発見

対象は、直近に操作した `openspec/changes/<change>/` の change です。該当しない場合は、関連判定で最初に見つかった change を使います。

モデルには、先にモデルを使わない機械的な照合の結果を渡します（ペインには表示しません）。

- MODIFIED の delta に書かれていない scenario（MODIFIED は要件を丸ごと置き換えるため、その scenario は消えます）
- REMOVED で消える scenario
- 現行 spec に無い要件を MODIFIED・REMOVED・RENAMED している、または既にある要件名で ADDED している
- 進行中の別の change が同じ capability の同じ要件を変更している
- 大文字小文字・記号・表記の揺れだけが違う、名前の似た要件
- 別の capability の spec 本文が、変更対象の要件名に言及している

Claude（`haiku` エイリアス。現在は Haiku 5.5）が「影響のまとめ」と「意外な発見」を出します。モデルには、機械的な照合の結果、対象 change の proposal・design・tasks・デルタ仕様、同じ capability の現行 spec、同じ capability を触る別の change のデルタ仕様、照合結果で根拠に挙がった spec を渡します。渡す本文は合計6万文字までで、超えた分は省略し、省略した文書名をペインに表示します。

- 呼び出し：対話型セッションでペインが開いている間、ターン終了時に1回呼びます。モデルに渡す内容が前回と同じなら呼びません。直近8件の結果はセッション内でキャッシュします。「再分析」ボタンはキャッシュを使わずに呼び直します。`claude -p` などの非対話セッションでは呼びません。
- 認証と費用：Claude Code セッションの認証で `$.model.complete` を呼びます。API キーの設定は不要です。サブスクリプションでログインしている場合はプランの利用枠、API キーの場合は従量課金で消費します。入力約2万トークン・出力約1,500トークンの場合、Haiku 5.5 の API 料金（入力 $0.10・出力 $0.50 / MTok）で1回あたり約 $0.003 です。使ったトークン数はペインに表示します。
- 待ち時間と失敗：呼び出しはターンの処理とは別に行うため、次のプロンプトを待たせません。上限は90秒です。状態と失敗の理由（`api-error` と HTTP ステータス等）は最上部に表示します。
- AI の結果は根拠のファイルを添えて出させますが、誤りを含む場合があります。判断前に本文で確認してください。履歴はセッション内の直近40パスに限定し、`/clear`・mod の再読み込みで忘れます。同じチェックアウトの別セッションと履歴を共有しません。

## 関連の判定

対象の change の判定には、次の根拠を使います（ペインには表示しません）。

- **直接**：操作した OpenSpec ファイル、その capability、またはその change の文書。
- **パス記述による推定**：文書内のソースファイルの完全な相対パス、バッククォートで囲まれたディレクトリや glob。ファイル名だけの一致では判定しません。
- **対応表**：プロジェクト側で指定したファイルと capability・change の対応。
- **change の対象仕様**：関連 change のデルタ仕様と同じ capability の現行 spec。

関連 change に属する proposal・design・tasks・デルタ仕様もまとめて判定の対象にします。`openspec/changes/archive/` は対象から除きます。対象の change が見つからない場合は「対象 change 待ち」と表示します。

対応表は開発対象プロジェクトの **`openspec/pane-map.json`** に配列として保存します。mod が作成・変更することはありません。

```json
[
  {
    "files": ["src/auth/**", "server/routes/session.ts"],
    "specs": ["authentication"],
    "changes": ["add-session-expiry"]
  }
]
```

`specs` は `openspec/specs/<capability>/` のディレクトリ名、`changes` は `openspec/changes/<change>/` のディレクトリ名です。`files` はプロジェクトルートからの相対パスで、`*`・`?` はパス区切り以外、`**` は区切りを含めて一致します。絶対パス・親ディレクトリへの移動は指定できません。

文書にパス記述がなく対応表もない場合、意味だけからの関連推定は行いません。Bash はコマンドに明示された `openspec/...` 等のリテラルパスのみ検知します。変数・glob・スクリプト内部でアクセスしたファイルは追跡できません。Grep・Glob は明示された検索対象パスを観測し、検索結果の各ファイルを操作履歴には追加しません。

## 読み取りの範囲と表示環境

mod の読み取りは、セッションのプロジェクトルートを境界として見つけた `openspec/` 配下の標準文書と対応表に限定します。対象のコード本文、Git の差分、会話本文は読み込みません。ファイルの書き込み、プロセス起動、独自のネットワーク通信はありません。モデル呼び出しは上記の影響分析だけで、送るのは `openspec/` 配下の文書の本文です。シンボリックリンクを経由する文書は索引に含めません。

文書は最大200件、各256KiB、合計4MiB、ディレクトリ取得は最大600回に制限します。取得上限・取得失敗・不正な対応表がある場合は未取得／未判定の表示を出します。表示処理の失敗でも、元のツールの実行や結果を変更しません。

terminal と Desktop の Code タブで描画します。VS Code のチャットパネルや `claude -p` は表示対象ではありません。mods が管理設定等で無効な場合も読み込まれません。

## 検証

```sh
claude plugin validate plugins/openspec --strict
claude plugin test plugins/openspec
```

mod のテストは実セッション・ログイン・通信・モデル呼び出しを使わずに、イベントと描画ツリーを検証します。モデルの応答はテスト内で差し替えます。実画面のレイアウト確認は別途必要です。

API の参照先: [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)、[Draw in the interface](https://code.claude.com/docs/en/plugins/mods/interface)、[Test a mod](https://code.claude.com/docs/en/plugins/mods/test)。翻訳済みスキルの出典は [NOTICE.md](NOTICE.md) を参照してください。
