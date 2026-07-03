// src/components/UI/CodeEditor/CodeEditor.jsx
//
// A lightweight, dependency-free code editor: monospace textarea + a synced
// line-number gutter + Tab-to-indent. (Phase 2 uses this instead of pulling in
// CodeMirror; syntax highlighting can be layered on later.)
import React, { useRef } from 'react';
import './codeEditor.css';

export default function CodeEditor({
    value = '',
    onChange,
    height = 300,
    placeholder = '',
    className = '',
}) {
    const taRef = useRef(null);
    const gutterRef = useRef(null);

    const lineCount = value ? value.split('\n').length : 1;
    const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

    // Keep the gutter vertically aligned with the textarea as it scrolls.
    const syncScroll = () => {
        if (gutterRef.current && taRef.current) {
            gutterRef.current.scrollTop = taRef.current.scrollTop;
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.target;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const next = value.slice(0, start) + '  ' + value.slice(end);
            onChange?.(next);
            // Restore the caret just after the two inserted spaces.
            requestAnimationFrame(() => {
                if (taRef.current) taRef.current.selectionStart = taRef.current.selectionEnd = start + 2;
            });
        }
    };

    return (
        <div className={`ce-wrap ${className}`.trim()} style={{ height }}>
            <pre ref={gutterRef} className="ce-gutter" aria-hidden="true">{lineNumbers}</pre>
            <textarea
                ref={taRef}
                className="ce-input"
                spellCheck={false}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange?.(e.target.value)}
                onScroll={syncScroll}
                onKeyDown={handleKeyDown}
            />
        </div>
    );
}
