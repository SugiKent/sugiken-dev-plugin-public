# OpenSpec plugin

日本語化した OpenSpec ワークフロースキルに、直近のターンの Haiku によるまとめを右ペインに表示する Claude Code mod を同梱しています。

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

## ペイン

対話型の terminal / Desktop でセッション開始時に自動で開きます（キーボードフォーカスは奪いません）。ターン終了ごとに、そのターンのエージェント応答を Haiku（`haiku` エイリアス）に渡し、要約と簡単な図をペインに表示します。呼び出しはターンとは別に行い、次のプロンプトを待たせません。

表示内容は上から次のとおりです。

* `Haiku: <状態>`：未実行・リクエスト中・応答あり（ms）・失敗（理由と HTTP ステータス）・スキップ理由
* 「再要約」「閉じる」ボタン
* Haiku のまとめと使用トークン数
* 最下部に mod の version（`openspec mod vX.Y.Z`）

`openspec/` 配下のファイルは読みません。Haiku に送るのは各ターンの応答テキスト（先頭2万文字まで）だけです。認証は Claude Code セッションのものを使うため API キーは不要です。

右ペインの希望幅は画面幅の約30%です。Claude の最低幅・配置ルール、ドラッグ等で調整した幅が優先されます。

* `/openspec-pane`：開く。ペインへフォーカスを移します。
* `/openspec-pane refresh`：直近の応答を再要約します。
* `/openspec-pane off`：閉じて、このセッションの自動表示を止めます。
* `/openspec-pane on`：自動表示を再開します。

terminal と Desktop の Code タブで描画します。VS Code のチャットパネルや `claude -p` は表示対象ではありません。

## 検証

```sh
claude plugin validate plugins/openspec --strict
claude plugin test plugins/openspec
```

mod のテストは実セッション・ログイン・通信・モデル呼び出しを使わずに、イベントと描画ツリーを検証します。モデルの応答はテスト内で差し替えます。実画面のレイアウト確認は別途必要です。

API の参照先: [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)、[Draw in the interface](https://code.claude.com/docs/en/plugins/mods/interface)、[Test a mod](https://code.claude.com/docs/en/plugins/mods/test)。翻訳済みスキルの出典は [NOTICE.md](NOTICE.md) を参照してください。
