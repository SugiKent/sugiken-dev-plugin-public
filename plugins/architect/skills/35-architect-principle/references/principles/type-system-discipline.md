# Type System Discipline（型の規律）

型を設計するとき、関数のシグネチャをレビューするとき、静的型付きの言語でコードを書くときに当てる。不正な状態を表現できなくし、意味のある primitive に印を付け、外部データは境界でパースし、変種を網羅し、正本のスキーマから導出する。

ありえない状態、取り違えた primitive、扱っていない変種を、コンパイラに拒否させる。特殊な場合やエラーの処理を増やすより、そうした場合が定義上ありえない形を選ぶ。

- **意味のある primitive に印を付ける。** `UserId` と `OrderId` は中身が文字列でも、入れ替えられてはいけない。それぞれに専用の型を与える（TypeScript なら brand を付けた交差型、ほかの言語なら newtype）。作るときに一度だけ検証し、その先は型を信頼する。同じ primitive 型で意味の違う引数が 2 つあるなら、印を付ける。
- **外部データは、パースするまで型がない。** RPC のペイロード、JSON、IPC のメッセージ、CLI 引数、設定ファイル、環境変数、DB の行がこれに当たる。すべての境界に、構造のない入力を型付きのモデルへ変えるパース関数を置く。検証をどこに置くかは [Boundary Discipline](boundary-discipline.md) が決める。
- **正本のスキーマから型を導出する。** protocol buffer、OpenAPI、GraphQL のスキーマ、DB の migration、デザイントークンのファイルなど、形を持つ別のファイルがあるなら、並行して手書きの型を作らず、そこから導出する。[Encode Lessons in Structure](encode-lessons-in-structure.md) も見る。
