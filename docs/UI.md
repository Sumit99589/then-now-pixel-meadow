# Research Meadow: the presentation layer

## Direction

A colorful pixel-art research meadow, not a professional dashboard with a mascot pasted onto it. Original animals, stepped clouds, a rainbow, a pond, tiny flowers, a letterbox, and two small gardens form a consistent visual world. Peach, lavender, mint, cream, and dusty rose repeat across scenery, navigation, prompt cards, the composer, and evidence dialogs.

The hero reads **“Stay curious. We’ll remember.”** The interface calls a new conversation an adventure and its example prompts trails. Substantive answers, uncertainty, source warnings, and provider errors keep their direct language. Playfulness belongs around the work, not in place of evidence.

## Eight animals, six selectable companions

| Companion | Animal | Where it appears |
| --- | --- | --- |
| Pip | Cat | Hero, brand, mini garden, selectable avatar |
| Scout | Dog | Hero, revisit prompt, selectable avatar |
| Wren | Bird | Hero, recheck prompt, mini garden, selectable avatar |
| Moss | Turtle | Pond, explore prompt, selectable avatar |
| Clover | Rabbit | Hero, selectable avatar |
| Fern | Fox | Selectable avatar and conversation rail |
| Decorative visitors | Frog and duck | Pond and footer |

Selection is stored under `tn_buddy` and updates the composer, assistant avatars, and activity indicator. It does not change the model, prompts, answer style, tools, search policy, verification, or memory. The animals do not make unearned progress claims or award trust points.

## Responsibilities

```text
public/index.html       Semantic structure and unchanged essential chat IDs
public/app.js           API, SSE, histories, answer rendering, citations, errors
        │
        ├── meadow.js   Companion state, preferences, mobile rail, motion, help
        │       │
        └───────┴── pixel-art.js   Local decorative SVG geometry
public/style.css        Shared tokens, layout, states, frame-style animation
```

There is no React migration, UI framework, animation dependency, build step, remote font, image CDN, canvas game loop, or extra API key. The export declarations make the art and presentation module contracts usable from TypeScript tests. The server still serves only explicit allowlisted files. Source and conversation text still enter the page through `textContent`; they are not interpreted as HTML.

## Motion

Cloud drift, stepped animal bobs and bunny hops, slow blinking, butterfly movement, water glimmers, and activity dots are CSS animations. Animal positions use an outer translated SVG group; animation acts on an inner group, so CSS transforms cannot overwrite the sprite's placement.

`prefers-reduced-motion: reduce` always disables decorative motion. The visible Motion button additionally stores the user's manual preference under `tn_motion`. Background tabs pause animations using the Page Visibility event. With motion off, every animal and important state stays visible; the research status still updates as text. No sounds autoplay.

## Usability and honest states

The mobile rail has a background scrim, Escape dismissal, focus wrap, focus return, and an inert background. The closed rail is inert so invisible controls cannot receive keyboard focus. A resize to desktop restores ordinary navigation. Native `dialog` elements handle help, source evidence, and original-message evidence.

Examples prefill and resize the composer but do not auto-submit. Conversation filtering is local to the already loaded titles; it is not represented as a semantic memory search. Thread/date counts come from real session data. During an active answer, thread navigation, history deletion, and new-thread creation are disabled. Stop and network errors preserve the draft and never create a fake completed assistant response.

Tracy cards show their topic, so a pricing check cannot be mistaken for a release check on the same vendor. Verdict labels and explanatory text remain explicit: changed, supported now, corrected, no change found, not verified, and conflicting. A source number opens the exact quotation and observation/publication metadata; a date opens the original message. The offline banner, API-key setup notice, and error states are not hidden by the artwork.

The mobile welcome composer is not sticky: it must not cover the animal chooser or example prompts. Once a conversation starts, the composer is sticky. At 320px, comparison columns stack. Large headings and body text use installed system fonts rather than a pixel font that would make long answers harder to read. Art is `aria-hidden`; the corresponding controls have textual accessible names. These decisions and smoke tests are not a claim of a complete WCAG audit.

Preference storage failures are caught. A browser that denies localStorage can still use the server-scoped conversation history. That browser will not retain its companion choice or selected thread through a reload.

## Upgrade an existing checkout

Keep `.env` and `data/` from your existing checkout. Replace the application files with this edition; do not overwrite private configuration or databases with someone else's files. The archive does not include either.

The agent, provider adapters, memory store, date resolution, database schema, output contracts, and evaluation fixtures are unchanged. The server difference is the static allowlist for `/pixel-art.js`, `/meadow.js`, and `/favicon.svg`. There is no database migration. The same `npm install`, `npm run dev`, and `npm run demo` commands work, with the same two API keys for live mode.

## Extending the art

Add an integer-grid drawing to `pixel-art.js`, register it in `drawings`, and optionally add a companion catalog entry. Use only SVG primitives; keep untrusted strings out of geometric attributes. Add position to an outer group and motion to an inner group. Keep decorative SVGs hidden from assistive technology and label the actual button. Extend the asset tests when adding a species or icon.

Palette and spacing tokens are at the top of `style.css`; components and responsive breakpoints follow them. All animation is grouped near the bottom. Do not tie companion preferences to agent prompts or truth judgments: that boundary is the reason this visual redesign does not weaken the original architecture.
