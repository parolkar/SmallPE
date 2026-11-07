#!/usr/bin/env node
/**
 * Let dsh-ui-auth share one workspace across every signed-in user.
 *
 * Why a patch
 * -----------
 * dsh-ui-auth scopes everything per user through two predicates in its policy core:
 *
 *   const session   = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.session(id)   === principal.username);
 *   const workspace = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.workspace(id) === principal.username);
 *
 * Every other rule composes from those two — RPC authorization, result projection, and
 * the per-frame projection of the `workspace/follow` stream that builds the sidebar.
 *
 * SmallPE needs the DS Bot team folder visible to the whole team: the nine agents are
 * colleagues working in one shared space. That cannot be expressed through the supported
 * seam:
 *
 *   * ownership is single-owner — `claimOwner` throws "Object already belongs to another
 *     user", so the team workspace cannot simply be claimed by everyone; and
 *   * `registerPolicy` cannot reach the sidebar. Of the five kinds `PolicyRules` declares,
 *     only `http`, `rpc` and `upgrade` are ever dispatched (modern-gateway.js lines 325,
 *     384, 395, 433). `stream` and `remote` are declared and never consulted, and the
 *     frame projection that would hide the team workspace runs through `policy.frame()`
 *     directly. Authorising access without it leaves a workspace nobody can see.
 *
 * So the two predicates gain one more way to say yes: an id listed in the shared scope
 * file, which @local/smallpe-user-workspaces rewrites on a timer.
 *
 * SECURITY: this widens access on purpose. Every signed-in user — not only admins — can
 * read and write every file in a shared workspace and drive the agents inside it, model
 * spend included. Nothing else changes: unlisted workspaces and sessions stay private to
 * their owner, and an absent or unreadable scope file means nothing is shared, so the
 * failure direction is closed. The scope lists explicit ids rather than matching a
 * pattern, so what is shared is always auditable:
 *
 *   cat $DSH_HOME/smallpe-shared-scope.json
 *
 * Run by dsh/scripts/enable-auth.sh, so it covers both the local opt-in and the container
 * image. Re-running is safe. Re-run it after any `dsh plugin add dsh-ui-auth`.
 *
 * Usage:  node dsh/scripts/patch-ui-auth-sharing.mjs [path/to/dsh-ui-auth/lib/modern-policy.js]
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/**
 * Second patch: let an `http` policy see the request body.
 *
 * DS Bot posts every one of its operations to the single route `/api/bot`, naming the
 * operation in the BODY (`{ endpoint, payload }`), not the URL. The gateway hands an
 * `http` policy the raw stream and then forwards that same stream, so a policy that read
 * the body to tell `state` (harmless, and what the UI needs to start) from
 * `dsh-update-install` (installs software on the host) would consume it and break the
 * forward. Without this, the only choices are "admins only" — which leaves non-admins
 * staring at "Setting up your Main Bot…" forever — or "everyone, for everything".
 *
 * The fix reuses the module's own machinery: `bodyOf` buffers, `replay` hands the bytes
 * to the forward, exactly as the RPC path already does a few lines below. The policy then
 * receives the parsed envelope as a third argument. Policies that ignore it are
 * unaffected, so this is backwards compatible with any other http policy.
 */
const HTTP_BODY_PATCH = {
  what: 'http policy body',
  from: `        const rule = extension('http', { pathname, method: req.method });
        if (rule !== undefined) {
            if (!(await rule.authorize(who, req)))
                json(res, 403, { error: 'Access denied' });
            else
                forward(req, res);
            return true;
        }`,
  to: `        const rule = extension('http', { pathname, method: req.method });
        if (rule !== undefined) {
            // SmallPE: buffer the body so the policy can authorize per operation, then
            // replay it to the forward. A body that is absent or not JSON authorizes as
            // before with an undefined envelope; it is never a reason to allow.
            let __smallpeBody;
            let __smallpeEnvelope;
            try {
                const read = await bodyOf(req);
                __smallpeBody = read.body;
                __smallpeEnvelope = read.envelope;
            }
            catch {
                __smallpeBody = undefined;
                __smallpeEnvelope = undefined;
            }
            if (!(await rule.authorize(who, req, __smallpeEnvelope)))
                json(res, 403, { error: 'Access denied' });
            else
                forward(__smallpeBody === undefined ? req : replay(req, __smallpeBody), res);
            return true;
        }`,
}

/**
 * Third patch: let the deployment's own model routes work for everyone.
 *
 * dsh-ui-auth decides what a non-admin may run from their model PROFILES — their own
 * plus any an admin shared with them. Its own comment is explicit:
 *
 *   从未配置任何模型的用户得到空授权（目录为空、切换模型被拒）
 *   (a user who has never configured a model gets an empty entitlement —
 *    empty catalog, model switching denied)
 *
 * SmallPE configures OpenRouter once, in the profile's cordis.patch.yml, keyed by
 * OPENROUTER_API_KEY. That is a deployment route, not a per-user profile, so without this
 * every non-admin signs in to an empty model picker and cannot run anything — while the
 * key they are meant to share sits right there.
 *
 * SMALLPE_DEFAULT_PROVIDERS names the routes everybody may use. It is a floor, not a
 * ceiling: a user's own profiles and shares are added on top, unchanged. Unset means no
 * change at all to stock behaviour.
 *
 * The matching `allowedModel` change makes a default route allow any model it serves. A
 * profile-backed route still matches model by model — profiles always register one — so
 * this loosens nothing that was previously strict.
 *
 * The key itself stays out of reach: it lives in the deployment environment, never in a
 * user-visible profile, and Settings/credentials remain administrator-only in
 * dsh-ui-auth's own policy. Users get the route, not the secret.
 */
const DEFAULT_PROVIDERS_PRELUDE = `// --- SmallPE: deployment-wide model routes (dsh/scripts/patch-ui-auth-sharing.mjs) ---
// Routes every signed-in user may use, on top of their own profiles and shares. The API
// key stays in the deployment environment and is never exposed to a non-admin.
const __smallpeDefaultProviders = String(process.env.SMALLPE_DEFAULT_PROVIDERS ?? "")
	.split(",").map(entry => entry.trim()).filter(entry => entry !== "");
// --- end SmallPE -------------------------------------------------------------------

`

const DEFAULT_PROVIDERS_PATCH = {
  what: 'entitlement fallback',
  from: `            const uid = await new ProfileStore(store).uidOf(principal.username);
            if (uid === undefined)
                return { providers: [], models: [] };
            const profiles = await service.listProfiles(uid);`,
  to: `            const uid = await new ProfileStore(store).uidOf(principal.username);
            if (uid === undefined)
                // SmallPE: a user with no profiles still gets the deployment's shared routes.
                return { providers: [...__smallpeDefaultProviders], models: [] };
            const profiles = await service.listProfiles(uid);`,
}

const DEFAULT_PROVIDERS_MERGE = {
  what: 'entitlement result',
  from: `            return {
                providers: [...new Set(profiles.map(routeOf))],
                models: profiles.map(meta => ({ provider: routeOf(meta), model: meta.model })),
            };`,
  to: `            return {
                // SmallPE: deployment routes first, then everything this user owns or was shared.
                providers: [...new Set([...__smallpeDefaultProviders, ...profiles.map(routeOf)])],
                models: profiles.map(meta => ({ provider: routeOf(meta), model: meta.model })),
            };`,
}

const ALLOWED_MODEL_PATCH = {
  what: 'allowedModel',
  from: `    const allowedModel = (scope, provider, model) => nonempty(provider) && nonempty(model)
        && scope.models.some(entry => entry.provider === provider && entry.model === model);`,
  to: `    const allowedModel = (scope, provider, model) => nonempty(provider) && nonempty(model)
        // SmallPE: a route allowed with no model entries of its own is a deployment route —
        // allow every model it serves. Profile-backed routes always register a model, so
        // they keep matching exactly as before.
        && (scope.models.some(entry => entry.provider === provider && entry.model === model)
            || (scope.providers.includes(provider)
                && !scope.models.some(entry => entry.provider === provider)));`,
}

/**
 * Fourth patch: stop the gateway choking on binary RPC responses.
 *
 * Symptom: the sidebar file viewer cannot open a PDF (or any file read as bytes) and
 * shows
 *   Read failed: client api: workspaceFiles/readBytes failed:
 *   transport failure for /api/workspaceFiles/readBytes: HTTP 502
 *
 * `forwardJson` buffers every /api/* RPC response and re-serialises it so ownership can
 * be projected onto the result:
 *
 *   const envelope = JSON.parse(body.toString('utf8'))
 *
 * But DSH does not answer every call with JSON. When a result carries bytes it replies
 * `multipart/form-data`, and DSH's own client branches on exactly that:
 *
 *   content-type === 'multipart/form-data' ? parseBinaryResponse(response)
 *                                          : parseConnectionResponse(await response.json())
 *     — @deepseek-ai/dsh-client-connection/lib/client.browser.js
 *
 * The gateway has no such branch, so `JSON.parse` meets the `--boundary` prefix and dies
 * with "No number after minus sign in JSON at position 1". The catch turns that into
 * HTTP 502 "Could not persist or project response".
 *
 * This affects EVERY user including the admin — it is not an ownership problem — and any
 * endpoint whose result carries bytes, not just PDFs.
 *
 * The fix forwards a multipart body untouched. Nothing is lost by not projecting it: a
 * byte range has no ownership fields to filter, and the request was already authorized
 * before it was forwarded — `workspaceFiles/*` is gated on
 * `session(principal, args.workspaceFileScopeId)`. Passing the bytes through is also the
 * only behaviour that can work at all, since re-serialising a multipart body as JSON
 * would corrupt it.
 *
 * The framing headers are kept for a pass-through body, because unlike the JSON path the
 * bytes are unchanged and content-length still describes them.
 */
const BINARY_RESPONSE_PATCH = {
  what: 'binary response pass-through',
  from: `                    capture(chunk);
                    let body = Buffer.concat(chunks);
                    if (status >= 200 && status < 300) {
                        const envelope = JSON.parse(body.toString('utf8'));
                        if (envelope?.result?.ok === true)
                            envelope.result.value = await transform(envelope.result.value);
                        body = Buffer.from(JSON.stringify(envelope));
                    }
                    restore();
                    // The body is re-serialized here: framing/encoding headers of the original
                    // bytes no longer describe it, so they must not survive the projection.
                    for (const header of ['content-length', 'Content-Length', 'content-encoding', 'Content-Encoding', 'transfer-encoding', 'Transfer-Encoding']) {
                        delete headers[header];
                        res.removeHeader?.(header);
                    }`,
  to: `                    capture(chunk);
                    let body = Buffer.concat(chunks);
                    // SmallPE: DSH answers with multipart/form-data when a result carries
                    // bytes (workspaceFiles/readBytes and friends). Those cannot be parsed
                    // as JSON — the boundary prefix throws — and have no ownership fields
                    // to project, so forward them exactly as received. Authorization has
                    // already run for this request.
                    // The content type can arrive either way: as a field passed to
                    // writeHead (captured in \`headers\`) or set directly on the response
                    // with setHeader, which the interception above never sees. DSH uses
                    // the latter, so consulting only \`headers\` silently misses it.
                    const __smallpeType = String(
                        headers['content-type'] ?? headers['Content-Type']
                        ?? res.getHeader?.('content-type') ?? '',
                    ).split(';', 1)[0].trim().toLowerCase();
                    const __smallpeBinary = __smallpeType === 'multipart/form-data';
                    if (status >= 200 && status < 300 && !__smallpeBinary) {
                        const envelope = JSON.parse(body.toString('utf8'));
                        if (envelope?.result?.ok === true)
                            envelope.result.value = await transform(envelope.result.value);
                        body = Buffer.from(JSON.stringify(envelope));
                    }
                    restore();
                    // The body is re-serialized here: framing/encoding headers of the original
                    // bytes no longer describe it, so they must not survive the projection.
                    // A pass-through binary body IS the original bytes, so its framing stands.
                    if (!__smallpeBinary) for (const header of ['content-length', 'Content-Length', 'content-encoding', 'Content-Encoding', 'transfer-encoding', 'Transfer-Encoding']) {
                        delete headers[header];
                        res.removeHeader?.(header);
                    }`,
}

/** The predicates as dsh-ui-auth emits them, and the shared-aware replacements. */
const REPLACEMENTS = [
  {
    what: 'session',
    from: "const session = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.session(id) === principal.username);",
    to: "const session = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.session(id) === principal.username || __smallpeShared().sessions.has(String(id)));",
  },
  {
    what: 'workspace',
    from: "const workspace = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.workspace(id) === principal.username);",
    to: "const workspace = (principal, id) => nonempty(id) && (principal.role === 'admin' || owners.workspace(id) === principal.username || __smallpeShared().workspaces.has(String(id)));",
  },
]

/**
 * The reader prepended to the module.
 *
 * Deliberately synchronous and self-contained: the predicates it serves are synchronous,
 * and they are on the authorization path for every request, so this must not import
 * anything the module does not already have or do any I/O it cannot bound. `readFileSync`
 * on a small local file behind a one-second cache is the cheapest thing that stays
 * correct when the file changes under a running harness.
 *
 * Every failure — missing file, bad JSON, unreadable — yields empty sets, which is stock
 * dsh-ui-auth behaviour. It can never widen access by accident.
 */
const PRELUDE = `// --- SmallPE: shared workspace scope (dsh/scripts/patch-ui-auth-sharing.mjs) ---------
// Ids listed here are visible to EVERY signed-in user, not just their owner. Written by
// @local/smallpe-user-workspaces; absent or malformed means nothing is shared.
import { readFileSync as __smallpeReadFileSync } from "node:fs";
import __smallpeNodePath from "node:path";
const __smallpeScopeFile = process.env.SMALLPE_SHARED_SCOPE_FILE
	?? __smallpeNodePath.resolve(process.env.DSH_HOME ?? ".", "smallpe-shared-scope.json");
const __smallpeEmptyScope = { workspaces: new Set(), sessions: new Set() };
let __smallpeScope = __smallpeEmptyScope;
let __smallpeScopeReadAt = 0;
function __smallpeShared() {
	const now = Date.now();
	// Re-read at most once a second: this runs on every authorization decision.
	if (now - __smallpeScopeReadAt < 1000) return __smallpeScope;
	__smallpeScopeReadAt = now;
	try {
		const parsed = JSON.parse(__smallpeReadFileSync(__smallpeScopeFile, "utf8"));
		__smallpeScope = {
			workspaces: new Set((Array.isArray(parsed.workspaces) ? parsed.workspaces : []).map(String)),
			sessions: new Set((Array.isArray(parsed.sessions) ? parsed.sessions : []).map(String)),
		};
	} catch {
		// No file yet, or garbage in it: share nothing.
		__smallpeScope = __smallpeEmptyScope;
	}
	return __smallpeScope;
}
// --- end SmallPE -------------------------------------------------------------------

`

const MARKER = '__smallpe'

const LIB = path.resolve(
  process.argv[2] ?? path.resolve(
    process.env.DSH_HOME ?? path.resolve(import.meta.dirname, '..', 'home'),
    'profiles/web/node_modules/dsh-ui-auth/lib',
  ),
)

/** The two files this touches, each with its edits and whether it gets the prelude. */
const TARGETS = [
  {
    file: 'modern-policy.js',
    edits: [...REPLACEMENTS, ALLOWED_MODEL_PATCH],
    prelude: PRELUDE,
    summary: 'shared scope in the session + workspace predicates, deployment routes in allowedModel',
  },
  {
    file: 'modern-gateway.js',
    edits: [HTTP_BODY_PATCH, BINARY_RESPONSE_PATCH],
    prelude: '',
    summary: 'request body passed to http policies, binary responses forwarded intact',
  },
  {
    file: 'index.js',
    edits: [DEFAULT_PROVIDERS_PATCH, DEFAULT_PROVIDERS_MERGE],
    prelude: DEFAULT_PROVIDERS_PRELUDE,
    summary: 'deployment model routes added to every user entitlement',
  },
]

let applied = 0
let already = 0

for (const { file, edits, prelude, summary } of TARGETS) {
  const target = path.join(LIB, file)
  let source
  try {
    source = await readFile(target, 'utf8')
  } catch (error) {
    // The plugin is opt-in; skipping is correct when it is absent.
    if (error.code === 'ENOENT') {
      console.log(`[smallpe] dsh-ui-auth is not installed at ${target} — no sharing patch to apply.`)
      process.exit(0)
    }
    throw error
  }

  if (source.includes(MARKER)) {
    console.log(`[smallpe] ${file}: already patched (${summary}).`)
    already += 1
    continue
  }

  const missing = edits.filter(({ from }) => source.split(from).length - 1 !== 1)
  if (missing.length > 0) {
    console.error(
      `[smallpe] patch-ui-auth-sharing: expected exactly one ${missing.map((r) => r.what).join(' and ')} in\n`
      + `          ${target}\n`
      + '          dsh-ui-auth has reworded this code. Re-read the file and update the patch in\n'
      + '          dsh/scripts/patch-ui-auth-sharing.mjs before trusting the result.\n'
      + '          Refusing to patch: a partial match here would silently change who can see what.',
    )
    process.exit(1)
  }

  let patched = source
  for (const { from, to } of edits) patched = patched.replace(from, to)
  await writeFile(target, prelude + patched)
  console.log(`[smallpe] ${file}: patched (${summary}).`)
  applied += 1
}

if (applied === 0 && already > 0) console.log('[smallpe] dsh-ui-auth sharing patches are already in place.')
