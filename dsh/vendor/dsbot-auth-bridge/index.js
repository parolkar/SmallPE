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
export function apply(ctx, config = {}) {
  const pathname = config.pathname ?? '/api/bot'

  ctx.inject(['uiAuth'], (ctx) => {
    ctx.effect(() => ctx.uiAuth.registerPolicy('dsbot-auth-bridge', {
      http: {
        // Deliberately narrow: the gateway throws "Ambiguous authorization policy" when two
        // rules of the same kind match one request, and that fails closed.
        matches: target => target.method === 'POST' && target.pathname === pathname,
        // Admin only, matching how dsh-ui-auth already gates its other exact fetch routes.
        // The gateway has authenticated the request before this rule runs; anything that
        // gets here is a signed-in principal.
        authorize: who => who?.role === 'admin',
      },
    }), `dsbot-auth-bridge: admit POST ${pathname}`)
  })
}
