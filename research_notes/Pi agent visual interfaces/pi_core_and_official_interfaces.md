# Pi Coding Agent: Core Architecture and Official Non-Terminal Interfaces

Research date: 2026-10-19. Primary source: a shallow clone of `github.com/badlogic/pi-mono`. That URL now serves the same repository as `github.com/earendil-works/pi`: `git ls-remote` on both returned the same HEAD commit, `73f8de8`, dated 2026-10-19. Repo-file citations below use the canonical `earendil-works/pi` URLs. WebFetch and npm registry access were blocked in this environment (DNS and proxy failures), so I could not read npm pages, pi.dev, or Wikipedia directly. Facts from those sites come from search-result summaries and are marked as such.

Read this first: some of the premises in the assignment are out of date as of October 2026.
- The repo has moved: badlogic/pi-mono is now earendil-works/pi.
- The npm scope has changed: `@mariozechner/*` is now `@earendil-works/*`.
- The website has changed: shittycodingagent.ai is now pi.dev.
- **`pi-web-ui`, `pi-mom` and `pi-pods` are no longer in the monorepo.**

---

## Q1: Is "pi" the right identification for a "pi programming harness", and are there other candidates?

### Takeaway
Yes. "Pi" is Mario Zechner's minimal, extensible coding-agent harness. It now belongs to Earendil (Armin Ronacher's company) and calls itself "a minimal, extensible agent harness." It is the only well-known coding harness with this name. Inflection AI's "Pi" is a consumer chatbot, not a coding tool.

### Cited Findings
- The root README says: "Pi is a minimal, extensible agent harness that you can make your own." It adds that Pi "ships with powerful defaults but skips features like sub-agents and plan mode." — [earendil-works/pi README](https://github.com/earendil-works/pi/blob/main/README.md)
- The repo moved from badlogic/pi-mono to earendil-works. Starting with 0.74.0, packages are published under the `@earendil-works` scope. 0.73.1 was the last release under `@mariozechner`, and that scope is deprecated. — [Pi changelog "Pi Has a New Home at Earendil" (2026-05-07), via search summary](https://pi.dev/changelog/2026/5/7/pi-has-a-new-home); confirmed by the CHANGELOG entries for 0.73.1 and 0.74.0 (2026-05-07): "Updated repository links and package references for the move to `earendil-works/pi-mono` and `@earendil-works/*` package scopes", and `pi update --self` handles the migration from `@mariozechner/pi-coding-agent` to `@earendil-works/pi-coding-agent` — [coding-agent CHANGELOG](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- Earendil, founded by Armin Ronacher and Colin Daymond Hanna, took over Pi on 2026-04-08, and Zechner joined the company. — [Agent Wars, 2026-04-08](https://agent-wars.com/news/2026-04-08-zechner-pi-earendil); [search summary of implicator.ai / eesel.ai](https://www.eesel.ai/blog/pi-coding-agent)
- The README footer says the pi.dev domain was "graciously donated by exe.dev". Older READMEs linked the logo to shittycodingagent.ai. — [README](https://github.com/earendil-works/pi/blob/main/README.md); [search summary of unpkg README 0.68.0](https://app.unpkg.com/@mariozechner/pi-coding-agent@0.68.0/files/README.md)
- Zechner's founding blog post, "What I learned building an opinionated and minimal coding agent," is dated 2025-11-30. Summaries describe Pi as having a system prompt under 1,000 tokens and four tools (read, write, edit, bash). The post says it does not support MCP or sub-agents. — [mariozechner.at post (via search summaries)](https://mariozechner.at/posts/2025-11-30-pi-coding-agent); [conffab summary](https://conffab.com/elsewhere/what-i-learned-building-an-opinionated-and-minimal-coding-agent/)
- The README cites OpenClaw as "a real-world integration" built on the Pi SDK and RPC. Ronacher called Pi "the minimal agent within OpenClaw." — [README](https://github.com/earendil-works/pi/blob/main/README.md); [search summary](https://tomrochette.com/agents/people-and-publications/armin-ronacher/)
- "oh-my-pi" (`omp`) is a fork or derivative that is compatible with Pi's RPC protocol. At least one third-party GUI drives either `pi` or `omp`. — [FaqFirebase/pi-desktop (search summary)](https://github.com/FaqFirebase/pi-desktop)

### Inferences
- A "pi programming harness" almost certainly means this project. The other things called "Pi" are Inflection's Pi chatbot (consumer chat, no coding harness) and Raspberry Pi (hardware). Neither fits the description.
- Use the new names: npm `@earendil-works/pi-coding-agent`, GitHub `earendil-works/pi`, site `pi.dev`. Anything that refers to `@mariozechner/*` describes a version from before May 2026.

### Gaps
- I could not check whether shittycodingagent.ai still resolves or redirects to pi.dev, because fetches were blocked.
- No source I found discusses Inflection Pi and this project together. That distinction rests on general knowledge.

---

## Q2: Which modes does pi support, and what does the RPC protocol look like?

### Takeaway
Pi has four CLI modes: interactive TUI, print, JSON (a one-shot JSONL event stream) and RPC (long-lived, bidirectional JSONL over stdin/stdout). It also has an in-process TypeScript SDK. RPC is the official way to drive Pi from a GUI, IDE or another language. It comes with a typed `RpcClient`, about 33 commands, and an extension-UI subprotocol that forwards dialogs to the client.

### Cited Findings
**Modes overview**
- The four modes, from the docs:

  | Mode | Interface | Lifetime |
  |---|---|---|
  | Interactive | Terminal UI | Until the user exits |
  | Print | Final text on stdout | One invocation |
  | JSON | JSONL events on stdout | One invocation |
  | RPC | JSONL commands, responses and events | Long-lived |

  "All four modes use the same agent, sessions, resources, and tools." The SDK "is not a CLI mode." — [cli-integration.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md)
- Print mode is `pi --print "..."`. Pi falls back to print mode when stdin or stdout is not a TTY. Exit status is nonzero on `error`/`aborted`, and since 1.2.0 also on `length` truncation. — [cli-integration.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md); [CHANGELOG 1.2.0](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- JSON mode is `pi --mode json "..."`. It writes a session header (`{"type":"session","version":3,...}`) followed by events. It accepts no later commands. — [json.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md)

**RPC protocol**
- Start it with `pi --mode rpc --no-session`. The docs say: "Use it for language-independent integrations, process isolation, IDEs, and custom user interfaces." — [rpc.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)
- There are four kinds of record:
  - commands, on stdin;
  - `response`, on stdout;
  - session events, on stdout;
  - extension UI records, in both directions.

  Clients can attach an `id` to a command for correlation, e.g. `{"id":"req-1","type":"get_state"}` returns `{"id":"req-1","type":"response","command":"get_state","success":true,"data":{...}}`. — [rpc.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)
- Framing is strict JSONL split on LF only. The docs warn against Node `readline` because it also splits on U+2028/U+2029. Stdout carries only protocol records; diagnostics go to stderr. Closing stdin shuts Pi down cleanly. — [rpc.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)
- A `prompt` response carries `data.disposition`: `started`, `queued` or `handled`. Getting the response does not mean the run is finished; clients should wait for the `agent_settled` event. Prompts can include base64 `images`. Sending a prompt while the agent is streaming requires `streamingBehavior: "steer" | "followUp"`. — [rpc-commands.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-commands.md)
- The command set, grouped as in the docs:
  - Prompting: `prompt`, `steer`, `follow_up`, `abort`, `clear_queue`, `new_session`
  - State: `get_state`, `get_messages`
  - Model: `set_model`, `cycle_model`, `get_available_models`
  - Thinking: `set_thinking_level`, `cycle_thinking_level`, `get_available_thinking_levels`
  - Queue modes: `set_steering_mode`, `set_follow_up_mode`
  - Compaction: `compact`, `set_auto_compaction`
  - Retry: `set_auto_retry`, `abort_retry`
  - Bash: `bash` (with `excludeFromContext`), `abort_bash`
  - Session: `get_session_stats`, `export_html`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `get_entries`, `get_tree`, `get_last_assistant_text`, `set_session_name`
  - Discovery: `get_commands`

  — [rpc-commands.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-commands.md); [rpc.md anchor list](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)
- Events are shared by the JSON and RPC modes:
  - Run lifecycle: `agent_start`, `agent_end` (`willRetry`), `agent_settled` (`aborted`), `turn_start`, `turn_end`
  - Messages: `message_start`, `message_update`, `message_end`. `message_update` carries `assistantMessageEvent` deltas of type `text_*`, `thinking_*`, `toolcall_*`, `done` or `error`.
  - Tools: `tool_execution_start`, `tool_execution_update` (`partialResult`), `tool_execution_end` (`durationMs`)
  - State: `queue_update`, `entry_appended`, `session_info_changed`, `thinking_level_changed`
  - Also compaction events, retry events, and RPC-only `bash_execution_update`.

  — [json.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md)
- Breaking change in 0.84.0 (2026-08-06): `message_update` now emits only deltas. The cumulative `message`/`partial` fields were removed to avoid quadratic output growth. Clients have to assemble the deltas themselves and then replace the result with the `message_end` message. — [CHANGELOG](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md); [json.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md)
- TypeScript clients get `RpcClient`, exported from `@earendil-works/pi-coding-agent`. It spawns the child process, correlates IDs, provides typed methods, and offers `promptAndWait()` and `waitForIdle()`. A checked example is `examples/rpc-client.ts`. A Python minimal client is in rpc.md. Types are in `src/modes/rpc/rpc-types.ts`. — [cli-integration.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md); [rpc.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)

**Extension UI subprotocol**
- Dialog methods (`select`, `confirm`, `input`, `editor`) emit an `extension_ui_request` and block until the client returns an `extension_ui_response` with `value`, `confirmed` or `cancelled`. An optional `timeout` auto-resolves the dialog. Fire-and-forget methods are `notify` (info/warning/error), `setStatus`, `setWidget` (string lines only, above or below the editor), `setTitle` and `set_editor_text`. — [rpc-extension-ui.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-extension-ui.md)
- These methods are unsupported or no-ops in RPC mode:
  - `ctx.ui.custom()` returns `undefined`.
  - `setFooter`, `setHeader`, `setEditorComponent`, `setWorkingIndicator`, autocomplete providers and `onTerminalInput` do nothing.
  - `getAllThemes()` returns `[]`, and `setTheme()` fails with "Theme switching not supported in RPC mode".

  `ctx.mode` is `"rpc"` and `ctx.hasUI` is `true`. — [rpc-extension-ui.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-extension-ui.md)
- `examples/rpc-extension-ui.ts` is a "custom terminal client with extension dialogs", paired with `examples/extensions/rpc-demo.ts`. — [cli-integration.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md)

**Removed experimental remote protocol**
- 0.84.0 (2026-08-06) added "experimental remote-session client APIs": a transport-neutral `PiClient`, a CBOR protocol, a Unix-socket transport, and a `RemoteSession` controller with transcript reducers. In 1.2.0 (2026-10-12) the "unreleased experimental server, client, and plugin stack" was removed, and the `@earendil-works/pi-client`, `pi-protocol` and `pi-server` packages "are removed and no longer released." — [CHANGELOG lines for 0.84.0 and 1.2.0](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- 0.85.x fixed SDK import failures caused by accidentally publishing that experimental code. Its note says "the supported local SDK and stdio RPC API are unchanged." — [CHANGELOG](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)

**Other non-terminal outputs**
- `/export` writes the session as HTML or JSONL. `/share` uploads it and returns a viewer link, either a Radius artifact or a private GitHub gist (`sessionShareDestination`, added in 1.3.0). Session files are JSONL trees. — [sessions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md); [CHANGELOG 1.3.0](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- `pi auth print-api-key` and `pi auth print-bearer-token` export credentials to external clients, refreshing OAuth tokens automatically (added in 0.83.0, 2026-07-29). — [CHANGELOG](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)

### Inferences
- RPC is the official, stable foundation for a GUI. It covers prompting with images, steering, model and thinking switching, session tree navigation and forking, HTML export and stats, plus a dialog channel for extensions. Its main limit is that extension-defined custom TUI components cannot be rendered remotely; only plain strings, dialogs and status text cross the boundary.
- An official higher-level remote and multi-client protocol was tried in Aug–Oct 2026 and then dropped. GUI builders should target stdio RPC or the SDK.

### Gaps
- I did not list every field of `get_state` or `get_session_stats`. They are in rpc-commands.md (860 lines).
- No WebSocket or HTTP transport for RPC is officially documented; the only transport is stdio. A web GUI would need its own bridge.

---

## Q3: What do the SDK packages (pi-agent-core, pi-ai), pi-web-ui, pi-mom and the other pi-mono packages offer? Can pi-web-ui serve as a chat GUI for the coding agent?

### Takeaway
The monorepo now holds 11 packages, all at version 1.3.0: pi-ai, pi-agent-core, pi-coding-agent, pi-tui, pi-durable, chord, pi-mcp, pi-codemode, pi-env, pi-telemetry and pi-evals. **pi-web-ui was dropped from the monorepo in 0.75.4 (2026-05-20), and pi-mom and pi-pods were removed around 2026-04-30.** pi-web-ui was a generic browser chat-component library built on pi-agent-core and pi-ai. It was never a front end for the coding agent itself. Its last npm release was `@earendil-works/pi-web-ui` 0.75.3 (around 2026-05-18). The Slack/chat bot role moved to the separate `earendil-works/pi-chat` extension, which supports Discord and Telegram.

### Cited Findings
**Current packages** (read from each `package.json` at HEAD on 2026-10-19; all versions are 1.3.0)

| Package | Description |
|---|---|
| `pi-ai` | "Unified LLM API with automatic model discovery and provider configuration" |
| `pi-agent-core` | "General-purpose agent with transport abstraction, state management, and attachment support" |
| `pi-coding-agent` | "Coding agent CLI with read, bash, edit, write tools and session management" |
| `pi-tui` | "Terminal User Interface library with differential rendering" |
| `pi-durable` | "Durable conversation, task, and document runtime" |
| `chord` | "Typed host runtime for plugins, contracts, replicated state, and RPC over JSON links" |
| `pi-mcp` | "Standalone Model Context Protocol client" |
| `pi-codemode` | "Sandboxed JavaScript execution where the only capability is calling injected tools" |
| `pi-env` | "Remote execution environments for Pi Durable: a small daemon deployed over SSH" |
| `pi-telemetry` | Telemetry |
| `pi-evals` | Evals |

— [packages/ directory](https://github.com/earendil-works/pi/tree/main/packages); [root README package table](https://github.com/earendil-works/pi/blob/main/README.md)

**SDK**
- `createAgentSession()` from `@earendil-works/pi-coding-agent` returns an `AgentSession` with:
  - `prompt()`, `steer()`, `followUp()`, `abort()`, `waitForIdle()`;
  - `subscribe(event => ...)`, which delivers the same events as JSON/RPC;
  - `getLastAssistantText()` and `dispose()`.

  Sessions can be configured through `modelRuntime`, `settingsManager`, `sessionManager` (including `SessionManager.inMemory()`), `resourceLoader`, `tools`/`customTools`, and inline extension factories. `AgentSessionRuntime` adds `newSession()`, `switchSession()`, `fork()` and `importFromJsonl()`. There are 14 checked examples, from `01-minimal.ts` to `14-codemode-mcp.ts`. — [sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- SDK sessions do not load the CLI's built-in codemode, tool_search and MCP extensions automatically. Add them with `createCodemodeExtension()`, `createToolSearchExtension()` and `createMcpExtension()`. — [sdk.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- pi-agent-core provides an `Agent` class with `subscribe`/`prompt` and a `streamProxy` "for browser apps that proxy through a backend" (`proxyUrl`). — [agent README](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- In 1.x, pi-agent-core lost its experimental harness (`AgentHarness`, sessions, durable runtime, etc.). It now contains only `Agent`, the agent loop, the proxy stream and their types, and points to pi-durable for durable sessions. — [agent CHANGELOG](https://github.com/earendil-works/pi/blob/main/packages/agent/CHANGELOG.md)
- pi-ai has a "Browser Usage" section: the core entrypoint is side-effect free and bundles cleanly. API keys must be passed explicitly in the browser, or supplied through a `CredentialStore` such as one backed by localStorage. — [ai README](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md)
- pi-durable is labeled "Experimental. The API changes without notice." It commits conversations, turns and tool calls to storage before showing them, and resumes after a crash. It has a "Watching a Conversation" section. It is built on chord, which replicates observable JSON state (snapshot plus deltas) to remote viewers over in-memory, Node IPC or **WebSocket** links and runs in "Node and browsers". — [durable README](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md); [chord README](https://github.com/earendil-works/pi/blob/main/packages/chord/README.md)
- Pi Durable shipped as an experimental package alongside Pi 1.0 on 2026-10-01. — [alternativeto.net news (search summary)](https://alternativeto.net/news/2026/10/pi-1-0-brings-native-mcp-support-and-pi-durable-for-long-running-crash-resistant-ai-agents/); [Techzine](https://www.techzine.eu/news/devops/144715/pi-1-0-will-include-mcp-and-a-dedicated-layer-for-long-running-ai-agents/)

**pi-web-ui**
- Not present in `packages/` at HEAD. The 0.75.4 entry (2026-05-20) says: "Removed web UI workspace references from the CLI package." — [coding-agent CHANGELOG](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- Earlier description (search summaries of npm and DeepWiki): "reusable web components for AI chat interfaces, built on mini-lit web components and Tailwind CSS v4." It offered:
  - `ChatPanel` (high level; takes an agent plus hooks for API-key prompts and tool factories) and `AgentInterface` (lower level);
  - streaming, tool execution, attachments (PDF, DOCX, XLSX, PPTX, images), sandboxed HTML/SVG/Markdown artifacts, and IndexedDB storage.

  Install: `npm install @earendil-works/pi-web-ui @earendil-works/pi-agent-core @earendil-works/pi-ai`. Latest npm version is 0.75.3, around May 18, 2026. `@mariozechner/pi-web-ui` is deprecated. — [npm @earendil-works/pi-web-ui (search summary)](https://www.npmjs.com/package/@earendil-works/pi-web-ui); [DeepWiki pi-web-ui](https://deepwiki.com/badlogic/pi-mono/6-pi-web-ui:-web-ui-components); [Mintlify Web UI overview](https://badlogic-pi-mono.mintlify.app/web-ui/overview)
- A different, unrelated "pi-web-ui" appears in the pi.dev package gallery. It is a third-party "full-featured web interface and desktop workspace for the pi coding agent SDK" with chat, files, terminal, Git and SSH projects. A third-party repo, `xing-shuyin/pi-web-ui`, depends on `@earendil-works/pi-coding-agent` (issue #530 references 0.97.0). — [pi.dev/packages/pi-web-ui (search summary)](https://pi.dev/packages/pi-web-ui); [xing-shuyin/pi-web-ui issue #530](https://github.com/xing-shuyin/pi-web-ui/issues/530); [Botmonster article](https://botmonster.com/coding/pi-web-ui-for-pi-coding-agent/)

**pi-mom, pi-pods and pi-chat**
- pi-mom was "a Slack bot that delegates messages to the pi coding agent" (running in a Docker sandbox). pi-pods managed vLLM GPU pods. Older forks still show the original repo tagline: "coding agent CLI, unified LLM API, TUI & web UI libraries, Slack bot, vLLM pods." — [ferologics/pi-mono fork](https://github.com/ferologics/pi-mono); [search summary](https://upd.dev/badlogic/pi-mono)
- A mirror shows a commit titled "remove mom and pods packages" dated 2026-04-30. — [search summary of mirror](https://upd.dev/badlogic/pi-mono) (secondary source; I could not verify it against history because my clone is shallow)
- The root README now says: "For Slack/chat automation and workflows see earendil-works/pi-chat." That repo's own README describes pi-chat as "A pi extension that bridges Discord and Telegram channels to a sandboxed pi session". Each channel gets a Gondolin micro-VM, and the extension offers streamed edit-in-place previews, memory, skills and file attachments. Setup is `pi install /path/to/pi-chat`, then `/chat-config` and `/chat-connect`. It requires QEMU and tmux. — [README](https://github.com/earendil-works/pi/blob/main/README.md); [earendil-works/pi-chat README (cloned)](https://github.com/earendil-works/pi-chat)

**Official GUI status**
- The official docs describe no first-party GUI, web UI or desktop app. Every interface listed is the TUI, print, JSON, RPC or SDK. — [how-pi-works.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/how-pi-works.md)
- A review notes that "no first-party IDE extension or desktop app is documented." — [search summary, aiagentslist.io](https://www.aiagentslist.io/agents/pi-coding-agent)
- Community desktop GUIs mostly drive `pi --mode rpc`:
  - gustavonline/pi-desktop (Tauri + Lit, v1.0.0 2026-04-13)
  - FaqFirebase/pi-desktop (alpha; pi or omp)
  - MarshallEriksen-Neura/pi-agent-desktop (Rust layer spawns `pi --mode rpc`)
  - pi-gui (Electron, wraps the SDK)
  - pi-lot
  - pi-desktop.dev (macOS, v0.7.0, Aug 24, 2026)

  These details come from search summaries; another researcher likely covers them in depth. — [gustavonline/pi-desktop](https://github.com/gustavonline/pi-desktop); [FaqFirebase/pi-desktop](https://github.com/FaqFirebase/pi-desktop); [pi-agent-desktop](https://github.com/MarshallEriksen-Neura/pi-agent-desktop); [pi-gui](https://github.com/minghinmatthewlam/pi-gui); [pi-lot.dev](https://www.pi-lot.dev/); [pi-desktop.dev](https://www.pi-desktop.dev/)
- A source fork can rebrand the CLI through `piConfig.name`/`configDir` in package.json. — [cli-integration.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md)

### Inferences
- pi-web-ui was not a ready-made chat GUI for the coding agent. It was a component kit for building browser chat apps on pi-agent-core (an in-browser agent), without the coding agent's file and bash tools or its session format. Using it with the coding agent would have meant writing a bridge. It is now frozen at 0.75.3 and unmaintained in the monorepo, so a new project should not build on it.
- The most plausible official building blocks for a GUI today:
  - stdio RPC or the SDK, for full coding-agent behavior;
  - chord/pi-durable, which have browser-capable WebSocket state replication, but are experimental.
- Earendil seems to be moving away from shipping first-party UIs (web-ui, mom and the experimental client/server were all dropped) and toward a small core with extensions. A visual front end is left to the community or to Earendil's separate products.

### Gaps
- No primary source explains why web-ui, mom and pods were removed.
- I could not confirm the exact last-publish date of `@earendil-works/pi-web-ui` or whether it is deprecated on npm, because the registry was blocked.
- I could not confirm whether `@earendil-works/pi-mom` was ever published.
- I found no documentation of a "Radius" web viewer (the `/share` destination, radius.pi.dev) beyond its mention as an upload target. It may be an Earendil web product worth investigating.

---

## Q4: How customizable is pi visually (themes, and extensions that render custom UI components)?

### Takeaway
Inside the terminal, Pi is very customizable:
- JSON themes in OKLCH/OKHSL, with a default `system` theme that derives its colors from the terminal palette;
- extensions that replace the header, footer and editor, add widgets, overlays and full-screen custom components (built on pi-tui), and custom renderers for tool calls and messages;
- fullscreen mode with mouse support (the default since 1.0).

Almost none of this carries over to RPC or the SDK: themes and custom components are TUI-only.

### Cited Findings
**Themes**
- Built-in themes are `system` (the default), `dark` and `light`. `system` queries the terminal's foreground, background and 16 ANSI colors, keeps body text at a WCAG contrast of at least 4.5:1, and rebuilds itself when the terminal switches between light and dark. There is also a `"light/dark"` pairing setting, and `--use-theme` sets the theme for one invocation. — [themes.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/themes.md)
- A custom theme is a JSON file at `~/.pi/agent/themes/<name>.json`. Its fields are `$schema`, `name`, `appearance`, `vars`, `colors` and `export`. The `export` field sets HTML-export backgrounds. Colors can be hex, `oklch()`, `okhsl()`, a 256-color index, a variable reference, or `""` for the terminal default. The active user theme hot-reloads. Since 1.2.0 the schema is strict, published at `https://pi.dev/schemas/theme.schema.json`. — [themes.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/themes.md); [CHANGELOG 1.2.0](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- Themes also apply to HTML exports. — [themes.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/themes.md)

**Extensions**
- Extensions are TypeScript modules loaded with jiti, so no build step is needed. They live in `~/.pi/agent/extensions/` or are loaded with `--extension`, and they run in-process with full user permissions. The API includes:
  - `pi.on()` events: `input`, `before_agent_start`, `context`, `tool_call`, `tool_result`, `before_provider_request`, `agent_settled`, `session_start`, and others;
  - registration methods: `registerTool`, `registerCommand`, `registerShortcut`, `registerFlag`, `registerProvider`, `registerMcpServer`, `registerVirtualModel`, `registerToolRenderer`;
  - messaging and state: `sendMessage`/`sendUserMessage`, `appendEntry`, and an `events` bus between extensions.

  — [extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- Integration points for TUI customization:

  | Need | API |
  |---|---|
  | Dialogs | `ctx.ui.select/confirm/input/editor` |
  | Feedback | `notify` / `setStatus` |
  | Persistent content near the editor | `setWidget` |
  | Replace header, footer or editor | component factories (`setHeader`, `setFooter`, `setEditorComponent` with `CustomEditor`) |
  | Overlays or temporary screens | `ctx.ui.custom()` |
  | Custom tool or entry rendering | renderers (`renderCall`/`renderResult`, which also render in HTML exports) |

  — [tui.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md); [extensions.md "Tool rendering"](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- pi-tui components:
  - content: `Text`, `Markdown`, `Image` (Kitty/iTerm2 inline images), `TruncatedText`;
  - layout: `Container`, `VStack`, `HStack`, `Box`, `Spacer`;
  - input: `Input`, `Editor`;
  - lists and scrolling: `SelectList`, `SettingsList`, `ScrollView`;
  - other: `Loader`, `CancellableLoader`, `MouseRegion`.

  It uses differential rendering with synchronized output (CSI 2026), and in fullscreen mode it routes mouse events. — [tui.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md); [tui README](https://github.com/earendil-works/pi/blob/main/packages/tui/README.md)
- The repo ships about 80 example extensions, including `custom-header.ts`, `custom-footer.ts`, `status-line.ts`, `rainbow-editor.ts`, `modal-editor.ts`, `border-status-editor.ts`, `minimal-mode.ts`, `widget-placement.ts`, `message-renderer.ts`, `entry-renderer.ts`, `built-in-tool-renderer.ts`, `titlebar-spinner.ts`, `mac-system-theme.ts`, overlays (`overlay-test.ts`, `doom-overlay/`), games (`snake.ts`, `space-invaders.ts`, `tic-tac-toe.ts`), `plan-mode/`, `subagent/`, `permission-gate.ts` and `questionnaire.ts`. — [examples/extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions)
- Fullscreen TUI has been the default since 1.0.0 (2026-10-01). `tuiMode: "regular"` keeps the normal terminal scrollback. — [CHANGELOG 1.0.0](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- Extensions, skills, prompt templates and themes can be bundled as "Pi packages" and shared through npm or git. The `pi-package` keyword lists a package in the gallery at pi.dev/packages, and optional `pi.image`/`pi.video` fields add previews. — [packages.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
- Extensions load in all modes, but "RPC can forward supported dialogs and notifications ... but not custom terminal components; JSON and print modes have no UI." The docs recommend guarding with `ctx.mode === "tui"`. — [extensions.md "UI and modes"](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)

### Inferences
- Visual customization is extensive but terminal-bound. A GUI client driving RPC gets plain-string widgets, status entries, notifications and dialogs from extensions. It does not get themes, custom renderers or custom components, so it has to provide its own visual layer.
- Tool renderers also feed HTML export, which shows a small amount of non-terminal rendering in core.

### Gaps
- I did not list the full set of required theme color tokens; they are in the JSON schema at pi.dev, which I could not fetch.

---

## Q5: What is the current version and how mature is pi (October 2026)?

### Takeaway
As of 2026-10-19 the current release is **1.3.0 (2026-10-15)**. 1.0.0 shipped on 2026-10-01 after about 11 months of 0.x releases, starting from 0.10.0 on 2025-11-25. Releases come out very often, every few days, with frequent breaking changes in the 0.x era. Pi is very popular (tens of thousands of GitHub stars, and 1.0 reached #1 on HN). Its stable surface is the CLI, stdio RPC and the SDK; durable and chord are still experimental.

### Cited Findings
- The CHANGELOG shows `[1.3.0] - 2026-10-15`, `[1.2.0] - 2026-10-12`, `[1.0.0] - 2026-10-01`, `[0.99.0] - 2026-09-29` and `[0.74.0] - 2026-05-07`, and its oldest entry is `[0.10.0] - 2025-11-25`. An `[Unreleased]` section is active, and the latest commit is dated 2026-10-19. — [coding-agent CHANGELOG](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- Main 1.0 changes:
  - fullscreen TUI by default;
  - leaner codemode (about 40% fewer prompt tokens);
  - image generation in codemode;
  - Radius in `/login`;
  - MCP OAuth hardening.

  Native MCP support (through codemode, tool_search and deferred loading) arrived around 1.0, reversing the 2025 "will not support MCP" stance. — [CHANGELOG 1.0.0](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md); [The Register, 2026-10-02](https://www.theregister.com/ai-and-ml/2026/10/02/pi-coding-agent-pulls-a-180-and-adds-mcp-support/5300678); [developersdigest](https://www.developersdigest.tech/blog/pi-1-0-release-guide-mcp-codemode-pi-durable)
- Install with `curl -fsSL https://pi.dev/install.sh | sh` (the installer pins dependencies; update with `pi update`), with `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`, or with `nix run github:earendil-works/pi/stable`. Requires Node.js ≥ 22.19. Runs on macOS, Linux and Windows; standalone binaries are attached to GitHub releases. MIT license. — [README](https://github.com/earendil-works/pi/blob/main/README.md)
- Contribution policy: "New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily." Issue numbers have passed #10,900. Pi has no built-in permission system; containerization (Gondolin micro-VM, Docker, OpenShell) is documented instead. — [README](https://github.com/earendil-works/pi/blob/main/README.md); [CHANGELOG](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- Pi 1.0 reached #1 on Hacker News with more than 1,000 points. — [trendingtopics.eu](https://www.trendingtopics.eu/pi-1-0-earendil-en/)
- Reported star counts: 45,041 (as of May 6, 2026) and 112,973 for earendil-works/pi (eesel.ai table, around Oct 2026). These come from different dates and sources and are unverified. — [search summary of eesel.ai](https://www.eesel.ai/blog/pi-coding-agent)
- Earendil claims "hundreds of thousands" of weekly users. This is a vendor claim. — [search summary of coverage](https://letsdatascience.com/news/pi-10-adds-mcp-and-durable-harness-6241c6f7)
- Wikipedia (via search summary) lists 1.3.0 as the stable release as of 2026-10-15. — [Wikipedia Pi (AI agent)](https://en.wikipedia.org/wiki/Pi_(AI_agent))

### Inferences
- Pi is mature and widely used, but it changes quickly. The RPC and event wire format has had breaking changes as recently as 0.84 (delta-only `message_update`), so GUI clients should pin a Pi version or track the changelog.
- The experimental packages (pi-durable, chord) and the removed client/server stack suggest a future official remote or multi-client story could appear, but nothing is shipped or stable as of October 2026.

### Gaps
- I could not get exact current GitHub star or npm download counts because the API and registry were blocked. The figures above are secondary and unverified.
- I could not read Hacker News threads directly.
