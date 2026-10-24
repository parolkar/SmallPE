/**
 * dsh-zapier-mcp — browser (client) half.
 *
 * Adds a "Zapier MCP" section to the Harness Settings panel, directly below
 * "Models". The user pastes the token belonging to their hosted Zapier MCP
 * server, and the page immediately reports whether Zapier accepted it and
 * which tools came back.
 *
 * Design rules honoured here:
 *  - No build step, no dependencies, no TypeScript. Plain modern ESM inside
 *    the module-loader factory, JSDoc on every helper.
 *  - Every remote call returns an envelope `{ ok: true, value }` or
 *    `{ ok: false, error: { code, message } }`. We never assume thrown errors.
 *  - All colours/text/borders come from `--dsw-*` CSS custom properties.
 *  - The stored token is write-only: it is never read back or rendered.
 */

window.__ModuleLoader__.load({
	id: 'dsh-zapier-mcp',
	/**
	 * @param {(name: string) => any} require module loader provided by the host
	 * @returns {{ inject: string[], apply: (ctx: any) => void, __internals: object }}
	 */
	factory(require) {
		const React = require('react');
		const h = React.createElement;
		const Fragment = React.Fragment;
		const useState = React.useState;
		const useEffect = React.useEffect;
		const useMemo = React.useMemo;
		const useRef = React.useRef;
		const useCallback = React.useCallback;

		/** Settings namespace this plugin owns. */
		const NS = 'zapier-mcp';
		/** Slot occupant id, also used as the DOM-ish identifier for tests. */
		const SECTION_ID = 'zapier-mcp';
		/** Order immediately after "Models" (10) and before "Plugins" (15). */
		const SECTION_ORDER = 11;
		/** Fallbacks used only when the host has not published the config yet. */
		const DEFAULT_CREDENTIAL_REF = 'ZAPIER_MCP_TOKEN';
		const DEFAULT_ENDPOINT = 'https://mcp.zapier.com/api/v1/connect';
		/** Where a user creates the hosted MCP server whose token they paste. */
		const ZAPIER_SITE = 'https://mcp.zapier.com/';
		/** Status polling: ~600 ms until the host finishes its check. */
		const POLL_INTERVAL_MS = 600;
		const POLL_TIMEOUT_MS = 25000;

		/* ------------------------------------------------------------------ *
		 * Locale dictionaries
		 * ------------------------------------------------------------------ */

		/** @type {Record<string, any>} */
		const en = {
			nav: 'Zapier MCP',
			heading: 'Zapier MCP',
			intro:
				'Connect a hosted Zapier MCP server to make its tools available in chat.',
			tokenLabel: 'Zapier MCP token',
			tokenHelp:
				'Paste the token from your hosted Zapier MCP server. It is the value after token= in that server\u2019s connect URL.',
			tokenHelpLink: 'Open mcp.zapier.com',
			tokenPlaceholder: 'Paste token',
			save: 'Save & verify',
			saving: 'Saving\u2026',
			recheck: 'Re-check',
			rechecking: 'Re-checking\u2026',
			remove: 'Remove token',
			removeArmed: 'Click again to confirm',
			removing: 'Removing\u2026',
			notConfigured: 'Not configured',
			checking: 'Checking token\u2026',
			connected: (count) => `Connected \u2014 ${count} tools available`,
			rejected: 'Token rejected',
			readFailed: 'Could not read status',
			readFailedHelp:
				'The settings service did not answer. You can still save a token; retry in a moment.',
			toolsPartial: (shown, total) =>
				`Showing ${shown} of ${total} tools.`,
			checkedAt: (when) => `Last checked ${when}`,
			emptyToken: 'Enter a token first.',
			saveFailed: 'Could not save the token.',
			removeFailed: 'Could not remove the token.',
			recheckFailed: 'Could not start a re-check.',
			pollTimeout:
				'Still checking \u2014 the result will appear here when it finishes.',
			advanced: 'Advanced',
			endpointLabel: 'MCP endpoint override',
			endpointHelp: (url) => `Leave empty to use the Zapier default ${url}.`,
			endpointSave: 'Save endpoint',
			endpointSaving: 'Saving\u2026',
			endpointSaved: 'Endpoint update requested.',
			endpointFailed: 'Could not save the endpoint.',
			endpointInUse: (url) => `In use: ${url}`,
		};

		/** @type {Record<string, any>} */
		const zh = {
			nav: 'Zapier MCP',
			heading: 'Zapier MCP',
			intro: '连接托管的 Zapier MCP 服务器，即可在对话中使用其工具。',
			tokenLabel: 'Zapier MCP 令牌',
			tokenHelp:
				'粘贴托管 Zapier MCP 服务器提供的令牌，即该服务器连接 URL 中 token= 之后的值。',
			tokenHelpLink: '打开 mcp.zapier.com',
			tokenPlaceholder: '粘贴令牌',
			save: '保存并验证',
			saving: '正在保存\u2026',
			recheck: '重新检查',
			rechecking: '正在重新检查\u2026',
			remove: '移除令牌',
			removeArmed: '再次点击以确认',
			removing: '正在移除\u2026',
			notConfigured: '未配置',
			checking: '正在检查令牌\u2026',
			connected: (count) => `已连接 \u2014 可用工具 ${count} 个`,
			rejected: '令牌被拒绝',
			readFailed: '无法读取状态',
			readFailedHelp: '设置服务未响应。仍可保存令牌，请稍后重试。',
			toolsPartial: (shown, total) => `已列出 ${shown} / ${total} 个工具。`,
			checkedAt: (when) => `上次检查 ${when}`,
			emptyToken: '请先输入令牌。',
			saveFailed: '无法保存令牌。',
			removeFailed: '无法移除令牌。',
			recheckFailed: '无法启动重新检查。',
			pollTimeout: '仍在检查 \u2014 完成后结果会显示在此处。',
			advanced: '高级',
			endpointLabel: 'MCP 端点覆盖',
			endpointHelp: (url) => `留空则使用 Zapier 默认值 ${url}。`,
			endpointSave: '保存端点',
			endpointSaving: '正在保存\u2026',
			endpointSaved: '已请求更新端点。',
			endpointFailed: '无法保存端点。',
			endpointInUse: (url) => `当前使用：${url}`,
		};

		/* ------------------------------------------------------------------ *
		 * Pure helpers (exported through __internals and unit tested)
		 * ------------------------------------------------------------------ */

		/**
		 * Unwraps a remote envelope without ever throwing.
		 *
		 * @param {any} envelope value returned by a `ctx.remote.*` call
		 * @returns {{ ok: boolean, value: any, code: string, message: string }}
		 */
		function interpretEnvelope(envelope) {
			if (envelope === null || typeof envelope !== 'object') {
				return {
					ok: false,
					value: undefined,
					code: 'invalid-envelope',
					message: 'The settings service returned nothing.',
				};
			}
			if (envelope.ok === true) {
				return {
					ok: true,
					value: envelope.value,
					code: '',
					message: '',
				};
			}
			const error =
				envelope.error !== null && typeof envelope.error === 'object'
					? envelope.error
					: {};
			return {
				ok: false,
				value: undefined,
				code: typeof error.code === 'string' ? error.code : 'unknown-error',
				message:
					typeof error.message === 'string' && error.message !== ''
						? error.message
						: 'The settings service reported a failure.',
			};
		}

		/**
		 * Normalises a `settings.describe()` payload into the shape the page
		 * renders. Tolerates missing namespaces, malformed values, and hostile
		 * scalars so the UI can always degrade to a readable message.
		 *
		 * @param {any} envelope result of `remote.settings.describe()`
		 * @returns {{
		 *   ok: boolean, error: { code: string, message: string } | null,
		 *   writable: boolean, revision: number | null, value: object | null,
		 *   configured: boolean, status: string, toolCount: number,
		 *   toolNames: string[], lastError: string, checkedAt: string,
		 *   credentialRef: string, endpoint: string, endpointOverride: string,
		 *   effectiveEndpoint: string
		 * }}
		 */
		function readSnapshot(envelope) {
			const parsed = interpretEnvelope(envelope);
			/** @type {any} */
			const base = {
				ok: false,
				error: null,
				writable: false,
				revision: null,
				value: null,
				configured: false,
				status: 'unknown',
				toolCount: 0,
				toolNames: [],
				lastError: '',
				checkedAt: '',
				credentialRef: DEFAULT_CREDENTIAL_REF,
				endpoint: DEFAULT_ENDPOINT,
				endpointOverride: '',
				effectiveEndpoint: DEFAULT_ENDPOINT,
			};
			if (!parsed.ok) {
				return {
					...base,
					error: { code: parsed.code, message: parsed.message },
				};
			}
			const document = parsed.value;
			if (document === null || typeof document !== 'object') {
				return {
					...base,
					error: {
						code: 'invalid-document',
						message: 'The settings document was empty.',
					},
				};
			}
			const namespaces = Array.isArray(document.namespaces)
				? document.namespaces
				: [];
			const entry = namespaces.find(
				(candidate) =>
					candidate !== null &&
					typeof candidate === 'object' &&
					candidate.ns === NS,
			);
			if (entry === undefined) {
				return {
					...base,
					error: {
						code: 'namespace-missing',
						message: 'This plugin has no settings document yet.',
					},
				};
			}
			const value =
				entry.value !== null && typeof entry.value === 'object'
					? entry.value
					: {};
			const status =
				typeof value.status === 'string' && value.status !== ''
					? value.status
					: 'unconfigured';
			const credentialRef =
				typeof value.credentialRef === 'string' &&
				value.credentialRef.trim() !== ''
					? value.credentialRef
					: DEFAULT_CREDENTIAL_REF;
			const endpoint =
				typeof value.endpoint === 'string' && value.endpoint.trim() !== ''
					? value.endpoint
					: DEFAULT_ENDPOINT;
			const endpointOverride =
				typeof value.endpointOverride === 'string'
					? value.endpointOverride.trim()
					: '';
			return {
				ok: true,
				error: null,
				writable: document.writable === true,
				revision: typeof entry.revision === 'number' ? entry.revision : null,
				value,
				configured: status !== 'unconfigured' && status !== 'unknown',
				status,
				toolCount: toCount(value.toolCount),
				toolNames: toStringList(value.toolNames),
				lastError: typeof value.lastError === 'string' ? value.lastError : '',
				checkedAt: typeof value.checkedAt === 'string' ? value.checkedAt : '',
				credentialRef,
				endpoint,
				endpointOverride,
				effectiveEndpoint:
					endpointOverride !== '' ? endpointOverride : endpoint,
			};
		}

		/**
		 * Coerces a value into a non-negative integer count.
		 *
		 * @param {any} value candidate
		 * @returns {number} count, or 0 when unusable
		 */
		function toCount(value) {
			if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
				return Math.floor(value);
			}
			return 0;
		}

		/**
		 * Coerces a value into a list of non-empty strings.
		 *
		 * @param {any} value candidate
		 * @returns {string[]} usable names
		 */
		function toStringList(value) {
			if (!Array.isArray(value)) {
				return [];
			}
			return value
				.filter((item) => typeof item === 'string' && item.trim() !== '')
				.map((item) => item.trim());
		}

		/**
		 * Maps a status value onto a small set of visual tones.
		 *
		 * @param {string} status one of unconfigured|checking|connected|error
		 * @returns {'idle' | 'busy' | 'ok' | 'error' | 'unknown'}
		 */
		function statusTone(status) {
			switch (status) {
				case 'unconfigured':
					return 'idle';
				case 'checking':
					return 'busy';
				case 'connected':
					return 'ok';
				case 'error':
					return 'error';
				default:
					return 'unknown';
			}
		}

		/**
		 * Builds the one-line status headline for the current snapshot.
		 *
		 * @param {ReturnType<typeof readSnapshot>} snapshot normalised snapshot
		 * @param {(key: string, ...args: any[]) => string} t translator
		 * @returns {string} human readable status line
		 */
		function formatStatusText(snapshot, t) {
			if (!snapshot.ok) {
				return t('readFailed');
			}
			switch (snapshot.status) {
				case 'checking':
					return t('checking');
				case 'connected':
					return t('connected', snapshot.toolCount);
				case 'error':
					return t('rejected');
				case 'unconfigured':
					return t('notConfigured');
				default:
					return t('notConfigured');
			}
		}

		/**
		 * Renders an ISO timestamp in the user's locale, or '' when unusable.
		 *
		 * @param {string} checkedAt ISO date string from the settings document
		 * @returns {string} localised timestamp
		 */
		function formatCheckedAt(checkedAt) {
			if (typeof checkedAt !== 'string' || checkedAt.trim() === '') {
				return '';
			}
			const parsed = new Date(checkedAt);
			if (Number.isNaN(parsed.getTime())) {
				return '';
			}
			return parsed.toLocaleString();
		}

		/**
		 * Decides whether a pending check has settled, by comparing the
		 * snapshot taken before the action with the one just read.
		 *
		 * @param {{ checkedAt: string, status: string }} before pre-action state
		 * @param {ReturnType<typeof readSnapshot>} after current state
		 * @returns {boolean} true once the host has published a new result
		 */
		function hasSettled(before, after) {
			if (after === null || typeof after !== 'object' || !after.ok) {
				return false;
			}
			if (after.checkedAt !== '' && after.checkedAt !== before.checkedAt) {
				return true;
			}
			return after.status !== 'checking' && after.status !== before.status;
		}

		/**
		 * Validates the token the user typed.
		 *
		 * @param {any} raw input value
		 * @returns {boolean} true when the value is worth sending to the host
		 */
		function isValidTokenInput(raw) {
			return typeof raw === 'string' && raw.trim() !== '';
		}

		/**
		 * Builds the `settings.mutate` operation that triggers a fresh check.
		 *
		 * @param {number} nonce monotonically increasing value
		 * @returns {Array<object>} mutation operations
		 */
		function nonceOps(nonce) {
			return [{ op: 'set', path: ['checkNonce'], value: nonce }];
		}

		/**
		 * Builds the `settings.mutate` operation for the endpoint override.
		 *
		 * @param {string} rawEndpoint user input
		 * @returns {Array<object>} mutation operations
		 */
		function endpointOps(rawEndpoint) {
			return [
				{
					op: 'set',
					path: ['endpointOverride'],
					value: typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '',
				},
			];
		}

		/**
		 * A promise-based delay used by the status poller.
		 *
		 * @param {number} ms milliseconds to wait
		 * @returns {Promise<void>} resolves after the delay
		 */
		function delay(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		}

		/* ------------------------------------------------------------------ *
		 * Remote service wrapper
		 * ------------------------------------------------------------------ */

		/**
		 * Wraps the injected remote services so the component never touches an
		 * undefined method directly.
		 *
		 * @param {any} ctx plugin context
		 * @returns {{
		 *   describe: () => Promise<any>,
		 *   saveToken: (ref: string, value: string) => Promise<any>,
		 *   removeToken: (ref: string) => Promise<any>,
		 *   recheck: (revision: number | null) => Promise<any>,
		 *   saveEndpoint: (value: string, revision: number | null) => Promise<any>,
		 *   subscribe: (handler: () => void) => () => void
		 * }}
		 */
		function createClient(ctx) {
			const remote =
				ctx !== null &&
				typeof ctx === 'object' &&
				ctx.remote !== null &&
				typeof ctx.remote === 'object'
					? ctx.remote
					: null;
			const settings =
				remote !== null && typeof remote === 'object' ? remote.settings : null;
			const credentials =
				remote !== null && typeof remote === 'object'
					? remote.credentials
					: null;
			const unavailable = () =>
				Promise.resolve({
					ok: false,
					error: {
						code: 'service-unavailable',
						message: 'The settings service is not available.',
					},
				});
			return {
				describe() {
					if (settings === null || typeof settings.describe !== 'function') {
						return unavailable();
					}
					try {
						return Promise.resolve(settings.describe());
					} catch (error) {
						return Promise.resolve({
							ok: false,
							error: {
								code: 'describe-threw',
								message: String(
									error !== null && typeof error === 'object'
										? error.message
										: error,
								),
							},
						});
					}
				},
				saveToken(ref, value) {
					if (
						credentials === null ||
						typeof credentials.set !== 'function'
					) {
						return unavailable();
					}
					try {
						return Promise.resolve(credentials.set(ref, value));
					} catch (error) {
						return Promise.resolve({
							ok: false,
							error: {
								code: 'set-threw',
								message: String(
									error !== null && typeof error === 'object'
										? error.message
										: error,
								),
							},
						});
					}
				},
				removeToken(ref) {
					if (
						credentials === null ||
						typeof credentials.unset !== 'function'
					) {
						return unavailable();
					}
					try {
						return Promise.resolve(credentials.unset(ref));
					} catch (error) {
						return Promise.resolve({
							ok: false,
							error: {
								code: 'unset-threw',
								message: String(
									error !== null && typeof error === 'object'
										? error.message
										: error,
								),
							},
						});
					}
				},
				recheck(revision) {
					if (settings === null || typeof settings.mutate !== 'function') {
						return unavailable();
					}
					try {
						return Promise.resolve(
							settings.mutate(NS, nonceOps(Date.now()), revision),
						);
					} catch (error) {
						return Promise.resolve({
							ok: false,
							error: {
								code: 'mutate-threw',
								message: String(
									error !== null && typeof error === 'object'
										? error.message
										: error,
								),
							},
						});
					}
				},
				saveEndpoint(value, revision) {
					if (settings === null || typeof settings.mutate !== 'function') {
						return unavailable();
					}
					try {
						return Promise.resolve(
							settings.mutate(NS, endpointOps(value), revision),
						);
					} catch (error) {
						return Promise.resolve({
							ok: false,
							error: {
								code: 'mutate-threw',
								message: String(
									error !== null && typeof error === 'object'
										? error.message
										: error,
								),
							},
						});
					}
				},
				subscribe(handler) {
					if (remote === null || typeof remote.$on !== 'function') {
						return () => {};
					}
					const offs = [];
					try {
						offs.push(remote.$on('settings/document-updated', handler));
						offs.push(remote.$on('credentials/reference-updated', handler));
					} catch {
						/* keep the page usable when an event name is unknown */
					}
					return () => {
						for (const off of offs) {
							if (typeof off === 'function') {
								off();
							}
						}
					};
				},
			};
		}

		/* ------------------------------------------------------------------ *
		 * Styling (theme tokens only — no hardcoded colours)
		 * ------------------------------------------------------------------ */

		/** @type {Record<string, any>} */
		const styles = {
			root: {
				display: 'flex',
				flexDirection: 'column',
				gap: '12px',
				fontFamily: 'var(--dsw-font-family)',
				fontSize: 'var(--dsw-font-s-14)',
				color: 'var(--dsw-alias-label-primary)',
				maxWidth: '640px',
			},
			heading: {
				margin: 0,
				fontSize: 'var(--dsw-font-s-14)',
				fontWeight: 600,
				color: 'var(--dsw-alias-label-primary)',
			},
			intro: {
				margin: 0,
				color: 'var(--dsw-alias-label-secondary)',
				lineHeight: 1.5,
			},
			link: {
				color: 'var(--dsw-alias-link)',
				textDecoration: 'underline',
			},
			status: {
				display: 'flex',
				flexDirection: 'column',
				gap: '4px',
				padding: '10px 12px',
				borderRadius: 'var(--dsw-radius-md)',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'var(--dsw-alias-bg-layer-2)',
			},
			statusHeadline: {
				display: 'flex',
				alignItems: 'center',
				gap: '8px',
				fontWeight: 600,
			},
			dot: {
				width: '8px',
				height: '8px',
				borderRadius: '50%',
				flex: '0 0 auto',
				background: 'var(--dsw-alias-state-idle-primary)',
			},
			meta: {
				color: 'var(--dsw-alias-label-tertiary)',
				fontSize: 'var(--dsw-font-xs-13)',
			},
			error: {
				color: 'var(--dsw-alias-label-error)',
				whiteSpace: 'pre-wrap',
				overflowWrap: 'anywhere',
			},
			toolList: {
				margin: 0,
				padding: '6px 8px',
				listStyle: 'none',
				maxHeight: '120px',
				overflowY: 'auto',
				fontFamily: 'var(--dsw-font-mono)',
				fontSize: 'var(--dsw-font-xs-13)',
				color: 'var(--dsw-alias-label-secondary)',
				background: 'var(--dsw-alias-bg-layer-1)',
				borderRadius: 'var(--dsw-radius-sm)',
				border: '1px solid var(--dsw-alias-border-l1)',
			},
			field: {
				display: 'flex',
				flexDirection: 'column',
				gap: '6px',
			},
			label: {
				fontWeight: 600,
				color: 'var(--dsw-alias-label-primary)',
			},
			input: {
				boxSizing: 'border-box',
				width: '100%',
				padding: '6px 8px',
				borderRadius: 'var(--dsw-radius-sm)',
				border: '1px solid var(--dsw-alias-border-l3)',
				background: 'var(--dsw-specific-input-major)',
				color: 'var(--dsw-alias-label-primary)',
				fontFamily: 'var(--dsw-font-mono)',
				fontSize: 'var(--dsw-font-s-14)',
			},
			help: {
				color: 'var(--dsw-alias-label-tertiary)',
				fontSize: 'var(--dsw-font-xs-13)',
				lineHeight: 1.5,
			},
			row: {
				display: 'flex',
				flexWrap: 'wrap',
				gap: '8px',
			},
			button: {
				padding: '6px 12px',
				borderRadius: 'var(--dsw-radius-sm)',
				border: '1px solid var(--dsw-alias-border-l3)',
				background: 'var(--dsw-alias-button-elevated-fill)',
				color: 'var(--dsw-alias-label-primary)',
				fontFamily: 'inherit',
				fontSize: 'var(--dsw-font-s-14)',
				cursor: 'pointer',
			},
			buttonPrimary: {
				padding: '6px 12px',
				borderRadius: 'var(--dsw-radius-sm)',
				border: '1px solid var(--dsw-alias-button-primary-fill)',
				background: 'var(--dsw-alias-button-primary-fill)',
				color: 'var(--dsw-alias-label-primary-foreground)',
				fontFamily: 'inherit',
				fontSize: 'var(--dsw-font-s-14)',
				cursor: 'pointer',
			},
			buttonDanger: {
				padding: '6px 12px',
				borderRadius: 'var(--dsw-radius-sm)',
				border: '1px solid var(--dsw-alias-border-l3)',
				background: 'var(--dsw-alias-button-elevated-fill)',
				color: 'var(--dsw-alias-label-error)',
				fontFamily: 'inherit',
				fontSize: 'var(--dsw-font-s-14)',
				cursor: 'pointer',
			},
			buttonDisabled: {
				padding: '6px 12px',
				borderRadius: 'var(--dsw-radius-sm)',
				border: '1px solid var(--dsw-alias-border-l2)',
				background: 'var(--dsw-alias-bg-layer-2)',
				color: 'var(--dsw-alias-label-tertiary)',
				fontFamily: 'inherit',
				fontSize: 'var(--dsw-font-s-14)',
				cursor: 'not-allowed',
			},
			advanced: {
				marginTop: '4px',
				paddingTop: '10px',
				borderTop: '1px solid var(--dsw-alias-separator-primary)',
				color: 'var(--dsw-alias-label-secondary)',
			},
			summary: {
				cursor: 'pointer',
				color: 'var(--dsw-alias-label-tertiary)',
				fontSize: 'var(--dsw-font-xs-13)',
				userSelect: 'none',
			},
			advancedBody: {
				display: 'flex',
				flexDirection: 'column',
				gap: '8px',
				marginTop: '10px',
			},
		};

		/**
		 * Picks a button style based on variant and disabled state.
		 *
		 * @param {'primary' | 'default' | 'danger'} variant visual variant
		 * @param {boolean} disabled whether the button is disabled
		 * @returns {any} React style object
		 */
		function buttonStyle(variant, disabled) {
			if (disabled) {
				return styles.buttonDisabled;
			}
			if (variant === 'primary') {
				return styles.buttonPrimary;
			}
			if (variant === 'danger') {
				return styles.buttonDanger;
			}
			return styles.button;
		}

		/**
		 * Maps a tone onto the status dot colour token.
		 *
		 * @param {string} tone tone from {@link statusTone}
		 * @returns {string} CSS colour value
		 */
		function toneColor(tone) {
			switch (tone) {
				case 'ok':
					return 'var(--dsw-alias-state-success-primary)';
				case 'error':
					return 'var(--dsw-alias-state-error-primary)';
				case 'busy':
					return 'var(--dsw-alias-state-business-primary)';
				case 'idle':
					return 'var(--dsw-alias-state-idle-primary)';
				default:
					return 'var(--dsw-alias-state-warn-primary)';
			}
		}

		/* ------------------------------------------------------------------ *
		 * Section component
		 * ------------------------------------------------------------------ */

		/**
		 * Settings section: paste a Zapier MCP token, immediately see whether it
		 * works and which tools were refreshed.
		 *
		 * @param {{ t: (key: string, ...args: any[]) => string, client: any }} props injected props
		 * @returns {any} React element
		 */
		function ZapierSection(props) {
			const t = typeof props.t === 'function' ? props.t : (key) => String(key);
			const client = props.client;

			const [snapshot, setSnapshot] = useState(null);
			const [token, setToken] = useState('');
			const [endpointDraft, setEndpointDraft] = useState('');
			const [endpointDirty, setEndpointDirty] = useState(false);
			const [pending, setPending] = useState('');
			const [notice, setNotice] = useState('');
			const [removeArmed, setRemoveArmed] = useState(false);
			const aliveRef = useRef(true);
			const beforeRef = useRef({ checkedAt: '', status: '' });

			/**
			 * Reads the current settings document and stores the normalised result.
			 *
			 * @returns {Promise<ReturnType<typeof readSnapshot>>} fresh snapshot
			 */
			const refresh = useCallback(async () => {
				const envelope = await client.describe();
				const next = readSnapshot(envelope);
				if (aliveRef.current) {
					setSnapshot(next);
				}
				return next;
			}, [client]);

			useEffect(() => {
				aliveRef.current = true;
				refresh();
				const off = client.subscribe(() => {
					refresh();
				});
				/** @returns {void} */
				const onVisible = () => {
					if (typeof document === 'undefined') {
						return;
					}
					if (document.visibilityState === 'visible') {
						refresh();
					}
				};
				if (typeof document !== 'undefined' && document.addEventListener) {
					document.addEventListener('visibilitychange', onVisible);
				}
				return () => {
					aliveRef.current = false;
					if (typeof off === 'function') {
						off();
					}
					if (
						typeof document !== 'undefined' &&
						document.removeEventListener
					) {
						document.removeEventListener('visibilitychange', onVisible);
					}
				};
			}, [client, refresh]);

			useEffect(() => {
				if (snapshot !== null && !endpointDirty) {
					setEndpointDraft(snapshot.endpointOverride);
				}
			}, [snapshot, endpointDirty]);

			/**
			 * Polls `settings.describe()` until the host publishes a new result.
			 *
			 * @param {{ checkedAt: string, status: string }} before pre-action state
			 * @returns {Promise<boolean>} true when the check settled in time
			 */
			const pollForSettle = useCallback(
				async (before) => {
					const deadline = Date.now() + POLL_TIMEOUT_MS;
					while (Date.now() < deadline) {
						await delay(POLL_INTERVAL_MS);
						if (!aliveRef.current) {
							return false;
						}
						const next = await refresh();
						if (hasSettled(before, next)) {
							return true;
						}
					}
					return false;
				},
				[refresh],
			);

			/**
			 * Captures the pre-action state and, if the action succeeded, waits
			 * for the resulting status.
			 *
			 * @param {any} result envelope returned by the action
			 * @param {string} failureKey translation key used on failure
			 * @returns {Promise<void>} resolves when the UI state is settled
			 */
			const settleAfter = useCallback(
				async (result, failureKey) => {
					const parsed = interpretEnvelope(result);
					if (!parsed.ok) {
						if (aliveRef.current) {
							setNotice(parsed.message || t(failureKey));
						}
						await refresh();
						return;
					}
					const before = {
						checkedAt: beforeRef.current.checkedAt,
						status: beforeRef.current.status,
					};
					if (aliveRef.current) {
						setSnapshot((current) =>
							current === null
								? current
								: { ...current, status: 'checking' },
						);
					}
					const settled = await pollForSettle(before);
					if (aliveRef.current && !settled) {
						setNotice(t('pollTimeout'));
					}
				},
				[pollForSettle, refresh, t],
			);

			/** @returns {Promise<void>} saves the typed token and verifies it */
			const onSave = useCallback(async () => {
				if (!isValidTokenInput(token)) {
					setNotice(t('emptyToken'));
					return;
				}
				const ref =
					snapshot !== null && snapshot.credentialRef
						? snapshot.credentialRef
						: DEFAULT_CREDENTIAL_REF;
				beforeRef.current = {
					checkedAt: snapshot !== null ? snapshot.checkedAt : '',
					status: snapshot !== null ? snapshot.status : '',
				};
				setPending('save');
				setNotice('');
				const result = await client.saveToken(ref, token.trim());
				if (aliveRef.current) {
					setPending('');
				}
				const parsed = interpretEnvelope(result);
				if (parsed.ok && aliveRef.current) {
					setToken('');
				}
				await settleAfter(result, 'saveFailed');
			}, [client, settleAfter, snapshot, t, token]);

			/** @returns {Promise<void>} asks the host to check the token again */
			const onRecheck = useCallback(async () => {
				beforeRef.current = {
					checkedAt: snapshot !== null ? snapshot.checkedAt : '',
					status: snapshot !== null ? snapshot.status : '',
				};
				setPending('recheck');
				setNotice('');
				const revision = snapshot !== null ? snapshot.revision : null;
				const result = await client.recheck(revision);
				if (aliveRef.current) {
					setPending('');
				}
				await settleAfter(result, 'recheckFailed');
			}, [client, settleAfter, snapshot, t]);

			/** @returns {Promise<void>} removes the stored token */
			const onRemove = useCallback(async () => {
				if (!removeArmed) {
					setRemoveArmed(true);
					return;
				}
				const ref =
					snapshot !== null && snapshot.credentialRef
						? snapshot.credentialRef
						: DEFAULT_CREDENTIAL_REF;
				beforeRef.current = {
					checkedAt: snapshot !== null ? snapshot.checkedAt : '',
					status: snapshot !== null ? snapshot.status : '',
				};
				setPending('remove');
				setNotice('');
				setRemoveArmed(false);
				const result = await client.removeToken(ref);
				if (aliveRef.current) {
					setPending('');
				}
				await settleAfter(result, 'removeFailed');
			}, [client, removeArmed, settleAfter, snapshot, t]);

			/** @returns {Promise<void>} saves the endpoint override */
			const onSaveEndpoint = useCallback(async () => {
				beforeRef.current = {
					checkedAt: snapshot !== null ? snapshot.checkedAt : '',
					status: snapshot !== null ? snapshot.status : '',
				};
				setPending('endpoint');
				setNotice('');
				const revision = snapshot !== null ? snapshot.revision : null;
				const result = await client.saveEndpoint(endpointDraft, revision);
				if (aliveRef.current) {
					setPending('');
					setEndpointDirty(false);
				}
				const parsed = interpretEnvelope(result);
				if (parsed.ok && aliveRef.current) {
					setNotice(t('endpointSaved'));
				}
				await settleAfter(result, 'endpointFailed');
			}, [client, endpointDraft, settleAfter, snapshot, t]);

			const tone = snapshot === null ? 'busy' : statusTone(snapshot.status);
			const statusText =
				snapshot === null
					? t('checking')
					: formatStatusText(snapshot, t);
			const checkedAtText =
				snapshot !== null && snapshot.ok
					? formatCheckedAt(snapshot.checkedAt)
					: '';
			const configured = snapshot !== null && snapshot.ok && snapshot.configured;
			const busy = pending !== '';
			const canSave = isValidTokenInput(token) && !busy;
			const effectiveEndpoint =
				snapshot !== null && snapshot.ok
					? snapshot.effectiveEndpoint
					: DEFAULT_ENDPOINT;
			const toolNames = snapshot !== null ? snapshot.toolNames : [];

			const statusNode = h(
				'div',
				{ style: styles.status, 'aria-live': 'polite', role: 'status' },
				h(
					'div',
					{ style: styles.statusHeadline },
					h('span', {
						style: { ...styles.dot, background: toneColor(tone) },
						'aria-hidden': 'true',
					}),
					h('span', null, statusText),
				),
				snapshot !== null && !snapshot.ok
					? h(
							Fragment,
							null,
							h('span', { style: styles.meta }, t('readFailedHelp')),
							snapshot.error !== null && snapshot.error.message !== ''
								? h('span', { style: styles.error }, snapshot.error.message)
								: null,
						)
					: null,
				snapshot !== null && snapshot.ok && snapshot.status === 'error'
					? h(
							'span',
							{ style: styles.error },
							snapshot.lastError || t('rejected'),
						)
					: null,
				toolNames.length > 0
					? h(
							'ul',
							{ style: styles.toolList },
							toolNames.map((name, index) =>
								h('li', { key: `${index}-${name}` }, name),
							),
						)
					: null,
				snapshot !== null && snapshot.ok && snapshot.toolCount > toolNames.length
					? h(
							'span',
							{ style: styles.meta },
							t('toolsPartial', toolNames.length, snapshot.toolCount),
						)
					: null,
				checkedAtText !== ''
					? h('span', { style: styles.meta }, t('checkedAt', checkedAtText))
					: null,
			);

			const tokenField = h(
				'div',
				{ style: styles.field },
				h(
					'label',
					{ style: styles.label, htmlFor: 'zapier-mcp-token' },
					t('tokenLabel'),
				),
				h('input', {
					id: 'zapier-mcp-token',
					type: 'password',
					autoComplete: 'off',
					spellCheck: false,
					style: styles.input,
					value: token,
					placeholder: t('tokenPlaceholder'),
					disabled: busy,
					onChange: (event) => {
						setToken(event.target.value);
						setNotice('');
					},
				}),
				h(
					'span',
					{ style: styles.help },
					t('tokenHelp'),
					' ',
					h(
						'a',
						{
							href: ZAPIER_SITE,
							target: '_blank',
							rel: 'noreferrer',
							style: styles.link,
						},
						t('tokenHelpLink'),
					),
				),
			);

			const buttons = h(
				'div',
				{ style: styles.row },
				h(
					'button',
					{
						type: 'button',
						style: buttonStyle('primary', !canSave),
						disabled: !canSave,
						onClick: onSave,
					},
					pending === 'save' ? t('saving') : t('save'),
				),
				h(
					'button',
					{
						type: 'button',
						style: buttonStyle('default', busy || !configured),
						disabled: busy || !configured,
						onClick: onRecheck,
					},
					pending === 'recheck' ? t('rechecking') : t('recheck'),
				),
				h(
					'button',
					{
						type: 'button',
						style: buttonStyle('danger', busy || !configured),
						disabled: busy || !configured,
						onClick: onRemove,
					},
					pending === 'remove'
						? t('removing')
						: removeArmed
							? t('removeArmed')
							: t('remove'),
				),
			);

			const advanced = h(
				'details',
				{ style: styles.advanced },
				h('summary', { style: styles.summary }, t('advanced')),
				h(
					'div',
					{ style: styles.advancedBody },
					h(
						'div',
						{ style: styles.field },
						h(
							'label',
							{ style: styles.label, htmlFor: 'zapier-mcp-endpoint' },
							t('endpointLabel'),
						),
						h('input', {
							id: 'zapier-mcp-endpoint',
							type: 'text',
							autoComplete: 'off',
							spellCheck: false,
							style: styles.input,
							value: endpointDraft,
							placeholder: effectiveEndpoint,
							disabled: busy,
							onChange: (event) => {
								setEndpointDirty(true);
								setEndpointDraft(event.target.value);
								setNotice('');
							},
						}),
						h(
							'span',
							{ style: styles.help },
							t('endpointHelp', DEFAULT_ENDPOINT),
						),
					),
					h(
						'div',
						{ style: styles.row },
						h(
							'button',
							{
								type: 'button',
								style: buttonStyle('default', busy),
								disabled: busy,
								onClick: onSaveEndpoint,
							},
							pending === 'endpoint'
								? t('endpointSaving')
								: t('endpointSave'),
						),
					),
					h(
						'span',
						{ style: styles.meta },
						t('endpointInUse', effectiveEndpoint),
					),
				),
			);

			return h(
				'div',
				{ style: styles.root },
				h('h2', { style: styles.heading }, t('heading')),
				h('p', { style: styles.intro }, t('intro')),
				statusNode,
				tokenField,
				buttons,
				notice !== '' ? h('p', { style: styles.error }, notice) : null,
				advanced,
			);
		}

		/** Services this bundle needs before `apply` runs. */
		const inject = [
			'slots',
			'locale',
			'remote',
			'remote.credentials',
			'remote.settings',
		];

		/**
		 * Registers the locale dictionaries and the Settings section.
		 *
		 * @param {any} ctx plugin context
		 * @returns {void}
		 */
		function apply(ctx) {
			ctx.effect(
				() => ctx.locale.register(NS, { en, zh }),
				'dsh-zapier-mcp:locale',
			);
			const t = ctx.locale.bind(NS);
			const client = createClient(ctx);
			ctx.slots.inject('settings.section', () =>
				ctx.slots.register(
					{
						name: 'settings.section',
						id: SECTION_ID,
						order: SECTION_ORDER,
						label: () => t('nav'),
						inject: () => ({ t, client }),
					},
					ZapierSection,
				),
			);
		}

		return {
			inject,
			apply,
			__internals: {
				NS,
				SECTION_ID,
				SECTION_ORDER,
				DEFAULT_ENDPOINT,
				DEFAULT_CREDENTIAL_REF,
				ZAPIER_SITE,
				POLL_INTERVAL_MS,
				POLL_TIMEOUT_MS,
				en,
				zh,
				ZapierSection,
				createClient,
				interpretEnvelope,
				readSnapshot,
				toCount,
				toStringList,
				statusTone,
				formatStatusText,
				formatCheckedAt,
				hasSettled,
				isValidTokenInput,
				nonceOps,
				endpointOps,
			},
		};
	},
});
