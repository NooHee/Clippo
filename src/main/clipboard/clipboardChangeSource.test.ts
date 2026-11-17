import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CHANGE_COUNT_SCRIPT, MacPasteboardChangeSource, type ChangeHelperProcess } from './clipboardChangeSource';

/** Stands in for the `osascript` child process: the test writes its stdout and decides when it exits. */
class FakeHelper extends EventEmitter implements ChangeHelperProcess {
  readonly stdout = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
  print(text: string): Promise<void> {
    this.stdout.write(text);
    return new Promise((resolve) => setImmediate(resolve));
  }
}

function setup() {
  const helpers: FakeHelper[] = [];
  const spawned: { command: string; args: readonly string[] }[] = [];
  const source = new MacPasteboardChangeSource((command, args) => {
    spawned.push({ command, args });
    const helper = new FakeHelper();
    helpers.push(helper);
    return helper;
  });
  const events = { changes: 0, failures: [] as unknown[] };
  const listener = {
    onChange: () => events.changes++,
    onUnavailable: (reason: unknown) => events.failures.push(reason),
  };
  return { source, helpers, spawned, events, listener };
}

describe('MacPasteboardChangeSource', () => {
  it('runs the change counter script in osascript with the poll interval', () => {
    const { source, spawned, listener } = setup();
    source.start(250, listener);

    expect(spawned).toEqual([{ command: 'osascript', args: ['-l', 'JavaScript', '-e', CHANGE_COUNT_SCRIPT, '250'] }]);
    expect(CHANGE_COUNT_SCRIPT).toContain('NSPasteboard.generalPasteboard');
    expect(CHANGE_COUNT_SCRIPT).toContain('changeCount');
  });

  it('reports one change per batch of printed counters, across chunk boundaries', async () => {
    const { source, helpers, events, listener } = setup();
    source.start(250, listener);
    const [helper] = helpers;

    await helper.print('41\n');
    await helper.print('42\n43\n');
    await helper.print('4');
    expect(events.changes).toBe(2);

    await helper.print('4\n');
    expect(events.changes).toBe(3);
  });

  it('reports the helper as unavailable when it exits or cannot start', () => {
    const { source, helpers, events, listener } = setup();
    source.start(250, listener);
    helpers[0].emit('exit', 1, null);
    source.start(250, listener);
    helpers[1].emit('error', new Error('spawn osascript ENOENT'));

    expect(events.failures).toHaveLength(2);
  });

  it('kills the helper on stop and stays silent afterwards', async () => {
    const { source, helpers, events, listener } = setup();
    source.start(250, listener);
    const [helper] = helpers;
    source.stop();
    await helper.print('7\n');
    helper.emit('exit', null, 'SIGTERM');

    expect(helper.killed).toBe(true);
    expect(events).toEqual({ changes: 0, failures: [] });
  });

  it('replaces the previous helper when restarted with a new interval', () => {
    const { source, helpers, spawned, listener } = setup();
    source.start(500, listener);
    source.start(200, listener);

    expect(helpers[0].killed).toBe(true);
    expect(spawned.map(({ args }) => args.at(-1))).toEqual(['500', '200']);
  });
});
