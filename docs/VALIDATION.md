# Validation record · Research Meadow edition

Build validation: **11 November 2026**. These results describe this checkout, not live model accuracy, a full accessibility certification, or production readiness.

## Executed successfully

| Check | Result | Scope |
| --- | --- | --- |
| `npm run typecheck` | Passed | Strict TypeScript application, test, and evaluation checks; see development-type caveat below. |
| `npm test` | **108 passed; 0 failed; 0 skipped** | Original 96 tests plus 12 new art, presentation, preference-failure, and static-route checks. |
| `npm run eval` | **8 / 8 passed** | Unchanged deterministic offline agent regressions. |
| JavaScript syntax | Passed | `node --check` on all three browser modules. |
| Demo server | Passed | Real local Node/SQLite server with explicitly synthetic providers. |
| Browser scenarios | **25 passed** | UI rendering and interactions with real demo HTTP responses bridged into managed Chromium; limitations below. |
| Responsive widths | Passed | 1440, 1280, 1024, 820, 390, and 320 pixels; no horizontal overflow in the checked layouts. |
| Core-file preservation | Checked | Agent, memory, provider, config, contract, and evaluation implementations unchanged from the previous archive. |

Node **22.16.0**, npm **10.9.2**, and TypeScript **5.8.3** were used. A clean `npm install` was attempted but the environment could not resolve the npm registry (`EAI_AGAIN`). Consequently, the TypeScript check used preinstalled **`@types/node` 25.1.0** and **`undici-types` 7.16.0**, not the lockfile's 24.0.4 / 7.8.0. This is a supplemental type check, not confirmation of a clean locked-dependency installation. The locked versions are unchanged from the original project. Re-run `npm ci && npm run check` in a networked environment. The app itself has zero runtime npm dependencies; the Node tests and demo do not require those type packages.

## What the extra tests cover

The new Node tests check the six-companion catalog, all eight animal geometries, unknown/prototype-key fallbacks, local-only pixel icons, bounded SVG node counts, essential legacy DOM hooks, motion controls, safe storage failures, text-only message rendering, no added runtime dependencies, static content types, preserved CSP, and rejection of non-allowlisted filesystem paths.

The original tests still cover temporal/daylight-saving boundaries, historical retrieval, owner isolation, idempotency, exact-quote/source checks, pricing scope, topic coverage, provider contracts, request limits, cancellation signals, persistence, and real local HTTP/SSE behavior. The eight offline evaluations still use synthetic providers; they are not a live accuracy score.

## Browser checks and their boundaries

Managed Chromium in this environment blocks direct browser navigation, including localhost, with `ERR_BLOCKED_BY_ADMINISTRATOR`. The actual HTML/CSS/browser JavaScript was therefore rendered in an `about:blank` document. Module imports were assembled for the test harness without changing their implementations. A browser-side fetch bridge sent API requests through Python to the **running real local Node demo server**, using a separate real cookie jar for each simulated browser session. Original demo responses, including SSE event frames, were returned to the actual renderer.

This exercised actual demo execution, historical persistence, frontend DOM/event handling, and real output rendering, **not native browser networking, browser cookie policies, CSP enforcement, or incremental SSE arrival timing**. The harness uses a localStorage substitute because `about:blank` lacks ordinary origin storage; preference writes, re-initialization, invalid/denied storage behavior, and companion state were checked, but native browser storage policy was not. The separate Node tests exercise real server headers, session cookies, routes, ownership checks, and SSE responses. Stop and temporary-error UI checks used deliberately pending/failed browser transports; they are not additional claims of live provider cancellation testing.

The 25 successful scenarios are recorded in `ui-check-results.json`. They include six companion choices; pause/resume; system reduced motion; help/escape; title filtering and no-results; prompt prefilling; five pricing plus five release-coverage cards; source and original-message dialogs; audit expansion; HTML-like text remaining inert; history restoration; new conversations; six viewport widths; drawer focus/inert behavior; non-overlapping mobile composition; mobile chat; Stop/error draft recovery; denied localStorage; and absence of page errors.

## Previews

All previews show the **labelled synthetic demo**, not real current prices or live web-search results.

- `preview-desktop.png`: desktop welcome.
- `preview-mobile.png`: full mobile welcome with the non-overlapping composer.
- `preview-conversation.png`: full comparison and research view.
- `preview-evidence.png`: inspectable source quotation and dates.
- `preview-mobile-menu.png`: mobile conversation drawer.
- `preview-mobile-chat.png`: narrow-screen chat.
- `preview-meadow.gif`: actual CSS scene animations sampled at fixed timeline positions; an illustration preview, not a performance benchmark.

## Not verified here

No OpenAI/Tavily keys were supplied; no live authenticated search/model run or live quality/latency/cost claim is made. There was no public deployment, native networked cross-browser test, screen-reader audit, independent security audit, load test, or live adversarial prompt-injection evaluation. The Node 22/24 GitHub Actions workflow is included but has not been run on GitHub here. No public repository or hiring application was submitted.

Before public review: run the locked installation and checks, open `npm run dev` in a normal networked browser, exercise the source/history dialogs and Stop with real keys, check keyboard/screen-reader behavior on target browsers, and independently grade `RUN_LIVE_EVALS=1 npm run eval:live` using `evals/RUBRIC.md`.
