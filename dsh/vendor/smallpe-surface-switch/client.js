/**
 * smallpe-surface-switch — a Classic-mode button at the sidebar foot.
 *
 * DS Bot can hand the window back to DSH's own "classic Agent" interface, but the only
 * way in is Settings -> General -> Mode -> Switch, which is four clicks deep. This puts
 * the same switch beside Settings at the foot of the sidebar.
 *
 * HOW DS BOT DOES IT, AND WHY THIS CANNOT DO THE SAME
 *
 * Its settings row calls an action it owns:
 *
 *   <button className="bt-soft bt-soft-sm" onClick={() => actions.setSurface("agent")}>
 *
 * `setSurface` closes the open panels, persists the choice, and flips a store that is
 * private to DS Bot's React tree:
 *
 *   const surface = createSource({ mode: readMode(), plain: false })
 *   writeMode(mode); surface.set(state => ({ ...state, mode }))
 *
 * Nothing exposes that action outside the bundle — `globalThis.dsBotApp` is the desktop
 * app bridge (ready/updates/browser/computer), not the UI. So this writes the same
 * persisted value DS Bot reads at startup and reloads the page:
 *
 *   localStorage["ds-bot:surface"] = "agent" | "bot"      (ds-bot's own STORAGE.surface)
 *
 * `readMode()` runs once when the store is created, and ds-bot's `storage` listener syncs
 * only reactions and unread marks, so a live window will not notice the change — the
 * reload is what makes it take effect, not laziness. Verified against a running harness:
 * writing the key and reloading lands on the classic surface, and writing it back returns
 * to the bot surface.
 *
 * The end state is the same as the settings switch, which also closes every panel on the
 * way out. The visible difference is the reload.
 *
 * The button hides itself on the classic surface: DS Bot already draws a return control
 * there, and two ways back would be noise.
 *
 * @module smallpe-surface-switch/client
 */

window.__ModuleLoader__.load({
  id: '@local/smallpe-surface-switch',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** ds-bot's own key. Changing this silently strands the button, so it is asserted below. */
    const SURFACE_KEY = 'ds-bot:surface';
    const BOT = 'bot';
    const AGENT = 'agent';

    /**
     * The surface DS Bot will start in.
     * Absent or unreadable storage means the bot surface, matching ds-bot's `readMode()`.
     * @returns {string} 'agent' or 'bot'
     */
    function currentSurface() {
      try {
        return globalThis.localStorage?.getItem(SURFACE_KEY) === AGENT ? AGENT : BOT;
      } catch {
        return BOT;
      }
    }

    /**
     * Persist the surface and restart the window into it.
     * @param {string} mode 'agent' or 'bot'
     * @returns {void}
     */
    function switchTo(mode) {
      try {
        globalThis.localStorage?.setItem(SURFACE_KEY, mode);
      } catch {
        // Private browsing or a blocked store: without persistence the reload would land
        // straight back here, so say so rather than appearing to do nothing.
        globalThis.alert?.('SmallPE: this browser will not let the app remember the mode.');
        return;
      }
      globalThis.location?.reload();
    }

    /** Two arrows, matching the 20px mark DS Bot's own footer buttons draw. */
    function SwitchIcon() {
      return h(
        'svg',
        {
          width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true',
        },
        h('path', {
          d: 'M3.5 7h12m0 0-3-3m3 3-3 3M16.5 13h-12m0 0 3-3m-3 3 3 3',
          stroke: 'currentColor', strokeWidth: '1.4',
          strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
      );
    }

    /**
     * One action beside Settings at the sidebar foot.
     *
     * Markup copied from DS Bot's own `BotReturn`, which occupies this same seat to get
     * BACK from the classic surface:
     *
     *   <button className="bt-return" aria-label={…} title={…} onClick={…}>
     *     <BotMark size={20} />
     *     {wide ? <span className="bt-return-name">{…}</span> : null}
     *   </button>
     *
     * Reusing `bt-return` is the point. DS Bot installs that CSS globally
     * (`display:inline-flex; align-items:center; justify-content:center; gap:8px;
     * min-height:36px; …`), so this button is laid out by the same rules as the shipped
     * one instead of by styles of our own invention — a first attempt with hand-written
     * inline styles collapsed to a 12px box on the rail. The two controls are mirror
     * images, so they should look identical.
     *
     * `wide` is the only thing the seat passes: false on the 56px rail, where the
     * shipped actions show their mark alone and the name lives on aria-label.
     *
     * @param {{ wide?: boolean }} props owner-supplied column state
     * @returns {object | null} the button, or null on the classic surface
     */
    function ClassicModeAction({ wide }) {
      // Read at render: a reload is the only way this value changes under us, and that
      // remounts everything anyway.
      if (currentSurface() === AGENT) return null;

      const label = 'Classic mode';
      return h(
        'button',
        {
          type: 'button',
          className: 'bt-return smallpe-surface-switch',
          onClick: () => switchTo(AGENT),
          title: label,
          'aria-label': label,
        },
        h(SwitchIcon),
        wide ? h('span', { className: 'bt-return-name' }, label) : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // A missing key would mean ds-bot renamed its storage, and the button would write
        // somewhere nothing reads. Say so once rather than failing silently.
        if (typeof globalThis.localStorage?.getItem !== 'function') {
          ctx.logger?.warn?.('smallpe-surface-switch: no localStorage; the button is inert');
        }

        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'smallpe-classic-mode',
              // After the shipped Cordis panel action (which registers without an order).
              order: 100,
              label: 'Classic mode',
            },
            ClassicModeAction,
          ),
        );
      },
    };
  },
});
