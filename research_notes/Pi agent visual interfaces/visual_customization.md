# Visual Customization of AI Coding Agent GUIs (benchmark for customizing a pi agent interface)

Research note on method: WebFetch and curl could not reach any page from this session. code.claude.com, zed.dev, raw.githubusercontent.com and most blogs got DNS or proxy 403 errors. Findings therefore come from (a) WebSearch result summaries, which are snippet-level and should be treated as lower confidence than full-page reads, and (b) a primary local source: the Claude Code v2.1.304 `plugin-authoring` skill bundled with this session. That skill includes the mod API reference (`reference.md`) and the full TypeScript API typings (`types/claude-code.d.ts`, about 14,000 lines), which I read directly. Those local files are cited as "[CC 2.1.304 mod reference (local)]" and should be treated as the most authoritative source on mods.

## 1. What exactly can Claude Code mods customize, and what are documented bugs/limitations?

### Takeaway
Claude Code "mods" are plugins written as JavaScript/TypeScript event handlers. They run inside Claude Code and can add panes beside the chat, a band above the prompt, status-line text, toasts, slash commands, sounds and tool-call/prompt rewriting. They draw only with a fixed set of engine-supplied elements (Box, Text, Button, Markdown, Svg, etc.) coloured by a fixed set of theme keys. They are **not** a CSS/theme-skinning system for the whole app. They also fail silently in many common situations: version too old, untrusted folder, safe mode, an unsupported surface, the hot-reload prompt never accepted, or a tree that doesn't validate. When a mod "doesn't work", the cause is usually one of those, and the reason is hidden in a debug log.

### Cited Findings
**What mods are / what they can draw**
- A mod is a plugin made of JS/TS event handlers. Unlike settings hooks, it runs inside Claude Code and can draw interface elements (a pane beside the transcript, a band above the prompt) and redraw parts of the UI such as the spinner — [Claude Code docs: Mods overview](https://code.claude.com/docs/en/plugins/mods/overview) (via search summary); [Better Stack guide](https://betterstack.com/community/guides/ai/claude-code-mods.md)
- Mods require Claude Code v2.1.287 or later and are on by default from that version — [Claude Code docs: Mods troubleshoot](https://code.claude.com/docs/en/plugins/mods/troubleshoot) (via search summary); [laozhang guide](https://blog.laozhang.ai/en/posts/claude-code-mods.md)
- The documented building blocks, per the bundled skill: a **pane/panel/sidebar** (`$.ui.open` + a `ui.render` hook on `Pane`), a **band above the prompt** (`AbovePrompt`), a **status line entry** (`$.ui.status`), a **toast** (`$.ui.toast`), **slash commands**, blocking/rewriting **tool calls**, rewriting **prompts** and the **system prompt**, **playing sounds**, timers, registering tools the model can call, subagent types, and file/process access — [CC 2.1.304 mod reference (local)] (plugin-authoring SKILL.md table)
- Drawing uses an element table supplied per surface (`$.ui.resolve(e)`), where `e.surface` is `terminal`, `desktop`, `vscode` or `mobile`. Surfaces differ: "`mobile` has no `Input`, `Select` or `Client`, `vscode` no `Client`, `terminal` no `Svg` but alone `Raster` and `Image`" — [CC 2.1.304 mod reference (local)] (reference.md, "Drawing: ui.render")
- Colours in mod trees are either a **theme key** that follows the user's Claude Code theme or a raw colour name/hex. The theme keys are a fixed list: `text, inverseText, inactive, subtle, suggestion, remember, success, error, warning, merged, claude, permission, planMode, autoAccept, promptBorder, bashBorder, ide, diffAdded, diffRemoved, ...` — [CC 2.1.304 types (local)] (`ThemeKey`, `Color` types)
- Mods can draw `Svg` (up to 131,072 characters of source). On desktop it can render in a "script-less sandboxed frame", which is the closest mods get to arbitrary HTML/CSS. Generic CSS restyling of the app's own chrome is not part of the API — [CC 2.1.304 types (local)] (Svg props, around lines 13068–13076)
- A mod can deny changes to the `theme` config key (e.g. `on("config.set", { key: "theme" }, () => ({ deny: "the theme stays" }))`). The app theme is therefore a config setting that mods can read or guard, not something mods replace with CSS — [CC 2.1.304 types (local)]
- Third-party tooling exists for the plain status line, e.g. "soffit" (a desktop editor with drag-and-drop and live preview for status-line widgets) and x-cmd's `x claude stl` with 70+ status bar colour schemes — [soffit on docs.rs](https://docs.rs/crate/soffit/0.0.2); [x-cmd cookbook](https://www.x-cmd.com/mod/claude/cookbook-7)

**Themes (separate from mods)**
- Built-in Claude Code themes listed in feature requests: dark, light, dark-daltonized, light-daltonized, dark-ansi, light-ansi, auto. Users reported that the ANSI variants cover only 16 slots, while other UI elements stay hardcoded — [GitHub issue #39369](https://github.com/anthropics/claude-code/issues/39369); [claudeissues #29166](https://claudeissues.com/issue/29166-feature-request-customizable-ui-colors-themes)
- A third-party blog says later releases support custom theme JSON files in `~/.claude/themes/` (a base preset plus colour overrides in hex/rgb). Not verified against official docs. The bundled typings do mention "the custom theme reference", which points to some official custom-theme support — [wmedia.es](https://wmedia.es/en/tips/claude-code-custom-themes); [vincentqiao blog](https://blog.vincentqiao.com/en/posts/claude-code-theme/); [CC 2.1.304 types (local)]
- Several feature requests for user-defined colours/themes (e.g. #50950, #49930, #33731) appear as resolved, but the search results did not show what shipped — [claudeissues #50950](https://claudeissues.com/issue/50950-feature-request-support-user-defined-custom-themes-in-settings-json); [#49930](https://claudeissues.com/issue/49930-feature-request-custom-color-theme-palette-support); [#33731](https://claudeissues.com/issue/33731-feature-request-customizable-ui-accent-colors)

**Where mods do and don't work**
- Mods draw in the CLI and in the desktop app's **Code tab**. `/plugin` does not run in the desktop app; installing there is "click + next to the prompt box, then Plugins, Add marketplace with `<owner>/<repo>`, then Add plugin". A mod installed from a terminal at user scope also loads in the desktop Code tab's local session and draws for the `desktop` surface — [CC 2.1.304 mod reference (local)] (reference.md, Sharing a mod)
- Third-party guides say mods do not draw in the VS Code extension's chat panel, `claude -p`, the Agent SDK or cloud sessions, and that plugins are unavailable in the desktop app's WSL sessions — [explainx.ai guide](https://www.explainx.ai/blog/claude-code-desktop-app-mods-how-to-install-and-build-guide-2026); [search summary of mods docs/blogs](https://tooljunction.io/blog/claude-code-mods). **Conflict:** the v2.1.304 typings list `vscode` (and `mobile`) as drawing surfaces with their own element tables, so VS Code drawing may have been added after those guides were written — [CC 2.1.304 types (local)]
- In headless runs (`-p`, SDK, desktop) some UI calls have no surface. For example `$.ui.notify` returns `no-surface` "where the session holds no terminal (a `-p` run, the SDK, the desktop: the hooks alone run)" — [CC 2.1.304 mod reference (local)]
- Mods written by Claude in a cloud session live in the container and disappear when the container ends — [CC 2.1.304 plugin-authoring skill (local)]

**Common reasons mods fail (documented)**
- Version older than 2.1.287 — [Mods troubleshoot docs](https://code.claude.com/docs/en/plugins/mods/troubleshoot.md)
- **Silent skip:** a broken mod is skipped and the session continues, so the mod "looks inert". The reason appears only in the debug log as `<mod> hooks module ... not loaded: <reason>` — [Mods troubleshoot docs](https://code.claude.com/docs/en/plugins/mods/troubleshoot); [CC 2.1.304 mod reference (local)]: "a plugin that seems to do nothing has usually been told why" (in `claude --debug`)
- The directory has not been trusted (the trust prompt was never accepted) — [Mods troubleshoot docs](https://code.claude.com/docs/en/plugins/mods/troubleshoot)
- Launched with `--safe-mode`, which loads no plugins. `"disableAllHooks": true` in settings disables all mods (and also the custom status line) — [Mods troubleshoot docs](https://code.claude.com/docs/en/plugins/mods/troubleshoot); [search summary](https://www.tooljunction.io/blog/claude-code-mods)
- `userConfig` values that fail validation (e.g. a number above the max, a required field empty) stop the module loading — [Mods troubleshoot docs](https://code.claude.com/docs/en/plugins/mods/troubleshoot)
- Mods Claude writes in-session need the person to answer "Turn on the mods Claude writes in this session?". On "Not now", or if it can't be asked (`claude -p`, org policy, untrusted workspace), the mod does not load until a later session — [CC 2.1.304 plugin-authoring skill (local)]
- A drawn tree that doesn't validate on that surface (e.g. using an element the surface lacks, like `Svg` on terminal or `Client` on VS Code) is **not drawn**. "the engine draws its own instead", or for a pane, "the pane was closed". Outside hot-reload sessions the only sign is in the debug log — [CC 2.1.304 mod reference (local)]
- A pane may simply not be placed: `$.ui.open` resolves `{ isPlaced }`, and the terminal's non-fullscreen mode shows panes inline rather than docked — [CC 2.1.304 mod reference (local)]
- Private-repo marketplaces install only when the machine already has a GitHub git credential. The install never prompts for one — [CC 2.1.304 mod reference (local)]
- `claude plugin validate <folder>` catches misspelled events, bad manifests and unreadable modules without starting a session — [Mods troubleshoot docs](https://code.claude.com/docs/en/plugins/mods/troubleshoot)
- Mods are not sandboxed. They run with the user's permissions (files, secrets, network) — [search summary of third-party guides](https://www.tooljunction.io/blog/claude-code-mods)

### Inferences
- For a user who wants to "change the look" (colours, fonts, layout chrome), mods are the wrong tool. They add widgets inside the existing UI, but they can't reskin it. Theme changes go through `/theme` / config, and possibly custom theme files.
- The likeliest reasons mods didn't work for a non-programmer: (1) using them somewhere they don't draw (claude.ai web chat, the desktop **Chat** tab rather than the Code tab, the VS Code panel on older builds, WSL or cloud sessions); (2) an old version; (3) never accepting the enable/trust prompt; (4) silent load failures visible only in `claude --debug`.

### Gaps
- Could not read the official mods overview/interface pages in full (fetch blocked). The official list of unsupported surfaces is unconfirmed.
- No GitHub issues found specifically about mods failing to render. Search returned only the official troubleshooting page.
- Unverified whether custom theme JSON files (`~/.claude/themes/`) officially exist, and in which version.

## 2. Which ACP-capable or agent-GUI hosts for pi offer the deepest real visual customization, and how reliable/easy without a terminal?

### Takeaway
For pi, the main options are: **Zed** (ACP via the pi-acp adapter, installable from Zed's ACP registry; mature theme system with theme extensions, `theme_overrides`, a Theme Builder and agent-panel font settings, but no custom CSS); **Obsidian** (ACP "Agent Client" plugin; Obsidian's CSS snippets could in principle restyle it, unconfirmed); **AionUi** (Electron ACP desktop app with user CSS injection in Settings, per a third-party write-up); **VS Code** (themes/colour customizations, but chat webviews often ignore them); and a set of young community pi desktop/web wrappers (pi-gui, Pi Desktop, piCode, OpenPi, Pi Web UI). Zed gives the most reliable, documented theming. AionUi and the web wrappers give the deepest free-form (CSS-level) control, but they are less mature. All of them still need pi itself installed via Node or a command.

### Cited Findings
**pi + ACP / Zed**
- Zed's ACP registry lists a Pi adapter that lets the pi coding agent run inside ACP-compatible editors — [Zed ACP: Pi](https://zed.dev/acp/agent/pi)
- pi-acp speaks JSON-RPC over stdio to the editor and launches pi in RPC mode as a subprocess. It requires Node.js 22+ and `pi` on PATH. Several competing forks exist (DxTa, victor-software-house, svkozak, @geohar), some embedding the SDK directly. One states that it does not delegate filesystem/terminal operations to the ACP client — [DxTa/pi-acp](https://github.com/DxTa/pi-acp); [victor-software-house/pi-acp](https://github.com/victor-software-house/pi-acp); [@geohar/pi-acp](https://pi.dev/packages/@geohar/pi-acp); [sourcepulse svkozak](https://www.sourcepulse.org/projects/28792506)
- Zed external agents: Zed hosts the thread in the Agent Panel, while the agent owns its own runtime, auth, models and tools. Agents are installed from the ACP Registry and then appear in the new-thread menu — [Zed docs: External agents](https://zed.dev/docs/ai/external-agents.md) (via search summary)
- Zed theming: themes come from the extension store; `theme_overrides` in settings.json (keyed by theme name) tweaks individual attributes; a Theme Builder exports custom themes as JSON; theme files follow a published JSON schema; light/dark is set under `theme` with `mode: "system"`; icon themes work the same way — [Zed docs: Themes](https://zed.dev/docs/themes.md); [Zed: theme extensions](https://zed.dev/docs/preview/extensions/themes.html); [Zed docs commit #41761](https://git.secluded.site/zed/commit/12fe12b5acfaabfd6d93912f82408b026708ad65)
- Agent panel typography: `agent_ui_font_size` (falls back to the UI font size), `agent_buffer_font_size`, and in newer/preview docs `agent_ui_font_family` / `agent_buffer_font_family` — [Zed docs: Visual customization](https://zed.dev/docs/visual-customization); [commit #36306](https://git.secluded.site/zed/commit/7b3fe0a474f5ead24fb9da976dfde745cc6ba936); [commit #38726](https://git.secluded.site/zed/commit/3cf6fa8f61a5b99bc02276564658534e57e67113)

**Obsidian**
- "Agent Client" (RAIT-09) brings ACP agents (Claude Code, Codex, Gemini CLI) into an Obsidian side panel, with @note mentions, session history/resume/fork and Markdown export. Zed lists it as an ACP editor. It ships its own `styles.css` — [Agent Client README](https://cdn.jsdelivr.net/gh/rait-09/obsidian-agent-client@master/README.md); [Zed ACP: Obsidian](https://zed.dev/acp/editor/obsidian); [Obsidian community listing](https://community.obsidian.md/plugins/agent-client)

**AionUi**
- AionUi is a free, open-source (Apache-2.0), local Electron GUI with ACP support (React 19, UnoCSS, Arco Design) — [Zed ACP: AionUi](https://zed.dev/acp/editor/aionui); [everydev.ai](https://www.everydev.ai/tools/aionui); [openapps.pro](https://openapps.pro/apps/aionui)
- Custom CSS injection via Settings → Display, stored under a `customCss` key and applied globally to the renderer. The source is an auto-generated third-party guide, so it needs verification — [instagit AionUi CSS guide](https://instagit.com/iofficeai/aionui/aionui-customize-ui-user-css-injection/)

**VS Code**
- VS Code exposes theme colours to webviews as `--vscode-*` CSS variables, and `workbench.colorCustomizations` overrides UI colours. Whether a chat webview follows them depends on the extension's own CSS — [VS Code theme color reference](https://code.visualstudio.com/api/references/theme-color); [VS Code themes docs](https://code.visualstudio.com/docs/configure/themes.md)
- Reported failures: Claude Code's VS Code chat panel code blocks ignore theme tokens (hardcoded CSS plus an undefined variable), and in Cursor extension webviews don't receive `--vscode-*` variables at all — [claudeissues #45841](https://claudeissues.com/issue/45841-vscode-extension-chat-panel-inline-code-and-code-blocks-have-no-background-ignor); [Cursor forum](https://forum.cursor.com/t/extension-webviews-dont-receive-vscode-theme-css-variables-themed-extension-ui-breaks-e-g-claude-code-panel/165601)

**pi-native GUIs and wrappers**
- **pi-gui:** an Electron shell around `@earendil-works/pi-coding-agent`, in beta for macOS arm64 and Linux AppImage — [jwangkun/pi-gui](https://github.com/jwangkun/pi-gui); [sourcepulse pi-gui](https://www.sourcepulse.org/projects/32739787)
- **Pi Desktop:** Tauri v2 + Lit web components, for macOS/Windows/Linux — [agentconn Pi Desktop](https://agentconn.com/agents/pi-desktop)
- **piCode:** an installable desktop GUI that talks to pi over RPC — [Davidcreador/pi-code](https://github.com/Davidcreador/pi-code)
- **OpenPi:** Electron + SolidJS UI for pi's session tree and extensions. There are also Electron/Tauri wrappers of pi-web, including a Windows client — [tomevault OpenPi](https://tomevault.io/tome/heyhuynhgiabuu/openpi); [GitHub topic pi-web](https://github.com/topics/pi-web); [dev.to desktop client write-up](https://dev.to/timexingxin/building-a-desktop-client-for-an-ai-coding-agent-147n)
- The official pi-web-ui runs the agent in the browser, so it can only call LLM APIs (no filesystem/shell/extensions). A community "Pi Web UI" runs the pi SDK on a Node server with a browser front end over WebSocket, giving it the full toolset — [sleepingrobots: Pi Web UI](https://sleepingrobots.com/dreams/pi-web-ui)
- pi itself has a theme resource type for its TUI and installable packages bundling themes (e.g. one package with 11 themes including Catppuccin, Dracula, Nord, Tokyo Night), installed with e.g. `pi install git:github.com/w-winter/dot314`. Extensions can reach the TUI. Packages execute code, so review them before installing — [dot314 wiki](https://github.com/w-winter/dot314/wiki); [pasqualepillitteri.it](https://pasqualepillitteri.it/es/news/5651/pi-coding-agent-lo-que-no-construyeron); [urandom.io deep dive](https://urandom.io/blog/2026-03-07-pi-dev-deep-dive)

### Inferences
- Ranking by **depth** of visual control: self-built/web wrapper (full HTML/CSS) > AionUi (global custom CSS) ≈ Obsidian (CSS snippets, likely workable since plugin UIs are DOM, unverified) > Zed (structured theme JSON + fonts, no CSS) > VS Code (theme colours that chat webviews may ignore) > Claude Code mods (widgets with theme keys).
- Ranking by **reliability/no-terminal ease**: Zed (GUI registry install, documented theming) is likely the most reliable. The community pi desktop apps are betas with unknown maintenance.
- In every ACP host, the host draws the chat UI. pi's own TUI themes and extensions UI do not carry over into Zed/Obsidian/AionUi.

### Gaps
- Unconfirmed whether Zed's `theme_overrides` reach every Agent Panel element for external agents.
- Unconfirmed whether Obsidian CSS snippets can target the Agent Client panel, and whether it supports pi via pi-acp (it lists Claude Code, Codex, Gemini).
- No maintenance, star or release data gathered for pi-gui, Pi Desktop, piCode or OpenPi. Whether any offers a theme picker or custom CSS is unknown.
- Official pi-web-ui framework is reported inconsistently: Lit + Tailwind per [lzw.me pi-book](https://lzw.me/docs/pi-book/ch27-web-ui.html), React with a `theme: 'light'|'dark'` ChatPanel prop per [mintlify.wiki](https://mintlify.wiki/badlogic/pi-mono/web-ui/overview). Not resolved.

## 3. Is there a no-terminal install path for pi, and how viable is "build your own small web UI on pi's RPC/SDK" for a non-programmer using AI?

### Takeaway
I found no truly GUI-only installer for pi. Every documented route is one command: a PowerShell one-liner, or Node.js followed by `npm install -g`. Some community desktop apps (pi-gui, Pi Desktop, piCode) may bundle or detect pi, but that is unverified. A custom web UI is technically straightforward because pi exposes a documented JSON-lines RPC mode and an SDK (`AgentSession`), and prior art exists (Pi Web UI, pi-web wrappers). For a non-programmer it is feasible with an AI writing the code, but they would still need to run a local Node server and manage updates and security. Forking an existing pi web UI and restyling its CSS is the lower-risk version of this path.

### Cited Findings
- Windows one-liner: `powershell -c "irm https://pi.dev/install.ps1 | iex"`. There is also a pi.dev/install.sh script for macOS/Linux — [codeagentswarm Windows guide](https://www.codeagentswarm.com/en/guides/pi-coding-agent-on-windows); [pi.dev/install.sh](https://pi.dev/install.sh)
- npm route: install Node (e.g. `winget install OpenJS.NodeJS.LTS` or the nodejs.org installer), then `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`, and check with `pi --version`. Node version requirements conflict (22.19.0+ vs 20.6.0+) — [codeagentswarm](https://www.codeagentswarm.com/en/guides/pi-coding-agent-on-windows); [pi docs on jsDelivr v0.81.1](https://cdn.jsdelivr.net/npm/@earendil-works/pi-coding-agent@0.81.1/docs/index.md); [implicator.ai](https://www.implicator.ai/how-to-install-pi-coding-agent-and-set-up-your-first-project/); [kanaries](https://docs.kanaries.net/topics/AICoding/pi-coding-agent-how-to-use)
- The package name changed or differs across sources: `@mariozechner/pi-coding-agent` vs `@earendil-works/pi-coding-agent` — [urandom.io](https://urandom.io/blog/2026-03-07-pi-dev-deep-dive); [pidocs RPC](https://pidocs.seepine.com/en/rpc)
- pi has four modes: interactive TUI, print/JSON, RPC and SDK. RPC (`pi --mode rpc`) is a headless JSON protocol over stdin/stdout, one JSON command per line, intended for embedding in IDEs and custom UIs. For Node/TS apps the docs recommend using `AgentSession` directly rather than spawning a subprocess — [pidocs RPC](https://pidocs.seepine.com/en/rpc); [urandom.io](https://urandom.io/blog/2026-03-07-pi-dev-deep-dive)
- Prior art for the custom-UI path: the community Pi Web UI (Node server running the pi SDK, browser over WebSocket), a pi-web topic with Electron/Tauri wrappers, and piCode over RPC — [sleepingrobots](https://sleepingrobots.com/dreams/pi-web-ui); [GitHub topic pi-web](https://github.com/topics/pi-web); [piCode](https://github.com/Davidcreador/pi-code)
- Docker Desktop and VS Code tasks as no-terminal launchers: I found no pi-specific sources.

### Inferences
- Minimal-terminal path: run the single installer command once (or use a community desktop app if it bundles pi). Afterwards, launch via Zed's registry (a GUI action) or a desktop wrapper.
- For a self-built UI, an AI can plausibly generate a small Node + HTML app that spawns `pi --mode rpc`, streams events to a browser and renders them with fully custom CSS. This is the only option with unlimited visual control. The risks: a local server with shell access (security), breakage when pi's RPC changes (versioning), and debugging without programming skills. Restyling an existing open-source pi web UI is lower effort and lower risk than writing one from scratch.
- A VS Code task or a double-clickable script (`.bat`/`.command`) could hide the terminal for daily launches. This is standard practice, but I found no pi-specific guide.

### Gaps
- Unverified whether any pi desktop wrapper bundles Node/pi so that no install command is needed.
- No sources on running pi via Docker Desktop's GUI.
- RPC protocol details (event types, stability guarantees) were not read in full because fetch was blocked.
