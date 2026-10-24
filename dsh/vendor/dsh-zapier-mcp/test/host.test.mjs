/**
 * Host-half tests: `node test/host.test.mjs` (Node 22+, no node_modules).
 *
 * Only `../lib/host-logic.js` is imported: `index.js` needs packages that exist
 * only inside an installed DSH profile.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ENDPOINT,
  RECHECK_PATHS,
  STATUS_PATHS,
  TOOL_NAME_LIMIT,
  buildServerUrl,
  createConnectionManager,
  describeError,
  isInstructionLimitError,
  isRecheckTrigger,
  selectServerTools,
} from '../lib/host-logic.js';

/** One macrotask, so queued promise-chain work gets a chance to run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Wait until a predicate holds, yielding between checks.
 * @param {() => boolean} predicate - condition to wait for.
 * @param {string} label - failure message subject.
 */
async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** Create an externally-resolvable promise. */
function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('buildServerUrl', () => {
  it('falls back to the default endpoint when empty or blank', () => {
    assert.equal(buildServerUrl('', 'tok'), `${DEFAULT_ENDPOINT}?token=tok`);
    assert.equal(buildServerUrl(undefined, 'tok'), `${DEFAULT_ENDPOINT}?token=tok`);
    assert.equal(buildServerUrl('   ', 'tok'), `${DEFAULT_ENDPOINT}?token=tok`);
  });

  it('appends token as a query parameter', () => {
    assert.equal(buildServerUrl('https://mcp.zapier.com/api/v1/connect', 'abc'), 'https://mcp.zapier.com/api/v1/connect?token=abc');
  });

  it('trims a trailing slash instead of producing a double slash', () => {
    assert.equal(buildServerUrl('https://mcp.zapier.com/api/v1/connect/', 'abc'), 'https://mcp.zapier.com/api/v1/connect?token=abc');
    assert.equal(buildServerUrl('https://host/connect///', 'abc'), 'https://host/connect?token=abc');
  });

  it('extends an existing query string with an ampersand', () => {
    assert.equal(buildServerUrl('https://host/connect?workspace=1', 'abc'), 'https://host/connect?workspace=1&token=abc');
    assert.equal(buildServerUrl('https://host/connect/?workspace=1', 'abc'), 'https://host/connect?workspace=1&token=abc');
  });

  it('percent-encodes every reserved and non-ASCII token character', () => {
    const url = buildServerUrl('https://host/connect', 'a b+c&d=e/f?g#ü');
    assert.equal(url, 'https://host/connect?token=a%20b%2Bc%26d%3De%2Ff%3Fg%23%C3%BC');
    assert.ok(!url.includes(' '));
  });
});

describe('describeError', () => {
  it('prefers the underlying cause message', () => {
    const error = new Error('mcp-client(zapier): initial connection or tool synchronization failed', {
      cause: new Error('Invalid OAuth token - please re-authenticate'),
    });
    assert.equal(describeError(error), 'Invalid OAuth token - please re-authenticate');
  });

  it('uses the error message when there is no cause', () => {
    assert.equal(describeError(new Error('plain failure')), 'plain failure');
  });

  it('collapses whitespace to a single line and caps the length at 500', () => {
    const described = describeError(new Error(`first line\nsecond\tline ${'x'.repeat(700)}`));
    assert.ok(described.startsWith('first line second line x'));
    assert.equal(described.length, 500);
    assert.ok(!described.includes('\n'));
    assert.ok(!described.includes('\t'));
  });

  it('handles non-Error values', () => {
    assert.equal(describeError('boom'), 'boom');
    assert.equal(describeError(42), '42');
    assert.equal(describeError(null), 'Unknown error');
    assert.equal(describeError(undefined), 'Unknown error');
  });

  it('falls back to the wrapper message when the cause is not an object', () => {
    assert.equal(describeError(new Error('wrapper', { cause: 'string cause' })), 'wrapper');
  });
});

describe('selectServerTools', () => {
  it('keeps only this server namespace', () => {
    assert.deepEqual(
      selectServerTools(['mcp__zapier__a', 'mcp__other__a', 'mcp__zapier__b', 'bash'], 'zapier'),
      ['mcp__zapier__a', 'mcp__zapier__b'],
    );
  });

  it('tolerates non-arrays and blank server names', () => {
    assert.deepEqual(selectServerTools(undefined, 'zapier'), []);
    assert.deepEqual(selectServerTools(['mcp__zapier__a'], ''), []);
  });
});

describe('isRecheckTrigger', () => {
  it('accepts nested key paths as emitted by the Loader', () => {
    assert.equal(isRecheckTrigger([['checkNonce']]), true);
    assert.equal(isRecheckTrigger([['endpointOverride']]), true);
  });

  it('accepts flat key names too', () => {
    assert.equal(isRecheckTrigger(['checkNonce']), true);
  });

  it('ignores the status fields this plugin publishes itself', () => {
    // Loop prevention: every status field the Host writes must be inert.
    assert.equal(isRecheckTrigger(STATUS_PATHS.map((path) => [path])), false);
    assert.equal(isRecheckTrigger([...STATUS_PATHS]), false);
    assert.equal(
      RECHECK_PATHS.some((path) => STATUS_PATHS.includes(path)),
      false,
      'a re-check path must never also be a self-published status path',
    );
    assert.equal(isRecheckTrigger([['status'], ['toolCount'], ['checkedAt']]), false);
  });

  it('ignores unknown paths and non-array payloads', () => {
    assert.equal(isRecheckTrigger([['serverName']]), false);
    assert.equal(isRecheckTrigger([]), false);
    assert.equal(isRecheckTrigger(undefined), false);
  });
});

describe('createConnectionManager', () => {
  it('publishes unconfigured without mounting when no token resolves', async () => {
    const published = [];
    let mounts = 0;
    const manager = createConnectionManager({
      resolveToken: () => undefined,
      resolveEndpoint: () => 'https://host/connect',
      mount: async () => {
        mounts += 1;
      },
      publish: (patch) => published.push(patch),
      now: () => '2026-01-01T00:00:00.000Z',
    });

    await assert.doesNotReject(manager.trigger('initial'));

    assert.equal(mounts, 0);
    assert.deepEqual(published, [
      { status: 'unconfigured', toolCount: 0, toolNames: [], lastError: '', checkedAt: '2026-01-01T00:00:00.000Z', inventory: '' },
    ]);
    await manager.dispose();
  });

  it('moves unconfigured -> checking -> connected and counts tools', async () => {
    const published = [];
    const names = Array.from({ length: 30 }, (_, index) => `mcp__zapier__tool${index}`);
    let clock = 0;
    const manager = createConnectionManager({
      resolveToken: () => 'tok',
      resolveEndpoint: () => 'https://host/connect',
      mount: async () => async () => {},
      unmount: async () => {},
      listTools: () => names,
      publish: (patch) => published.push(patch),
      now: () => `2026-01-01T00:00:${String(clock++).padStart(2, '0')}.000Z`,
    });

    await manager.trigger('initial');

    assert.deepEqual(published.map((patch) => patch.status), ['checking', 'connected']);
    const [checking, connected] = published;
    assert.equal(checking.checkedAt !== connected.checkedAt, true, 'checkedAt must change on every completed check');
    assert.equal(connected.toolCount, 30);
    assert.equal(connected.toolNames.length, TOOL_NAME_LIMIT);
    assert.equal(connected.toolNames[0], 'mcp__zapier__tool0');
    assert.equal(connected.toolNames.at(-1), `mcp__zapier__tool${TOOL_NAME_LIMIT - 1}`);
    assert.equal(connected.lastError, '');
    await manager.dispose();
  });

  it('publishes the cause message and never rejects when mount fails', async () => {
    const published = [];
    const events = [];
    let mounted = null;
    const manager = createConnectionManager({
      resolveToken: () => 'tok',
      resolveEndpoint: () => '',
      mount: async (token) => {
        mounted = token; // partially mounted before the failure
        events.push('mount');
        throw new Error('mcp-client(zapier): initial connection or tool synchronization failed', {
          cause: new Error('Invalid OAuth token - please re-authenticate'),
        });
      },
      unmount: async () => {
        if (mounted === null) return;
        mounted = null;
        events.push('unmount');
      },
      listTools: () => [],
      publish: (patch) => published.push(patch),
      now: () => '2026-01-01T00:00:00.000Z',
    });

    await assert.doesNotReject(manager.trigger('credential'));

    assert.deepEqual(events, ['mount', 'unmount']);
    assert.equal(mounted, null, 'no child may stay mounted after a failure');
    const last = published.at(-1);
    assert.equal(last.status, 'error');
    assert.equal(last.lastError, 'Invalid OAuth token - please re-authenticate');
    assert.equal(last.toolCount, 0);
    assert.deepEqual(last.toolNames, []);
    await manager.dispose();
  });

  it('turns a credential-resolution failure into an error status', async () => {
    const published = [];
    const manager = createConnectionManager({
      resolveToken: async () => {
        throw new Error('credential store unavailable');
      },
      resolveEndpoint: () => '',
      mount: async () => async () => {},
      listTools: () => [],
      publish: (patch) => published.push(patch),
      now: () => 'now',
    });

    await assert.doesNotReject(manager.trigger('credential'));
    assert.deepEqual(published.map((patch) => patch.status), ['error']);
    assert.equal(published[0].lastError, 'credential store unavailable');
    await manager.dispose();
  });

  it('replaces the existing child on re-check without overlapping mounts', async () => {
    const events = [];
    let mounted = null;
    let sequence = 0;
    const manager = createConnectionManager({
      resolveToken: () => `tok${(sequence += 1)}`,
      resolveEndpoint: () => 'https://host/connect',
      mount: async (token) => {
        mounted = token;
        events.push(`mount:${token}`);
        return async () => {
          if (mounted !== token) return;
          mounted = null;
          events.push(`unmount:${token}`);
        };
      },
      unmount: async () => {
        if (mounted === null) return;
        const token = mounted;
        mounted = null;
        events.push(`unmount:${token}`);
      },
      listTools: () => ['mcp__zapier__a'],
      publish: () => {},
      now: () => 'now',
    });

    await manager.trigger('initial');
    await manager.trigger('recheck');

    assert.deepEqual(events, ['mount:tok1', 'unmount:tok1', 'mount:tok2']);
    assert.equal(mounted, 'tok2');
    await manager.dispose();
    assert.equal(mounted, null);
  });

  it('serializes rapid overlapping triggers and disposes a stale slow mount', async () => {
    const events = [];
    const statuses = [];
    const gates = [];
    let mounted = null;
    let clock = 0;
    let sequence = 0;
    const manager = createConnectionManager({
      resolveToken: () => `tok${(sequence += 1)}`,
      resolveEndpoint: () => 'https://host/connect',
      mount: async (token) => {
        const gate = deferred();
        gates.push(gate);
        events.push(`mount:start:${token}`);
        await gate.promise;
        mounted = token;
        events.push(`mount:end:${token}`);
        return async () => {
          if (mounted !== token) return;
          mounted = null;
          events.push(`unmount:${token}`);
        };
      },
      unmount: async () => {
        if (mounted === null) return;
        const token = mounted;
        mounted = null;
        events.push(`unmount:${token}`);
      },
      listTools: () => ['mcp__zapier__a'],
      publish: (patch) => statuses.push(patch.status),
      now: () => `t${(clock += 1)}`,
    });

    const first = manager.trigger('credential');
    await waitFor(() => events.includes('mount:start:tok1'), 'the first mount to start');

    // A re-check arrives while the first mount is still connecting.
    const second = manager.trigger('recheck');
    gates[0].resolve();
    await first;
    await waitFor(() => events.includes('mount:start:tok2'), 'the second mount to start');

    assert.deepEqual(events, ['mount:start:tok1', 'mount:end:tok1', 'unmount:tok1', 'mount:start:tok2']);
    assert.equal(statuses.includes('connected'), false, 'the stale mount must not publish connected');
    assert.deepEqual(statuses, ['checking', 'checking']);

    gates[1].resolve();
    await second;
    assert.deepEqual(events, ['mount:start:tok1', 'mount:end:tok1', 'unmount:tok1', 'mount:start:tok2', 'mount:end:tok2']);
    assert.deepEqual(statuses, ['checking', 'checking', 'connected']);
    assert.equal(mounted, 'tok2');
    await manager.dispose();
    assert.equal(mounted, null);
  });

  it('reads the effective endpoint on every attempt', async () => {
    const seen = [];
    let endpoint = 'https://one.test/connect';
    let sequence = 0;
    const manager = createConnectionManager({
      resolveToken: () => `tok${(sequence += 1)}`,
      resolveEndpoint: () => endpoint,
      mount: async (token, effectiveEndpoint) => {
        seen.push([token, effectiveEndpoint]);
        return async () => {};
      },
      unmount: async () => {},
      listTools: () => [],
      publish: () => {},
      now: () => 'now',
    });

    await manager.trigger('initial');
    endpoint = 'https://two.test/connect';
    await manager.trigger('recheck');

    assert.deepEqual(seen, [
      ['tok1', 'https://one.test/connect'],
      ['tok2', 'https://two.test/connect'],
    ]);
    await manager.dispose();
  });

  it('dispose releases the child and ignores later triggers', async () => {
    const events = [];
    let mounted = null;
    let mounts = 0;
    const manager = createConnectionManager({
      resolveToken: () => 'tok',
      resolveEndpoint: () => '',
      mount: async (token) => {
        mounts += 1;
        mounted = token;
        return async () => {
          if (mounted !== token) return;
          mounted = null;
          events.push('unmount');
        };
      },
      unmount: async () => {
        if (mounted === null) return;
        mounted = null;
        events.push('unmount');
      },
      listTools: () => [],
      publish: () => {},
      now: () => 'now',
    });

    await manager.trigger('initial');
    assert.equal(mounted, 'tok');

    await manager.dispose();
    assert.equal(mounted, null);
    assert.deepEqual(events, ['unmount']);

    await manager.trigger('recheck');
    assert.equal(mounts, 1, 'a disposed manager must not remount');
  });

  it('publishes the collected inventory and clears it when disconnected', async () => {
    const published = [];
    let token = 'tok';
    const manager = createConnectionManager({
      resolveToken: () => token,
      resolveEndpoint: () => '',
      mount: async () => async () => {},
      unmount: async () => {},
      listTools: () => ['mcp__zapier__inspect_zapier_actions'],
      collectInventory: () => 'Enabled now: Gmail — 1 action, 2 accounts',
      publish: (patch) => published.push(patch),
      now: () => 'now',
    });

    await manager.trigger('initial');
    assert.equal(published.at(-1).status, 'connected');
    assert.equal(published.at(-1).inventory, 'Enabled now: Gmail — 1 action, 2 accounts');

    token = '';
    await manager.trigger('credential');
    assert.equal(published.at(-1).status, 'unconfigured');
    assert.equal(published.at(-1).inventory, '');
    await manager.dispose();
  });

  it('degrades to no inventory when collection throws or returns garbage', async () => {
    const published = [];
    const manager = createConnectionManager({
      resolveToken: () => 'tok',
      resolveEndpoint: () => '',
      mount: async () => async () => {},
      unmount: async () => {},
      listTools: () => [],
      collectInventory: () => {
        throw new Error('inventory tool denied');
      },
      publish: (patch) => published.push(patch),
      now: () => 'now',
    });

    await assert.doesNotReject(manager.trigger('initial'));
    assert.equal(published.at(-1).status, 'connected');
    assert.equal(published.at(-1).inventory, '');
    assert.equal(published.at(-1).lastError, '');
    await manager.dispose();
  });

  it('retries exactly once with the larger instruction cap, then succeeds', async () => {
    const published = [];
    const attempts = [];
    const manager = createConnectionManager({
      resolveToken: () => 'tok',
      resolveEndpoint: () => 'https://host/connect',
      mount: async (token, endpoint, instructionBytes) => {
        attempts.push(instructionBytes);
        if (attempts.length === 1) {
          // The real shape: mcp-client wraps the oversized-instructions error in a cause.
          throw new Error('mcp-client(zapier): initial connection or tool synchronization failed', {
            cause: new Error('mcp-client(zapier): server instructions exceed maxInstructionBytes (131072)'),
          });
        }
        return async () => {};
      },
      unmount: async () => {},
      listTools: () => ['mcp__zapier__inspect_zapier_actions'],
      collectInventory: () => '',
      publish: (patch) => published.push(patch),
      maxInstructionBytes: 131072,
      instructionRetryBytes: 1048576,
      now: () => 'now',
    });

    await manager.trigger('initial');

    assert.deepEqual(attempts, [131072, 1048576]);
    assert.deepEqual(published.map((patch) => patch.status), ['checking', 'connected']);
    assert.equal(published.at(-1).lastError, '');
    await manager.dispose();
  });

  it('reports the second failure when the retry also exceeds the cap', async () => {
    const published = [];
    const attempts = [];
    const manager = createConnectionManager({
      resolveToken: () => 'tok',
      resolveEndpoint: () => '',
      mount: async (_token, _endpoint, instructionBytes) => {
        attempts.push(instructionBytes);
        throw new Error(`server instructions exceed maxInstructionBytes (${instructionBytes}) - retry failed`);
      },
      unmount: async () => {},
      listTools: () => [],
      publish: (patch) => published.push(patch),
      maxInstructionBytes: 131072,
      instructionRetryBytes: 1048576,
      now: () => 'now',
    });

    await assert.doesNotReject(manager.trigger('initial'));

    assert.deepEqual(attempts, [131072, 1048576], 'exactly one retry');
    assert.equal(published.at(-1).status, 'error');
    assert.match(published.at(-1).lastError, /retry failed/);
    await manager.dispose();
  });

  it('does not retry an unrelated mount failure', async () => {
    const published = [];
    let mounts = 0;
    const manager = createConnectionManager({
      resolveToken: () => 'tok',
      resolveEndpoint: () => '',
      mount: async () => {
        mounts += 1;
        throw new Error('Invalid OAuth token - please re-authenticate');
      },
      unmount: async () => {},
      listTools: () => [],
      publish: (patch) => published.push(patch),
      maxInstructionBytes: 131072,
      instructionRetryBytes: 1048576,
      now: () => 'now',
    });

    await assert.doesNotReject(manager.trigger('initial'));

    assert.equal(mounts, 1, 'only an instruction-cap failure may retry');
    assert.equal(published.at(-1).lastError, 'Invalid OAuth token - please re-authenticate');
    await manager.dispose();
  });
});

describe('isInstructionLimitError', () => {
  it('matches the message directly or through the cause chain', () => {
    assert.equal(isInstructionLimitError(new Error('server instructions exceed maxInstructionBytes (32768)')), true);
    assert.equal(
      isInstructionLimitError(new Error('mcp-client(zapier): initial connection failed', {
        cause: new Error('server instructions exceed maxInstructionBytes (131072)'),
      })),
      true,
    );
    assert.equal(isInstructionLimitError(new Error('Invalid OAuth token - please re-authenticate')), false);
    assert.equal(isInstructionLimitError(undefined), false);
    assert.equal(isInstructionLimitError('maxInstructionBytes'), false);
  });
});
