# Premier League Scoreboard — plain-HTML example

A soccer **Match Scoreboard Desk** built as a single `index.html` with **no bundler, no Vite, no framework**. It runs against the airZ Studio SDK via the **global build** (`window.Airz`) directly in the browser.

## Overview

This control desk drives live Premier League style broadcast graphics, with full two-way synchronization, match clock stopwatch engine, stoppage/extra time popup, match statistics (possession and shots), and graphic in/out cue triggers.

### What it does:

- **Teams & Match Score**:
  - Home Team code + Away Team code (`HOME TEAM`, `AWAY TEAM`).
  - Home Score + Away Score (`HOME SCORE`, `AWAY SCORE`) with quick `-` / `+` steppers.
  - Team colors: Left banner color (`score1LeftColor`), Away right banner color (`score2RightColor`), and score badge backgrounds (`score1ScorBackColor`, `score2ScorBackColor`).
  - Quick match presets: `CHE 0 - 0 HUL`, `ARS 2 - 1 TOT`, `MCI 1 - 1 LIV`, `MUN 3 - 2 NEW`.
  - Quick `⇄ Swap Teams` action.
- **Match Clock / Timer Engine**:
  - Live digital stopwatch with `start`, `pause`, `continue`, `resetTime` actions.
  - Emits `timeDisplay` (e.g., `00:00`), `startTime` (`00:00`), `targetEndTime` (`45:00`), and `direction` (`1` = count up, `-1` = count down).
  - Half presets: 1st Half (`00:00 → 45:00`), 2nd Half (`45:00 → 90:00`), Extra Time 1 (`90:00 → 105:00`), Extra Time 2 (`105:00 → 120:00`).
  - Stoppage / Extra time chips: `+0'`, `+1'`, `+2'`, `+3'`, `+4'`, `+5'` (`extraTime`).
- **Match Statistics**:
  - Possession (`home_possession`, `away_possession`, and `home_possesion` alias) with interactive linked slider and auto-balance.
  - Shots (`home_shot`, `away_shot`) with quick stepper buttons.
- **Graphic In / Out Cue Triggers**:
  - Score Bug: `Score In` / `Score Out`
  - Timer: `Timer In` / `Timer Out`
  - Extra Time: `Extra In` / `Extra Out`
  - Match Stats: `Stats In` / `Stats Out`
  - Master broadcast triggers: `TAKE IN` / `TAKE OUT`
- **Live Broadcast Preview**:
  - **HTML Graphic**: Pixel-accurate recreation of the Premier League broadcast graphic (crowned lion emblem, team banners, timer, stoppage badge, match statistics drawer with Microsoft sponsor bar). Works 100% offline.
  - **Rive Runtime Preview**: When connected to an airZ Studio template, renders the `.riv` canvas with live view-model auto-binding and bidirectional synchronization.
- **Air Policies**:
  - `cue`: Push prepares data on the preview; commits to program on TAKE.
  - `live`: Streams changes straight to program once `ON AIR` is toggled.

---

## Databinding Property Mappings

| Rive Key | Desk Property | Type | Description |
| :--- | :--- | :--- | :--- |
| `HOME TEAM` / `HOME_TEAM` | `homeTeam` | String | Home club code (e.g. `CHE`) |
| `HOME SCORE` / `HOME_SCORE` | `homeScore` | String | Home match score (e.g. `"0"`) |
| `AWAY TEAM` / `AWAY_TEAM` | `awayTeam` | String | Away club code (e.g. `HUL`) |
| `AWAY SCORE` / `AWAY_SCORE` | `awayScore` | String | Away match score (e.g. `"0"`) |
| `score1LeftColor` | `score1LeftColor` | Color | Left team chevron color (hex) |
| `score1ScorBackColor` | `score1ScorBackColor`| Color | Home score background color |
| `score2RightColor` | `score2RightColor` | Color | Right team chevron color (hex) |
| `score2ScorBackColor` | `score2ScorBackColor`| Color | Away score background color |
| `timeDisplay` | `timeDisplay` | String | Clock readout (e.g. `"00:00"`) |
| `startTime` | `startTime` | String | Period start time (e.g. `"00:00"`) |
| `targetEndTime` | `targetEndTime` | String | Period target time (e.g. `"45:00"`) |
| `extraTime` | `extraTime` | String | Stoppage badge text (e.g. `"+3'"`) |
| `direction` | `direction` | Number | `1` (Count Up) or `-1` (Count Down) |
| `home_possession` | `homePossession` | Number | Home possession percentage |
| `away_possession` | `awayPossession` | Number | Away possession percentage |
| `home_shot` | `homeShot` | Number | Home total shots |
| `away_shot` | `awayShot` | Number | Away total shots |

### Trigger Mappings

| Trigger Name | Action |
| :--- | :--- |
| `Score In` / `Score Out` | Toggles score banner visibility |
| `Timer In` / `Timer Out` | Toggles timer box visibility |
| `Extra In` / `Extra Out` | Toggles extra time card visibility |
| `Stats In` / `Stats Out` | Toggles match statistics drawer |
| `start` | Starts the match timer |
| `pause` | Pauses the match timer |
| `continue` | Continues the match timer |
| `resetTime` | Resets the match timer to start time |
| `TAKE` / `OUT` | Master Take In / Take Out triggers |

---

## How to Run

1. Build the global SDK once if not already built:
   ```powershell
   npm run build:sdk
   ```

2. Serve the repository over HTTP:
   ```powershell
   npx serve . -l 3000
   ```
   Or double-click `run-scoreboard.cmd` at the repository root.

3. Open in your browser:
   ```
   http://localhost:3000/examples/premiere_league_scoreboard/
   ```
