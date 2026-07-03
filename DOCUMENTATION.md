# Semagram Lua API

The complete reference for authoring a **2D semagraphic writing system** in the Semagram Studio (`/semagram`).

A semagram script is a small **Lua** program. It reads one global table — `features` (the grammar + phonology of a clause) — and calls one function — `emit(op)` — to draw. Your script runs in an isolated WASM sandbox; the app renders only the geometry you emit.

```
features  ──▶  your Lua script  ──▶  emit(op), emit(op), …  ──▶  validated → SVG
```

> **Mental model:** you don't draw pixels or set colors — you *emit shapes as data* (numbers), and the host turns them into a picture using the app's theme color. You control **geometry**, the app controls **style**.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [Execution model](#2-execution-model)
3. [Coordinates & angles](#3-coordinates--angles)
4. [`emit(op)` — the drawing API](#4-emitop--the-drawing-api)
5. [`features` — the input table](#5-features--the-input-table)
6. [Primitive helper library](#6-primitive-helper-library)
7. [The sandbox: what's available](#7-the-sandbox-whats-available)
8. [Limits & validation](#8-limits--validation)
9. [Lua gotchas for authors](#9-lua-gotchas-for-authors)
10. [Worked examples](#10-worked-examples)
11. [Errors & debugging](#11-errors--debugging)

---

## 1. Quick start

```lua
-- Draw a dot for every phoneme of the first word.
local word = features.words[1]
if word then
  for i, ph in ipairs(word.phonemes) do
    emit({ type = 'dot', cx = 40 + (i - 1) * 40, cy = 100, r = ph.isVowel and 6 or 3 })
  end
end
```

Everything else in this document is detail on the two things above: what's in `features`, and what you can `emit`.

---

## 2. Execution model

- **Language:** Lua **5.4** (via wasmoon, compiled to WebAssembly).
- **One run per clause.** Your script is executed once with the current `features`. In **Scene** mode it is executed once per clause (each with its own `features`), and the results are tiled and connected for you.
- **`emit` is the only output.** Your script's return value is ignored. Anything you don't `emit` doesn't appear.
- **Deterministic is best.** A script may be *precomputed* once and cached for public viewers, so avoid randomness (`math.random`) if you want shared renders to match what you see.
- **Isolation.** The script cannot touch the page, the network, the filesystem, or the app's data. See [§7](#7-the-sandbox-whats-available).
- **Bounded.** Runtime is capped (a few hundred ms) and the number of shapes is capped (see [§8](#8-limits--validation)). An infinite loop is terminated, not hung.

The program the sandbox actually runs is: a security prelude, then `local features = {…}`, then the [primitive helper library](#6-primitive-helper-library), then **your script**. You only write the last part.

---

## 3. Coordinates & angles

- The canvas is an **SVG viewport**. The default single-clause view is **400 wide × 200 tall**. Design within `x ∈ [0, 400]`, `y ∈ [0, 200]`. (In Scene mode the app offsets each clause and expands the view automatically — you still author in local 0–400 × 0–200.)
- **Origin is top-left. Y increases downward** (standard screen space).
- **Angles are in degrees** for the `arc` op and **in radians** for the trig you do yourself with `math.cos` / `math.sin`.

Angle directions (degrees, for `arc`):

| Degrees | Direction |
|---|---|
| `0` | right (east) |
| `90` | down (south) |
| `180` | left (west) |
| `270` | up (north) |

- **Color is not yours to set.** Strokes and fills render in the app's theme text color so semagrams match the user's theme. Emit geometry; the app themes it.

---

## 4. `emit(op)` — the drawing API

Call `emit(op)` once per shape. `op` is a Lua table whose `type` selects the shape. Unknown types are silently dropped; every numeric field is coerced to a finite number and clamped (see [§8](#8-limits--validation)).

### `arc` — a partial circle (the "ripple")

```lua
emit({ type = 'arc', cx = 100, cy = 100, r = 24, start = 180, stop = 300, sweep = 0 })
```

| Field | Type | Notes |
|---|---|---|
| `cx`, `cy` | number | centre of the circle |
| `r` | number | radius (required; 0 if omitted → nothing visible) |
| `start`, `stop` | number (deg) | start and end angle of the arc |
| `sweep` | `0` or `1` | which of the two possible arcs to draw (flips the bulge) |

### `line` — a straight stroke

```lua
emit({ type = 'line', x1 = 0, y1 = 0, x2 = 100, y2 = 50 })
```

| Field | Type |
|---|---|
| `x1`, `y1`, `x2`, `y2` | number |

### `dot` — a small filled circle

```lua
emit({ type = 'dot', cx = 50, cy = 50, r = 3 })
```

| Field | Type | Notes |
|---|---|---|
| `cx`, `cy` | number | centre |
| `r` | number | radius, **optional** — defaults to `2.5` |

### `circle` — a ring or disc

```lua
emit({ type = 'circle', cx = 200, cy = 100, r = 60, fill = false })
```

| Field | Type | Notes |
|---|---|---|
| `cx`, `cy` | number | centre |
| `r` | number | radius |
| `fill` | boolean | `true` = filled disc, `false`/omitted = stroked ring |

### `poly` — an open polyline

```lua
emit({ type = 'poly', points = { {x=10, y=10}, {x=40, y=30}, {x=70, y=10} } })
```

| Field | Type | Notes |
|---|---|---|
| `points` | array of `{x=, y=}` | **2–64** points; fewer than 2 is dropped |

### `group` — a transform anchor *(reserved)*

```lua
emit({ type = 'group', id = 'head', rotate = 90, tx = 0, ty = 0, scale = 1 })
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | ≤ 32 chars, sanitised to `A–Z a–z 0–9 _ -` |
| `rotate` | number (deg) | |
| `tx`, `ty` | number | translation |
| `scale` | number | defaults to `1` |

> **Note:** `group` currently renders **nothing on its own** — it is accepted for forward-compatibility and to record structural/metadata intent (e.g. "the head points at `tenseAngle`"). Don't rely on it for visible output in this version; draw the visible marks with the other ops.

---

## 5. `features` — the input table

`features` describes the clause to be written. All fields are read-only.

### Top level

| Field | Type | Description |
|---|---|---|
| `features.clause` | table | `{ type = 'main' \| 'subordinate', role = 'nom'\|'adv'\|'rel'\|'adj'\|nil }` |
| `features.tense` | string | one of the 8 tenses (below) |
| `features.tenseAngle` | number | that tense as an angle in degrees (below) |
| `features.aspect` | string | `'base'`, `'perfective'`, `'continuous'`, or `'none'` |
| `features.mood` | string | `'indicative'`, `'imperative'`, or `'interrogative'` |
| `features.moodIntensity` | number | small integer `0–3` (a flourish knob) |
| `features.arguments` | table | `{ active = <word\|nil>, stative = <word\|nil>, oblique = <word\|nil> }` |
| `features.verbs` | array | word objects (0 or 1 today) |
| `features.words` | array | **every** word object in the clause (verb + arguments + modifiers) |
| `features.modifiers` | array | word objects |
| `features.subordinates` | array | nested `features`-shaped tables (recursive) |

### Tenses and `tenseAngle`

The eight tenses map to eight directions:

| `tense` | `tenseAngle` |
|---|---|
| `remotePast` | `-135` |
| `past` | `-90` |
| `nearPast` | `-45` |
| `present` | `0` |
| `nearFuture` | `45` |
| `future` | `90` |
| `remoteFuture` | `135` |
| `historicalFuture` | `180` |

### `moodIntensity`

Derived as: `imperative → 2`, `interrogative → 1`, else `0`; **+1** if `aspect == 'continuous'`; clamped to `0–3`.

### Word object

Each entry in `features.words`, `features.verbs`, `features.modifiers`, and each slot of `features.arguments`:

| Field | Type | Description |
|---|---|---|
| `text` | string | the surface (conlang) word |
| `wordClass` | string | from the lexicon if known, else `""` |
| `translation` | string | from the lexicon if known, else `""` |
| `phonemes` | array | phoneme objects (below) |

### Phoneme object

Each entry in a word's `phonemes` — this is what drives the ripple layer:

| Field | Type | Description |
|---|---|---|
| `symbol` | string | the orthographic segment as written |
| `ipa` | string | its IPA form (after your `ipaMappingRules`, if any) |
| `place` | string \| `nil` | e.g. `'Bilabial'`, `'Alveolar'`, `'Velar'` (consonants); `'Front'`, `'Central'`, `'Back'` (vowels) |
| `manner` | string \| `nil` | e.g. `'Plosive'`, `'Nasal'`, `'Fricative'`, `'Trill'`, `'Approximant'` (consonants); vowel height like `'Open'`, `'Close'`, `'Mid'` (vowels) |
| `voiced` | boolean | |
| `nasal` | boolean | true for nasals (`m`, `n`, `ŋ`, …) |
| `isVowel` | boolean | |

> If a segment isn't in the IPA table (an unusual letter, or one your inventory doesn't cover), `place` and `manner` are `nil` and the booleans are `false`, but `symbol`/`ipa` are still present. Always guard: `if ph.manner == 'Nasal' then …`.

---

## 6. Primitive helper library

These convenience functions are pre-defined for you (they just call `emit`). Use them or ignore them.

| Helper | Signature | Defaults |
|---|---|---|
| `ripple` | `ripple(cx, cy, r, o)` | `r=20`; `o = { start=180, stop=300, sweep=0 }` |
| `ring` | `ring(cx, cy, r, filled)` | `r=30`, `filled=false` |
| `dotAt` | `dotAt(cx, cy, r)` | `r=3` |
| `lineTo` | `lineTo(x1, y1, x2, y2)` | — |
| `branch` | `branch(x, y, depth, ang, len)` | `len=22`; recurses, `len × 0.85` and `ang ± 0.5 rad` per level |

```lua
ripple(60, 110, 24, { sweep = 1 })         -- a ripple, bulge flipped
ring(200, 100, 60, false)                   -- an empty ring
dotAt(120, 90)                              -- a default 3px dot
branch(300, 110, 3, -math.pi / 2, 22)       -- a small recursive "fin"
```

`branch` is an L-system: it draws a line, then recurses into two shorter branches at ±0.5 radians until `depth` reaches 0. Great for organic fins/tendrils whose size can scale with `features.moodIntensity`.

---

## 7. The sandbox: what's available

Your script runs in a locked-down Lua 5.4 environment.

### ✅ Available

- **Base functions:** `ipairs`, `pairs`, `next`, `select`, `type`, `tostring`, `tonumber`, `pcall`, `xpcall`, `error`, `assert`, `setmetatable`, `getmetatable`, `rawget`, `rawset`, `rawequal`, `rawlen`, `print` (no-op for you).
- **`math`** — `math.pi`, `math.sin`, `math.cos`, `math.tan`, `math.sqrt`, `math.abs`, `math.floor`, `math.ceil`, `math.min`, `math.max`, `math.huge`, `math.fmod`, `math.random`, …
- **`string`** — `string.format`, `string.rep`, `string.sub`, `string.len`, `string.byte`, …
- **`table`** — `table.insert`, `table.remove`, `table.concat`, `table.sort`, …
- **`emit(op)`**, the global **`features`** table, and the [helper library](#6-primitive-helper-library).

### ❌ Removed (calling these errors)

`os`, `io`, `package`, `require`, `dofile`, `loadfile`, `load`, `loadstring`, `debug`, `collectgarbage`, `coroutine`, and any JS bridge (`js`). There is **no** access to the DOM, network, filesystem, timers, or the app's state — by design, so a shared script is safe to render on other people's machines.

---

## 8. Limits & validation

| Limit | Value | Effect |
|---|---|---|
| Max shapes | **5000** ops | further `emit` calls are ignored |
| Coordinate bound | **±10000** | out-of-range / `NaN` / non-numbers → `0` |
| `poly` points | **2–64** | < 2 dropped; > 64 truncated |
| `group.id` | **≤ 32 chars** | sanitised to `A–Z a–z 0–9 _ -` |
| Time budget | a few hundred ms | overrun (e.g. `while true do end`) → terminated |

Validation is applied to **everything** you emit, so malformed ops never reach the screen — they're dropped or coerced. You cannot inject markup or styles through `emit`; only the fields documented above are read, and only as numbers/booleans/short ids.

---

## 9. Lua gotchas for authors

If you come from JavaScript/Python, watch for these:

- **1-based indexing.** `word.phonemes[1]` is the first phoneme; `ipairs` yields `i` starting at `1`.
- **Length:** `#features.words` is the count.
- **Ternary idiom:** `ph.voiced and 1 or 0` (there is no `? :`).
- **Truthiness:** only `nil` and `false` are falsy — **`0` is truthy**.
- **Table literals use `=`:** `{ type = 'arc', cx = 10 }` (not `:`).
- **`end` is a reserved word.** You can't write `end = 5` as a bare table key — use `["end"] = 5`. (The op schema deliberately uses `stop`, not `end`, so you never hit this for arcs.)
- **No `+=`.** Write `x = x + 1`.
- **Comments:** `-- line`, `--[[ block ]]`.
- **Single-table-arg sugar:** `emit{ type = 'dot', cx = 1, cy = 1 }` (parens optional).

---

## 10. Worked examples

### Tsevhu-style ripples (linear)

Spell the first word as a chain of quarter-circle "ripples" along a spine; nasals get a dot above, vowels a solid node; a recursive fin scales with mood.

```lua
local R = 24
local word = features.words[1]
if word then
  for i, ph in ipairs(word.phonemes) do
    local cx = 40 + (i - 1) * 42
    emit({ type = 'arc', cx = cx, cy = 115, r = R,
           start = 180, stop = 300, sweep = ph.voiced and 1 or 0 })
    if ph.nasal then dotAt(cx, 115 - R - 7) end
    if ph.isVowel then emit({ type = 'circle', cx = cx, cy = 115, r = 4, fill = true }) end
  end
end

emit({ type = 'group', id = 'head', rotate = features.tenseAngle or 0 })  -- tense (metadata)

local function fin(x, y, depth, ang)
  if depth <= 0 then return end
  local x2 = x + math.cos(ang) * 22
  local y2 = y + math.sin(ang) * 22
  emit({ type = 'line', x1 = x, y1 = y, x2 = x2, y2 = y2 })
  fin(x2, y2, depth - 1, ang - 0.5)
  fin(x2, y2, depth - 1, ang + 0.5)
end
fin(350, 115, (features.moodIntensity or 0) + 3, -math.pi / 2)
```

### Heptapod-style ring (circular)

Distribute phonemes around a ring; a radial spar points at the tense; mood adds inner rings. Uses the helper library.

```lua
local cx, cy = 200, 100
local R = 62
ring(cx, cy, R, false)

local word = features.words[1]
if word then
  local n = math.max(#word.phonemes, 1)
  for i, ph in ipairs(word.phonemes) do
    local a = (i - 1) / n * math.pi * 2
    local px = cx + math.cos(a) * R
    local py = cy + math.sin(a) * R
    if ph.isVowel then dotAt(px, py, 4) else ring(px, py, 8, false) end
    if ph.voiced then branch(px, py, 2, a, 12) end
  end
end

local ta = (features.tenseAngle or 0) * math.pi / 180
lineTo(cx, cy, cx + math.cos(ta) * R, cy + math.sin(ta) * R)

for k = 1, (features.moodIntensity or 0) do
  ring(cx, cy, R - k * 12, false)
end
```

Both ship as presets (**Load preset…**) in the Studio.

---

## 11. Errors & debugging

- **Line numbers are yours.** When your script errors, the Studio reports it as `Lua error (line N): <message>` where **N is the line in your script** (the sandbox prelude and injected data are subtracted out for you).
- **Common errors:**
  - `attempt to index a nil value` — you read a field of something `nil` (e.g. `features.words[1]` when the clause has no words). Guard with `if word then …`.
  - `attempt to call a nil value (os)` / `(require)` / `(load)` — you used a removed function (see [§7](#7-the-sandbox-whats-available)).
  - `attempt to perform arithmetic on a nil value` — a `features` field was `nil`; default it, e.g. `(features.moodIntensity or 0)`.
  - *"Script exceeded …ms and was terminated"* — an unbounded loop or too much work; add a termination condition.
- **Nothing renders?** Check you actually called `emit`, that coordinates fall within `0–400 × 0–200`, and that shapes have non-zero size (`r`, or distinct endpoints).
- **Test hostile scripts** with the Studio's **Sandbox acceptance suite** — it demonstrates that loops, memory bombs, and forbidden calls are contained.

---

*This documents the guest Lua API only. For the host architecture (the sandbox worker, op validation, scene composition, precompute/sharing, and phase status), see [`SEMAGRAM.md`](SEMAGRAM.md).*
