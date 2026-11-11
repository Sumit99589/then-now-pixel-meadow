# Architecture and review notes

## The difficult operation is a temporal evidence join

```text
Browser ── POST /api/chat ──► HTTP + identity + idempotency
                                      │
                             immutable user message
                                      │
                         local date + topic retrieval
                                      │
                         typed plan / direct answer
                                      │
                           one tool: web_search
                          (parallel, bounded, deduped)
                                      │
                       fresh and historical evidence kept apart
                                      │
                              structured synthesis
                                      │
                  ID / quotation / coverage / scope / date gates
                                      │
                      conditional semantic evidence audit
                                      │
                    atomic assistant message + saved result
                                      │
Browser ◄── progress + source metadata + checked answer SSE
```

The state machine owns execution, persistence and budgets. Models propose semantic decisions; they do not own user identity, the clock, SQL, network destinations, executable code or when a turn has completed. An agent step is not a separately deployed agent. There is one tool interface, `WebSearch.search`; it maps only to Tavily’s Search endpoint. Retrieving application-owned conversations is not an additional external tool.

## Retrieval is a proposal, not proof of perfect memory

The store combines four independently useful retrieval views: exact local-date windows, FTS5 topic relevance, the current thread tail and recent cross-thread context. Weighted reciprocal ranks combine candidates. Neighbor expansion recovers questions and answers together without crossing ownership or thread boundaries. Candidate budgets cap message count and text size; the model is told when retrieval truncates. It receives raw originals, not a lossy summary pretending to be the original.

The latest request is excluded from retrieval so “we shortlisted five tools” cannot fabricate its own baseline. Future-dated messages are excluded. A raw timestamp is server-owned. The explicit fixture/live evaluation harnesses may inject clocks for repeatable testing; the public API cannot.

Retrieval is intentionally not semantic search yet. Dates and exact shortlisted entities carry much of this challenge. An embedding service, extra writes and reranking should be justified by measured missed conversations. The implementation can be extended behind `Store.retrieve` without changing evidence or answer contracts.

## Evidence model

| Object | Meaning | Must not be mistaken for |
| --- | --- | --- |
| Original message + creation time | What the user or assistant said then | A verified real-world observation |
| Archived source snapshot + observation time | What a search provider returned then | A guaranteed complete capture of the original site |
| Current source + observation time | What search returned during this turn | Proof the page was crawled at that instant |
| Publication date | A provider-supplied publication timestamp | The effective date of the event |
| Supported event date | The date a claimed change took effect | An inferred date from “retrieved today” |

A snapshot stores the URL, title, returned content, SHA-256 content hash, query, observation time and optional publication date. Snapshots are append-only in normal operation, not overwritten because a URL is the same. An explicit forget operation can delete them. Hash changes are not used to infer price changes: navigation, formatting and tracking can alter a page without changing a relevant claim.

Completed results carry references and display excerpts. Full retained snapshots are stored once in the sources table and can be requested only by the owning identity. The hash identifies the full retained snapshot, not a shortened UI excerpt. Archived and current evidence pools remain distinct during validation.

## Contracts instead of “please be accurate”

A plan identifies historical message IDs, subjects, requested subject/topic checks, search queries and whether clarification is genuinely needed. The answer carries paragraph-level source and memory references, explicit comparison verdicts, old/new pricing scope, a supported effective date when known, and uncertainties. Topic coverage matters: five checked prices must not silently substitute for five requested feature checks.

The structural guard can prove that a cited source/message was supplied and that a normalized verbatim quotation occurs in it. It can prove that the declared scope is known/matched and that each requested entity/topic has an output. It **cannot** prove the quotation entails the claim, that the declared plan name is semantically right, or that the retrieved source is accurate. Revalidation and high-stakes requests therefore run a separate model audit over the cited evidence and surrounding content. This audit is an additional fallible check, not a mathematical validator.

Price scope includes plan, currency, billing cadence, unit and geography. Additional details such as promotional discounts, bundled quotas, included fees, taxes and minimum seats must be explained and checked semantically. Unknown or incomparable dimensions prevent confidently declaring a verified price change. Missing old evidence does not require refusing all help: current evidence can still show a prior answer needs revision, with timing explicitly unknown.

## Bounded execution and failure semantics

The deadline covers the entire request. Per-attempt timeouts are shorter. Retry only transport failures and 429/500/502/503/504 responses, with bounded delay; never retry an invalid key as though it were congestion. Physical retries consume the five-model/twelve-search limits. The normal revalidation path uses planning, synthesis and an audit; optional gap research or repair must fit the same limits. A repair cannot be shipped as verified unless its required follow-up checks also fit.

Failures are not results. An unavailable search does not mean no change. A failed audit does not mean no defects. A disconnected browser cancels downstream work. An assistant message is saved only after completion; the original user message and already-observed snapshots may remain for inspection. Startup marks abandoned runs failed. Replay keys bind to identity, thread, text and timezone. Active turns are serialized per conversation, including a SQLite uniqueness constraint.

Progress events expose completed execution steps and source discovery, not chain of thought. Holding the answer until validation sacrifices token-by-token immediacy but avoids streaming a false price before retracting it. Direct safe answers avoid unnecessary synthesis; ordinary complex questions do not run expensive independent verification unless their route warrants it.

## Security boundary and honest limits

Opaque HttpOnly SameSite cookies identify a browser’s data; every query is owner-scoped. They are not recoverable accounts. State-changing requests reject cross-origin requests, the local app validates Host headers, and remote binds require an explicit password. The UI renders model text as text nodes, not HTML. Evidence URLs are validated; the server does not autonomously fetch those URLs. The only external HTTP destinations are the configured model service and the fixed search service endpoint.

The planner is instructed to minimize personal data in public searches. An email/obvious-token guard also runs at the search adapter boundary, including follow-up queries. This is not comprehensive data-loss prevention. Neither search snippets nor old messages can legitimately change system instructions, but language-model prompt-injection resistance remains probabilistic and requires real adversarial evaluation. Keys are not inserted into model context.

Single-process SQLite is an intentional small-deployment tradeoff. Synchronous queries can block at large scale; in-memory limits do not coordinate across processes. Browser sessions, HTTP Basic access control and logical deletion are not a production identity/compliance architecture. These boundaries are documented rather than hidden under a “production-ready” label.

## Alternatives considered

| Alternative | Why not the first implementation |
| --- | --- |
| Recent-history prompt plus hosted search | Fast to build, but loses older cross-thread discussion and historical source evidence. Useful evaluation baseline. |
| Fully provider-hosted search loop | Less code, but less control over snapshot persistence, physical search budgets, partial failures and deterministic replay fixtures. |
| Vector database + summaries everywhere | Additional service and lossy memory before proving lexical/date recall is insufficient. |
| Agent swarm with researcher/reviewer/planner roles | Independent models do not automatically create independent evidence; more calls increase latency and correlated failure surface. |
| Recursive self-critique until “confident” | Unbounded cost and no reliable stopping criterion. |
| Always return raw tokens immediately | Conflicts with holding factual conclusions until provenance and evidence checks finish. |
| Regex-only verdicts | Source meaning, corrections and product plans require semantic interpretation. |

## Provider references

Implementation contracts were checked against primary documentation on 11 November 2026:

- OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI Responses API: https://developers.openai.com/api/reference/resources/responses/methods/create
- GPT-5.4 model contract: https://developers.openai.com/api/docs/models/gpt-5.4
- GPT-5.4 mini model contract: https://developers.openai.com/api/docs/models/gpt-5.4-mini
- Tavily Search endpoint: https://docs.tavily.com/documentation/api-reference/endpoint/search
- Node SQLite: https://nodejs.org/api/sqlite.html

Documentation compatibility is not equivalent to a successful authenticated integration test. API access, model availability and actual results must still be verified with the live harness.


## Pixel presentation boundary

The Research Meadow redesign does not change any model prompt, tool interface, memory query, database schema, search budget, answer contract, provider adapter, or verification rule. The only backend change is an explicit static-file allowlist addition for two JavaScript modules and the SVG favicon. The Content Security Policy remains restrictive; no `unsafe-inline`, remote assets, or wildcard file serving were introduced.

`app.js` still owns chat transport, conversation selection, text rendering, citations, and replay. `meadow.js` owns decorative preferences, companion selection, native help content, reduced-motion behavior, and the mobile drawer. It makes no network requests. `pixel-art.js` is a small local geometry catalog that emits SVG nodes with integer coordinates; no model-generated or user-provided markup is interpreted. CSS drives animation, with system/user pause and background-tab suspension. Native HTML controls continue to handle forms and modal dialogs.

A companion is not another agent. Selecting a turtle does not select a slower model; an animated bird does not imply a successful search. Activity text comes from actual server phases, and the six evidence verdicts retain their original meanings. Frontend errors preserve drafts; navigation is disabled during active turns. See `docs/UI.md` for the full presentation contract and `docs/VALIDATION.md` for what the browser checks do and do not establish.
