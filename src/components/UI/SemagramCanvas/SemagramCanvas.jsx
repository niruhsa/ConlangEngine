// src/components/UI/SemagramCanvas/SemagramCanvas.jsx
//
// Renders validated drawing-ops to SVG. The host builds every node from clean
// numbers — the guest never produces markup (SEMAGRAM.md §2, #1).
import { arcPath } from '@/utils/semagram/geometry.js';
import './semagramCanvas.css';

export default function SemagramCanvas({ ops = [], viewBox = '0 0 400 200', className = '' }) {
    return (
        <svg
            className={`semagram-canvas ${className}`.trim()}
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Semagram preview"
        >
            {ops.map((op, i) => {
                switch (op.type) {
                    case 'arc':
                        return <path key={i} className="sg-stroke" d={arcPath(op.cx, op.cy, op.r, op.start, op.stop, op.sweep)} />;
                    case 'line':
                        return <line key={i} className="sg-stroke" x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} />;
                    case 'dot':
                        return <circle key={i} className="sg-fill" cx={op.cx} cy={op.cy} r={op.r} />;
                    case 'circle':
                        return <circle key={i} className={op.fill ? 'sg-fill' : 'sg-stroke'} cx={op.cx} cy={op.cy} r={op.r} />;
                    case 'poly':
                        return <polyline key={i} className="sg-stroke" points={op.points.map((p) => `${p.x},${p.y}`).join(' ')} />;
                    case 'group':
                        // Phase 0: transforms render as an empty anchor (children arrive in later phases).
                        return <g key={i} transform={`translate(${op.tx} ${op.ty}) rotate(${op.rotate}) scale(${op.scale})`} />;
                    default:
                        return null;
                }
            })}
        </svg>
    );
}
