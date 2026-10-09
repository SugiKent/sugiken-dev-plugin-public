import { expect, test } from 'claude-code/testing';

const pane = {
  plugin: 'openspec', component: 'Pane', requestId: 'openspec-impact',
  viewport: { columns: 200, rows: 60 },
  props: { title: 'OpenSpec', isFocused: true, bodyColumns: 60,
    placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const;

function setup(on) {
  const opens: any[] = [];
  on('session.start', () => ({ cwd: '/work' }));
  on('command.register', () => ({ value: undefined }));
  on('ui.close', () => ({ value: undefined }));
  on('ui.open', ($, e) => { opens.push(e); return { value: { isPlaced: true } }; });
  on('turn.complete', () => ({ text: '' }));
  on('classic.SessionStart', () => ({}));
  return { opens };
}

test('the pane opens at session start and shows status and version', async ($, on) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  expect(opens.length).toBe(1);
  expect(opens[0].focus).toBeUndefined();
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: /^Haiku: / })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /^openspec mod v\d+\.\d+\.\d+$/ })).toBeDefined();
});

test('headless sessions never open UI', async ($, on) => {
  const { opens } = setup(on);
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false });
  expect(opens.length).toBe(0);
});
