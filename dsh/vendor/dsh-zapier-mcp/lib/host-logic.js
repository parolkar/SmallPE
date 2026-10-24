/**
 * Dependency-free Host helpers for the `dsh-zapier-mcp` bundle.
 *
 * `index.js` imports `@deepseek-ai/schemastery` and `@deepseek-ai/dsh-mcp-client`,
 * which only resolve once the bundle is installed into a DSH profile. Everything
 * that is worth testing therefore lives here instead, so
 * `node test/host.test.mjs` runs against a bare checkout with no node_modules.
 *
 * @module dsh-zapier-mcp/lib/host-logic
 */
import { INVENTORY_LIMIT } from './prompt.js';

/** MCP endpoint used whenever the configured endpoint is empty. */
export const DEFAULT_ENDPOINT = 'https://mcp.zapier.com/api/v1/connect';

/** How many tool names are published to the Settings page (the first N, in registry order). */
export const TOOL_NAME_LIMIT = 25;

/** Maximum length of a published `lastError`, in characters. */
export const ERROR_MESSAGE_LIMIT = 500;

/** User-writable volatile config paths that must schedule a re-check. */
export const RECHECK_PATHS = Object.freeze(['checkNonce', 'endpointOverride']);

/**
 * Volatile config paths this plugin writes about itself.
 *
 * These must never schedule a re-check: publishing status makes the Loader emit
 * `loader/volatile-update` for exactly these paths, so reacting to them would
 * reconnect forever.
 */
export const STATUS_PATHS = Object.freeze(['status', 'toolCount', 'toolNames', 'lastError', 'checkedAt', 'inventory']);

/**
 * Build the MCP URL for one connection attempt by appending the token as a
 * query parameter.
 *
 * The token travels in the query string (that is what the hosted Zapier MCP
 * endpoint expects), so it is percent-encoded as a single value: spaces, `+`,
 * `&`, `=` and non-ASCII characters can never split or corrupt the query.
 * A trailing slash is trimmed from the path so the canonical `.../connect?token=`
 * form is produced, and an endpoint that already carries a query string is
 * extended with `&` rather than a second `?`.
 *
 * @param {string} endpoint - configured endpoint; empty/blank falls back to {@link DEFAULT_ENDPOINT}.
 * @param {string} token - resolved credential value to embed; never logged.
 * @returns {string} the absolute URL to hand to the MCP streamable-http transport.
 */
export function buildServerUrl(endpoint, token) {
  const configured = typeof endpoint === 'string' ? endpoint.trim() : '';
  const raw = configured === '' ? DEFAULT_ENDPOINT : configured;
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const query = queryStart === -1 ? '' : raw.slice(queryStart);
  let trimmed = path;
  while (trimmed.length > 1 && trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  const separator = query === '' ? '?' : '&';
  const value = token === undefined || token === null ? '' : String(token);
  return `${trimmed}${query}${separator}token=${encodeURIComponent(value)}`;
}

/**
 * Turn any thrown value into the single-line, bounded message the Settings page shows.
 *
 * The underlying cause wins over the wrapper: `mcp-client` wraps a failed
 * connect in one message and puts the real MCP/JSON-RPC error in `cause`, which
 * is the text a user needs ("Invalid OAuth token - please re-authenticate").
 * Whitespace is collapsed because the value is rendered in one line, and the
 * result is capped at {@link ERROR_MESSAGE_LIMIT} characters.
 *
 * @param {unknown} error - thrown value, Error or not.
 * @returns {string} a single-line message of at most 500 characters.
 */
export function describeError(error) {
  if (error === undefined || error === null) return 'Unknown error';
  const cause = typeof error === 'object' ? error.cause : undefined;
  const causeMessage = cause !== undefined && cause !== null && typeof cause === 'object' ? cause.message : undefined;
  let raw;
  if (typeof causeMessage === 'string' && causeMessage !== '') raw = causeMessage;
  else if (typeof error === 'object' && typeof error.message === 'string' && error.message !== '') raw = error.message;
  else if (typeof error === 'string') raw = error;
  else raw = String(error);
  return raw.replace(/\s+/g, ' ').trim().slice(0, ERROR_MESSAGE_LIMIT);
}

/**
 * Keep only the public tool names owned by one MCP server.
 *
 * `mcp-client` names every bridged tool `mcp__<serverName>__<rawName>`; the
 * prefix filter is what lets two mounts of this plugin count their own tools
 * without seeing another server's.
 *
 * @param {unknown} names - names as returned by the tool registry.
 * @param {string} serverName - this plugin's configured MCP server name.
 * @returns {string[]} the names matching `mcp__<serverName>__`.
 */
export function selectServerTools(names, serverName) {
  if (!Array.isArray(names) || typeof serverName !== 'string' || serverName === '') return [];
  const prefix = `mcp__${serverName}__`;
  return names.filter((name) => typeof name === 'string' && name.startsWith(prefix));
}

/**
 * Decide whether a `loader/volatile-update` payload asks for a re-check.
 *
 * The Loader emits an array of key paths. Depending on how deep the volatile
 * field sits, one element is either a flat key (`'checkNonce'`) or a path array
 * (`['checkNonce']`), so both shapes are accepted. Status paths this plugin
 * writes itself are deliberately ignored, which is what prevents a publish from
 * triggering another publish.
 *
 * @param {unknown} paths - `paths` argument of `loader/volatile-update`.
 * @returns {boolean} true when any path names a user-facing re-check trigger.
 */
export function isRecheckTrigger(paths) {
  if (!Array.isArray(paths)) return false;
  for (const entry of paths) {
    const keys = Array.isArray(entry) ? entry : [entry];
    if (keys.some((key) => RECHECK_PATHS.includes(key))) return true;
  }
  return false;
}

/**
 * Whether an error is `mcp-client`'s oversized-server-instructions rejection.
 *
 * `mcp-client` wraps its initial-connection failure in an outer Error, so the
 * `maxInstructionBytes` text normally sits in the cause chain rather than on
 * the message the caller sees; the chain is walked a bounded number of links.
 * Only this exact failure justifies a retry with a larger cap.
 *
 * @param {unknown} error - thrown/rejected value.
 * @returns {boolean} true when the instruction-byte cap caused the failure.
 */
export function isInstructionLimitError(error) {
  let current = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === 'object' && typeof current.message === 'string' && /maxInstructionBytes/.test(current.message)) return true;
    current = typeof current === 'object' ? current.cause : undefined;
  }
  return false;
}

/**
 * Own the connection lifecycle: serialized probes, status transitions, and
 * publishing of the volatile fields the Settings page reads.
 *
 * Runs never overlap. Every `trigger` gets a generation number and is appended
 * to one promise chain; the newest generation wins, and an older run that finds
 * itself superseded either skips publishing or disposes the child it managed to
 * mount. `trigger` never rejects — a failed probe becomes `status='error'` with
 * the cause message in `lastError`.
 *
 * @param {object} options - injected side effects; every one is called at most once per generation step.
 * @param {() => (string | undefined | Promise<string | undefined>)} options.resolveToken - resolve the credential per attempt; empty/absent means unconfigured.
 * @param {(token: string, endpoint: string, maxInstructionBytes: number) => (Function | Promise<Function>)} options.mount - connect and return a disposer; may throw/reject on a failed token or connection.
 * @param {() => void | Promise<void>} [options.unmount] - defensive, idempotent cleanup for a mount that failed after partially mounting; called before re-mounting.
 * @param {() => (string[] | Promise<string[]>)} [options.listTools] - tool names owned by this server, read after a successful mount.
 * @param {() => (string | Promise<string>)} [options.collectInventory] - digest of the live capability inventory; bounded and cleared when disconnected.
 * @param {(patch: object) => void | Promise<void>} [options.publish] - receive the complete volatile status patch; failures are swallowed.
 * @param {() => (string | Promise<string>)} [options.resolveEndpoint] - effective endpoint for the attempt, read per attempt so an override applies without a reload.
 * @param {number} [options.maxInstructionBytes] - server-instructions cap used for the first mount attempt.
 * @param {number} [options.instructionRetryBytes] - larger cap used for the single retry when the first attempt failed on that cap.
 * @param {() => string} [options.now] - ISO-8601 clock used for `checkedAt`.
 * @returns {{ trigger: (reason?: string) => Promise<void>, dispose: () => Promise<void> }}
 *   `trigger(reason)` schedules one probe (the reason is diagnostic only);
 *   `dispose()` invalidates in-flight runs, disposes the mounted child, and
 *   never blocks on a hung probe.
 */
export function createConnectionManager(options) {
  const {
    resolveToken,
    mount,
    unmount = async () => {},
    listTools = () => [],
    collectInventory = async () => '',
    publish = async () => {},
    resolveEndpoint = () => '',
    maxInstructionBytes = 131072,
    instructionRetryBytes = 1048576,
    now = () => new Date().toISOString(),
  } = options ?? {};

  if (typeof resolveToken !== 'function') throw new TypeError('createConnectionManager: resolveToken must be a function');
  if (typeof mount !== 'function') throw new TypeError('createConnectionManager: mount must be a function');

  /** Monotonic probe id; only the run whose id still matches `generation` may publish. */
  let generation = 0;
  /** The serialization queue: every run is appended here, so two runs never interleave. */
  let chain = Promise.resolve();
  let disposed = false;
  /** Disposer returned by the currently mounted child, if any. */
  let childDisposer;
  let state = {
    status: 'unconfigured',
    toolCount: 0,
    toolNames: [],
    lastError: '',
    checkedAt: '',
    inventory: '',
  };

  /**
   * Whether a newer trigger (or disposal) has superseded this run.
   * @param {number} gen - the run's probe id.
   */
  const stale = (gen) => disposed || gen !== generation;

  /** Run a side effect that must never reject and mask the connection outcome. */
  const settle = async (work) => {
    try {
      return await work();
    } catch {
      return undefined;
    }
  };

  /** Publish the complete state once; the Settings service is optional. */
  const publishState = async () => {
    try {
      await publish({ ...state });
    } catch {
      // A missing Settings service or a stale settings revision must never
      // break the connection logic.
    }
  };

  /** Apply a patch and publish it, unless a newer generation owns the status now. */
  const transition = async (gen, patch) => {
    if (stale(gen)) return;
    state = { ...state, ...patch };
    await publishState();
  };

  /** Dispose the child this manager mounted, if it mounted one. */
  const releaseChild = async () => {
    const disposer = childDisposer;
    childDisposer = undefined;
    if (disposer) await settle(disposer);
  };

  /**
   * Leave no child mounted. `unmount` is the defensive half: when `mount`
   * rejects after partially mounting, it has no disposer to return, and only
   * the injected `unmount` can clear that state (it must be idempotent).
   */
  const cleanup = async () => {
    await releaseChild();
    await settle(unmount);
  };

  /** Publish the error transition, preferring the cause message; never throws. */
  const fail = async (gen, error) => {
    await cleanup();
    if (stale(gen)) return;
    await transition(gen, {
      status: 'error',
      toolCount: 0,
      toolNames: [],
      lastError: describeError(error),
      checkedAt: now(),
      inventory: '',
    });
  };

  /**
   * Mount, retrying exactly once with the larger instruction cap when (and only
   * when) the attempt failed because the server's instructions exceeded it.
   * Zapier ships a large instructions block; reporting that as a broken token
   * would be wrong. Everything here stays inside the serialized run.
   * @param {number} gen - the run's probe id.
   * @param {string} token - resolved token.
   * @param {string} endpoint - effective endpoint.
   * @returns {Promise<{ disposer?: Function, error?: unknown, stale?: boolean }>} the mount outcome.
   */
  const mountWithInstructionRetry = async (gen, token, endpoint) => {
    try {
      return { disposer: await mount(token, endpoint, maxInstructionBytes) };
    } catch (error) {
      if (!isInstructionLimitError(error)) return { error };
      if (stale(gen)) return { stale: true };
      // A failed mount may have left a partially mounted child behind.
      await cleanup();
      if (stale(gen)) return { stale: true };
      try {
        return { disposer: await mount(token, endpoint, instructionRetryBytes) };
      } catch (retryError) {
        return { error: retryError };
      }
    }
  };

  /** One serialized probe: resolve, check, mount, count. */
  const run = async (gen) => {
    try {
      let token;
      try {
        token = await resolveToken();
      } catch (error) {
        await fail(gen, error);
        return;
      }
      if (stale(gen)) return;
      const value = token === undefined || token === null ? '' : String(token).trim();

      if (value === '') {
        await cleanup();
        await transition(gen, {
          status: 'unconfigured',
          toolCount: 0,
          toolNames: [],
          lastError: '',
          checkedAt: now(),
          inventory: '',
        });
        return;
      }

      let endpoint;
      try {
        endpoint = await resolveEndpoint();
      } catch (error) {
        await fail(gen, error);
        return;
      }
      if (stale(gen)) return;

      await transition(gen, {
        status: 'checking',
        toolCount: 0,
        toolNames: [],
        lastError: '',
        checkedAt: now(),
        inventory: '',
      });
      if (stale(gen)) return;

      // The previous child must be gone before this one mounts: mcp-client
      // reserves `serverName` for the lifetime of the child fiber.
      await cleanup();
      if (stale(gen)) return;

      const outcome = await mountWithInstructionRetry(gen, value, endpoint);
      if (outcome.stale === true) return;
      if (outcome.error !== undefined) {
        await fail(gen, outcome.error);
        return;
      }
      const disposer = outcome.disposer;
      childDisposer = disposer;

      // Superseded while connecting: this child is ours, so drop it now rather
      // than leaving a stale server mounted until the next run replaces it.
      if (stale(gen)) {
        await cleanup();
        return;
      }

      let names;
      try {
        names = await listTools();
      } catch (error) {
        await fail(gen, error);
        return;
      }
      if (stale(gen)) {
        await cleanup();
        return;
      }

      // The inventory is a best-effort digest of live state: a missing or
      // malformed payload degrades to no inventory and never fails the connect.
      let inventory = '';
      try {
        inventory = await collectInventory();
      } catch {
        inventory = '';
      }
      if (stale(gen)) {
        await cleanup();
        return;
      }
      if (typeof inventory !== 'string') inventory = '';

      const list = (Array.isArray(names) ? names : []).filter((name) => typeof name === 'string');
      await transition(gen, {
        status: 'connected',
        toolCount: list.length,
        toolNames: list.slice(0, TOOL_NAME_LIMIT),
        lastError: '',
        checkedAt: now(),
        inventory: inventory.slice(0, INVENTORY_LIMIT),
      });
    } catch (error) {
      // `trigger` must never reject; anything unexpected still becomes status.
      await fail(gen, error);
    }
  };

  /**
   * Schedule one probe and return a promise settling after it (and every probe
   * already queued) finished. The promise never rejects.
   * @param {string} [reason] - call-site diagnostic (`credential`, `recheck`, ...); ordering is by generation, not by reason.
   */
  const trigger = (reason) => {
    void reason;
    if (disposed) return Promise.resolve();
    const gen = ++generation;
    const task = chain.then(() => run(gen), () => run(gen));
    chain = task.catch(() => {});
    return chain;
  };

  /**
   * Stop owning the connection. In-flight runs are invalidated and dispose
   * their own child when they settle; the currently mounted child is disposed
   * synchronously-relative-to-this-call. The run chain is deliberately not
   * awaited: a hung network probe must not block Host shutdown or HMR.
   * @returns {Promise<void>} settles once the current child is released.
   */
  const dispose = () => {
    disposed = true;
    generation += 1;
    return cleanup().catch(() => {});
  };

  return { trigger, dispose };
}
