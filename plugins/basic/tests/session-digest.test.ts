import { expect, mock, test } from 'claude-code/testing';

const HISTORY = [
  { role: 'user', text: '認証を Cognito から Salesforce 直に変えたい', toolUses: [] },
  { role: 'assistant', text: '調べたところ、JWT の aud が想定と違っていました。', toolUses: [
    { tool_use_id: 'u1', tool: 'Read', input: { file_path: 'src/auth.ts' } }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'u1', text: 'ファイルの中身', isError: false }] },
  { role: 'assistant', text: '完了しました', toolUses: [] },
];

function setup(on, gate?: Promise<void>) {
  const prompts: string[] = [];
  const clock = mock.clock(on);
  on('session.start', () => ({ cwd: '/work' }));
  on('command.register', () => ({ value: undefined }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  on('ui.invalidate', () => ({ value: undefined }));
  on('session.messages', () => ({ value: HISTORY }));
  on('turn.complete', () => ({ text: '' }));
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null };
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
  expect(prompts[0]).toContain('ターン途中、10 ステップ時点');
  await complete($);
  await clock.settle();
  expect(prompts.length).toBe(2);
  expect(prompts[1]).toContain('ターン終了時');
});

test('the turn-end digest reads the recent conversation, not the last answer alone', async ($, on) => {
  const { prompts, clock } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await complete($);
  await clock.settle();
  expect(prompts[0]).toContain('### ユーザー\n認証を Cognito から Salesforce 直に変えたい');
  expect(prompts[0]).toContain('JWT の aud が想定と違っていました');
  expect(prompts[0]).toContain('ツール: Read {"file_path":"src/auth.ts"}');
  expect(prompts[0]).toContain('完了しました');
  // Tool results stay out of the input.
  expect(prompts[0]).not.toContain('ファイルの中身');
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
  expect(prompts[1]).toContain('ターン終了時');
});

test('the interval follows digestEverySteps', { options: { digestEverySteps: 3 } }, async ($, on) => {
  const { prompts, clock } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await steps($, 7);
  await clock.settle();
  expect(prompts.length).toBe(2);
});

test('digestEverySteps 0 keeps turn end only', { options: { digestEverySteps: 0 } }, async ($, on) => {
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
