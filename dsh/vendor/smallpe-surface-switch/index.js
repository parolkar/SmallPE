/**
 * smallpe-surface-switch — host half.
 *
 * There is nothing for the Host to do: the whole feature is one button in the browser,
 * registered into the shipped `sidebar.footer.action` seat (see client.js). The switch is
 * a value in the browser's own localStorage, which the Host neither reads nor writes.
 *
 * This file exists because a profile row is imported on the Host first — without a main
 * entry the row fails to activate with
 *
 *   ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined
 *
 * and the Client half never loads. So: a named, deliberately empty plugin rather than a
 * puzzling absence.
 *
 * @module smallpe-surface-switch
 */

export const name = 'smallpe-surface-switch'

/**
 * No Host behaviour. The browser half does the work.
 * @returns {void}
 */
export function apply() {}
