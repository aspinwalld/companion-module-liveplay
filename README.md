# companion-module-liveplay

Control **LivePlay** audio playout software from a Stream Deck (or any other surface) using [Bitfocus Companion](https://bitfocus.io/companion).

## Requirements

- **LivePlay server v2.5.0 or later.** Older servers are refused with a clear status message.
- **Bitfocus Companion v5.0 or later.** The module is built on module API 2.1, which Companion 4.x will not load.
- Network access from the Companion machine to the LivePlay server (default port `4480`).

### Authentication

LivePlay 2.5.0 can optionally require a login. If it does, have an administrator issue an **API token** (it starts with `lpk1_`) from LivePlay's Users settings, and paste it into the connection's **API token** field. Use an API token rather than a user account: it does not expire, and revoking it affects only Companion. It is stored in Companion's secrets store, not in the plain config.

> If login is **off**, the LivePlay API is open to anyone on the network who can reach the port — only use it on a trusted network.

## Status

This module is **not yet part of the official Companion module registry** — it is still being tested in the field. Once it has had more real-world testing it will be submitted through the formal [Bitfocus module PR process](https://github.com/bitfocus/companion-module-requests). Until then, install it manually from a release (below).

> **Pre-release (< 1.0.0).** The LivePlay external-control API is under active, rapid development. Any build before 1.0.0 may change actions, feedbacks, variables, or required server version in ways that are **not backward compatible** with earlier LivePlay or Companion module versions. Pin a specific release and check its notes before upgrading either side.

## Installation

Each [release](https://github.com/aspinwalld/companion-module-liveplay/releases) includes a ready-to-import module package (`liveplay-x.y.z.tgz`).

1. Download the `.tgz` from the latest release.
2. Open the Companion web UI (default `http://localhost:8000`), go to the **Modules** tab, click **Import custom module**, and select the downloaded `.tgz`.
3. Add a new connection and search for **LivePlay**.
4. Enter the IP/hostname of the machine running LivePlay and the port (default `4480`), plus an API token if the server requires a login.
5. Drag presets from the **Presets** tab onto buttons, or build your own from the actions below.

## What you get

### Actions

| Action                                           | Notes                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| GO                                               | Plays the armed Up Next item, or the item derived from the playing item's end behavior — identical to LivePlay's GO button |
| Play / Stop / Pause / Resume / Toggle pause item | Addressed by item UUID; Stop takes an optional fade (blank uses the cue's own Stop fade)                                   |
| Play item by index path                          | e.g. `0` or `1,11` (0-based, matches the LivePlay UI)                                                                      |
| Seek item                                        | Jump to a position in seconds                                                                                              |
| Stop all                                         | Optional fade in ms; blank uses the project default                                                                        |
| Panic                                            | Instant stop-all                                                                                                           |
| Trigger cart slot                                | Slots 1–64                                                                                                                 |
| Master gain set / adjust                         | Absolute dB, or a ± step applied server-side (race-free)                                                                   |
| Master limiter                                   | Toggle / on / off                                                                                                          |
| Arm Up Next                                      | Blank clears the override                                                                                                  |
| Preview / stop preview                           | Pre-listen without going to air                                                                                            |
| Load / close project                             | Path is resolved on the server machine                                                                                     |
| Bus fader set / adjust, bus mute, bus PFL        | Any mixer bus, or "Master" / "Preview", which follow whichever bus holds that role                                         |
| Clear all PFL · Preview mono audition            | Session-only; not saved in the show                                                                                        |

### Feedbacks

Connection OK · project loaded · item playing · item paused · anything playing · cart slot active · limiter enabled · limiter engaged (actively reducing) · preview active · bus muted · bus PFL · Preview mono. Plus color mirrors that paint a button in an item's own LivePlay color.

### Variables

`project_name`, `current_item`, `elapsed`, `remaining`, `duration`, `next_name`, `master_gain`, `limiter`, `lufs_m`, `lufs_s`, `playing_count`, `item_count`, `server_version` and more — see the connection's Variables tab.

New in 0.4.0:

- `<x>_progress` — how far through the cue is, as a whole number from `0` (start) to `255` (end). Built to drive a Companion 5 gauge. `<x>` is `cart_<n>`, `current`, `next` or `selected`.
- `<x>_color_rgb` — the item color as a packed RGB **number**, and `<x>_text_rgb` — black or white, whichever reads over it. Gauge colors need numbers: the existing `*_color` variables are `#RRGGBB` text, which Companion 5.0.0 draws as black on a gauge. `current_flash_rgb` / `current_flash_text_rgb` add the end-of-cue warning flash.
- For any other cue, the **Cue progress / color / text color / name** value feedbacks give the same values for a UUID or index path, through button local variables.
- `bus_<id>_name`, `bus_<id>_gain`, `bus_<id>_mute`, `bus_<id>_pfl` for every bus in the open show.
- `preview_mono`, and `advance_in` — seconds until a cue that is waiting before the next one fires (blank when nothing is waiting).

Every item in the open project also gets a pair of **name variables** so buttons can show an item's name addressed either way: `$(liveplay:item_name_<uuid>)` (stable across playlist edits) and `$(liveplay:item_name_at_<index>)` (e.g. `item_name_at_0`, or `item_name_at_1_11` for index path `1,11`). These update automatically when the playlist changes.

### Presets

Ready-made buttons for GO (shows the Up Next name), a now-playing display with countdown, one Trigger Cue button per cue in the open show, stop all, panic, cart slots 1–16, bus mute and PFL for every bus, master gain ±1 dB, a limiter toggle that turns red while limiting, and a connection status tile.

Every preset that fires or shows a cue — **cart slots, GO, Now playing, Play selected and every Trigger Cue button** — uses Companion 5's layered buttons with the same progress bar: the whole button is a horizontal gauge in the cue's own color. While the cue waits, the button shows that color dimmed; as it plays, a full-color bar sweeps left to right under the name. GO follows the Up Next item; Now playing also carries the end-of-cue warning flash. To build the same thing by hand, add a gauge element with value `$(liveplay:cart_<n>_progress)`, range `0`–`255`, one color stop set to `$(liveplay:cart_<n>_color_rgb)` (as an expression), and a dimmed track at 60.

## Tips

- **Prefer UUIDs for fixed buttons.** Item UUIDs stay stable when the playlist is edited; index paths shift.
- Playing an item may stop others — LivePlay's default ducking mode is _stop-all_. That's LivePlay behavior, not a module bug.
- Right after a project loads, cues may still be loading audio; plays during that window fail with _item not loaded into engine_ (logged as a warning in Companion).

## Development

```bash
corepack enable
yarn install
yarn build        # compile to dist/
yarn dev          # watch mode
yarn lint         # eslint
yarn package      # build a distributable .tgz via companion-module-build
```

## License

[MIT](LICENSE)
