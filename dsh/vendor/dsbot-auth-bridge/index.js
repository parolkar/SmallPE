// Admits DS Bot's own exact fetch route through the dsh-ui-auth gateway.
//
// dsh-ui-auth wraps the DSH HTTP server and takes over every request before DSH
// dispatches it. For a POST under /api/ that is not one of the few exact fetch routes it
// knows, it requires a DSH Remote envelope:
//
//   { type: 'client-request', method: '<endpoint>', rpcId: '...', payload: ... }
//
// DS Bot's browser half does not speak that protocol. It posts its own shape,
// { endpoint, payload }, to its own exact route /api/bot and reads back the host's
// { ok, value | error } envelope. dsh-ui-auth therefore answers HTTP 400
// {"error":"Invalid request"} and DSH never sees the request, which is why the DS Bot
// interface reports an error in every panel and its model list stays empty.
//
// dsh-ui-auth publishes a documented seam for exactly this: `ctx.get('uiAuth')
// .registerPolicy(id, { http })`. The gateway consults `http` policies first and, on a
// match, forwards the raw request to DSH dispatch, bypassing the envelope gate. This
// plugin registers that one rule and nothing else.

export const name = 'dsbot-auth-bridge'

// NOTE: `uiAuth` is injected on an INNER fiber, not declared as this plugin's own
// `inject`. The difference is only visible when dsh-ui-auth is absent, which is the
// default for a local install (`./bin/run.sh` has no login; see dsh/scripts/enable-auth.sh):
//
//   * a top-level `inject` leaves the whole loader entry pending for a service nothing
//     will ever provide, and dsh reports that on every start —
//       dsh: warning: 1 entry did not activate
//       dsbot-auth-bridge (@local/dsbot-auth-bridge): pending (waiting for service: uiAuth)
//     which reads like a broken install and sends people looking for a login page that
//     this configuration deliberately does not have;
//   * an inner `ctx.inject` lets the entry activate, and only the child fiber waits. The
//     loader's activation report covers entries and their subtrees, not fibers a plugin
//     starts itself, so there is nothing to warn about.
//
// The behaviour is otherwise identical: the policy is registered the moment dsh-ui-auth
// provides the gateway — before or after this plugin loads — and is withdrawn with it.
// DS Bot names its operation in the request BODY — it posts `{ endpoint, payload }` to the
// one route — so authorization has to read the envelope, not the URL. What a user needs to
// see the team and talk to it is shared; what changes the team, its settings or the host
// stays with the admin.
//
// The SmallPE DS Bots are shared colleagues: every signed-in user must be able to load the
// team and talk to the agents. Admin-only here is what leaves a non-admin looking at
// "Setting up your Main Bot…" forever, because `state` never answers.
const SHARED_ENDPOINTS = new Set([
  'state',                 // the roster and its sessions — the call the UI blocks on at startup
  'agent-session',         // attach to an agent's session, i.e. actually talk to a colleague
  'thinking',              // toggle the thinking view on a turn
  // --- ds-bot 0.3.x ---
  'bot-new-part',          // start a new session with an agent ("new session" button)
  'bot-open-part',         // reopen an earlier session ("Open this earlier session")
  'browser-takeover',      // take the wheel of an agent's browser mid-task
  'browser-stop',          // stop that browser
  'browser-give-back',     // hand control back to the agent, with an optional answer
  'computer-cursor-wait',  // computer-use handshake; the client polls this on a loop
  'computer-user-active',  // idle/presence ping, sent automatically by the client
  'learning-answer',       // approve or reject a learning card
  // Reading a chat
  'earlier',               // scroll back through a Bot's chat
  'exchange',              // the messages two Bots passed each other
  'exchange-text',         // one of those messages in full
  'file-text',             // "Show all" on a long post
  'room-progress',         // who is speaking in a group chat right now
  // Talking in it
  'send',                  // send a message to a Bot or a group chat
  'answer-question',       // answer a Bot's ask_user card
  'view-reply',            // submit a form a Bot showed
  'approval-answer',       // allow or deny a tool call the Bot asked about
  'dismiss-question',      // close a question card unanswered
  'dismiss-view',          // close a form unanswered
  'resume',                // "Retry" after a failed turn
  'btw-delete',            // delete a by-the-way card
  'side-new',              // side chats: an aside next to a Bot's chat
  'side-ask',
  'side-cancel',
  'side-close',
  // Steering work in progress
  'stop-member-work',      // stop one Bot in a group chat
  'stop-room-work',        // stop the whole group chat
  'goal-draft',            // set a group chat's goal
  'goal-control',          // pause, resume or stop that goal
  'computer-takeover',     // the computer-use counterparts of the browser-* entries above
  'computer-handback',
  'computer-stop',
  'computer-hold-answer',
  'computer-shot',         // a screenshot the Bot took, shown in its chat
])

// Everything else ds-bot serves is left to the admin on purpose. By kind:
//   roster and group chats: add-agent, remove-agent, agent-*, create-bot, update-bot,
//     duplicate-bot, delete-bot, set-main, set-flags, private-release, create-room,
//     update-room, delete-room, team-workspace, folder*, avatar-*, local-agent*
//     — the team's shape, not one member's to change
//   providers, models, secrets, connectors, mail, IM, capabilities, schedules, memory,
//   usage, diagnostics, set-prefs, repo-stars and the remaining computer-* settings
//     — host-wide configuration, other people's data, or the deployment's spend
//   update-check, update-install, dsh-update-install
//     — these install software on the host; a non-admin must never reach them
//
// Two of the shared entries are not user gestures but client housekeeping:
// `computer-cursor-wait` is polled in a loop and `computer-user-active` reports idle
// time. Denying them does not protect anything — they carry no authority — and leaves a
// non-admin's UI retrying against a 403 forever.
//
// WHEN UPGRADING ds-bot: re-derive this list; test/policy.test.mjs fails on anything
// unclassified. Anything new is denied to non-admins until it is classified here, which
// is the safe default but shows up as a feature that silently does nothing for them, or
// as a 403. The client calls the route through more than one minified alias (`call`,
// `call2`), so match them all:
//   grep -ohE '\bcall[0-9]*\("[a-zA-Z._/-]+"' client.js | sort -u
// plus `local-agents` and `local-agent-refresh`, which it names through a variable.

export function apply(ctx, config = {}) {
  const pathname = config.pathname ?? '/api/bot'
  const shared = new Set(config.sharedEndpoints ?? SHARED_ENDPOINTS)

  ctx.inject(['uiAuth'], (ctx) => {
    ctx.effect(() => ctx.uiAuth.registerPolicy('dsbot-auth-bridge', {
      http: {
        // Deliberately narrow: the gateway throws "Ambiguous authorization policy" when two
        // rules of the same kind match one request, and that fails closed.
        matches: target => target.method === 'POST' && target.pathname === pathname,
        // `envelope` is the parsed body, which dsh-ui-auth only supplies once
        // dsh/scripts/patch-ui-auth-sharing.mjs has run. Without that patch it is
        // undefined and this falls back to admin-only — the stock behaviour, and the safe
        // direction: an unpatched gateway must not hand the roster to everyone.
        authorize: (who, _request, envelope) => {
          // Require a principal explicitly. The gateway answers 401 before any policy runs
          // when it cannot identify the caller, so this is belt and braces — but the rule
          // it replaced was `who?.role === 'admin'`, which denied an absent principal, and
          // widening a rule must not quietly drop that.
          if (typeof who?.username !== 'string') return false
          if (who.role === 'admin') return true
          const endpoint = envelope?.endpoint
          return typeof endpoint === 'string' && shared.has(endpoint)
        },
      },
    }), `dsbot-auth-bridge: admit POST ${pathname}`)
  })
}
