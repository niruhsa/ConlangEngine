// src/utils/semagram/sceneComposer.js
//
// PHASE 3. Compose a multi-clause scene from independently-rendered clauses:
// translate each clause's ops into place, draw "bubble-path" connectors between a
// clause and its parent, and compute a bounding viewBox. Pure — the per-clause
// ops are produced upstream by runSemagram(); this module just lays them out.

import { validateOps } from './opSchema.js';

/** Shift every coordinate in a list of ops by (dx, dy). Returns new ops. */
export function translateOps(ops, dx, dy) {
    return (ops || []).map((op) => {
        switch (op.type) {
            case 'arc':
            case 'circle':
            case 'dot':
                return { ...op, cx: op.cx + dx, cy: op.cy + dy };
            case 'line':
                return { ...op, x1: op.x1 + dx, y1: op.y1 + dy, x2: op.x2 + dx, y2: op.y2 + dy };
            case 'poly':
                return { ...op, points: op.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
            case 'group':
                return { ...op, tx: (op.tx || 0) + dx, ty: (op.ty || 0) + dy };
            default:
                return op;
        }
    });
}

/** Axis-aligned bounding box of a list of ops. */
export function boundsOf(ops) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const acc = (x, y) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    };
    (ops || []).forEach((op) => {
        switch (op.type) {
            case 'arc':
            case 'circle':
            case 'dot':
                acc(op.cx - op.r, op.cy - op.r); acc(op.cx + op.r, op.cy + op.r); break;
            case 'line':
                acc(op.x1, op.y1); acc(op.x2, op.y2); break;
            case 'poly':
                op.points.forEach((p) => acc(p.x, p.y)); break;
            default: // 'group' renders nothing on its own yet — skip
                break;
        }
    });
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 400, maxY: 200 };
    return { minX, minY, maxX, maxY };
}

/** A curved "bubble path" connector (a sampled quadratic bezier) as a poly op. */
export function connectorOps(x1, y1, x2, y2, curve = 24) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;          // unit perpendicular
    const ctrlX = mx + nx * curve, ctrlY = my + ny * curve;
    const pts = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const x = u * u * x1 + 2 * u * t * ctrlX + t * t * x2;
        const y = u * u * y1 + 2 * u * t * ctrlY + t * t * y2;
        pts.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
    }
    return [{ type: 'poly', points: pts }];
}

/**
 * Compose a scene from placements.
 * @param {Array} placements  [{ id, ops, x, y, w?, h?, parentId? }]
 * @returns {{ ops: Array, viewBox: string }}
 */
export function composeScene(placements, opts = {}) {
    const list = Array.isArray(placements) ? placements : [];
    const byId = {};
    list.forEach((p) => { byId[p.id] = p; });
    const centerOf = (p) => ({ x: p.x + (p.w ?? 400) / 2, y: p.y + (p.h ?? 200) / 2 });

    let ops = [];
    // Connectors first, so they render behind the clauses.
    list.forEach((p) => {
        if (p.parentId && byId[p.parentId]) {
            const a = centerOf(byId[p.parentId]);
            const b = centerOf(p);
            ops.push(...connectorOps(a.x, a.y, b.x, b.y));
        }
    });
    list.forEach((p) => { ops.push(...translateOps(p.ops, p.x, p.y)); });

    ops = validateOps(ops); // defense-in-depth: keep the merged scene within bounds
    const pad = opts.pad ?? 20;
    const b = boundsOf(ops);
    const viewBox = `${(b.minX - pad).toFixed(1)} ${(b.minY - pad).toFixed(1)} `
        + `${(b.maxX - b.minX + pad * 2).toFixed(1)} ${(b.maxY - b.minY + pad * 2).toFixed(1)}`;
    return { ops, viewBox };
}
