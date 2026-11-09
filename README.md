# Cubeman

A live **Cubeman** pane for Claude Code, formerly skill-pulse. It shows what Claude is doing while it works, including which skills and tools it uses, plus a plan-first workflow where Claude waits for your approval before it executes.

<img width="693" height="626" alt="image" src="https://github.com/user-attachments/assets/7ec6d31a-133e-401d-8e09-90faa13a6852" />




## Install

In Claude Code, run:

```
/plugin install cubeman --marketplace eunille/Claude-mod
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). The pane opens by itself on a wide terminal; type `/cubeman` to open it on a narrower one.

### Upgrading from skill-pulse

The plugin was renamed, so install it under its new name once:

```
/plugin marketplace update eunille-mods
/plugin uninstall skill-pulse@eunille-mods
/plugin install cubeman@eunille-mods
```

Then restart Claude Code. The command is now `/cubeman` and the plan tool is `mcp__cubeman__plan`. Your settings, plan history and all-time skill counts are kept under the plugin's name, so copy them across before the first start: in `~/.claude/plugins/store/`, copy `skill-pulse_eunille-mods-69f18ef4cc3a.json` to `cubeman_eunille-mods-f3b7ea64de3c.json`.

## What it shows

- **Header bar:** idle or working, uptime, turns and cost. Counters start over at local midnight, so uptime, turns, tokens and cost are today's; context and rate limits stay live.
- **Owl:** a pixel-art owl that acts out what Claude is doing. It bobs and flaps while working, twitches its ears when a plan is waiting for you, shakes with red eyes on an error, hops when a plan finishes, and sits still when idle, with a blink or an ear twitch now and then.
- **Cubeman (default):** the Catalyx mascot, a white pixel cube with the logo marks on its side, in its own band across the top of the pane. Switch to the owl, or turn the mascot off, in ⚙ Settings → MASCOT or with `/cubeman mascot owl|cubeman|off`. Pick how it moves under ⚙ Settings → ANIMATION or with `/cubeman animation classic|arbitrage`:
  - **classic** (default): it hops while working, looks up with a `?` when a plan waits, shakes on an error, jumps and lands in a burst of colour when a plan finishes, and dozes when idle.
  - **arbitrage**: a red bandana, parked at the right end of the band. Each prompt hands it a random gun (zapper, shotgun or blaster), and it holds fire until each wave of one to three zombie cubes (Cubeman's green, red-eyed cousins, sliding in big and small) walks up close, then shoots in bursts: the zapper, an arcade light gun, locks a red reticle on 3 then 2 and zaps each zombie into a burst of stars, a pumped 3-pellet spread from the shotgun, charged blue bolts from the blaster. While a plan waits, three guns pop up over its head and it picks the one for the task. An error flushes it red while it reloads; a finished task gets a jump with the gun spinning, two shots into the air, a wink and a smoking barrel, in confetti. Idle it stands guard; asleep, the bandana is a sleep mask. The band has a floor, a moon and stars after 7 pm by your clock, and a HUD with the wave, the kills and your best (kept across sessions). Cubeman sweats when context passes 80%, and sweats harder past 90%.

  Its sprites come from [ctx-mascot](https://github.com/eunille/ctx-mascot) (`hooks/cubeman.ts` is generated there; don't edit it here).
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
4. If files changed since the last passing test, typecheck or lint run, finishing the last phase is held once so Claude runs the checks first.

The **Plans** tab (press `3`) shows every phase with the files it changed and the state of the checks, plus your past plans, kept across sessions. A finished plan clears from the overview when you send your next prompt.

Questions and one-line edits skip the plan step; a second file edit without a plan (including shell writes such as `sed -i` or `>`) is turned back once to ask for one. You can turn the whole workflow off in ⚙ Settings.

## Settings

Open the **⚙** tab (press `5`, or click it):

| Row | Choices |
|---|---|
| Theme | auto · mocha · latte · terminal |
| Mascot | owl · cubeman · off |
| Animation | classic · arbitrage (shown while Cubeman is the mascot) |
| Owl | night · barn · snowy · lilac (shown while the owl is the mascot) |
| Style | powerline · rounded · plain |
| Plan workflow | on · off |
| Data | reset counters |

Press `o` beside the owl to cycle its colours. Your choices are kept across sessions.

Commands do the same: `/cubeman`, `/cubeman report`, `/cubeman reset`, `/cubeman style <powerline|rounded|plain>`, `/cubeman mascot <owl|cubeman|off>`, `/cubeman animation <classic|arbitrage>`, `/cubeman owl <night|barn|snowy|lilac|off>`.

## What installs, and what doesn't

**Included in the one install line:** the whole Cubeman pane, the owl in all four colourways, the Settings tab, the plan workflow, and the Catppuccin theme. With nothing else installed, the pane draws in Catppuccin Mocha. Switch to Latte or your terminal's own colours under ⚙ Settings → THEME.

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
/plugin uninstall cubeman
```

## License

MIT
