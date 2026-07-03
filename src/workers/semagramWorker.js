// src/workers/semagramWorker.js  (module Web Worker)
//
// Runs an untrusted semagram script in a Lua VM (wasmoon / WASM) inside a Worker.
//
// SECURITY (SEMAGRAM.md §2):
//  - The ONLY bridge exposed to Lua is emit(op). We do NOT inject wasmoon's `js`
//    interop library (injectObjects:false) — a Worker has fetch/importScripts, so
//    an enabled bridge would defeat the sandbox. The prelude also nils `js`.
//  - enableProxy:false → Lua↔JS values cross by COPY, so the `op` we receive is a
//    plain JS object (safe to postMessage) with no live Lua-backed proxy.
//  - The authoritative timeout is host-side worker.terminate() in runSemagram.js,
//    which fires even if Lua spins in `while true do end` (the host thread is free).
//
// NOTE: requires `npm install wasmoon`. If wasmoon cannot locate its .wasm under
// Vite, pass an explicit URL:
//   import wasmUri from 'wasmoon/dist/glue.wasm?url';
//   getFactory = () => (factory ??= new LuaFactory(wasmUri));
import { LuaFactory } from 'wasmoon';
import { buildLuaProgram } from '../utils/semagram/luaRuntime.js';
import { MAX_OPS } from '../utils/semagram/opSchema.js';

let factory = null;
const getFactory = () => (factory ??= new LuaFactory());

self.onmessage = async (e) => {
    const { luaSource, features } = e.data || {};
    const ops = [];
    let lua = null;
    try {
        const f = getFactory();
        lua = await f.createEngine({
            openStandardLibs: true, // base/math/string/table (os/io are nil'd by the prelude)
            injectObjects: false,   // do NOT expose the JS bridge
            enableProxy: false,     // copy semantics both ways
        });

        // The single guest→host channel. Cap length so an emit-flood can't OOM us.
        lua.global.set('emit', (op) => {
            if (ops.length < MAX_OPS && op && typeof op === 'object') ops.push(op);
        });

        await lua.doString(buildLuaProgram(luaSource, features));
        self.postMessage({ ok: true, ops });
    } catch (err) {
        self.postMessage({ ok: false, error: String((err && err.message) || err) });
    } finally {
        try { lua && lua.global.close(); } catch { /* ignore cleanup errors */ }
    }
};
