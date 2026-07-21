# Phase 3: 反復的プロンプト最適化の実装仕様（原論文 Algorithm 1 / Appendix B）

2 モード。 **質問分解の再生成も更新対象に含める**（最大改善源）。

**反復回数と早期終了**: 原論文は **最大 5 反復**まで回し、 **検証用データ（held-out、テスト集合）の相関/精度が前反復より下がったら停止**（早期終了で最良を選択）。ゲインはほぼ 1〜2 反復に集中し、以降は教訓が競合して劣化する。検証用データの評価信号（人間ラベルや検証関数）が無い環境では安全側に `MAX_ITER=2` を既定とし、ある環境では `MAX_ITER=5` + 早期終了を推奨する（config で切替）。

## 共通コンポーネント

- **note-taker LLM** $L_{\text{note}}$: 不一致/失敗を文脈付きで分析し、汎化された **教訓(lesson)** を短文で出す。
- **dedup**: 教訓のセマンティック重複排除。`merge` if 類似 / `add` otherwise。実装は「新教訓と既存教訓の意味的類似を LLM か埋め込み類似で判定 → 類似なら統合、そうでなければ追加」。 **保持は最大 10 個のユニーク教訓**。
- **updater LLM**: 形式的には教訓ごとにプロンプト内の関連部分文字列 $s_k$ を特定し修正 $s_k'$ に置換（`replace`, Algorithm 1）。 **実運用（Appendix B）では、保持した全教訓を 1 回の LLM 呼び出しでまとめてプロンプトに反映** する。どちらでもプロンプト全体を無秩序に書き直させず、劣化を抑える。

教訓は構造化して保存（監査用）:
```json
{ "id": "l1", "text": "誤帰属を『いいえ』と判定する際、発言者の一致だけでなく行為の帰属も確認する", "source_questions": ["consistency_q3"] }
```

## Cross-Model Prompt Update

強い参照モデル(source)と弱い運用モデル(target)の不一致を改善シグナルにする。用途4(モデル追従)・target 評価器の校正に使う。

反復 $t$:

1. **Evaluate**: 各テストケース $(x_j,y_j)$ を両モデルで二値評価 → $A_j^{\text{src}}, A_j^{\text{tgt}}$。
2. **Identify disagreements**: $\Delta_j = \{q_i : A_j^{\text{src}}(q_i) \neq A_j^{\text{tgt}}(q_i)\}$。
3. **Extract lessons**: $L_j = L_{\text{note}}(x_j, y_j, A_j^{\text{src}}, A_j^{\text{tgt}}, \Delta_j)$ → dedup → $L_{\text{unique}}$。
4. **Update prompt**: 各 $\ell_k$ で $P_E^{(t)} \leftarrow P_E^{(t)}.\text{replace}(s_k, s_k')$。
5. **終了**: 全次元でテストケース平均スコアが $|S_d^{\text{tgt}} - S_d^{\text{src}}| < \epsilon$（または target が source を上回る）、あるいは検証用データでの相関が低下（早期終了）、あるいは $t = \text{MAX\_ITER}$。

擬似コード:
```
P_tgt = load(target_evaluator_prompt)
for t in 1..MAX_ITER:
    lessons = []
    for (x, y) in cases:
        A_src = evaluate(E_src, x, y, Q)          # source モデル
        A_tgt = evaluate(E_tgt, x, y, Q, P_tgt)   # target モデル(現行プロンプト)
        delta = {qi for qi in Q if A_src[qi] != A_tgt[qi]}
        if delta:
            lessons += note_taker(x, y, A_src, A_tgt, delta)
    lessons = dedup(lessons)
    for l in lessons:
        s, s2 = updater.locate_and_rewrite(P_tgt, l)
        P_tgt = P_tgt.replace(s, s2)
    # 質問分解も更新（最大改善源）: 教訓を meta-prompt にも反映し Q を再生成する
    Q = maybe_regenerate_questions(Q, lessons)
    if all(abs(S_d(E_tgt, P_tgt) - S_d(E_src)) < eps for d in D):
        break
save(P_tgt)
```

## Self Prompt Update

生成プロンプト $P_G$ を BINEVAL の失敗質問で反復改善する。用途5(プロンプト改善)。

反復 $t$:

1. **Generate**: $y_j^{(t)} = L_G(x_j; P_G^{(t)})$。
2. **Evaluate**: BINEVAL 評価し失敗質問と説明を収集 $E_j = \{(q_i,e_i): f_E(x_j,y_j^{(t)},q_i)=0\}$。
3. **Extract lessons**: $L_j = L_{\text{note}}(x_j, y_j^{(t)}, E_j)$ → dedup。
4. **Update**: 同じ書換を $P_G$ に適用。終了は評価エラー消滅 or MAX_ITER。

擬似コード:
```
P_gen = load(generation_prompt)
for t in 1..MAX_ITER:
    lessons = []
    for x in cases:
        y = generate(L_G, x, P_gen)
        report = bineval_evaluate(x, y, Q)
        failures = [(qi, e) for (qi, ans, e) in report.answers if ans == "no"]
        if failures:
            lessons += note_taker(x, y, failures)
    lessons = dedup(lessons)
    if not lessons: break
    for l in lessons:
        s, s2 = updater.locate_and_rewrite(P_gen, l)
        P_gen = P_gen.replace(s, s2)
save(P_gen)
```

## note-taker が出す教訓(lesson)の形

「汎化された 1 行の是正」を出す。例:「省略は不整合ではない —— 要約中に存在する未裏付け/矛盾した記述だけを減点する」「暗黙の接続で十分（"because" 等の明示接続詞を要求しない）」。プロンプトへは、この教訓を反映した最小の局所修正として入れる。

## 運用ノブ（README にも書く）

- **反復はほぼ 1〜2 回で頭打ち**。既定 `MAX_ITER=2`。検証用データの信号があれば早期終了で最良を選ぶ。
- **質問分解の再生成が最大改善源**。評価器プロンプトだけ更新して満足しない。
- 改善が止まったら、それ以上プロンプトに指示を足さない（指示過負荷で逆効果になりうる）。
