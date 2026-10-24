/**
 * Prompt-text and inventory-digest helpers for the `dsh-zapier-mcp` bundle.
 *
 * Deliberately dependency-free (no imports at all): every rule about what the
 * model may be told, and every rule about what may leave the process, is pure
 * text handling that the tests can exercise with a bare `node`.
 *
 * Nothing here is allowed to touch the network, the credential value, or any
 * account identifier: the inventory digest reads only app name, action count
 * and connection count, and the prompt section is empty unless the connection
 * is live.
 *
 * @module dsh-zapier-mcp/lib/prompt
 */

/** Unique system-prompt section name for this bundle. */
export const ZAPIER_SECTION_NAME = 'zapier-mcp';

/** Placement used when the SystemPrompt service does not know the repository name. */
export const ZAPIER_SECTION_ORDER_FALLBACK = 3150;

/** Offset after the `MCP_SERVERS` repository order: right behind the MCP server instructions. */
const ZAPIER_SECTION_ORDER_OFFSET = 50;

/** Bound for the published `inventory` string, in characters (roughly 1 KB). */
export const INVENTORY_LIMIT = 1024;

/** Bound for the whole prompt section, in characters. */
export const PROMPT_SECTION_LIMIT = 4096;

/** Most apps named in one digest; the rest are summarized as a count. */
export const MAX_INVENTORY_APPS = 20;

/** Private app-name bound, so one hostile server string cannot own the section. */
const MAX_APP_NAME_LENGTH = 60;

/** Zapier's inventory meta-tool, called without arguments for the enabled surface. */
export const ZAPIER_INSPECT_TOOL = 'inspect_zapier_actions';

/**
 * Whether this plugin should register its prompt section at all.
 *
 * @param {{ systemPrompt?: boolean }} [config] - ordinary config values.
 * @returns {boolean} true unless the user explicitly turned the section off.
 */
export function shouldRegisterPromptSection(config) {
  return config?.systemPrompt !== false;
}

/**
 * Resolve the section order next to the MCP server instructions.
 *
 * `getSectionOrder('MCP_SERVERS')` is the documented repository placement; a
 * service that does not know that name (or throws) must never break section
 * registration, so the fixed fallback is used instead.
 *
 * @param {{ getSectionOrder?: (name: string) => number }} [service] - the systemPrompt service.
 * @param {number} [fallback] - order used when the repository name is unavailable.
 * @returns {number} a finite ascending order.
 */
export function sectionOrderFor(service, fallback = ZAPIER_SECTION_ORDER_FALLBACK) {
  try {
    const base = service?.getSectionOrder?.(/** @type {never} */ ('MCP_SERVERS'));
    if (typeof base === 'number' && Number.isFinite(base)) return base + ZAPIER_SECTION_ORDER_OFFSET;
  } catch {
    // Unknown repository name on another service version: keep the fallback.
  }
  return fallback;
}

/**
 * Build the Zapier prompt section text for the current connection state.
 *
 * Empty unless `status === 'connected'`: an unconfigured or broken token must
 * add no context at all. The text states only what the verbatim server
 * instructions cannot — the DSH name mapping, the virtual-surface warning, the
 * live inventory and the write-safety rule — and is registered with
 * `interpolate: false`, so `$` sequences stay literal.
 *
 * @param {{ status?: string, serverName?: string, inventory?: string }} [state] - live connection facts.
 * @returns {string} the section text, or `''` when it must contribute nothing.
 */
export function buildZapierPromptSection(state) {
  if (state?.status !== 'connected') return '';
  const serverName = safeServerName(state?.serverName);
  const inventory = cleanLine(state?.inventory, INVENTORY_LIMIT);
  const lines = [
    '## Zapier MCP',
    '',
    `The Zapier tools here are fixed scaffolding, not the capability limit: a small set of meta-tools discovers, enables, inspects and executes actions across 9,000+ apps, resolved at call time. Call them as \`mcp__${serverName}__<name>\` — that is, \`inspect_zapier_actions\` is \`mcp__${serverName}__inspect_zapier_actions\`. Never tell the user an app is unavailable because no matching tool is listed; discover and enable it instead.`,
  ];
  if (inventory !== '') lines.push('', inventory);
  lines.push('', '`execute_zapier_write_action` acts on real external systems: confirm with the user before any send, publish or delete.');
  return `${lines.join('\n')}\n`;
}

/**
 * Unwrap an MCP tool result value into the inventory payload.
 *
 * Accepts what a tool call can realistically hand back: the canonical
 * `{ content, structuredContent }` value, a bare JSON string, an already
 * parsed payload, or a `{ apps: [...] }` object. Anything else — including a
 * malformed payload — yields `null` so callers degrade to no inventory.
 *
 * @param {unknown} value - tool result value, structured content, or JSON text.
 * @returns {{ apps: unknown[] } | null} the payload, or null when unusable.
 */
export function extractInventoryPayload(value) {
  if (typeof value === 'string') return parseJsonObject(value);
  if (!value || typeof value !== 'object') return null;
  if (isAppList(value)) return /** @type {{ apps: unknown[] }} */ (value);

  const structured = /** @type {{ structuredContent?: unknown }} */ (value).structuredContent;
  if (structured !== undefined) {
    const found = extractInventoryPayload(structured);
    if (found !== null) return found;
  }

  const content = /** @type {{ content?: unknown }} */ (value).content;
  if (typeof content === 'string') return parseJsonObject(content);
  if (Array.isArray(content)) {
    const text = content
      .filter((block) => block && typeof block === 'object' && typeof (/** @type {{ text?: unknown }} */ (block).text) === 'string')
      .map((block) => /** @type {{ text: string }} */ (block).text)
      .join('\n');
    return parseJsonObject(text);
  }
  return null;
}

/**
 * Digest the live capability inventory into one bounded prompt line.
 *
 * Only app name, action count and connection count are read; connection ids,
 * account titles/emails and internal API names are never copied. The result
 * is at most {@link INVENTORY_LIMIT} characters, so the section it feeds stays
 * bounded and a hostile app name cannot inject lines into the prompt.
 *
 * @param {unknown} value - inventory payload, tool result value, or JSON text.
 * @returns {string} e.g. `Enabled now: Gmail — 1 action, 2 accounts`, or `''` when nothing is enabled or the payload is unusable.
 */
export function buildInventoryDigest(value) {
  const payload = extractInventoryPayload(value);
  if (payload === null || !Array.isArray(payload.apps)) return '';

  // Count every named app, but only carry the first MAX_INVENTORY_APPS into the
  // digest, so the "+N more" summary is exact even for a huge inventory.
  const apps = [];
  let namedTotal = 0;
  for (const entry of payload.apps) {
    const app = normalizeApp(entry);
    if (app === null) continue;
    namedTotal += 1;
    if (apps.length < MAX_INVENTORY_APPS) apps.push(app);
  }
  if (apps.length === 0) return '';

  const head = 'Enabled now: ';
  const parts = [];
  let length = head.length;
  for (const app of apps) {
    const part = formatApp(app);
    const next = length + (parts.length === 0 ? 0 : 2) + part.length;
    if (next > INVENTORY_LIMIT - 12) break;
    parts.push(part);
    length = next;
  }
  if (parts.length === 0) return '';
  const omitted = namedTotal - parts.length;
  const text = `${head}${parts.join('; ')}${omitted > 0 ? `; +${omitted} more` : ''}`;
  return text.slice(0, INVENTORY_LIMIT);
}

/**
 * Read one app entry into the three facts the prompt may carry.
 * @param {unknown} entry - one `apps[]` element.
 * @returns {{ name: string, actions: number, accounts: number } | null} normalized facts, or null when unnamed.
 */
function normalizeApp(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const record = /** @type {{ app?: unknown, action_count?: unknown, connections?: { total?: unknown } }} */ (entry);
  const name = cleanLine(record.app, MAX_APP_NAME_LENGTH);
  if (name === '') return null;
  return {
    name,
    actions: toCount(record.action_count),
    accounts: toCount(record.connections?.total),
  };
}

/**
 * Render one normalized app as a digest clause.
 * @param {{ name: string, actions: number, accounts: number }} app - normalized facts.
 * @returns {string} e.g. `Trello — 3 actions, 1 account`.
 */
function formatApp(app) {
  const actions = `${app.actions} ${app.actions === 1 ? 'action' : 'actions'}`;
  const accounts = `${app.accounts} ${app.accounts === 1 ? 'account' : 'accounts'}`;
  return `${app.name} — ${actions}, ${accounts}`;
}

/** A finite, non-negative integer count; anything else is zero. */
function toCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Whether a value is a parsed inventory payload with an `apps` array (possibly empty). */
function isAppList(value) {
  return typeof value === 'object' && value !== null && Array.isArray(/** @type {{ apps?: unknown }} */ (value).apps);
}

/**
 * Parse JSON text into an object, tolerating prose around one JSON document.
 * @param {unknown} text - candidate JSON.
 * @returns {object | null} the parsed object, or null.
 */
function parseJsonObject(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const direct = tryParseObject(trimmed);
  if (direct !== null) return direct;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return tryParseObject(trimmed.slice(start, end + 1));
}

/** Parse one JSON document and keep only object results. */
function tryParseObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Collapse any value to one bounded, single-line string.
 * @param {unknown} value - candidate text.
 * @param {number} limit - maximum character count.
 * @returns {string} collapsed text, or `''` when nothing printable remains.
 */
function cleanLine(value, limit) {
  if (typeof value !== 'string') return '';
  const collapsed = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.slice(0, limit);
}

/** A safe MCP server name for the section's examples. */
function safeServerName(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value) ? value : 'zapier';
}
