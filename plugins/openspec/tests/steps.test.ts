import { expect, mock, test } from 'claude-code/testing';

function setup(on, gate?: Promise<void>) {
  const prompts: string[] = [];
  const clock = mock.clock(on);
  on('session.start', () => ({ cwd: '/work' }));
  on('command.register', () => ({ value: undefined }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  on('ui.invalidate', () => ({ value: undefined }));
  on('turn.complete', () => ({ text: '' }));
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ステップ' + e.index,
      toolUses: [{ name: 'Read', input: { file_path: 'openspec/specs/a.md' } }],
      stopReason: 'tool_use', usage: null };
  });
  on('model.complete', async ($, e) => {
    prompts.push(String(e.prompt));
    if (gate) await gate;
    return { value: { isAnswered: true, text: 'まとめ', usage: { input_tokens: 1, output_tokens: 1 } } };
  });
  return { prompts, clock };
}

async function steps($, count: number, from = 0) {
  for (let i = from; i < from + count; i++) {
    for await (const _ of $.turn.step({ turnId: 't1', index: i, model: 'opus', messageCount: 1 })) { /* drain */ }
  }
}

const complete = ($) => $.turn.complete({ answer: '完了しました', durationMs: 1, isAborted: false, turnId: 't1' });

test('Haiku runs every 10 steps and at turn end', async ($, on) => {
  const { prompts, clock } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await steps($, 9);
  await clock.settle();
  expect(prompts.length).toBe(0);
  await steps($, 1, 9);
  await clock.settle();
  expect(prompts.length).toBe(1);
  expect(prompts[0]).toContain('ここまで 10 ステップ');
  expect(prompts[0]).toContain('ツール: Read');
  await complete($);
  await clock.settle();
  expect(prompts.length).toBe(2);
  expect(prompts[1]).toBe('完了しました');
});

test('a call never starts while the previous one runs', async ($, on) => {
  let release = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const { prompts, clock } = setup(on, gate);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await steps($, 20);
  await complete($);
  await clock.settle();
  expect(prompts.length).toBe(1);
  release();
  await clock.settle();
  // The 20-step call was replaced by the newer turn-end call while waiting.
  expect(prompts.length).toBe(2);
  expect(prompts[1]).toBe('完了しました');
});

test('the interval follows summaryEverySteps', { options: { summaryEverySteps: 3 } }, async ($, on) => {
  const { prompts, clock } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await steps($, 7);
  await clock.settle();
  expect(prompts.length).toBe(2);
});

test('summaryEverySteps 0 keeps turn end only', { options: { summaryEverySteps: 0 } }, async ($, on) => {
  const { prompts, clock } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await steps($, 25);
  await complete($);
  await clock.settle();
  expect(prompts.length).toBe(1);
});

test('subagent steps and turns are not counted', async ($, on) => {
  const { prompts, clock } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  for (let i = 0; i < 12; i++) {
    for await (const _ of $.turn.step({ turnId: 's1', index: i, model: 'haiku', messageCount: 1, agentId: 'a1' })) { /* drain */ }
  }
  await $.turn.complete({ answer: 'サブエージェントの報告', durationMs: 1, isAborted: false, turnId: 's1', agentId: 'a1' });
  await clock.settle();
  expect(prompts.length).toBe(0);
});
