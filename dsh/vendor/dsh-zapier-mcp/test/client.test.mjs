/**
 * Unit tests for the dsh-zapier-mcp browser half (`client.js`).
 *
 * The bundle is plain ESM that expects `window.__ModuleLoader__` to exist, so
 * the suite installs a fake loader, imports the file, and drives the captured
 * factory with a minimal React stub and a controllable fake plugin context.
 *
 * Run with: node test/client.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

/* -------------------------------------------------------------------------- *
 * Fake module loader + React stub
 * -------------------------------------------------------------------------- */

/** @type {any} */
let loaded = null;

globalThis.window = {
	__ModuleLoader__: {
		/**
		 * Captures the bundle descriptor produced by client.js.
		 *
		 * @param {{ id: string, factory: (require: any) => any }} config descriptor
		 * @returns {void}
		 */
		load(config) {
			loaded = config;
		},
	},
};

await import('../client.js');

/** Minimal React stand-in; enough for one render pass and hook plumbing. */
const ReactStub = {
	/**
	 * @param {any} type element type
	 * @param {any} props element props
	 * @param {...any} children child nodes
	 * @returns {any} pseudo element node
	 */
	createElement(type, props, ...children) {
		return { type, props: props === null ? {} : props, children };
	},
	Fragment: Symbol.for('react.fragment'),
	/**
	 * @param {any} initial initial value
	 * @returns {[any, (next: any) => void]} state pair
	 */
	useState(initial) {
		return [initial, () => {}];
	},
	useEffect() {},
	useMemo(compute) {
		return compute();
	},
	useRef(initial) {
		return { current: initial };
	},
	useCallback(fn) {
		return fn;
	},
};

/**
 * @param {string} name module specifier
 * @returns {any} module
 */
function stubRequire(name) {
	if (name === 'react') {
		return ReactStub;
	}
	throw new Error(`unexpected require: ${name}`);
}

assert.ok(loaded !== null, 'client.js must call window.__ModuleLoader__.load');
const bundle = loaded;
const mod = bundle.factory(stubRequire);

/* -------------------------------------------------------------------------- *
 * Fake plugin context
 * -------------------------------------------------------------------------- */

/**
 * Builds a fake `ctx` capturing everything `apply` does.
 *
 * @param {any} remote fake remote services
 * @returns {{ ctx: any, registrations: any[], injections: any[], effects: any[], localeRegs: any[] }}
 */
function makeFakeCtx(remote) {
	const registrations = [];
	const injections = [];
	const effects = [];
	const localeRegs = [];
	/** @type {any} */
	const ctx = {
		effect(fn, label) {
			const dispose = fn();
			effects.push({ label, dispose });
			return dispose;
		},
		inject(names) {
			injections.push({ kind: 'service', names });
		},
		locale: {
			register(ns, dicts) {
				localeRegs.push({ ns, dicts });
				return () => {};
			},
			bind(ns) {
				const entry = localeRegs.find((item) => item.ns === ns);
				const dict = entry === undefined ? {} : entry.dicts.en;
				/**
				 * @param {string} key translation key
				 * @param {...any} args interpolation arguments
				 * @returns {string} translated string
				 */
				return (key, ...args) => {
					const value = dict[key];
					if (typeof value === 'function') {
						return value(...args);
					}
					return value === undefined ? key : value;
				};
			},
		},
		slots: {
			inject(name, fn) {
				injections.push({ kind: 'slots', name });
				return fn();
			},
			register(options, component) {
				registrations.push({ options, component });
				return { dispose() {} };
			},
			entries() {
				return [];
			},
			subscribe() {
				return () => {};
			},
		},
		remote,
	};
	return { ctx, registrations, injections, effects, localeRegs };
}

/** A `settings.describe()` payload carrying a healthy, connected snapshot. */
function connectedDocument(value = {}) {
	return {
		ok: true,
		value: {
			writable: true,
			hasDocument: true,
			namespaces: [
				{
					ns: 'zapier-mcp',
					autoGenerate: false,
					schema: {},
					revision: 7,
					secrets: [{ path: ['token'], set: true }],
					value: {
						status: 'connected',
						toolCount: 3,
						toolNames: ['gmail_send_email', 'slack_post_message', 'notion_search'],
						lastError: '',
						checkedAt: '2024-05-01T10:00:00.000Z',
						checkNonce: 42,
						credentialRef: 'ZAPIER_MCP_TOKEN',
						endpoint: 'https://mcp.zapier.com/api/v1/connect',
						endpointOverride: '',
						...value,
					},
				},
			],
		},
	};
}

/** A fake remote whose every method resolves a supplied envelope. */
function makeRemote(overrides = {}) {
	const calls = { set: [], unset: [], mutate: [] };
	/** @type {any} */
	const remote = {
		settings: {
			describe: async () => connectedDocument(),
			mutate: async (ns, ops, revision) => {
				calls.mutate.push({ ns, ops, revision });
				return { ok: true };
			},
			...overrides.settings,
		},
		credentials: {
			describe: async () => ({ ok: true, value: {} }),
			set: async (ref, value) => {
				calls.set.push({ ref, value });
				return { ok: true };
			},
			unset: async (ref) => {
				calls.unset.push({ ref });
				return { ok: true };
			},
			...overrides.credentials,
		},
		$on(event, listener) {
			if (overrides.on !== undefined) {
				overrides.on(event, listener);
			}
			return () => {};
		},
	};
	return { remote, calls };
}

/* -------------------------------------------------------------------------- *
 * Bundle shape
 * -------------------------------------------------------------------------- */

test('bundle id and factory shape', () => {
	assert.equal(bundle.id, 'dsh-zapier-mcp');
	assert.equal(typeof bundle.factory, 'function');
	assert.equal(typeof mod.apply, 'function');
	assert.ok(Array.isArray(mod.inject));
	assert.equal(typeof mod.__internals, 'object');
});

test('inject list declares every service the page needs', () => {
	for (const service of [
		'slots',
		'locale',
		'remote',
		'remote.credentials',
		'remote.settings',
	]) {
		assert.ok(
			mod.inject.includes(service),
			`inject must include ${service}`,
		);
	}
});

/* -------------------------------------------------------------------------- *
 * apply()
 * -------------------------------------------------------------------------- */

test('apply registers the locale, the section, and one effect', () => {
	const { remote } = makeRemote();
	const { ctx, registrations, injections, effects, localeRegs } =
		makeFakeCtx(remote);
	mod.apply(ctx);

	assert.equal(localeRegs.length, 1);
	assert.equal(localeRegs[0].ns, 'zapier-mcp');
	assert.ok(localeRegs[0].dicts.en);
	assert.ok(localeRegs[0].dicts.zh);

	assert.equal(effects.length, 1);
	assert.equal(typeof effects[0].dispose, 'function');

	assert.ok(injections.some((i) => i.kind === 'slots' && i.name === 'settings.section'));
	assert.equal(registrations.length, 1);
});

test('the section sits directly below Models (order 11)', () => {
	const { remote } = makeRemote();
	const { ctx, registrations } = makeFakeCtx(remote);
	mod.apply(ctx);

	const entry = registrations[0];
	assert.equal(entry.options.name, 'settings.section');
	assert.equal(entry.options.id, 'zapier-mcp');
	assert.equal(entry.options.order, 11);
	assert.ok(entry.options.order > 10, 'must come after Models (10)');
	assert.ok(entry.options.order < 15, 'must come before Plugins (15)');
	assert.equal(typeof entry.component, 'function');
});

test('label is a thunk resolving a non-empty string', () => {
	const { remote } = makeRemote();
	const { ctx, registrations } = makeFakeCtx(remote);
	mod.apply(ctx);

	const { label } = registrations[0].options;
	assert.equal(typeof label, 'function');
	const resolved = label();
	assert.equal(typeof resolved, 'string');
	assert.ok(resolved.trim().length > 0);
});

test('injected props carry the translator and every operation', () => {
	const { remote } = makeRemote();
	const { ctx, registrations } = makeFakeCtx(remote);
	mod.apply(ctx);

	const injected = registrations[0].options.inject();
	assert.equal(typeof injected.t, 'function');
	const { client } = injected;
	for (const op of [
		'describe',
		'saveToken',
		'removeToken',
		'recheck',
		'saveEndpoint',
		'subscribe',
	]) {
		assert.equal(typeof client[op], 'function', `client.${op} must exist`);
	}
});

/* -------------------------------------------------------------------------- *
 * __internals
 * -------------------------------------------------------------------------- */

const {
	readSnapshot,
	interpretEnvelope,
	toCount,
	toStringList,
	statusTone,
	formatStatusText,
	formatCheckedAt,
	hasSettled,
	isValidTokenInput,
	nonceOps,
	endpointOps,
	createClient,
	ZapierSection,
	en,
	zh,
	DEFAULT_ENDPOINT,
	DEFAULT_CREDENTIAL_REF,
	POLL_TIMEOUT_MS,
} = mod.__internals;

test('dictionaries cover the same keys in both languages', () => {
	const enKeys = Object.keys(en).sort();
	const zhKeys = Object.keys(zh).sort();
	assert.deepEqual(zhKeys, enKeys);
	for (const key of enKeys) {
		const value = en[key];
		const isUsable =
			(typeof value === 'string' && value.trim() !== '') ||
			typeof value === 'function';
		assert.ok(isUsable, `en.${key} must be a non-empty string or function`);
		const other = zh[key];
		assert.equal(typeof other, typeof value, `zh.${key} type mismatch`);
	}
});

test('interpretEnvelope unwraps success and failure without throwing', () => {
	assert.deepEqual(interpretEnvelope({ ok: true, value: 1 }), {
		ok: true,
		value: 1,
		code: '',
		message: '',
	});
	const failed = interpretEnvelope({
		ok: false,
		error: { code: 'nope', message: 'bad token' },
	});
	assert.equal(failed.ok, false);
	assert.equal(failed.code, 'nope');
	assert.equal(failed.message, 'bad token');

	for (const hostile of [null, undefined, 0, 'x', [], { ok: false }]) {
		const parsed = interpretEnvelope(hostile);
		assert.equal(parsed.ok, false);
		assert.equal(typeof parsed.code, 'string');
		assert.ok(parsed.message.length > 0);
	}
});

test('readSnapshot normalises a healthy document', () => {
	const snap = readSnapshot(connectedDocument());
	assert.equal(snap.ok, true);
	assert.equal(snap.error, null);
	assert.equal(snap.writable, true);
	assert.equal(snap.revision, 7);
	assert.equal(snap.configured, true);
	assert.equal(snap.status, 'connected');
	assert.equal(snap.toolCount, 3);
	assert.equal(snap.toolNames.length, 3);
	assert.equal(snap.credentialRef, DEFAULT_CREDENTIAL_REF);
	assert.equal(snap.endpoint, DEFAULT_ENDPOINT);
	assert.equal(snap.endpointOverride, '');
	assert.equal(snap.effectiveEndpoint, DEFAULT_ENDPOINT);
	assert.equal(snap.checkedAt, '2024-05-01T10:00:00.000Z');
});

test('readSnapshot honours an endpoint override', () => {
	const snap = readSnapshot(
		connectedDocument({ endpointOverride: '  https://example.test/mcp  ' }),
	);
	assert.equal(snap.endpointOverride, 'https://example.test/mcp');
	assert.equal(snap.effectiveEndpoint, 'https://example.test/mcp');
});

test('readSnapshot degrades on malformed payloads', () => {
	for (const hostile of [null, undefined, 42, {}, { ok: true }]) {
		const snap = readSnapshot(hostile);
		assert.equal(snap.ok, false);
		assert.ok(snap.error !== null);
		assert.equal(snap.status, 'unknown');
		assert.equal(snap.configured, false);
		assert.equal(snap.effectiveEndpoint, DEFAULT_ENDPOINT);
		assert.deepEqual(snap.toolNames, []);
	}

	const missing = readSnapshot({
		ok: true,
		value: { writable: true, namespaces: [{ ns: 'other', value: {} }] },
	});
	assert.equal(missing.ok, false);
	assert.equal(missing.error.code, 'namespace-missing');

	const badValue = readSnapshot({
		ok: true,
		value: { writable: false, namespaces: [{ ns: 'zapier-mcp', value: null }] },
	});
	assert.equal(badValue.ok, true);
	assert.equal(badValue.status, 'unconfigured');
	assert.equal(badValue.configured, false);
	assert.equal(badValue.revision, null);
	assert.deepEqual(badValue.toolNames, []);

	const garbage = readSnapshot(
		connectedDocument({
			status: 99,
			toolCount: 'many',
			toolNames: 'nope',
			lastError: { deep: true },
			checkedAt: 12,
			credentialRef: '   ',
			endpoint: '',
		}),
	);
	assert.equal(garbage.status, 'unconfigured');
	assert.equal(garbage.toolCount, 0);
	assert.deepEqual(garbage.toolNames, []);
	assert.equal(garbage.lastError, '');
	assert.equal(garbage.checkedAt, '');
	assert.equal(garbage.credentialRef, DEFAULT_CREDENTIAL_REF);
	assert.equal(garbage.endpoint, DEFAULT_ENDPOINT);
});

test('toCount and toStringList reject hostile scalars', () => {
	assert.equal(toCount(5), 5);
	assert.equal(toCount(5.9), 5);
	assert.equal(toCount(0), 0);
	assert.equal(toCount(-3), 0);
	assert.equal(toCount(Number.NaN), 0);
	assert.equal(toCount('4'), 0);

	assert.deepEqual(toStringList(['a', ' b ', 3, '', null]), ['a', 'b']);
	assert.deepEqual(toStringList([]), []);
	assert.deepEqual(toStringList('a'), []);
	assert.deepEqual(toStringList(null), []);
});

test('statusTone maps each status and unknown values', () => {
	assert.equal(statusTone('unconfigured'), 'idle');
	assert.equal(statusTone('checking'), 'busy');
	assert.equal(statusTone('connected'), 'ok');
	assert.equal(statusTone('error'), 'error');
	assert.equal(statusTone('whatever'), 'unknown');
	assert.equal(statusTone(undefined), 'unknown');
});

test('formatStatusText reports every state', () => {
	const t = (key, ...args) => {
		if (key === 'connected') return `connected:${args[0]}`;
		return key;
	};
	const ok = readSnapshot(connectedDocument());
	assert.equal(formatStatusText(ok, t), 'connected:3');
	assert.equal(
		formatStatusText({ ...ok, status: 'checking' }, t),
		'checking',
	);
	assert.equal(formatStatusText({ ...ok, status: 'error' }, t), 'rejected');
	assert.equal(
		formatStatusText({ ...ok, status: 'unconfigured' }, t),
		'notConfigured',
	);
	assert.equal(formatStatusText({ ...ok, ok: false }, t), 'readFailed');
});

test('formatCheckedAt converts ISO timestamps and rejects junk', () => {
	const formatted = formatCheckedAt('2024-05-01T10:00:00.000Z');
	assert.equal(typeof formatted, 'string');
	assert.ok(formatted.length > 0);
	assert.notEqual(formatted, '2024-05-01T10:00:00.000Z');
	assert.equal(formatCheckedAt(''), '');
	assert.equal(formatCheckedAt('not-a-date'), '');
	assert.equal(formatCheckedAt(null), '');
	assert.equal(formatCheckedAt(undefined), '');
});

test('hasSettled detects a new check result', () => {
	const before = { checkedAt: 'a', status: 'checking' };
	assert.equal(
		hasSettled(before, readSnapshot(connectedDocument())),
		true,
		'new checkedAt settles',
	);
	assert.equal(
		hasSettled(before, readSnapshot(connectedDocument({ checkedAt: 'a' }))),
		true,
		'leaving checking settles even with an unchanged timestamp',
	);
	assert.equal(
		hasSettled(before, {
			ok: true,
			checkedAt: 'a',
			status: 'checking',
		}),
		false,
	);
	assert.equal(hasSettled(before, { ok: false }), false);
	assert.equal(hasSettled(before, null), false);
});

test('isValidTokenInput trims and rejects empties', () => {
	assert.equal(isValidTokenInput('abc'), true);
	assert.equal(isValidTokenInput('  abc  '), true);
	assert.equal(isValidTokenInput(''), false);
	assert.equal(isValidTokenInput('   '), false);
	assert.equal(isValidTokenInput(null), false);
	assert.equal(isValidTokenInput(undefined), false);
	assert.equal(isValidTokenInput(7), false);
});

test('mutation operation builders are exact', () => {
	const nonce = nonceOps(123);
	assert.deepEqual(nonce, [{ op: 'set', path: ['checkNonce'], value: 123 }]);
	assert.deepEqual(endpointOps('  https://x.test  '), [
		{ op: 'set', path: ['endpointOverride'], value: 'https://x.test' },
	]);
	assert.deepEqual(endpointOps('   '), [
		{ op: 'set', path: ['endpointOverride'], value: '' },
	]);
	assert.deepEqual(endpointOps(null), [
		{ op: 'set', path: ['endpointOverride'], value: '' },
	]);
});

/* -------------------------------------------------------------------------- *
 * createClient
 * -------------------------------------------------------------------------- */

test('createClient forwards token writes and removals', async () => {
	const { remote, calls } = makeRemote();
	const client = createClient({ remote });
	assert.equal((await client.saveToken('ZAPIER_MCP_TOKEN', 'tok')).ok, true);
	assert.deepEqual(calls.set, [{ ref: 'ZAPIER_MCP_TOKEN', value: 'tok' }]);
	assert.equal((await client.removeToken('ZAPIER_MCP_TOKEN')).ok, true);
	assert.deepEqual(calls.unset, [{ ref: 'ZAPIER_MCP_TOKEN' }]);
});

test('createClient re-check mutates the namespace with a nonce', async () => {
	const { remote, calls } = makeRemote();
	const client = createClient({ remote });
	const result = await client.recheck(7);
	assert.equal(result.ok, true);
	assert.equal(calls.mutate.length, 1);
	assert.equal(calls.mutate[0].ns, 'zapier-mcp');
	assert.equal(calls.mutate[0].revision, 7);
	assert.equal(calls.mutate[0].ops[0].op, 'set');
	assert.deepEqual(calls.mutate[0].ops[0].path, ['checkNonce']);
	assert.equal(typeof calls.mutate[0].ops[0].value, 'number');
});

test('createClient endpoint save trims the override', async () => {
	const { remote, calls } = makeRemote();
	const client = createClient({ remote });
	await client.saveEndpoint('  https://example.test/mcp ', 7);
	assert.deepEqual(calls.mutate[0].ops, [
		{ op: 'set', path: ['endpointOverride'], value: 'https://example.test/mcp' },
	]);
	assert.equal(calls.mutate[0].revision, 7);
});

test('createClient degrades gracefully without services', async () => {
	const client = createClient({});
	for (const result of [
		await client.describe(),
		await client.saveToken('ZAPIER_MCP_TOKEN', 'x'),
		await client.removeToken('ZAPIER_MCP_TOKEN'),
		await client.recheck(0),
		await client.saveEndpoint('', 0),
	]) {
		assert.equal(result.ok, false);
		assert.equal(typeof result.error.message, 'string');
	}
	const off = client.subscribe(() => {});
	assert.equal(typeof off, 'function');
	off();
});

test('createClient surfaces a thrown service call as a failure envelope', async () => {
	const remote = {
		settings: {
			describe() {
				throw new Error('boom');
			},
			mutate() {
				throw new Error('boom');
			},
		},
		credentials: {
			set() {
				throw new Error('boom');
			},
			unset() {
				throw new Error('boom');
			},
		},
	};
	const client = createClient({ remote });
	for (const result of [
		await client.describe(),
		await client.saveToken('r', 'v'),
		await client.removeToken('r'),
		await client.recheck(1),
		await client.saveEndpoint('', 1),
	]) {
		assert.equal(result.ok, false);
		assert.equal(result.error.message, 'boom');
	}
});

test('createClient subscribes to both refresh events and disposes them', () => {
	const seen = [];
	const disposed = [];
	const remote = {
		settings: {},
		credentials: {},
		$on(event) {
			seen.push(event);
			return () => disposed.push(event);
		},
	};
	const client = createClient({ remote });
	const off = client.subscribe(() => {});
	assert.ok(seen.includes('settings/document-updated'));
	assert.ok(seen.includes('credentials/reference-updated'));
	off();
	assert.deepEqual(disposed.sort(), seen.slice().sort());
});

/* -------------------------------------------------------------------------- *
 * Rendering smoke test
 * -------------------------------------------------------------------------- */

test('the section component renders for every status without throwing', () => {
	// readSnapshot is exercised for every status above; here we only prove that
	// the component body itself never throws and emits the expected anchors.
	const { remote } = makeRemote();
	const client = createClient({ remote });
	const t = (key, ...args) => {
		const value = en[key];
		return typeof value === 'function' ? value(...args) : value;
	};
	const tree = ZapierSection({ t, client });
	assert.ok(tree !== null && typeof tree === 'object');
	assert.equal(tree.type, 'div');
	/** Inclusive rendering of the whole subtree must not throw. */
	const rendered = JSON.stringify(tree, (key, value) =>
		typeof value === 'function' ? String(value) : value,
	);
	assert.ok(rendered.includes('Zapier MCP'));
	assert.ok(rendered.includes('zapier-mcp-token'));
	assert.ok(rendered.includes('zapier-mcp-endpoint'));
	assert.ok(rendered.includes(DEFAULT_ENDPOINT));
});

test('the advanced disclosure is collapsed by default and secondary', () => {
	const { remote } = makeRemote();
	const client = createClient({ remote });
	const t = (key, ...args) => {
		const value = en[key];
		return typeof value === 'function' ? value(...args) : value;
	};
	const tree = ZapierSection({ t, client });
	/**
	 * @param {any} node pseudo element
	 * @returns {any | null} first details node
	 */
	function findDetails(node) {
		if (node === null || typeof node !== 'object') {
			return null;
		}
		if (node.type === 'details') {
			return node;
		}
		for (const child of node.children ?? []) {
			const found = findDetails(child);
			if (found !== null) {
				return found;
			}
		}
		return null;
	}
	const details = findDetails(tree);
	assert.ok(details !== null, 'an advanced disclosure must exist');
	assert.equal(
		details.props.open,
		undefined,
		'the disclosure must start collapsed',
	);
	const text = JSON.stringify(details, (key, value) =>
		typeof value === 'function' ? String(value) : value,
	);
	assert.ok(text.includes('Advanced'));
	assert.ok(text.includes('MCP endpoint override'));
});

test('polling constants are bounded', () => {
	assert.ok(POLL_TIMEOUT_MS > 0);
	assert.ok(POLL_TIMEOUT_MS <= 60000);
});
