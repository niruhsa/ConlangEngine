// src/utils/semagram/svgExport.js
//
// PHASE 3. Serialize validated ops to a standalone SVG string, and browser
// helpers to download SVG/PNG. `opsToSvg` is pure (host-built markup from
// validated numbers — never guest strings), so it is unit-testable.

import { arcPath } from './geometry.js';
import { validateOps } from './opSchema.js';

/** Build a standalone SVG document string from ops. */
export function opsToSvg(rawOps, viewBox = '0 0 400 200', opts = {}) {
    const ops = validateOps(rawOps);
    const stroke = opts.stroke || '#111827';
    const sw = opts.strokeWidth ?? 2;
    const [, , vwRaw, vhRaw] = String(viewBox).split(/\s+/).map(Number);
    const vw = Number.isFinite(vwRaw) ? vwRaw : 400;
    const vh = Number.isFinite(vhRaw) ? vhRaw : 200;

    const body = ops.map((op) => {
        switch (op.type) {
            case 'arc':
                return `<path d="${arcPath(op.cx, op.cy, op.r, op.start, op.stop, op.sweep)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
            case 'line':
                return `<line x1="${op.x1}" y1="${op.y1}" x2="${op.x2}" y2="${op.y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
            case 'dot':
                return `<circle cx="${op.cx}" cy="${op.cy}" r="${op.r}" fill="${stroke}"/>`;
            case 'circle':
                return op.fill
                    ? `<circle cx="${op.cx}" cy="${op.cy}" r="${op.r}" fill="${stroke}"/>`
                    : `<circle cx="${op.cx}" cy="${op.cy}" r="${op.r}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
            case 'poly':
                return `<polyline points="${op.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
            default:
                return '';
        }
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${vw * 2}" height="${vh * 2}">${body}</svg>`;
}

// ── Browser download helpers (not unit-tested; require DOM APIs) ──────────────

export function downloadBlob(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function exportSvg(ops, viewBox, filename = 'semagram.svg') {
    downloadBlob(filename, opsToSvg(ops, viewBox), 'image/svg+xml');
}

export async function exportPng(ops, viewBox, filename = 'semagram.png', scale = 2) {
    const svg = opsToSvg(ops, viewBox);
    const [, , vwRaw, vhRaw] = String(viewBox).split(/\s+/).map(Number);
    const w = (Number.isFinite(vwRaw) ? vwRaw : 400) * scale;
    const h = (Number.isFinite(vhRaw) ? vhRaw : 200) * scale;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => { if (b) downloadBlob(filename, b, 'image/png'); }, 'image/png');
    } finally {
        URL.revokeObjectURL(url);
    }
}
