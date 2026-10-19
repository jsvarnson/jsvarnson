# Third-party and community graphical front-ends for the pi coding agent (as of 2026-10-19)

Method note: GitHub metadata (stars, forks, open issues, created/updated dates) comes from a GitHub repository search API call made on 2026-10-19. GitHub's `updated_at` field changes on any repo activity, stars included. It is a rough activity signal, not the date of the last commit. Direct fetches of github.com, pi-gui.com, agentclientprotocol.com and botmonster.com failed with DNS errors in this environment, so README-level details (install steps, themes, known bugs) for most repos come from search-engine snippets and repo descriptions. They have not been checked against the READMEs. There is no official GUI from Mario Zechner. Pi's own integration surfaces are the interactive TUI, print/JSON mode, an RPC mode (`pi --mode rpc`) and an SDK. Nearly every GUI below uses RPC mode or the SDK. — [npm @mariozechner/pi-coding-agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)

Packaging note: several 2026 sources call the pi SDK `@earendil-works/pi-coding-agent` (used by percho and victor-software-house/pi-acp). The package may have been renamed or moved from `@mariozechner/pi-coding-agent`. I did not confirm this. — [search summary of victor-software-house/pi-acp](https://github.com/victor-software-house/pi-acp); [percho wiki](https://github.com/Jaxton07/percho/wiki)

## Does pi support the Agent Client Protocol (ACP) so it can run in Zed, JetBrains, Neovim or ACP desktop GUIs?

### Takeaway
Yes, through community adapters, not natively. The main adapter is svkozak/pi-acp (736 stars). It is listed in the shared Zed/JetBrains ACP Registry, and Zed has a "Pi" agent page, so Zed users can install pi with no terminal. JetBrains IDEs read the same registry, but I found no source confirming that Pi appears in the JetBrains picker. At least eight alternative or forked adapters exist, including a Rust rewrite and a JetBrains-targeted variant.

### Cited Findings
- **svkozak/pi-acp**: the main ACP adapter for pi. TypeScript, 736 stars, 205 forks, 89 open issues, created 2025-12-19, updated 2026-10-19 (active). — [GitHub search API](https://github.com/svkozak/pi-acp)
- How it works: pi-acp speaks ACP JSON-RPC 2.0 over stdio to an ACP client such as Zed, spawns `pi --mode rpc`, and bridges requests and events between the two. — [svkozak/pi-acp README via search](https://github.com/svkozak/pi-acp)
- Features: it streams assistant output, maps pi tool runs to ACP tool calls, and supports session history in Zed from v0.225.0. Sessions map to pi's session files and can be resumed in either pi or the ACP client. — [search summary of pi-acp](https://github.com/svkozak/pi-acp)
- Prerequisites: Node.js 22+ and pi v0.80.4+ on PATH, with providers and API keys configured separately. pi-acp is a bridge only, so pi itself must be installed. — [search summary of pi-acp / pi.dev package](https://pi.dev/packages/@geohar/pi-acp)
- Zed has an official "Pi – ACP Agent" page. It gives a manual run command (`npx pi-acp@0.0.34`) and recommends selecting Pi from the registry in the editor. Zed's docs say Pi is an agent harness, not a Zed LLM subscription, so provider auth and models are configured in Pi. — [Zed: Pi ACP Agent](https://zed.dev/acp/agent/pi); [Zed External Agents docs](https://zed.dev/docs/ai/external-agents)
- In Zed, open the registry with the `zed: acp registry` command and choose the pi adapter. — [search summary](https://github.com/svkozak/pi-acp)
- The ACP Registry was released jointly by JetBrains and Zed. An agent registered once becomes available to every ACP-compatible client. — [JetBrains Blog, Jan 2026](https://blog.jetbrains.com/ai/2026/01/acp-agent-registry/); [heise](https://www.heise.de/en/news/Integrate-AI-Agents-into-the-Editor-JetBrains-and-Zed-Release-ACP-Registry-11160709.html)
- JetBrains: IDE 2025.3.2+ with JetBrains AI 253.30387.147 can install agents from the Agent Picker via "Install From ACP Registry…". Agents outside the registry can be added in `~/.jetbrains/acp.json` with a command and args, which is a manual config-file step. — [JetBrains Blog](https://blog.jetbrains.com/ai/2026/01/acp-agent-registry/); [Zed: JetBrains ACP client page](https://zed.dev/acp/editor/jetbrains)
- **Alternative and forked adapters** (GitHub search, 2026-10-19):
  - `@geohar/pi-acp`, a fork that adds subagent, MCP and multi-root workspace support. — [pi.dev package](https://pi.dev/packages/@geohar/pi-acp)
  - victor-software-house/pi-acp (3 stars, updated 2026-09-09). It embeds pi through the SDK instead of spawning the CLI. — [GitHub](https://github.com/victor-software-house/pi-acp)
  - ahmadaccino/pi-acpinator (Rust, 4 stars, updated 2026-09-01; crate 0.1.0). It is a single native binary, where other adapters are Node processes. — [GitHub](https://github.com/ahmadaccino/pi-acpinator); [docs.rs](https://docs.rs/pi-acpinator/0.1.0)
  - pi-acp-jetbrain / @wbline/pi-acp-jetbrain, which targets JetBrains IDEs. Other ACP clients get "partial coverage". — [pi.dev](https://pi.dev/packages/pi-acp-jetbrain?page=26)
  - 0xSero/pi-acp (34 stars, last updated 2026-07-13, possibly stale). — [GitHub](https://github.com/0xSero/pi-acp)
  - regadas/pi-acp ("independently maintained", 2 stars, updated 2026-10-17). — [GitHub](https://github.com/regadas/pi-acp)
  - patrick-xin/pi-acp, built for the "Buzz" ACP host (2 stars). — [GitHub](https://github.com/patrick-xin/pi-acp)
  - DxTa/pi-acp (another fork). — [GitHub](https://github.com/DxTa/pi-acp)
  - LodyAI/acp-extension-pi (3 stars, updated 2026-10-18). — [GitHub](https://github.com/LodyAI/acp-extension-pi)
- The reverse direction also exists: pi extensions that let pi drive other ACP agents, for example buihongduc132/pi-acp-agents (9 stars), zacbemis/pi-antigravity-acp-provider (51 stars) and vantuh/pi-kiro-acp. These are not GUIs. — [GitHub search](https://github.com/buihongduc132/pi-acp-agents)
- Two ACP-based VS Code clients target pi: ustc-mkh/pi-acp-workbench ("VS Code extension for Pi Agent over ACP", streaming chat, KaTeX, diff previews; 2 stars, created 2026-10-03) and rdoiron/oh-my-pi-vscode ("ACP-powered native chat" for the oh-my-pi fork; 4 stars). — [GitHub](https://github.com/ustc-mkh/pi-acp-workbench); [GitHub](https://github.com/rdoiron/oh-my-pi-vscode)

### Inferences
- Zed via the ACP Registry is the most "no-terminal" IDE route. The user still has to have Node 22+ and pi installed, and still configures API keys in pi. Zed's registry handles the adapter, but whether it also installs pi itself is unclear.
- Any ACP client (Neovim plugins such as CodeCompanion or avante, Emacs agent-shell, desktop ACP GUIs) should in principle run pi through pi-acp, since it is a standard stdio ACP agent. I found no client-specific confirmation for Neovim or Emacs ACP clients.
- 89 open issues on svkozak/pi-acp and the number of forks that add features (MCP, subagents, multi-root) suggest the main adapter has gaps that users are filling elsewhere.

### Gaps
- I could not confirm that Pi appears in the JetBrains AI Assistant registry picker, as opposed to only Zed's.
- I could not read pi-acp's README or issues directly (github.com fetch was blocked), so specific known bugs and unsupported ACP features (slash commands, permission prompts, images, extensions' custom UI) are unverified.
- The current pi-acp version is unknown beyond Zed's page referencing 0.0.34, which may be outdated.
- agentclientprotocol.com's agent list could not be fetched.

## Are there VS Code extensions for pi?

### Takeaway
Yes, more than a dozen. All are community-made and none is official. They range from a thin "pi in a terminal beside the editor plus editor-state bridge" (pithings/pi-vscode, the most popular at 186 stars, on both the Marketplace and Open VSX) to full sidebar chat GUIs (Zetaphor, frostime, quincycs, iqbalabiyoga). Most need the pi CLI installed first.

### Cited Findings
- **pithings/pi-vscode** (Marketplace ID `pi0.pi-vscode`). It is a "minimal" extension that opens pi in a terminal beside the editor and gives pi live editor state: active file, selection, diagnostics. It is on the VS Code Marketplace and Open VSX, and needs the pi CLI plus a provider API key. 186 stars, 45 forks, 25 open issues, updated 2026-10-19. — [GitHub](https://github.com/pithings/pi-vscode); [search summary](https://tomevault.io/tome/pi0/pi-vscode)
  - Known concern: an automated third-party scan of the Open VSX listing (v0.0.6) reported 77 findings with a high risk score. This is generic static analysis, not a confirmed malicious finding. — [riskyplugins.com](https://riskyplugins.com/extension/5c63a580-2ed4-52a4-bec0-9f6d45251246/openvsx)
  - Caveat: it still shows pi's TUI inside VS Code's integrated terminal, so it is not a true graphical front-end.
- **Zetaphor/pi-vscode-extension**: "Pi coding agent, as a VSCode extension". Sidebar chat UI, multi-tab sessions, checkpoints. 46 stars, updated 2026-09-14. I found no Marketplace listing. — [GitHub](https://github.com/Zetaphor/pi-vscode-extension)
- **frostime/pi-vscode-ui**: "non-intrusive VS Code extension that offers GUI wrapper for the Pi Coding Agent" (webui). 37 stars, updated 2026-10-15. — [GitHub](https://github.com/frostime/pi-vscode-ui)
- **quincycs/pi-qcode** ("pi-vscode-qcode"): "Native vscode extension for pi coding agent". 18 stars, updated 2026-10-19. — [GitHub](https://github.com/quincycs/pi-qcode)
- **tintinweb/vscode-pi-model-chat-provider**: exposes pi's models in VS Code's model picker for GitHub Copilot Chat and other `vscode.lm.*` consumers. 16 stars, updated 2026-09-02. This is a model bridge, not an agent UI. — [GitHub](https://github.com/tintinweb/vscode-pi-model-chat-provider)
- **Printaga/PiLot**: "Integrate the PI coding agent directly into VS Code with a user-friendly GUI". 8 stars, updated 2026-10-05. — [GitHub](https://github.com/Printaga/PiLot)
- **auchan/pi-on-code** and **NimbleTronAI/pi-code-gui**: both described as "GUI experience for the popular Pi Coding Agent" (6 and 14 stars). Pi-on-code appears to be derived from pi-code-gui. — [GitHub](https://github.com/auchan/pi-on-code); [GitHub](https://github.com/NimbleTronAI/pi-code-gui)
- **iqbalabiyoga/pi-vscode-chat**: "Copilot-like chat sidebar for VS Code, powered by your local pi" (3 stars, updated 2026-08-24). — [GitHub](https://github.com/iqbalabiyoga/pi-vscode-chat)
- Marketplace companions paired with pi packages:
  - `balaenis.pi-x-ide` for VS Code, Cursor and Windsurf, paired with the `pi-x-ide` package. — [jsdelivr docs](https://cdn.jsdelivr.net/npm/pi-x-ide@1.19.4/docs/how-to/install-vscode.md)
  - `serhioromano.vscode-pi-sr` ("Pi Agent Companion", diff review), paired with `pi-vscode-sr`. — [pi.dev](https://pi.dev/packages/pi-vscode-sr?page=78)
  - `@m4riok/pi-ide-bridge` and `pi-ide-integration`. — [pi.dev](https://pi.dev/packages/@m4riok/pi-ide-bridge?page=60)
- Smaller or stale VS Code projects:
  - zenyui/vscode-pi (4 stars, last updated 2026-07-16)
  - brijbyte/piagent-vscode (3 stars, updated 2026-08-28)
  - chouchouji/pi-vscode-extension (2 stars)
  - sounkou-bioinfo/vscode-pi (1 star)
  - qagushaq/pi-coding-agent-vscode (1 star)
  - Source for all five: [GitHub search API](https://github.com/zenyui/vscode-pi)
- An AI-generated tutorial site tells users to search the Marketplace for "Pi Coding Agent". No such official extension was confirmed. — [aiindigo.com](https://aiindigo.com/tutorials/getting-started-with-pi-coding-agent-accelerate-full-stack-development)

### Inferences
- For a non-terminal VS Code experience, the sidebar-chat projects (Zetaphor, frostime, pi-qcode) fit better than pithings/pi-vscode, but they are small (<50 stars) single-maintainer projects.
- Pi's model-picker bridge (tintinweb) lets Copilot Chat use pi-configured models. This is a different use case from driving the pi agent loop.

### Gaps
- I could not verify Marketplace install counts, versions or themeability for the sidebar extensions.
- Specific known bugs per extension are unavailable because the READMEs and issues could not be fetched.

## Are there multi-agent GUI wrappers (Conductor, Crystal, Opcode/Claudia, Vibe Kanban, CodexMonitor, Happy, Omnara, etc.) that support pi as a backend?

### Takeaway
Most well-known wrappers do not list pi. The clear exception is **Orca (stablyai/orca, ~98k stars)**: its docs list Pi as a built-in preconfigured agent, and it runs on desktop, mobile and a remote runtime. Several pi-native multi-session or "harness" desktop apps (pi-harness, mu, Wa-PiAgent) and terminal-board tools (horizon, claude_codex_bridge) also include pi.

### Cited Findings
- **Orca (stablyai/orca)**: "the place for working with a fleet of agents… Available on desktop, mobile and remote runtime". 98,226 stars, 8,619 open issues, created 2026-03-17, updated 2026-10-19. The repo topics include "pi". — [GitHub search API](https://github.com/stablyai/orca)
  - Orca's docs list Pi among agents that ship preconfigured in the built-in picker, with auto-setup, hooks and status support. Orca pre-fills Pi's permission-bypass flag for new launches, so pi runs skip confirmations by default. That is a safety consideration. — [Orca supported agents](https://www.onorca.dev/docs/agents/supported)
  - Each agent runs in its own git worktree. Orca claims to work with any CLI agent. — [Orca fork README](https://github.com/MuathJ/orca)
  - Name collisions to avoid: `@pi-orca/agents` (a pi subagent extension) and VirtusLab/orca (a Scala tool that drives `pi --mode rpc`) are unrelated to stablyai's Orca. — [jsdelivr](https://cdn.jsdelivr.net/npm/@pi-orca/agents@0.0.5/README.md); [VirtusLab/orca](https://github.com/VirtusLab/orca)
- **Vibe Kanban**: its agent list names Claude Code, Codex, Gemini CLI, Copilot, Amp, Cursor, OpenCode, Droid, CCR and Qwen Code. Pi is not listed. The project is now community-maintained after Bloop shut down. — [aq.dev](https://aq.dev/alternatives/vibe-kanban/); [vibekanban docs](https://www.vibekanban.com/docs/getting-started)
- **Conductor** (Mac only): Claude Code and Codex, plus Cursor and OpenCode according to some sources. No pi. — [nimbalyst comparison](https://nimbalyst.com/compare/nimbalyst-vs-conductor-vs-vibe-kanban/)
- **Crystal**: deprecated February 2026, with agents listed as Claude and Codex only. It is abandoned. — [augmentcode](https://www.augmentcode.com/tools/open-source-agent-orchestrators)
- **Happy**: described as a mobile client for Claude Code. No pi support found. — [agentsroom](https://agentsroom.dev/blog/best-multi-agent-coding-tools)
- **Omnara**: no agent list found that includes pi. — [AlternativeTo](https://www.alternativeto.net/software/omnara/)
- **AgentsRoom** lists "oh-my-pi" (a pi fork) among its providers. — [agentsroom](https://agentsroom.dev/blog/best-multi-agent-coding-tools)
- Pi-aware multi-agent tools found on GitHub (topic `pi-coding-agent`, 2026-10-19):
  - **wangmiaozero/pi-harness**: an Electron + Vue3 desktop app, an "operational superset of Pi" with observability, governance, recovery, evaluation and multi-agent orchestration. 997 stars. — [GitHub](https://github.com/wangmiaozero/pi-harness)
  - **qybaihe/mu**: an Electron coding agent "built on pi and AionUi" with a small judge model. 526 stars. This suggests AionUi, a multi-agent desktop GUI, can host pi-based agents. — [GitHub](https://github.com/qybaihe/mu)
  - **peters/horizon**: a Rust GPU terminal board ("infinite canvas") for many agent sessions, pi included. 719 stars. It is still terminal-based. — [GitHub](https://github.com/peters/horizon)
  - **SeemSeam/claude_codex_bridge**: a multi-agent CLI workspace with Pi among its agents. 3,578 stars. tmux-based, so not a GUI. — [GitHub](https://github.com/SeemSeam/claude_codex_bridge)
  - **HarnessRouter/harnessrouter**: a unified API across Codex, Claude Code, Hermes, PI and others. 3,144 stars. Back-end infrastructure, not a GUI. — [GitHub](https://github.com/HarnessRouter/harnessrouter)
  - **tninja/ai-code-interface.el**: a unified Emacs interface supporting the Pi agent. 292 stars. — [GitHub](https://github.com/tninja/ai-code-interface.el)
  - **luandapipi91/Wa-PiAgent**: an Electron "AI agent team" GUI for pi with MCP, skills, memory and IM channels. 4 stars. — [GitHub](https://github.com/luandapipi91/Wa-PiAgent)
  - **liaohch3/claude-tap**: a local trace viewer for coding-agent API traffic, Pi supported. 3,295 stars. Observability, not control. — [GitHub](https://github.com/liaohch3/claude-tap)

### Inferences
- If the user wants a mainstream, polished multi-agent GUI with pi as one backend, Orca is the only well-established option found. Its default bypass of pi permissions should be reviewed.
- Opcode/Claudia, CodexMonitor and Happy appear to be Claude Code or Codex specific. Searches found no evidence of pi support.

### Gaps
- I found nothing on CodexMonitor or Opcode/Claudia regarding pi.
- I could not retrieve Vibe Kanban's full supported-agents page (vibekanban.com/docs/supported-coding-agents) to rule pi out definitively.
- AionUi's direct pi support is inferred only from the `mu` project's description.

## Are there pi-specific desktop and web apps on GitHub?

### Takeaway
Yes, many. The GitHub search "pi-coding-agent gui" alone returned 74 repos. The leaders by stars:
- Web: agegr/pi-web (7.5k), jmfederico/pi-web (894), rcarmo/piclaw (877), xing-shuyin/pi-web-ui (319)
- Desktop: minghinmatthewlam/pi-gui (1.27k Electron), percho (452), pi-app (379), FaqFirebase/pi-desktop (325), DLYZZT/pi-desktop (276), bivor (207, macOS), Pie (107, native Swift macOS), Orbit (Rust/GPUI)

All are third-party, created between Feb and Oct 2026, and almost all depend on pi installed locally (via RPC mode or the SDK).

### Cited Findings — Desktop apps
(Stars, forks, open issues and created/updated dates from the GitHub search API, 2026-10-19.)

| Name | URL | Stack / platforms | Stars | Created → updated | Notes |
|---|---|---|---|---|---|
| pi-gui | https://github.com/minghinmatthewlam/pi-gui | Electron | 1,271 (183 forks, 52 issues) | 2026-03-20 → 2026-10-19 | "Electron GUI app for the pi coding agent runtime". A shell around the pi package, not a separate agent. Site says free/open source, installed via GitHub Releases or Homebrew. Sources disagree on npm name and platforms. — [search summary](https://www.pi-gui.com/); [macaiapps listing](https://www.macaiapps.com/apps/pi-gui/). A mirror or fork exists at awsl12581/pi-gui. — [GitHub](https://github.com/awsl12581/pi-gui) |
| Percho | https://github.com/Jaxton07/percho | Electron, embeds pi SDK in main process | 452 (36 forks, 18 issues) | 2026-08-08 → 2026-10-19 | "Minimalist desktop GUI… same engine as the Pi CLI". Multi-session chat, visual tool approvals, custom themes: light/dark/system plus a custom background image with overlay dimming. Shares settings with the CLI, so sessions continue across both. No custom CSS documented. — [GitHub](https://github.com/Jaxton07/percho); [wiki](https://github.com/Jaxton07/percho/wiki) |
| pi-app | https://github.com/justhil/pi-app | Electron + React; Windows/macOS/Linux, WSL | 379 (2 issues) | 2026-06-20 → 2026-10-19 | Streaming timeline, Git review with hunk staging, session tree, "native UI for pi extensions". Chinese and English. — [GitHub](https://github.com/justhil/pi-app) |
| Pi Desktop (FaqFirebase) | https://github.com/FaqFirebase/pi-desktop | Electron + React; Linux/macOS/Windows | 325 (0 issues) | 2026-05-20 → 2026-10-19 | Chat, file editing, built-in terminal, diff review. Supports pi and the oh-my-pi fork. — [GitHub](https://github.com/FaqFirebase/pi-desktop) |
| pi-desktop (DLYZZT) | https://github.com/DLYZZT/pi-desktop | Electron + React/Vite; cross-platform | 276 | 2026-07-12 → 2026-10-19 | Local-first workspace: sessions, project files, browser tools, skills, plugins, messaging integrations, git worktrees. — [GitHub](https://github.com/DLYZZT/pi-desktop) |
| Bivor | https://github.com/ryanlab/bivor | macOS | 207 | 2026-08-14 → 2026-10-05 | "macOS desktop workbench for the pi coding agent". — [GitHub](https://github.com/ryanlab/bivor) |
| Pie | https://github.com/hieunc229/Pie | Native Swift, macOS | 107 | 2026-09-15 → 2026-10-19 | "Native macOS GUI for Pi Coding Agent". — [GitHub](https://github.com/hieunc229/Pie) |
| Orbit | https://github.com/imrj05/orbit | Rust on GPUI (Zed's GPU UI framework) | 48 | 2026-09-03 → 2026-10-19 | Speaks pi's RPC protocol over stdio. No browser, webview or Node in the GUI itself. — [GitHub](https://github.com/imrj05/orbit) |
| Pi Desktop (gustavonline) | https://github.com/gustavonline/pi-desktop | Tauri + Lit | n/a | latest stable v1.0.0 (2026-04-13) | "extension-first and multi-session aware". Requires the pi CLI and shows an onboarding card with install instructions if it is missing. — [GitHub via search](https://github.com/gustavonline/pi-desktop) |
| Pilot (espennilsen) | https://github.com/espennilsen/pilot | Electron + React, with an iOS/iPad companion for remote control | 36 | 2026-02-23 → 2026-08-06 | Sandboxed file editing, git, task management, memory. **Possibly stale** (no update for about 2.5 months). — [GitHub](https://github.com/espennilsen/pilot) |
| pi-lot | https://www.pi-lot.dev/ | Desktop | n/a | n/a | "Visual control over your AI coding sessions": streaming, analytics, model switching, git integration. Its relation to espennilsen/pilot is unknown. — [pi-lot.dev](https://www.pi-lot.dev/) |
| Pi Desktop (pi-desktop.dev) | https://www.pi-desktop.dev/ | macOS | n/a | n/a | Multi-tab sessions, built-in web search, custom models, GitHub integration. — [pi-desktop.dev](https://www.pi-desktop.dev/) |
| Pace | https://github.com/bubbleptr/pace | Electron + React | 19 | 2026-06-20 → 2026-10-19 | Sessions, trajectories, cost and token tracking, "extension-registered surfaces". — [GitHub](https://github.com/bubbleptr/pace) |
| SPOPI | https://github.com/spongioblast/spopi | Tauri, vanilla JS, Rust (hard fork of "Picot") | 14 | 2026-09-25 → 2026-10-12 | Editor, diff review, checkpoints, LSP around `pi --mode rpc`, session tree, live steering, local-model metrics. — [GitHub](https://github.com/spongioblast/spopi) |
| pi-gui-flutter | https://github.com/saltysalrua/pi-gui-flutter | Flutter desktop | 4 | 2026-09-15 → 2026-09-29 | Multiple sessions and projects side by side, appearance and frosted-glass personalization. Chinese UI. — [GitHub](https://github.com/saltysalrua/pi-gui-flutter) |
| ompanion | https://github.com/edde746/ompanion | Flutter: desktop plus iOS/Android | 2 | 2026-09-26 → 2026-10-17 | GUI for the oh-my-pi fork, local or remote over SSH/Tailscale. — [GitHub](https://github.com/edde746/ompanion) |
| PiG (jmcblane) | https://github.com/jmcblane/PiG | Swift | 9 | → 2026-10-09 | Swift GUI. Not the same as MichaelKinsy/PiG (a Go port of pi). — [GitHub](https://github.com/jmcblane/PiG) |
| morse | https://github.com/supanadit/morse | Angular + NestJS | 8 | 2026-10-03 → 2026-10-15 | "A comfortable GUI for the Pi coding agent". — [GitHub](https://github.com/supanadit/morse) |
| pi-heao-gui | https://github.com/Q1y1ng/pi-heao-gui | Electron, Windows | 3 | → 2026-10-07 | Wraps the "pi-agent-studio" chat UI. Installer and portable builds, auto-update, terminal/file/git dock. — [GitHub](https://github.com/Q1y1ng/pi-heao-gui) |
| Others (≤6 stars) | — | — | — | — | abboskhonov/pi-desktop (**stale**, last updated 2026-06-07); ArtificialNotImbecile/pi-desktop; bunnywaffle/pi-desktop; akirnsdsd/PI-gui (Chinese Tauri, **stale**, 2026-08-03); spmurrayzzz/leyline; ankitchouhan1020/pi-gui-extension (Svelte GUI shipped as a pi extension). Config-only managers: angusdevgo/Pi-Model-Manager and suimi8/PiManager. — [GitHub search API](https://github.com/minghinmatthewlam/pi-gui) |

### Cited Findings — Web and mobile/remote UIs
- **agegr/pi-web**: "Web UI for the pi coding agent". The most-starred pi GUI found: 7,516 stars, 1,135 forks, 28 open issues; created 2026-03-22, updated 2026-10-19. — [GitHub](https://github.com/agegr/pi-web)
  - Install: `npx @agegr/pi-web@latest`, or `npm i -g` then `pi-web`. Needs Node ≥22.19.0, so one terminal command is needed at launch. It serves at http://127.0.0.1:30141, opens the browser, and binds only to localhost by default. — [search summary of README](https://instagit.com/agegr/pi-web/what-is-the-purpose-of-the-pi-web-repository/)
  - Features: session browsing, real-time chat with streamed thinking and tool calls, model configuration (Settings → Models for sign-in or API key), skill management, project file preview. Projects and sessions can be searched, pinned, archived, renamed, exported or deleted. Storage is pi-compatible JSONL under `~/.pi/agent`, so the CLI and web UI share state. Options: `--port`, `--hostname`, `--no-open`, and `PI_WEB_PASSWORD` for Basic Auth. — [same](https://instagit.com/agegr/pi-web/how-to-build-the-agegr-pi-web-project/)
  - Forks: @cnbattle/pi-web (adds features), csoop, Eileenes, icekale. — [pi.dev](https://pi.dev/packages/@cnbattle/pi-web?name=web)
- **jmfederico/pi-web** ("PI WEB", pi-web.dev): a web UI that "keeps sessions alive in real workspaces". Sessions live in a long-running daemon, not the browser tab, so you can close the laptop and reconnect from a phone. 894 stars, 183 forks, **73 open issues**. A fork, CompN3rd/pi-web, adds a remote "control plane". — [GitHub](https://github.com/jmfederico/pi-web); [pi-web.dev](https://pi-web.dev/); [remote-first doc](https://pi-web.dev/remote-first); [CompN3rd](https://github.com/CompN3rd/pi-web)
- **ygncode/pi-web**: drive pi from any browser on the network (laptop, phone, tablet). Built-in token auth. Auto-publishes a Tailscale endpoint if Tailscale is running. Installable as a PWA. It is a pi package and states it is not affiliated with pi. — [GitHub](https://github.com/ygncode/pi-web); [site](https://ygncode.github.io/pi-web/)
- **xing-shuyin/pi-web-ui** (`pi-web-ui` package): a desktop-style workspace with chat, files, terminal and Git in one browser tab, built on the pi SDK, including remote SSH projects. 319 stars, updated 2026-10-19. — [GitHub](https://github.com/xing-shuyin/pi-web-ui); [pi.dev](https://pi.dev/packages/pi-web-ui)
- **rcarmo/piclaw**: "pi coding agent in a technicolor web trenchcoat". A self-hosted web workspace using Bun and Docker, with VNC and adaptive cards. 877 stars, 57 open issues. — [GitHub](https://github.com/rcarmo/piclaw)
- **mikeyobrien/rho**: an always-running agent built on pi, for macOS, Linux and Android. 374 stars. — [GitHub](https://github.com/mikeyobrien/rho)
- Mobile: Orca (desktop and mobile, above), Pilot's iOS/iPad companion, ompanion (Flutter iOS/Android for oh-my-pi), and the PWA/phone-browser modes of ygncode/pi-web and jmfederico/pi-web. "CC Pocket: Dev Agent Remote" on the iOS App Store appeared in search results, but its pi support is unconfirmed. — [App Store](https://apps.apple.com/mx/app/cc-pocket-dev-agent-remote/id6759188790)
- Security warning from a third-party review of a pi web UI: the safest current use is a second window on the machine already running pi, with a password set. Exposing it as a remote console on an open network "hands a shell to whoever finds it". An SSH client over a private tunnel is suggested as the safer phone route. — [Botmonster Tech review (via search snippet)](https://botmonster.com/coding/pi-web-ui-for-pi-coding-agent/)
- Ecosystem index: qualisero/awesome-pi-agent (1,098 stars) is now **archived** on GitHub, so it is no longer a current community list. — [GitHub](https://github.com/qualisero/awesome-pi-agent)
- Terminal theme packages on pi.dev (amp-themes, pi-theme-vitesse, @rokiy/pi-ui) style the TUI, not the GUIs. — [pi.dev amp-themes](https://pi.dev/packages/amp-themes)

### Inferences
- **No-terminal install**: the Electron and Tauri desktop apps (pi-gui, Percho, pi-app, the pi-desktop variants, Pie, Bivor) are the best candidates, since they ship as installers or DMGs and some (Percho, DLYZZT) embed the SDK. Several, though, still require pi to be installed separately. gustavonline/pi-desktop explicitly shows install instructions if pi is missing. Web UIs (agegr/pi-web) need one `npx` command, unless the user installs them as a pi package from within pi.
- **Maturity**: pi-gui and agegr/pi-web are the most adopted. Everything else is under 1k stars and between 1 and 8 months old, a fast-churning ecosystem of mostly solo projects.
- **Visual customization**: documented options are limited. Percho has light/dark/system themes and custom backgrounds; pi-gui-flutter has appearance and frosted-glass settings; pi-app, Pace and pi-gui-extension render "extension-registered surfaces" or native UI for pi extensions, which is a plugin-style customization path. I found no project that documents user custom CSS.
- **Platform**: Pie, Bivor and pi-desktop.dev are macOS-only. pi-app explicitly supports WSL on Windows. pi-heao-gui is Windows-focused.

### Gaps
- Per-app known problems and bugs: issue trackers could not be read. The available signals are only the open-issue counts (pi-gui 52, jmfederico/pi-web 73, piclaw 57, pi-acp 89, Orca 8,619).
- Latest release versions are unknown for most repos. Only gustavonline/pi-desktop v1.0.0 (2026-04-13) was surfaced.
- Whether pi-gui's Homebrew cask exists, and which platforms it supports, is unverified because the sources conflict.
- I did not search Discord, HN, Reddit or X discussions directly. The pi-mono README "community" section could not be fetched.
- Exact last-commit dates could not be retrieved. Staleness flags are based on GitHub `updated_at`.
