# Semagram Engine — Implementation Plan

**User-authored 2D semagraphic writing systems**, powered by an embedded, sandboxed **Lua** scripting language (the "B2" approach).

## 1. Goal & motivation

ConlangEngine today renders every script as a **linear run of glyphs in a compiled font** (`src/utils/scriptRendering.js` → `src/utils/fontCompiler.jsx`). That model cannot express *holistic 2D writing systems* like **Tsevhu** (koi-fish clauses) or **Arrival**'s Heptapod B (circular semagrams), where an entire clause is one composed drawing and meaning is encoded by geometry (orientation = tense, fins = mood, ripples = phonemes, spatial layout = discourse).

Rather than hard-coding a "fish generator" and a "ring generator," we let users **describe their own mapping from grammar/phonology to vector geometry** in a small embedded language. Tsevhu and Heptapod then ship as *example presets authored in that system*, not built-ins.

We use **Lua** (via [`wasmoon`](https://github.com/ceifa/wasmoon), Lua 5.4 compiled to WASM) as the guest language because it is a classic embeddable scripting language, trivial to strip down to a safe sandbox, and runs in an isolated WASM heap.

### Non-goals
- **Reading** (diagram → sentence parsing). Out of scope; possibly never.
- Replacing the font pipeline. This is a **parallel** renderer for one script *type*; TTF/PDF/keyboard exports remain font-only.
- Turing-complete power for casual users. Most systems will be expressible with the presets + light edits; the full language is the escape hatch.

## 2. The core security model (read first)

Because projects **sync to the cloud and are publicly shared** (`/view/` `PublicViewer`, the Explore page), any user-authored script travels to *other people's browsers*. Untrusted code execution is therefore the central risk. This design extends the app's existing injection-consciousness (`SEC-2`/`SEC-3` in `App.jsx`, `SEC-4` in `schemaValidator.jsx`, `dompurify`).

Five guarantees, in order of importance:

1. **The guest emits data, never markup.** Lua scripts call `emit(op)` where `op` is a plain table of numbers (see §4). The **host** builds SVG nodes from validated numbers. The user never produces `<svg>`, tag names, attribute names, or event handlers, so SVG/script injection is structurally impossible — not merely filtered.
2. **Two isolation boundaries.** Lua runs in a **WASM heap** (no reference to host JS objects) *inside* a **Web Worker** (no DOM). Mirrors the existing `src/utils/fontWorker.js` pattern.
3. **Disable wasmoon's JS bridge — this is the #1 hardening task.** wasmoon can optionally expose a `js` global that lets Lua reach into JavaScript (`js.global.fetch`, etc.). A Web Worker *does* have `fetch`, `XMLHttpRequest`, `importScripts`, and `postMessage`, so an enabled bridge would defeat the sandbox entirely. We **must not inject the `js` library**, and we strip dangerous stdlib (`os`, `io`, `package`, `require`, `load`/`loadstring`, `dofile`, `loadfile`, `debug`) before running user code. Keep only `math`, `string`, `table`, and our `emit`.
4. **Bounded compute.** Authoritative kill is a **host-side wall-clock `worker.terminate()`** after a budget (fires even if the worker is spin-blocked by `while true do end`, because the timer lives on the host thread). Add a best-effort Lua instruction hook and a `MAX_OPS` output cap. Memory capping (emscripten `MAXIMUM_MEMORY`) is a hardening follow-up.
5. **Tiered execution by trust** (see §7). In particular, **public `/view/` viewers never run shared Lua** — authors precompute ops and we ship only the cached geometry.

> Invariant: the Lua source string only ever crosses into the Worker via `postMessage`. It is never `eval`'d, never interpolated into markup/CSS/DOM, never passed to `new Function`.

## 3. Architecture & data flow

```
                        ┌──────────────────────── HOST (main thread) ────────────────────────┐
  config + parsed  ──▶  featureExtractor.js  ──▶  features {}  ─┐
  clause (grammar-                                              │  postMessage
  Analyzer)                                                     ▼
  user Lua source  ───────────────────────────────▶  runSemagram()  ──▶  Web Worker
                                                                                │
                        ┌──────────────────── WEB WORKER ────────────────────┐  │
                        │  wasmoon (Lua 5.4 in WASM)                          │◀─┘
                        │   • strip os/io/package/require/load/debug          │
                        │   • DO NOT inject `js` bridge                       │
                        │   • inject: features (table), emit(op)              │
                        │   • run user Lua  ──▶ collects ops[] (≤ MAX_OPS)    │
                        └────────────────────────────────────────────────────┘
                                                                     │ postMessage(ops)
  validateOps()  ◀───────────────────────────────────────────────────┘
     │  (whitelist types, coerce every field to a bounded finite number)
     ▼
  SemagramCanvas.jsx  ──▶  <svg> built by host from clean numbers  ──▶  screen / SVG export
```

## 4. Contracts (the stable interfaces)

### 4.1 Drawing-op schema (guest → host)

Structured primitives only. **Field named `stop`, not `end`** — `end` is a reserved keyword in Lua and cannot be a bare table key. All coordinates are in a fixed `viewBox` space (e.g. `0 0 400 200`).

| `type` | Fields | Renders as |
|---|---|---|
| `arc` | `cx, cy, r, start, stop, sweep(0\|1)` | quarter/partial circle path (a "ripple") |
| `line` | `x1, y1, x2, y2` | straight stroke |
| `dot` | `cx, cy, r?` | small filled circle |
| `circle` | `cx, cy, r, fill?(bool)` | ring / Heptapod base |
| `poly` | `points:[{x,y}...]` (≤ 64) | open polyline |
| `group` | `id(string ≤32), rotate, tx?, ty?, scale?` | a `<g transform>` (e.g. rotate "head" for tense) |

`validateOps()` (host, pure, unit-tested) drops unknown `type`s, coerces every numeric field with `Number.isFinite` + a `±CANVAS_LIMIT` clamp, forces `sweep ∈ {0,1}`, truncates `id`/string fields, and enforces `ops.length ≤ MAX_OPS` (e.g. 5000). No string reaches the DOM except short opaque `group.id`s used only as React keys.

### 4.2 Feature schema (host → guest)

Derived from `grammarAnalyzer.js` + config by `featureExtractor.js`. This is the vocabulary users write against; keep it **stable and documented**.

```jsonc
{
  "clause":   { "type": "main" | "subordinate", "role": "nom"|"adv"|"rel"|"adj"|null },
  "tense":    "remotePast"|"past"|"nearPast"|"present"|"nearFuture"|"future"|"remoteFuture"|"historicalFuture",
  "tenseAngle": -135,            // convenience: 8-way tense mapped to degrees
  "aspect":   "perfective"|"continuous"|"base"|null,
  "mood":     "indicative"|"imperative"|"interrogative"|null,
  "moodIntensity": 0,             // small int, for parametric flourishes
  "arguments": { "active": {...word}, "stative": {...word}, "oblique": {...word} },
  "verbs":    [ {...word} ],       // up to 3 verb slots ("moves with the tail")
  "words":    [ {                 // every word, phonemically decomposed
      "text": "…", "wordClass": "noun",
      "phonemes": [ { "symbol":"t", "place":"Alveolar", "manner":"Plosive",
                      "voiced": false, "nasal": false, "isVowel": false } ]
  } ],
  "modifiers": [ {...word} ],
  "subordinates": [ { /* nested clause feature objects */ } ]
}
```

Phoneme features come from `IPA_INFO` in `src/utils/ipaData.js` (already has `place`/`manner`/`voiced`/`isVowel`/vowel height/backness). This is the same data the new Naturalness engine (`src/utils/typologyEngine.js`) consumes — reuse the parsing helpers.

### 4.3 Runner API (host)

```js
// src/utils/semagram/runSemagram.js
runSemagram(luaSource, features, {
  timeBudgetMs = 200,        // host wall-clock terminate + best-effort hook
  memoryBudgetBytes = 16*1024*1024,
  trust = 'owner'            // 'owner' | 'community' (gates the opt-in prompt)
}) : Promise<Op[]>           // already validated
```

## 5. File-by-file work

### New files
| Path | Responsibility | Purity |
|---|---|---|
| `src/utils/semagram/opSchema.js` | op type constants + `validateOps()` + bounds | pure |
| `src/utils/semagram/featureExtractor.js` | parsed clause + config → `features` object | pure |
| `src/utils/semagram/luaSandbox.js` | prelude string: strip libs, helper Lua fns | pure/data |
| `src/workers/semagramWorker.js` | wasmoon load (dynamic import), inject `features`+`emit`, run, return ops | worker |
| `src/utils/semagram/runSemagram.js` | spawn worker, wall-clock terminate, resolve `validateOps(ops)` | host |
| `src/components/UI/SemagramCanvas/SemagramCanvas.jsx` (+ css) | ops → SVG (host builds nodes) | pure view |
| `src/components/pages/semagram/SemagramTab.jsx` (+ css) | editor page: Lua editor + feature source + live canvas | view |
| `src/utils/semagram/presets/tsevhu.lua.js` | Tsevhu example rule-set (exported string) | data |
| `src/utils/semagram/presets/heptapod.lua.js` | Heptapod-style example rule-set | data |
| `src/utils/semagram/__tests__/*` | unit tests for `validateOps`/`featureExtractor` + adversarial sandbox tests | test |

### Modified files
| Path | Change |
|---|---|
| `src/utils/scriptResolver.js` | add `'semagraphic'` to `SCRIPT_TYPES` (makes `normalizeScriptType` accept it) |
| `src/store/useConfigStore.jsx` | store per-script semagram rule-set **nested in the `scriptSystems[]` entry** (`semagram: { luaSource, viewBox, presetId }`); add save action + `logActivity` |
| `src/utils/schemaValidator.jsx` | `scriptSystems` is already an allowed key and nested objects pass through, so **no `VALID_CONFIG_KEYS` change** if we nest there. Only add a key if we introduce a top-level field (e.g. a `semagramDocuments` store). Per-word cached ops ride in the existing `scriptForms[scriptId]` (already preserved by `sanitizeLexicon`). |
| `src/App.jsx` | lazy-import `SemagramTab`; add `/semagram` to `ALLOWED_REDIRECTS` + a `<Route>` |
| `src/components/Layout/NavBar/Navbar.jsx` | nav entry under **Linguistics** or **Resources** (e.g. "Semagram Studio") |
| `src/components/UI/ScriptManager/ScriptManager.jsx` | add `'semagraphic'` to the script-type selector + a "Edit rules" link to `/semagram` |
| `src/components/pages/viewer/PublicViewer.jsx` | render **precomputed cached ops only**; never execute shared Lua (Tier-3 gate, §7) |
| `package.json` | add `wasmoon` dependency |

## 6. Sandbox worker sketch (the safety-critical core)

```js
// src/workers/semagramWorker.js  — runs in a Web Worker
import { LuaFactory } from 'wasmoon';                  // lazy: only loaded for semagraphic scripts

const STRIP = `os=nil; io=nil; package=nil; require=nil; dofile=nil;
               loadfile=nil; load=nil; loadstring=nil; debug=nil; collectgarbage=nil;`;

self.onmessage = async (e) => {
  const { luaSource, features, limits } = e.data;
  const ops = [];
  try {
    // IMPORTANT: do NOT enable wasmoon's `js` interop bridge.
    const lua = await new LuaFactory().createEngine({ injectObjects: false, openStandardLibs: true });

    lua.global.set('emit', (op) => { if (ops.length < 5000) ops.push(op); });
    lua.global.set('features', features);               // wasmoon converts JS obj → Lua table (1-based)

    await lua.doString(STRIP + '\n' + luaSource);       // strip libs, THEN run user code
    lua.global.close();
    self.postMessage({ ok: true, ops });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};
```

```js
// src/utils/semagram/runSemagram.js  — host side, authoritative timeout
export function runSemagram(luaSource, features, opts = {}) {
  const timeBudgetMs = opts.timeBudgetMs ?? 200;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/semagramWorker.js', import.meta.url), { type: 'module' });
    const kill = setTimeout(() => { worker.terminate(); reject(new Error('Semagram script timed out')); }, timeBudgetMs + 600);
    worker.onmessage = (ev) => {
      clearTimeout(kill); worker.terminate();
      ev.data.ok ? resolve(validateOps(ev.data.ops)) : reject(new Error(ev.data.error));
    };
    worker.onerror = (err) => { clearTimeout(kill); worker.terminate(); reject(err); };
    worker.postMessage({ luaSource, features, limits: { timeBudgetMs } });
  });
}
```

### Example user Lua (ships as the Tsevhu preset)
```lua
local R = 24
for i, ph in ipairs(features.words[1].phonemes) do
  local cx = 40 + (i - 1) * 34
  emit({ type = 'arc', cx = cx, cy = 100, r = R,
         start = 180, stop = 270,                 -- note: 'stop', not 'end'
         sweep = ph.voiced and 1 or 0 })
  if ph.nasal then emit({ type = 'dot', cx = cx, cy = 100 - R }) end
end
emit({ type = 'group', id = 'head', rotate = features.tenseAngle })   -- tense = head direction
```

## 7. Trust tiers (execution policy)

| Context | Policy |
|---|---|
| **Author editing their own script** | Run freely on save/preview (local, sandboxed). |
| **Importing a community project / backup** | Run only after an explicit **"Run this shared script?"** opt-in prompt. Until then, show cached ops if present, else a placeholder. |
| **Public `/view/` viewer** | **Never execute Lua.** The author precomputes ops (author's browser → `validateOps` → cache under `lexicon[i].scriptForms[scriptId]` / a per-document cache) and the viewer renders the cached geometry only. Zero code execution for the audience; also faster. |

This makes the shared-code-is-a-malware-vector problem moot for the audience, while preserving full authoring power locally.

## 8. Phased delivery (each phase is shippable)

- **Phase 0 — Sandbox core spike (de-risk everything).** ✅ **Built** (`src/utils/semagram/{opSchema,luaRuntime,runSemagram}.js`, `src/workers/semagramWorker.js`, `src/components/UI/SemagramCanvas/`, dev page at `/semagram`). `validateOps` + the Lua program builder/escaper are covered by 32 passing pure-logic tests; the wasmoon worker path still needs a live `npm install wasmoon` + dev-server run to confirm (the top build risk, §10).
  **Adversarial acceptance tests (must pass, wired as buttons on the dev page):** `while true do end` (killed by wall-clock), memory bomb (bounded/terminated), `os.execute`/`io` (nil — error), attempt to reach `js`/`fetch` (unavailable), 100k `emit` calls (capped at `MAX_OPS`), malformed ops (dropped by `validateOps`).

- **Phase 1 — Feature extraction.** ✅ **Built** (`src/utils/semagram/featureExtractor.js`; the `/semagram` "Compose clause" mode). Turns the project's **phonology config + lexicon** into the §4.2 `features` object: `decomposePhonemes()` segments each conlang word into phonemes with articulatory features (via the inventory + `ipaMappingRules` + `IPA_INFO`), and `extractClauseFeatures()` packages a composed clause (tense/aspect/mood/valency). Covered by 33 passing pure-logic tests; §4.2 schema locked. **Design deviation from the original plan:** we do *not* route through `grammarAnalyzer.js` — that is an English→conlang, cursor-based word-assist engine (imports the store, lemmatizes English), which is the wrong tool for rendering a clause and would break purity/testability. A semagram is *composed* (pick categories + words), so config+lexicon is the correct, deterministic source. An optional English-gloss adapter over `grammarAnalyzer.computePhraseSuggestion` can be added in a later phase.

- **Phase 2 — Authoring UX.** ✅ **Built.** Line-numbered, Tab-indenting `CodeEditor` (`src/components/UI/CodeEditor/`); a **primitive helper library** injected into every program (`ripple`/`ring`/`dotAt`/`lineTo`/`branch` in `luaRuntime.js` `PRIMITIVE_LIBRARY`); **Tsevhu** + **Heptapod** presets with a picker; **persistence** — create/select a semagraphic script and Save/Load its Lua into the `scriptSystems[]` entry (`semagram: { luaSource, viewBox }`) via `addScriptSystem`/`updateScriptSystem`; `'semagraphic'` registered in `ScriptManager` with an "Open Studio" link. Two pragmatic deviations from the original plan: (1) a dependency-free `CodeEditor` instead of CodeMirror (no new bundle dep; syntax highlighting is a later add); (2) a Lua **helper library** as the "primitive library" — wiring actual Font Studio stroke glyphs as stampable primitives needs the stroke→path bridge from `blockFontGenerator`/`fontCompiler` and is deferred to a later phase. Covered by 35 passing runtime tests (incl. library injection ordering); all Phase 2 files lint clean.

- **Phase 3 — Documents, precompute & sharing.** ✅ **Built.** **Scene composition** (`sceneComposer.js`: `translateOps`/`boundsOf`/`connectorOps`/`composeScene`) tiles multiple clauses with curved "bubble-path" connectors and a computed bounding viewBox; the Studio's **Scene** control renders a main clause + N tense-varied clauses connected to it. **SVG export** (`svgExport.js` `opsToSvg` — pure/host-built; plus browser `exportSvg`/`exportPng`) via a Download button. **Precompute + cache**: the "Precompute" button runs the script and stores validated ops on the script system (`semagram.cachedOps` + `viewBox`). **Tier-3 sharing**: `PublicViewer` renders any semagraphic script's `cachedOps` through `validateOps` → `SemagramCanvas` — **it never loads wasmoon or runs shared Lua**, closing the malware-vector concern for the audience. Shared arc/geometry helpers extracted to `geometry.js` (used by both canvas and exporter). Covered by 22 new pure-logic tests (90 total across the feature); all files lint clean. Interactive pan/zoom + drag-to-arrange remain in **Phase 4** (scenes are currently tile-composed, not hand-dragged).

- **Phase 4 — Polish.** ✅ **Built.** **Pan/zoom** preview (the canvas is wrapped in the existing `PanZoomContainer` — scroll to zoom, drag to pan). **Friendly Lua error surfacing**: `mapLuaError`/`USER_SOURCE_LINE_OFFSET` in `luaRuntime.js` translate a raw wasmoon error's line number out of the full generated program back into the user's own script coordinates and strip the `[string "..."]:` noise, shown as "Lua error (line N): …". **In-app reference** card driving its op list from `OP_TYPES` (stays in sync with the schema), plus the primitive-helper signatures and the `features` fields. Covered by 6 new error-mapping tests (96 total across the feature); all files lint clean. **Remaining stretch:** per-element **drag-to-arrange** of individual clauses (scenes are procedurally tiled + connected today; pan/zoom covers navigation, but hand-dragging fish needs a placement editor) and the Phase-2 **Font Studio stroke-stamping** primitive bridge.

## 9. Testing & verification

- **Pure units:** `validateOps` (coercion/clamping/whitelist/cap) and `featureExtractor` (clause → features) — no worker needed.
- **Adversarial sandbox suite:** the Phase-0 list above, run against the real worker.
- **Render checks:** snapshot the SVG ops for the two presets.
- **Build caveat:** this repo's `node_modules` currently holds Linux-only native binaries, so a native Windows `vite build`/dev-server may not run locally without reinstalling platform binaries. Verify **wasmoon's WASM bundling under Vite module workers** early (Phase 0) — it may need Vite `?url`/`assetsInclude` handling; this is the top build risk.

## 10. Risks & open questions

1. **wasmoon + Vite module-worker + WASM bundling** — verify in Phase 0 (highest risk).
2. **Memory capping** in wasmoon/emscripten is harder than time capping; rely on `MAX_OPS` + wall-clock terminate initially, add a memory ceiling as hardening.
3. **Bundle size** — Lua WASM is a few hundred KB; **lazy-load** it only when a `semagraphic` script is active (dynamic `import()` inside the worker).
4. **Sentence sourcing** — where composed clause-scenes come from (Analyzer input vs. a new document type). MVP: transient from a parse; persistence is Phase 3.
5. **Language-agnostic boundary** — the op/worker boundary is not Lua-specific. If desired later, a QuickJS/JS guest can be offered behind the *same* `validateOps` contract with no downstream changes.
6. **Reverse reading** (drawing → sentence) — explicitly out of scope.

## 11. Relationship to existing subsystems

- **Rule-engine DNA:** semagram rule-sets extend the app's existing "author feature→behavior tables" pattern (`scriptRules`, the grammar matrix `RulesManager`/`VisualRuleBuilder`, prosody `stressRules`/`toneRules`).
- **Primitive library:** reuse Font Studio drawings / `featuralComponents` as parametric parts (a ripple, a fin).
- **Linguistics inputs:** `grammarAnalyzer.js`, the morphology/valency config (Active/Stative/Oblique), `ipaData.js` phoneme features.
- **Multi-script plumbing:** `scriptResolver.js` + `scriptSystems` + `useScriptResolver`.
- **Sharing/remix:** ship Tsevhu & Heptapod as presets users fork and remix (the "fork & remix public conlangs" idea in `features.md`).

---
*Plan authored for the B2 (embedded-Lua-in-WASM) approach. The load-bearing decisions are: **emit-ops-not-markup**, **disable wasmoon's `js` bridge**, **host-side `worker.terminate()` as the authoritative kill**, and **precomputed ops for public viewers**.*
