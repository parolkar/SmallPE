/**
 * smallpe-brand — browser half.
 *
 * Shows the images uploaded through dsh-custom-logo as this app's brand, in
 * both places the shell can draw it:
 *
 *   1. The shipped sidebar's brand seats — `sidebar.brand.mark` (collapsed rail)
 *      and `sidebar.brand.name` (expanded row). Both are `single` slots where
 *      the LOWEST priority wins; DS Bot occupies them at -100 and its
 *      `freePriority` helper sinks one below the current holder, so the seats
 *      are claimed through {@link claimSeat}, which takes them back whenever a
 *      rival ends up lower.
 *   2. DS Bot's OWN expanded brand row. In bot mode the DS Bot shell renders
 *      `BrandMark`/`BrandName` directly inside `span.bt-brand` (`.bt-side-top`)
 *      instead of going through those seats, so no occupant can replace it —
 *      that markup is styled here, the same way dsh-custom-logo styles the
 *      shipped brand button.
 *
 * Images come from dsh-custom-logo's host route (`/custom-logo/*`), cache-busted
 * with the mtimes `/custom-logo/state` reports so a re-upload reaches the
 * browser on a plain reload. When that route reports no image for a slot, the
 * seat stays empty instead of showing a broken image, and dsh-custom-logo's own
 * background copies are cancelled so exactly one logo is drawn.
 *
 * @module smallpe-brand/client
 */

window.__ModuleLoader__.load({
  id: '@local/smallpe-brand',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** dsh-custom-logo's host route: branding-dir mtime per slot, null when absent. */
    const STATE_URL = '/custom-logo/state';
    /** Square logo — favicon and collapsed rail in dsh-custom-logo. */
    const SQUARE_SRC = '/custom-logo/logo-64.png';
    /** Wide lockup — expanded sidebar top in dsh-custom-logo. */
    const WIDE_SRC = '/custom-logo/logo-wide.png';

    /** Lowest priority wins a single seat; DS Bot occupies these at -100. */
    const BRAND_PRIORITY = -500;

    /**
     * Resolve one branding slot from dsh-custom-logo.
     * @returns `undefined` while undecided, `null` when the slot has no image,
     *   otherwise the mtime to cache-bust with.
     */
    function useBrandingMtime(slot) {
      const [state, setState] = React.useState({ decided: false });
      React.useEffect(() => {
        let live = true;
        fetch(STATE_URL, { credentials: 'same-origin' })
          .then((response) => (response.ok ? response.json() : null))
          .then((value) => {
            if (!live) return;
            if (value === null) {
              // The route answered but not with state: try the image anyway.
              setState({ decided: true, mtime: null, optimistic: true });
              return;
            }
            const mtime = value[slot];
            setState({ decided: true, mtime: typeof mtime === 'number' ? mtime : null });
          })
          .catch(() => {
            if (live) setState({ decided: true, mtime: null, optimistic: true });
          });
        return () => {
          live = false;
        };
      }, [slot]);
      return state;
    }

    /** One brand image; renders nothing while undecided or when no logo exists. */
    function BrandImage({ slot, src, alt, style }) {
      const state = useBrandingMtime(slot);
      if (!state.decided) return null;
      if (state.mtime === null && state.optimistic !== true) return null;
      const href = state.mtime === null ? src : `${src}?v=${state.mtime}`;
      return h('img', {
        src: href,
        alt,
        draggable: false,
        'data-smallpe-brand': slot,
        style,
        onError: (event) => {
          event.currentTarget.style.display = 'none';
        },
      });
    }

    /** Collapsed rail and expanded row leading mark. */
    function BrandMark({ size }) {
      const edge = typeof size === 'number' && size > 0 ? size : 24;
      return h(BrandImage, {
        slot: 'square',
        src: SQUARE_SRC,
        alt: '',
        style: {
          display: 'block',
          width: `${edge}px`,
          height: `${edge}px`,
          objectFit: 'contain',
        },
      });
    }

    /** Expanded row lockup; the shell gives it the width the brand button has. */
    function BrandName() {
      return h(BrandImage, {
        slot: 'wide',
        src: WIDE_SRC,
        alt: 'SmallPE',
        style: {
          display: 'block',
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '42px',
          objectFit: 'contain',
        },
      });
    }

    /**
     * Brand styles for both shells.
     * @param state - `/custom-logo/state` payload, or null when it could not be read.
     * @returns the CSS text.
     */
    function buildCss(state) {
      const bust = (base, key) => {
        const mtime = state === null ? undefined : state[key];
        return typeof mtime === 'number' ? `${base}?v=${mtime}` : base;
      };
      return [
        // Shipped sidebar: the wide lockup already contains the square mark, and
        // this plugin draws the images, so dsh-custom-logo's copies are dropped.
        '[class*="brandMark"]{display:none!important}',
        '[class*="brandIdentity"]{height:auto!important}',
        '[class*="brandName"]{height:auto!important}',
        'button[class*="_brand"]{background-image:none!important}',
        '[class*="_collapsed"] button[class*="_toggle"]{background-image:none!important}',
        // DS Bot's own expanded brand row (bot mode): hide its whale and "DS Bot"
        // text, then paint the SmallPE lockup on the element that held them.
        '.bt-side-top .bt-brand > span{display:none!important}',
        `.bt-side-top .bt-brand{background:url(${bust(WIDE_SRC, 'wide')}) no-repeat left center/auto 26px!important;min-height:26px!important;min-width:92px!important;padding-left:0!important}`,
      ].join('');
    }

    /**
     * Claim one brand seat below every other occupant, and keep it.
     *
     * DS Bot re-installs its own brand occupants through `freePriority`, which
     * reads the current entries and sinks one below the lowest, so a fixed
     * priority loses the seat the moment its shell installs. This watches the
     * seat and takes it back whenever another occupant sits below us.
     *
     * @param ctx - plugin Context carrying `slots`.
     * @param seat - slot key to occupy.
     * @param Component - occupant rendered in the seat.
     * @returns cleanup releasing the seat and its subscription.
     */
    function claimSeat(ctx, seat, Component) {
      let priority = BRAND_PRIORITY;
      let dispose = null;
      let busy = false;

      /** Occupants of the seat other than ours, matched by our own priority. */
      const rivals = () =>
        (ctx.slots.entries(seat) ?? []).filter((entry) => entry.options?.priority !== priority);

      /** Register below the given occupants, replacing any previous claim. */
      const take = (others) => {
        if (busy) return;
        busy = true;
        try {
          if (dispose !== null) {
            const previous = dispose;
            dispose = null;
            previous();
          }
          priority = Math.min(
            BRAND_PRIORITY,
            ...others.map((entry) => (entry.options?.priority ?? 0) - 1),
          );
          dispose = ctx.slots.register({ name: seat, priority }, Component);
        } finally {
          busy = false;
        }
      };

      take(rivals());

      const off = ctx.slots.subscribe(seat, () => {
        const others = rivals();
        if (others.some((entry) => (entry.options?.priority ?? 0) < priority)) take(others);
      });

      return () => {
        off?.();
        if (dispose !== null) {
          const previous = dispose;
          dispose = null;
          previous();
        }
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Styles are rebuilt once the live mtimes arrive, so a re-upload applies
        // to the styled DS Bot brand row as well as to the seats.
        ctx.effect(() => {
          let tag = null;
          let live = true;
          const paint = (state) => {
            if (!live) return;
            if (tag !== null) tag.remove();
            tag = document.createElement('style');
            tag.dataset.smallpeBrand = '';
            tag.textContent = buildCss(state);
            document.head.appendChild(tag);
          };
          paint(null);
          fetch(STATE_URL, { credentials: 'same-origin' })
            .then((response) => (response.ok ? response.json() : null))
            .then((state) => paint(state))
            .catch(() => {});
          return () => {
            live = false;
            if (tag !== null) tag.remove();
          };
        }, 'smallpe-brand: brand styles');

        ctx.slots.inject('sidebar.brand.mark', () =>
          claimSeat(ctx, 'sidebar.brand.mark', BrandMark),
        );
        ctx.slots.inject('sidebar.brand.name', () =>
          claimSeat(ctx, 'sidebar.brand.name', BrandName),
        );
      },
    };
  },
});
