// src/utils/semagram/runSemagram.js  (host thread)
//
// Spawns the sandbox worker, enforces the AUTHORITATIVE wall-clock timeout, and
// returns validated ops. This timeout lives on the host thread, so it kills a
// worker that is spin-blocked by `while true do end` (SEMAGRAM.md §2, #4).

import { validateOps } from './opSchema.js';

/**
 * Run a semagram Lua script against a features object.
 * @param {string} luaSource
 * @param {object} features
 * @param {{ timeBudgetMs?: number }} [opts]
 * @returns {Promise<Array<object>>} validated, bounded drawing-ops
 */
export function runSemagram(luaSource, features, opts = {}) {
    const timeBudgetMs = opts.timeBudgetMs ?? 250;

    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = new Worker(
                new URL('../../workers/semagramWorker.js', import.meta.url),
                { type: 'module' }
            );
        } catch (err) {
            reject(new Error('Failed to start semagram worker: ' + (err?.message || err)));
            return;
        }

        // First run also pays for WASM load + engine creation, hence the headroom.
        const kill = setTimeout(() => {
            worker.terminate();
            reject(new Error(`Script exceeded ${timeBudgetMs}ms and was terminated.`));
        }, timeBudgetMs + 600);

        worker.onmessage = (ev) => {
            clearTimeout(kill);
            worker.terminate();
            if (ev.data?.ok) resolve(validateOps(ev.data.ops));
            else reject(new Error(ev.data?.error || 'Unknown semagram error'));
        };

        worker.onerror = (err) => {
            clearTimeout(kill);
            worker.terminate();
            reject(new Error(err?.message || 'Semagram worker crashed (is `wasmoon` installed?)'));
        };

        worker.postMessage({ luaSource, features });
    });
}
