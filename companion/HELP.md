# LivePlay

Controls LivePlay audio playout software over its REST + WebSocket external-control API.

## Requirements

- LivePlay server **v2.5.0 or later**. An older server is reported in the connection status and not used.
- Companion **v5.0 or later**.

## Configuration

| Setting              | Description                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Server IP / hostname | The machine running the LivePlay server.                                                   |
| Port                 | The LivePlay REST/WebSocket port. Default `4480`.                                          |
| API token            | Only needed when LivePlay requires a login. Paste an API token (starts with `lpk1_`) here. |

### Authentication

LivePlay can optionally require a login. When it does, have an administrator issue an **API token** from LivePlay's Users settings and paste it into **API token**. Use a token, not a user account: tokens don't expire, and revoking one only disconnects Companion. If the token is missing, wrong or revoked, the connection status says so.

When LivePlay's login is off, its API is open to anyone on the network — only run it that way on a trusted network.

## Addressing items: UUID vs index path

Most item-level actions take the item's **UUID** from the LivePlay project. UUIDs are stable across playlist edits, so prefer them for fixed buttons.

Actions that take an **index path** use comma-separated, 0-based child indices descending into groups — `1,11` means the 2nd top-level item's 12th child, matching what the LivePlay client shows. Index paths shift when the playlist is edited; they suit "play position 1"-style workflows.

Cart slots are numbered **1–64** here, matching the LivePlay UI. The cart wall itself has 16 slots, and those get ready-made presets and variables.

## Running a show from Companion

The module mirrors LivePlay's own operator state, so a Stream Deck can drive a whole show without touching the screen:

1. **Select ▲ / ▼** move the selection in the LivePlay playlist itself — the highlight moves on screen, and the selected item's name and color appear on the surface.
2. **Set As Next** arms the selected item for GO.
3. **GO** fires it. The GO button carries the armed item's own color, so you can see what is about to go to air before you press it.
4. The **now-playing** button shows the most recently triggered cue in its color, counting down, flashing yellow at 30 s, orange at 10 s and red at 5 s — the same thresholds and blink rates as the on-screen cue card.

Selection and Show Mode are held by the **server**, not by each client, so Companion, a touch tablet and the operator's laptop always agree.

## Actions

**Transport**

- **GO** — plays the armed Up Next item, or the target derived from the playing item's end behavior (same as LivePlay's GO button).
- **Play / Stop / Pause / Resume / Toggle pause item** — by UUID. Stop takes an optional fade in ms; blank uses the cue's own Stop fade.
- **Pause / resume on-air items** — one button: resumes everything paused, otherwise pauses everything sounding.
- **Play item by index path**
- **Seek item** — jump to a position in seconds.
- **Stop all** — with an optional fade in ms (blank uses the project's Stop All fade).
- **Panic** — instant stop all.
- **Trigger cart slot** — slots 1–64.

**Selection & Show Mode**

- **Select next / previous item** — walks the flattened playlist (groups, then their children) and stops at the ends rather than wrapping.
- **Select item by UUID / by index path**
- **Arm selected as Up Next**
- **Play selected item**
- **Preview selected item**
- **Show Mode** — toggle / on / off. Applies to every connected LivePlay client.

**Master & project**

- **Master gain: set / adjust** — absolute dB or relative step (applied server-side, race-free).
- **Master limiter** — toggle / on / off.
- **Arm Up Next** — arm an item by UUID (blank clears the override).
- **Preview item / Stop preview** — pre-listen without going to air.
- **Load / Close project** — the path is resolved on the server machine.

**Mixer**

- **Bus fader: set / adjust** — absolute level, or a ± step from where the fader sits.
- **Bus mute** / **Bus PFL** — toggle / on / off. PFL listens to a bus through the Preview bus.
- **Clear all PFL**
- **Preview mono audition** — sums the Preview bus to mono to check for phase problems.

Every bus picker lists the buses in the open show, plus **Master** and **Preview** entries that follow whichever bus holds that role. PFL and Preview mono are session-only and are not saved in the show.

## Feedbacks

**Boolean** (apply a style when true)

- **Connected to LivePlay**, **Project loaded**
- **Item is playing** (sounding) / **Item is paused**
- **Anything is playing**
- **Cart slot is playing**
- **Limiter enabled** / **Limiter engaged** (actively reducing gain)
- **Preview active**
- **Show Mode is on**
- **Item is selected** / **Item is armed as Up Next**
- **Bus is muted** / **Bus PFL is on** / **Preview mono audition is on**

**Color mirrors** (paint the button from the item's own color)

LivePlay operators read cues by color first and name second, so these take the color authored in the project and put it on the button, choosing black or white text for whatever color that turns out to be.

- **Up Next item color** — for GO buttons.
- **Selected item color** — for the arm / play-selected buttons.
- **Playing item color (with end-of-cue flash)** — the most recently triggered on-air cue. With the flash enabled it cross-fades to yellow / orange / red at 30 s / 10 s / 5 s remaining, blinking at 2 s / 1 s / 0.5 s to match the client. Paused cues do not flash.
- **Cart slot color** — the loaded cue's color, dimmed while idle and full while firing.
- **Item color by UUID** — same treatment for any specific item.
- **Cue button** — a whole cue button from one UUID _or_ index path (variables allowed): the cue's name as text, its color dimmed while idle, and a playing / paused fill (green / orange by default).

Each takes a **Background when empty** color used when there is no item to draw from.

**Cue values** (for gauges; see _Progress bars_ below)

- **Cue progress**, **Cue color**, **Cue text color**, **Cue name** — value feedbacks that report one cue's progress (`0`–`255`), color and legible text color as numbers, and its name. They take a UUID, an index path, or a variable such as `$(local:index)`. Point a button **local variable** at one and use `$(local:…)` in a gauge.

## Variables

| Variable                                             | Description                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `project_name`, `item_count`                         | Open project info                                 |
| `current_item`, `current_item_uuid`, `current_color` | Most recently triggered on-air item               |
| `current_state`                                      | Its transport state, in LivePlay's language       |
| `elapsed`, `remaining`, `duration`                   | Current item times (`mm:ss`, updated 4 Hz)        |
| `warn_level`                                         | `yellow` / `orange` / `red`, blank when clear     |
| `next_name`, `next_uuid`, `next_color`, `next_index` | Effective Up Next (armed override or derived)     |
| `next_source`                                        | `override` or `auto`                              |
| `selected_*`                                         | Name, UUID, color and index of the selected item  |
| `show_mode`, `locale`                                | Shared operator UI state                          |
| `master_gain`, `limiter`                             | Master section state                              |
| `lufs_m`, `lufs_s`                                   | Master K-weighted momentary/short-term loudness   |
| `playing_count`, `server_version`                    | Misc status                                       |
| `cart_<n>_name`, `cart_<n>_uuid`, `cart_<n>_color`   | Cart slots 1–16                                   |
| `<x>_progress`                                       | Playback progress, `0` (start) to `255` (end)     |
| `<x>_color_rgb`                                      | Item color as a number, for gauge color stops     |
| `<x>_text_rgb`                                       | Black or white, whichever reads over that color   |
| `current_flash_rgb`, `current_flash_text_rgb`        | Current item color with the end-of-cue flash      |
| `bus_<id>_name`, `_gain`, `_mute`, `_pfl`            | Every mixer bus in the open show                  |
| `preview_mono`                                       | Preview mono audition (On/Off)                    |
| `advance_in`                                         | Seconds until a waiting cue fires (blank if none) |
| `item_name_<uuid>`                                   | Name of a specific item, by UUID                  |
| `item_name_at_<index>`                               | Name of a specific item, by index path            |

For the gauge variables, `<x>` is `cart_<n>` (slots 1–16), `current` (Now Playing), `next` (Up Next) or `selected`. Progress is `0` whenever the item is not on air.

A pair of name variables is created for every item in the open project, so any button can show an item's name whether you address it by UUID or by position. For example `$(liveplay:item_name_at_0)` is the name of the first top-level item, `$(liveplay:item_name_at_1_11)` the name at index path `1,11`, and `$(liveplay:item_name_e8eaa079-...)` the name of that specific item wherever it moves. These update automatically when the playlist is edited. (Cart-only items get a UUID variable but no index variable.)

## Trigger Cue presets

The **Trigger Cue** preset section lists one button per cue in the open project, grouped by top-level LivePlay group (`2,35` appears under _Group 2_). Each button fires its cue by UUID and shows the cue's live name over a progress bar (see below). The list refreshes as the playlist is edited; renaming a cue relabels buttons already on a page too.

The **Manual** group has two buttons you point at a cue yourself: _by index path_ and _by UUID_. Each keeps its target in a button **local variable** (`index` or `uuid`) that both the press action and the button's cue values read. Set that one value (e.g. `2,35`) and the button fires that cue, shows its name, color and progress. An index path that points at nothing shows the path itself on the button. An index button follows whatever currently sits at that position, so it retargets when the playlist is reordered.

## Progress bars

Every preset that fires or shows a cue — the cart pads, **GO**, **Now playing**, **Play selected** and every **Trigger Cue** button — is a Companion 5 layered button drawn the same way: the whole button is a gauge in the cue's own color, dimmed while the cue waits, with a full-color bar sweeping left to right as it plays, under the name. GO shows the Up Next item, so its bar stays empty until that item is itself on air. Now playing also flashes yellow / orange / red near the end of the cue, blended into the bar's color.

To build one yourself, add a **gauge** element (horizontal, full size) with:

- **Value** `$(liveplay:cart_<n>_progress)`, **Minimum** `0`, **Maximum** `255`
- one **color stop** at `0`, color set as an expression to `$(liveplay:cart_<n>_color_rgb)`
- **Track style** dimmed, amount `60`

then a **text** element on top with color `$(liveplay:cart_<n>_text_rgb)`. Swap `cart_<n>` for `current`, `next` or `selected`, or use the **Cue** value feedbacks through local variables for any other cue. Use the `_color_rgb` variables for gauges, not `_color`: gauge colors must be numbers, and Companion 5.0.0 draws a `#RRGGBB` text value as black.

A cue that is a group shows no progress: LivePlay reports playback per audio cue, not per group.

## Button language

Preset button labels are written in whatever language LivePlay is currently displaying. The strings come from LivePlay's own translation files, so a Companion button and the on-screen control it mirrors are worded identically. Changing the language in LivePlay re-publishes the presets in the new language.

`GO`, `PANIC` and `LIMITER` stay in English deliberately — they are the terms operators look for, and they fit a button in a way the translated phrases do not.

Buttons you have already placed on a page keep the text you gave them; only the presets in the sidebar are relabelled. Re-drag a preset to pick up the new wording.

To regenerate the label table after LivePlay adds a locale:

```
python tools/gen-locale.py <path-to>/liveplay/client/locales
```

## Notes

- Playing an item may stop others — LivePlay's default ducking mode is _stop-all_. That is LivePlay behavior, not a module bug.
- Right after loading a project, cues may still be loading; play requests during that window fail with _item not loaded into engine_ and are logged as warnings.
- "Currently playing" means the **most recently triggered** cue, not the topmost one in the playlist. With a bed under a stinger, the button follows what you fired last.
