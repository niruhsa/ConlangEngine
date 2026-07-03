// src/utils/semagram/geometry.js
// Shared geometry helpers used by the on-screen canvas and the SVG exporter, so
// arcs render identically in both.

/** Point on a circle at `deg` degrees (0 = east, clockwise in SVG's y-down space). */
export function polarPoint(cx, cy, r, deg) {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG path `d` for an arc from `start`→`stop` degrees on a circle of radius `r`. */
export function arcPath(cx, cy, r, start, stop, sweep) {
    const [x1, y1] = polarPoint(cx, cy, r, start);
    const [x2, y2] = polarPoint(cx, cy, r, stop);
    const large = Math.abs((((stop - start) % 360) + 360) % 360) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
