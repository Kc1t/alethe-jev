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
- **Settings** in Preferences → Integrations: the decisions API key, voice input, dictation mode,
  microphone, transcriber and speech model.

Speech capture and recognition run in Alethe itself (`speech_*` commands); the plugin drives them.

It is also the reference for writing an **external** Alethe plugin with a real toolchain: TypeScript,
React and CSS Modules in its own repository, built by Vite into one script that binds to
`window.alethe`, then shipped as a release zip that Alethe installs from its catalogue after checking
the sha256. The plugin contract is documented in Alethe's
[`docs/PLUGINS.md`](https://github.com/Kc1t/alethe-agents/blob/main/docs/PLUGINS.md).

## Install

Jev needs plugin API 2. Alethe 1.7.0 and older speak API 1, so they do not list it.

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
| `invoke:speech_*`   | microphone capture, models and transcription                 |
| `invoke:jev_decide` | sending the transcript and workspace summary to OpenRouter   |
| `listen:speech*`    | speech model download progress                               |

Voice settings from the versions of Alethe that had Jev built in, including the decisions key, are
picked up the first time the plugin runs.

## Privacy

Spoken audio stays on the machine with the on-device transcriber. With OpenRouter transcription the
recording is sent to OpenRouter. Every voice command sends the transcript plus the names and folders
of open projects and terminals to OpenRouter to pick an action. The key is stored in plain text in
`plugin-data/alethe.jev.json` inside the Alethe profile and never syncs; uninstalling the plugin
deletes it.

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
