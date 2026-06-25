# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step, no package manager, no dependencies. Open `index.html` directly in a browser, or serve statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no lint or test tooling — verification is manual in a browser.

## Architecture

Three cooperating files:

- **`index.html`** — DOM structure: `<canvas id="board" width="300" height="600">` (main board) and `<canvas id="next-canvas" width="120" height="120">` (next-piece preview), a side panel with `#score` / `#lines` / `#level` readouts, and a shared `#overlay` div used for both PAUSE and GAME OVER states.
- **`style.css`** — dark retro-arcade theme; overlay visibility is toggled purely via the `hidden` class.
- **`game.js`** — all game logic (~300 lines), `'use strict'`, no ES modules — everything is global scope.

### Board model (`game.js`)

`board` is a `ROWS×COLS` (20×10) 2-D array. Each cell holds `0` (empty) or an integer `1–7`. That integer is simultaneously a piece type **and** a direct index into both `COLORS` and `PIECES` (both arrays are 1-indexed; index 0 is `null`).

### Key functions

| Function | Role |
|---|---|
| `collide(shape, ox, oy)` | Single predicate for movement validity, rotation checks, ghost projection, spawn-time game-over detection, and locking. |
| `rotateCW(shape)` | Rotates a piece matrix 90° clockwise (transpose + column-reverse). |
| `tryRotate()` | Attempts rotation with wall kicks at offsets `[0, -1, 1, -2, 2]`. |
| `loop(ts)` | `requestAnimationFrame` game loop; accumulates `dropAccum`, drops piece when ≥ `dropInterval`, then calls `draw()`. |
| `lockPiece()` | `merge()` → `clearLines()` → `spawn()`. |
| `init()` | Resets all state globals and starts the loop; also the restart handler. |

### State globals

All live at module scope and are reset by `init()`: `board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `lastTime`, `dropAccum`, `dropInterval`, `animId`.

### Scoring & speed

- Line clear points: `LINE_SCORES = [0, 100, 300, 500, 800]` × current level.
- Soft drop: +1 pt/row; hard drop: +2 pts/cell fallen.
- Level up every 10 lines; `dropInterval = max(100, 1000 − (level − 1) × 90)` ms.

## Gotchas

- **Canvas size is hard-coded in `index.html`**: `<canvas id="board" width="300" height="600">`. If you change `COLS`, `ROWS`, or `BLOCK` in `game.js`, update the canvas `width`/`height` attributes to match (`COLS × BLOCK` and `ROWS × BLOCK`).
- **UI text is in Spanish** (`'PAUSA'`, `'GAME OVER'`, `'Puntuación:'`). Keep new user-facing strings consistent.
