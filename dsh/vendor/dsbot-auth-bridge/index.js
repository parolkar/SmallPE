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

// Wait for dsh-ui-auth's service. Without it there is no gateway to open a route in, and
// the plugin stays pending rather than pretending to work.
export const inject = ['uiAuth']

export function apply(ctx, config = {}) {
  const pathname = config.pathname ?? '/api/bot'

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
}
