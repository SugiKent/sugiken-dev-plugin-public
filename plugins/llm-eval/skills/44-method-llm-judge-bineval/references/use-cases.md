# 5 用途の実行基盤（ハーネス）

敷設した BINEVAL 基盤(`eval/`)を、選ばれた用途で使う薄いラッパを `eval/harnesses/` に置く。どれも `evaluate()` を土台にする（TypeScript）。

---

## 用途1: CI に組み込まれるもの

PR ごとに出力品質を二値スコアでゲートする。閾値割れで fail。

`eval/harnesses/ci.ts`:
```ts
import { evaluate } from "../evaluate";
import { config } from "../config";

// テストケース: [{x, y}] を fixtures から読む（実出力を CI 前段で生成しておく）
const THRESHOLDS: Record<string, number> = { consistency: 0.8, coherence: 0.7 }; // 次元別 raw 閾値

async function main() {
  const cases: { x: string; y: string }[] = JSON.parse(process.env.EVAL_CASES ?? "[]");
  let failed = false;
  for (const c of cases) {
    const r = await evaluate(c.x, c.y, config.judgeModel);
    for (const [dim, th] of Object.entries(THRESHOLDS)) {
      const raw = r.dimensions[dim]?.raw ?? 1;
      if (raw < th) { console.error(`FAIL ${dim}: ${raw.toFixed(3)} < ${th}`); failed = true; }
    }
  }
  process.exit(failed ? 1 : 0);
}
main();
```

GitHub Actions 雛形（`.github/workflows/bineval.yml`）:
```yaml
name: bineval
on: [pull_request]
jobs:
  judge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx tsx eval/harnesses/ci.ts
        env:
          # 検知した既存 LLM のプロバイダに合わせた API キーを secrets に設定する
          # 例: OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY など
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

注意: CI は `runs:1` / `judgeModel`(検知した現行モデル) で回す。閾値は quality-check と人間ラベルで校正する。

---

## 用途2: プロダクト内で動作するもの

生成物をユーザーに出す前に inline で自己評価し、閾値割れなら再生成 / フォールバック / フラグ。

`eval/harnesses/inline-guard.ts`:
```ts
import { evaluate } from "../evaluate";

export async function guardedGenerate(input: string, generate: (i: string) => Promise<string>, opts?: { minRaw?: number; retries?: number }) {
  const minRaw = opts?.minRaw ?? 0.7, retries = opts?.retries ?? 1;
  let last = "";
  for (let i = 0; i <= retries; i++) {
    const y = await generate(input);
    last = y;
    const r = await evaluate(input, y); // x=input, y=生成物
    if (r.overall.raw >= minRaw) return { output: y, report: r, passed: true };
  }
  return { output: last, report: null, passed: false }; // フォールバック判断は呼び出し側で
}
```

注意: レイテンシとコストが増える（質問数分の呼び出し）。プロダクトでは次元を絞る / `concurrency` を上げる / 重要次元(consistency 等)だけに限定する。

---

## 用途3: 手元マシン内で改善のために用いるもの

ローカルで単発/バッチ評価し、次元別スコアと各質問の説明を見ながら改善する。

`eval/harnesses/local.ts`:
```ts
import { evaluate } from "../evaluate";

async function main() {
  const [x, y] = [process.argv[2], process.argv[3]];
  const r = await evaluate(x, y);
  console.log(JSON.stringify(r, null, 2));
  // 「いいえ」の質問とその説明が改善のヒント（デバッグ可能性）
  for (const a of r.answers) if (a.answer === "no") console.log(`✗ [${a.dimension}] ${a.explanation}`);
}
main();
```

---

## 用途4: モデルの変化への追従

評価器/被評価モデルを差し替えたとき、次元スコア差を出して回帰を検出。config の `judgeModel` / `referenceModel` を切り替えるだけで動く。アダプタがプロバイダ差を吸収するので、別プロバイダへ移行しても実行基盤は不変。

`eval/harnesses/model-drift.ts`:
```ts
import { evaluate } from "../evaluate";
import { config } from "../config";

// 固定ケース集合を reference と judge の両モデルで評価し、次元差を出す
async function main() {
  const cases: { x: string; y: string }[] = JSON.parse(process.env.EVAL_CASES ?? "[]");
  const acc: Record<string, { ref: number; jud: number; n: number }> = {};
  for (const c of cases) {
    const rref = await evaluate(c.x, c.y, config.referenceModel);
    const rjud = await evaluate(c.x, c.y, config.judgeModel);
    for (const d of config.dimensions) {
      const a = (acc[d] ??= { ref: 0, jud: 0, n: 0 });
      a.ref += rref.dimensions[d]?.raw ?? 0; a.jud += rjud.dimensions[d]?.raw ?? 0; a.n += 1;
    }
  }
  for (const [d, a] of Object.entries(acc)) {
    const diff = Math.abs(a.ref / a.n - a.jud / a.n);
    console.log(`${d}: |Δ|=${diff.toFixed(3)} ${diff > config.epsilon ? "⚠ drift" : "ok"}`);
  }
}
main();
```

用途: 新モデルへ移行する前に、評価器としての一貫性を確認。ドリフトが大きい次元は cross-model update(Phase3)で判定役の LLM（judge）を校正する。

---

## 用途5: プロンプトのアップデートを評価・改善していくためのもの

生成プロンプトを self-update で反復改善し、改善量を計測。

`eval/harnesses/prompt-improve.ts`:
```ts
import { selfUpdate } from "../optimize/self-update"; // prompt-optimization.md 実装
import { config } from "../config";

async function main() {
  // 現行 P_gen で各ケースを生成→BINEVAL 評価→失敗質問を教訓化→局所置換、を maxIter 回
  const result = await selfUpdate({ maxIter: config.maxIter });
  console.log("before overall:", result.before.toFixed(3));
  console.log("after  overall:", result.after.toFixed(3), `(+${(result.after - result.before).toFixed(3)})`);
  console.log("updated prompt saved to:", result.path);
}
main();
```

運用ノブ（README に書く）:
- **改善はほぼ 1〜2 反復で頭打ち**（`maxIter=2` 既定）。改善が止まったら、それ以上プロンプトに指示を足さない。
- **質問分解の再生成が最大改善源**。評価器プロンプトだけ更新して満足しない。

---

## 共通の README 注意書き（用途横断）

- **判定役は検知した既存 LLM を流用**。モデル差替は config だけで、実行基盤は不変。
- コスト: 質問数 × ケース数の呼び出し。次元/質問を絞る・batching・concurrency で調整。
- 校正: 人間ラベルがあれば閾値と次元スコアの相関で確認。無ければ quality-check の 3 指標で代替。
