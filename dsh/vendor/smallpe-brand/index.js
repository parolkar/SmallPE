/**
 * smallpe-brand — host half.
 *
 * Brands the page itself, which the Client half cannot reach before it boots:
 *
 *   - the tab favicon. dsh-custom-logo only rewrites a single
 *     `<link rel="icon" … href="/favicon.svg" />`, but this DSH ships
 *     `./favicon.svg` and `./favicon-dark.svg` behind media queries, so neither
 *     matches and the DeepSeek mark stayed. Every icon link is replaced by the
 *     square logo dsh-custom-logo serves.
 *   - the initial <title>. DSH rewrites it per session afterwards; the Client
 *     half keeps it saying SmallPE.
 *   - the install manifest, which names the app.
 *
 * @module smallpe-brand
 */

export const name = 'smallpe-brand'
export const inject = ['webServer']

const PRODUCT = 'SmallPE'
/** Square logo from $DSH_HOME/branding, served by dsh-custom-logo. */
const ICON = '/custom-logo/logo-128.png'
const ROUTE = '/smallpe-brand'
const MANIFEST = JSON.stringify({
  name: PRODUCT,
  short_name: PRODUCT,
  start_url: '/',
  scope: '/',
  display: 'fullscreen',
  icons: [{ src: ICON, sizes: '128x128', type: 'image/png', purpose: 'any' }],
})

/** Pure index.html transform: favicon, title and manifest. */
export function tapIndexHtml(html) {
  return html
    .replace(/<link rel="icon"[^>]*>/g, '')
    .replace(
      /<link rel="manifest"[^>]*>/,
      `<link rel="manifest" href="${ROUTE}/manifest.webmanifest" crossorigin="use-credentials" />`,
    )
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>${PRODUCT}</title>` +
        `<link rel="icon" type="image/png" href="${ICON}" />` +
        `<link rel="apple-touch-icon" href="${ICON}" />`,
    )
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => {
      if (req.method === 'GET' && req.url?.split('?')[0] === `${ROUTE}/manifest.webmanifest`) {
        res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8' })
        res.end(MANIFEST)
        return
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
    },
  }), 'smallpe-brand: manifest route')

  ctx.effect(() => ctx.webServer.tapIndex(tapIndexHtml), 'smallpe-brand: index tap')
}
