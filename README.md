# Jev for Alethe

Jev is the voice plugin for [Alethe](https://github.com/Kc1t/alethe-agents). It adds:

- **Voice commands.** Press `Ctrl+Shift+Space`, say what the workspace should do ("open two Claude
  agents in Portfolio and fix the header"), and Jev opens, focuses, stops or briefs your agents.
  Routing runs on TypeSafe Jev through OpenRouter's decisions API; destructive or ambiguous plans
  wait for confirmation.
- **Dictation.** Press `Ctrl+E` (toggle or hold) to type speech into the focused terminal, with an
  on-device model or an audio model on OpenRouter.
- **History.** A Jev tab in the right sidebar lists every command of the session with what was heard,
  the plan, its cost and what ran.
- **Settings** in Preferences → Integrations: whether the OpenRouter key is set, voice input,
  dictation mode, microphone, transcriber and which downloaded speech model to use.

Speech capture and recognition run in Alethe itself; the plugin drives them through `context.voice`.
The OpenRouter key and the speech models live in Alethe's Preferences → Voice, which Jev opens from
its settings.

It is also the reference for writing an **external** Alethe plugin with a real toolchain: TypeScript,
React and CSS Modules in its own repository, built by Vite into one script that binds to
`window.alethe`, then shipped as a release zip that Alethe installs from its catalogue after checking
the sha256. The plugin contract is documented in Alethe's
[`docs/PLUGINS.md`](https://github.com/Kc1t/alethe-agents/blob/main/docs/PLUGINS.md).

## Install

Jev 1.1 needs plugin API 3 with `context.voice` (typed voice API). An API 3 build of Alethe without
`context.voice` refuses to activate it with an explicit error; Jev 1.0 needs plugin API 2.

Set the OpenRouter key in Preferences → Voice. Voice commands and OpenRouter dictation use that key;
Jev never sees it. Download or remove on-device speech models in the same place.

From Alethe: Preferences → Plugins → catalogue → **Jev** → Install, then turn it on. The trust dialog
lists what it asks for:

| Capability          | Why                                                          |
| ------------------- | ------------------------------------------------------------ |
| `ui.overlay`        | the voice bar and the dictation indicator                    |
| `ui.settings`       | its sections in Preferences → Integrations                   |
| `ui.sidebarTab`     | the history tab                                              |
| `workspace.read`    | the projects, terminals and agents a command can refer to    |
| `workspace.control` | opening, focusing and stopping terminals                     |
| `terminal.write`    | handing a prompt to a running agent and typing dictated text |
| `voice.listen`      | microphone capture, model status and transcription           |
| `invoke:jev_decide` | sending the transcript and workspace summary to OpenRouter   |

Reading whether a key is set and opening Preferences → Voice need no capability.

Voice settings from the versions of Alethe that had Jev built in are picked up the first time the
plugin runs. A decisions key that Jev 1.0 stored is left in its settings file untouched; Alethe moves
it into the OS keychain and blanks it.

## Privacy

Spoken audio stays on the machine with the on-device transcriber. With OpenRouter transcription the
recording is sent to OpenRouter. Every voice command sends the transcript plus the names and folders
of open projects and terminals to OpenRouter to pick an action. The OpenRouter key is kept by Alethe
in the OS keychain; Jev only learns whether one is set.

## Develop

```bash
npm install
npm test          # vitest
npm run build     # tsc + vite → dist/ (plugin.json, main.js, styles.css)
npm run package   # dist/ → alethe-jev-<version>.zip and its sha256
```

To try a build, open Preferences → Plugins → **Import plugin** in Alethe and pick `dist/`. Re-import
after each build; the plugin keeps its settings.

The bundle is a single IIFE. React is not bundled: `react` and `react/jsx-runtime` resolve to
`window.alethe.react` and `window.alethe.jsxRuntime`, so hooks run on the host's React. Styles are CSS
Modules prefixed `jev_` and use Alethe's theme tokens only.

## Release

1. Bump `version` in `package.json` and `plugin.json`.
2. `npm run package`.
3. Attach `alethe-jev-<version>.zip` to a GitHub release.
4. Update the `alethe.jev` entry in Alethe's `plugins.json` with the version, the release asset URL
   and the printed sha256. The archive is reproducible, so rebuilding the same source gives the same
   hash.

## License

AGPL-3.0, the same as Alethe.
