import { expect, test } from 'claude-code/testing';

const pane = {
  plugin: 'basic', component: 'Pane', requestId: 'session-digest',
  viewport: { columns: 200, rows: 60 },
  props: { title: 'Session Digest', isFocused: true, bodyColumns: 60,
    placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const;

function setup(on: any) {
  const opens: any[] = [];
  on('session.start', () => ({ cwd: '/work' }));
  on('command.register', () => ({ value: undefined }));
  on('ui.close', () => ({ value: undefined }));
  on('ui.open', ($: any, e: any) => { opens.push(e); return { value: { isPlaced: true } }; });
  on('turn.complete', () => ({ text: '' }));
  on('classic.SessionStart', () => ({}));
  return { opens };
}

test('the pane stays closed at session start', async ($: any, on: any) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.turn.complete({ answer: '完了しました', durationMs: 1, isAborted: false, turnId: 't1' });
  expect(opens.length).toBe(0);
});

test('/session-digest on opens the pane and shows the version', async ($: any, on: any) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  await $.command.run({ command: 'session-digest', args: 'on' });
  expect(opens.length).toBe(1);
  expect(opens[0].focus).toBe(true);
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  // The status line stays hidden until the first digest.
  expect(await ui.find({ type: 'Text', text: /^Haiku: / })).toBeUndefined();
  expect(await ui.find({ type: 'Text', text: /^session-digest v\d+\.\d+\.\d+$/ })).toBeDefined();
});

test('headless sessions never open UI', async ($: any, on: any) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false });
  expect(opens.length).toBe(0);
});
