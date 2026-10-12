# skill-pulse

A live **Pulse** pane for Claude Code. It shows what Claude is doing while it works, including which skills and tools it uses, plus a plan-first workflow where Claude waits for your approval before it executes.

```
 ▄▄    ▄▄      ◉ PULSE  ⠹ working  ◷ 12m  ↻ 7 turns  $0.42
 ████████      1: Overview  2: Tools  3: Timeline  4: ⚙
 ▀▀▀▀▀▀▀▀
 owl moods     CONTEXT  ████████████░░░░░░░░  43%  86k / 200k
               TOKENS   in 312k out 18k cache 91% hit
               ACTIVITY ▁▁▂▅▇█▃▁▁▂▃▅  42 calls / 8m
```

## Install

In Claude Code, run:

```
/plugin install skill-pulse --marketplace eunille/Claude-mod
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). The pane opens by itself on a wide terminal; type `/pulse` to open it on a narrower one.

## What it shows

- **Header bar:** idle or working, uptime, turns and session cost.
- **Owl:** a pixel-art owl whose face follows Claude. It glances around while working, gets sleepy when idle, looks up when a plan is waiting for you, shows red eyes on an error, and smiles when a plan finishes.
- **Gauges:** context window, 5h and 7d rate limits, tokens and cache hit rate, and an activity sparkline that warms as Claude gets busier.
- **Running now:** tool calls and subagents in progress, with elapsed time.
- **Skills:** which skills loaded, how often and when, with all-time counts across sessions.
- **Tools:** calls, errors, and average and slowest time per tool.
- **Subagents, hot files, insights and a timeline** of everything that happened.
- **Alerts:** a toast when the same tool repeats with the same input (a likely loop), and when context passes 80% and 90%.

## Plan-first workflow

For multi-step tasks, Claude proposes a phased plan and waits for you before it changes anything:

1. Claude analyzes the task and proposes 3 to 7 phases. They appear in the **PLAN** section with a stepper bar.
2. File edits are blocked until you approve. Reply `yes` (or `ok`, `go`, `good`, `lgtm`), or press **a** in the pane.
3. Claude runs every phase straight through, and the pane shows each phase's time and the new tokens it used.

Questions and one-line edits skip the plan step. You can turn the whole workflow off in ⚙ Settings.

## Settings

Open the **⚙** tab (press `4`, or click it):

| Row | Choices |
|---|---|
| Theme | auto · mocha · latte · terminal |
| Owl | night · barn · snowy · lilac · off |
| Style | powerline · rounded · plain |
| Plan workflow | on · off |
| Data | reset counters |

Press `o` beside the owl to cycle its colours. Your choices are kept across sessions.

Commands do the same: `/pulse`, `/pulse report`, `/pulse reset`, `/pulse style <powerline|rounded|plain>`, `/pulse owl <night|barn|snowy|lilac|off>`.

## What installs, and what doesn't

**Included in the one install line:** the whole Pulse pane, the owl in all four colourways, the Settings tab, the plan workflow, and the Catppuccin theme. With nothing else installed, the pane draws in Catppuccin Mocha. Switch to Latte or your terminal's own colours under ⚙ Settings → THEME.

**Optional extras, installed separately:**

- **The skins mod**, for Catppuccin across the rest of Claude Code (tool rows, code, tables), not just this pane. With THEME on `auto`, the pane then follows your `/skin`, including Latte on light backgrounds.
  ```
  /plugin install skins --marketplace hellosverre/claude-skins
  /skin catppuccin
  ```
- **A Nerd Font** (for example JetBrainsMono Nerd Font from [nerdfonts.com](https://www.nerdfonts.com)), set as your terminal's font, for the powerline arrows. Without one, choose STYLE `plain`.
- **A status line** at the bottom of the screen is your own Claude Code setting (`/statusline`). This plugin doesn't change it.

A plugin can't install fonts or edit your settings, and making skins a required dependency would stop this plugin loading for anyone who can't get it, so these stay optional.

## Requirements

- **Claude Code** with function-hook mods (the plugin API this uses is early access; run `claude update` if the pane doesn't appear).
- **A truecolor terminal** for the owl and colours (VS Code, Windows Terminal, iTerm2, kitty, Ghostty, WezTerm).

## Privacy

Everything stays on your machine. The pane reads Claude Code's own events, stores its counters in Claude Code's local plugin storage, and makes no network calls.

## Uninstall

```
/plugin uninstall skill-pulse
```

## License

MIT
