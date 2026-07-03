// src/utils/semagram/luaRuntime.js
//
// Pure helpers that build the Lua program string run inside the sandbox worker.
//
// Design choice (SEMAGRAM.md §6): we serialize `features` to a Lua table LITERAL
// here on the host (fully escaped) and prepend it to the user's script. The guest
// therefore sees a genuine 1-based Lua table and NO live JS proxy object — the
// only JS→Lua bridge is the `emit` function. This sidesteps wasmoon's
// proxy/indexing semantics entirely and keeps the attack surface minimal.

// Neutralize dangerous stdlib globals + any JS interop bridge BEFORE user code.
// (Defense in depth: we also create the engine without injecting the `js` lib.)
export const SANDBOX_PRELUDE =
    ['os', 'io', 'package', 'require', 'dofile', 'loadfile', 'load', 'loadstring',
     'debug', 'collectgarbage', 'js', 'coroutine']
        .map((g) => `${g}=nil`).join('; ') + ';\n';

// Escape a JS string into a safe Lua double-quoted literal. Lua 5.4 has no
// \uXXXX, so control chars use decimal \ddd; printable bytes (incl. UTF-8) pass
// through, since Lua strings are byte strings.
function luaString(s) {
    let out = '"';
    for (const ch of String(s)) {
        const code = ch.codePointAt(0);
        if (ch === '"') out += '\\"';
        else if (ch === '\\') out += '\\\\';
        else if (ch === '\n') out += '\\n';
        else if (ch === '\r') out += '\\r';
        else if (ch === '\t') out += '\\t';
        else if (code < 0x20) out += '\\' + String(code).padStart(3, '0');
        else out += ch;
    }
    return out + '"';
}

/**
 * Serialize a JSON-ish JS value to a Lua literal.
 * Arrays → 1-based sequence `{v, v}`; objects → `{["k"]=v}` (bracketed keys are
 * safe for reserved words like `end` and for any odd key).
 */
export function luaSerialize(value) {
    if (value === null || value === undefined) return 'nil';
    const t = typeof value;
    if (t === 'number') return Number.isFinite(value) ? String(value) : '0';
    if (t === 'boolean') return value ? 'true' : 'false';
    if (t === 'string') return luaString(value);
    if (Array.isArray(value)) return '{' + value.map(luaSerialize).join(',') + '}';
    if (t === 'object') {
        const parts = [];
        for (const k of Object.keys(value)) {
            const v = value[k];
            if (typeof v === 'function' || v === undefined) continue;
            parts.push('[' + luaString(k) + ']=' + luaSerialize(v));
        }
        return '{' + parts.join(',') + '}';
    }
    return 'nil';
}

// Built-in primitive helper library (Phase 2). Trusted host-authored Lua that
// gives authors reusable drawing verbs on top of raw `emit`. Defined before the
// user script; all helpers resolve `emit`/`math` at call time.
export const PRIMITIVE_LIBRARY = `-- ===== semagram primitive library =====
function ripple(cx, cy, r, o)
  o = o or {}
  emit({ type = 'arc', cx = cx, cy = cy, r = r or 20,
         start = o.start or 180, stop = o.stop or 300, sweep = o.sweep or 0 })
end
function ring(cx, cy, r, filled)
  emit({ type = 'circle', cx = cx, cy = cy, r = r or 30, fill = filled or false })
end
function dotAt(cx, cy, r)
  emit({ type = 'dot', cx = cx, cy = cy, r = r or 3 })
end
function lineTo(x1, y1, x2, y2)
  emit({ type = 'line', x1 = x1, y1 = y1, x2 = x2, y2 = y2 })
end
function branch(x, y, depth, ang, len)
  if depth <= 0 then return end
  len = len or 22
  local x2 = x + math.cos(ang) * len
  local y2 = y + math.sin(ang) * len
  emit({ type = 'line', x1 = x, y1 = y, x2 = x2, y2 = y2 })
  branch(x2, y2, depth - 1, ang - 0.5, len * 0.85)
  branch(x2, y2, depth - 1, ang + 0.5, len * 0.85)
end
`;

/**
 * Build the full Lua program: sandbox prelude + injected `features` table +
 * built-in primitive library + the user's script.
 * @param {string} userSource
 * @param {object} features
 * @returns {string} Lua source
 */
export function buildLuaProgram(userSource, features) {
    const featureLit = luaSerialize(features || {});
    return (
        SANDBOX_PRELUDE +
        `local features = ${featureLit}\n` +
        PRIMITIVE_LIBRARY +
        '-- ===== user script below =====\n' +
        String(userSource || '')
    );
}

// How many lines the host prepends before the user's script (prelude + the
// single features line + primitive library + marker). The features literal is
// always one line, so this is constant regardless of feature content.
export const USER_SOURCE_LINE_OFFSET = buildLuaProgram('', {}).split('\n').length - 1;

/**
 * Translate a raw Lua/wasmoon error into a friendly, user-coordinate error.
 * Lua reports the line within the FULL generated program; we shift it back into
 * the user's own script line numbers and strip the noisy `[string "..."]:` prefix.
 * @returns {{ line: number|null, message: string }}
 */
export function mapLuaError(rawMessage) {
    const raw = String(rawMessage || '');
    const m = raw.match(/:(\d+):\s*([^\n]*)/);
    if (!m) {
        return { line: null, message: raw.replace(/^\[string[^\]]*\]:\s*/, '').trim() || raw };
    }
    const userLine = Number(m[1]) - USER_SOURCE_LINE_OFFSET;
    return { line: userLine > 0 ? userLine : null, message: m[2].trim() };
}
