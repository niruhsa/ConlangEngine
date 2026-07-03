// src/utils/semagram/opSchema.js
//
// Pure validation of the drawing-ops emitted by a (sandboxed) semagram script.
// The guest Lua can emit anything; the host trusts NOTHING here. Every numeric
// field is coerced to a bounded finite number, `sweep` is forced to a bit,
// unknown op types are dropped, and the total is capped. No string a guest
// provides ever reaches the DOM except a short, alnum-only group id used solely
// as a React key / transform anchor.
//
// This is the security boundary described in SEMAGRAM.md §2 (#1): "the guest
// emits data, never markup". Keep it pure and defensive.

export const CANVAS_LIMIT = 10000; // max |coordinate|
export const MAX_OPS = 5000;       // hard cap on emitted primitives
export const MAX_POINTS = 64;      // max vertices in a poly
export const ID_MAX = 32;

export const OP_TYPES = new Set(['arc', 'line', 'dot', 'circle', 'poly', 'group']);

const num = (v, fallback = 0) =>
    (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= CANVAS_LIMIT) ? v : fallback;

const bit = (v) => (v ? 1 : 0);

// Group ids are the ONLY guest string that survives; strip to [A-Za-z0-9_-].
const safeId = (v) => (typeof v === 'string' ? v : '').slice(0, ID_MAX).replace(/[^\w-]/g, '');

function validateOne(op) {
    if (!op || typeof op !== 'object') return null;
    switch (op.type) {
        case 'arc':
            return {
                type: 'arc',
                cx: num(op.cx), cy: num(op.cy), r: Math.abs(num(op.r)),
                start: num(op.start), stop: num(op.stop), sweep: bit(op.sweep),
            };
        case 'line':
            return { type: 'line', x1: num(op.x1), y1: num(op.y1), x2: num(op.x2), y2: num(op.y2) };
        case 'dot':
            return { type: 'dot', cx: num(op.cx), cy: num(op.cy), r: Math.abs(num(op.r, 2.5)) || 2.5 };
        case 'circle':
            return { type: 'circle', cx: num(op.cx), cy: num(op.cy), r: Math.abs(num(op.r)), fill: Boolean(op.fill) };
        case 'poly': {
            const src = Array.isArray(op.points) ? op.points.slice(0, MAX_POINTS) : [];
            const points = src.map((p) => ({ x: num(p && p.x), y: num(p && p.y) }));
            if (points.length < 2) return null; // a polyline needs at least two points
            return { type: 'poly', points };
        }
        case 'group':
            return {
                type: 'group',
                id: safeId(op.id),
                rotate: num(op.rotate),
                tx: num(op.tx), ty: num(op.ty),
                scale: num(op.scale, 1) || 1,
            };
        default:
            return null; // unknown / malicious type → dropped
    }
}

/**
 * Validate and clamp a raw ops array coming back from the sandbox.
 * @param {unknown} raw
 * @returns {Array<object>} clean, bounded ops (length ≤ MAX_OPS)
 */
export function validateOps(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const op of raw) {
        if (out.length >= MAX_OPS) break;
        const clean = validateOne(op);
        if (clean) out.push(clean);
    }
    return out;
}
