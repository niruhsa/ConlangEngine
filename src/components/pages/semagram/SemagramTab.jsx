// src/components/pages/semagram/SemagramTab.jsx
//
// PHASE 0 spike + PHASE 1 (SEMAGRAM.md §8). A dev page to de-risk the sandboxed-
// Lua core and drive it from real app data:
//  - "Compose clause" mode builds the `features` object from the project's
//    phonology config + lexicon via featureExtractor (Phase 1).
//  - "Sample JSON" mode lets you hand-edit features (Phase 0).
// Type Lua → see the emitted geometry render; run the adversarial suite to prove
// the sandbox holds. Not the final authoring UX (Phase 2 adds a real editor).
import React, { useState, useCallback, useMemo } from 'react';
import { useConfigStore } from '@/store/useConfigStore.jsx';
import { useLexiconStore } from '@/store/useLexiconStore.jsx';
import Card from '@/components/UI/Card/Card.jsx';
import Button from '@/components/UI/Buttons/Buttons.jsx';
import CodeEditor from '@/components/UI/CodeEditor/CodeEditor.jsx';
import SemagramCanvas from '@/components/UI/SemagramCanvas/SemagramCanvas.jsx';
import PanZoomContainer from '@/components/UI/PanZoomContainer/PanZoomContainer.jsx';
import { runSemagram } from '@/utils/semagram/runSemagram.js';
import { SAMPLE_FEATURES } from '@/utils/semagram/sampleFeatures.js';
import { TSEVHU_RIPPLES } from '@/utils/semagram/presets/tsevhu.lua.js';
import { HEPTAPOD_RING } from '@/utils/semagram/presets/heptapod.lua.js';
import { ADVERSARIAL } from '@/utils/semagram/presets/adversarial.js';
import {
    extractClauseFeatures, tenseToAngle, TENSES, ASPECTS, MOODS,
} from '@/utils/semagram/featureExtractor.js';
import { composeScene } from '@/utils/semagram/sceneComposer.js';
import { exportSvg } from '@/utils/semagram/svgExport.js';
import { mapLuaError } from '@/utils/semagram/luaRuntime.js';
import { OP_TYPES } from '@/utils/semagram/opSchema.js';
import { Fish, Play, ShieldAlert, Loader2, Save, Plus, Download, Share2, BookOpen } from 'lucide-react';
import './semagramTab.css';

const EMPTY_SCRIPTS = []; // stable fallback ref so memo deps don't churn

const DEFAULT_CLAUSE = {
    clauseType: 'main', role: null,
    tense: 'past', aspect: 'perfective', mood: 'indicative',
    verb: 'tanek', active: 'melu', stative: 'sila', oblique: '',
};

// In-app reference (Phase 4). Op list is driven by OP_TYPES so it stays in sync.
const OP_DOCS = {
    arc: 'partial circle — cx, cy, r, start, stop, sweep (0|1)',
    line: 'straight stroke — x1, y1, x2, y2',
    dot: 'small filled circle — cx, cy, r?',
    circle: 'ring or disc — cx, cy, r, fill?',
    poly: 'open polyline — points = { {x=, y=}, ... }',
    group: 'transform anchor — id, rotate, tx, ty, scale',
};
const HELPER_DOCS = [
    'ripple(cx, cy, r, { start=, stop=, sweep= })',
    'ring(cx, cy, r, filled)',
    'dotAt(cx, cy, r)',
    'lineTo(x1, y1, x2, y2)',
    'branch(x, y, depth, angle, len)',
];
const FEATURE_DOCS = [
    'features.tense / features.tenseAngle — 8-way tense, angle in degrees',
    'features.aspect / features.mood / features.moodIntensity',
    'features.words[i].phonemes[j] — { symbol, ipa, place, manner, voiced, nasal, isVowel }',
    'features.arguments.active / .stative / .oblique — argument word slots',
    'features.verbs / features.modifiers / features.subordinates',
];

export default function SemagramTab() {
    const config = useConfigStore();
    const rawLexicon = useLexiconStore((s) => s.lexicon);
    const lexicon = useMemo(
        () => (Array.isArray(rawLexicon) ? rawLexicon : (rawLexicon?.lexicon || [])),
        [rawLexicon]
    );

    const scriptSystems = useConfigStore((s) => s.scriptSystems) || EMPTY_SCRIPTS;
    const addScriptSystem = useConfigStore((s) => s.addScriptSystem);
    const updateScriptSystem = useConfigStore((s) => s.updateScriptSystem);
    const logActivity = useConfigStore((s) => s.logActivity);
    const semagraphicScripts = useMemo(
        () => scriptSystems.filter((s) => s.type === 'semagraphic'),
        [scriptSystems]
    );

    const [luaSource, setLuaSource] = useState(TSEVHU_RIPPLES);
    const [mode, setMode] = useState('compose'); // 'compose' | 'sample'
    const [clause, setClause] = useState(DEFAULT_CLAUSE);
    const [featuresText, setFeaturesText] = useState(JSON.stringify(SAMPLE_FEATURES, null, 2));
    const [ops, setOps] = useState([]);
    const [status, setStatus] = useState(null);
    const [running, setRunning] = useState(false);
    const [adversarialResults, setAdversarialResults] = useState({});
    const [selectedScriptId, setSelectedScriptId] = useState('');
    const [saveMsg, setSaveMsg] = useState('');
    const [viewBox, setViewBox] = useState('0 0 400 200');
    const [sceneCount, setSceneCount] = useState(0);

    // Live-build features from the real phonology config + lexicon (Phase 1).
    const composedFeatures = useMemo(
        () => extractClauseFeatures(clause, config, lexicon),
        [clause, config, lexicon]
    );

    const getActiveFeatures = useCallback(() => {
        if (mode === 'compose') return { features: composedFeatures };
        try { return { features: JSON.parse(featuresText) }; }
        catch (err) { return { error: `Invalid features JSON: ${err.message}` }; }
    }, [mode, composedFeatures, featuresText]);

    const setClauseField = (field, value) => setClause((c) => ({ ...c, [field]: value }));

    const loadPreset = (name) => {
        if (name === 'tsevhu') setLuaSource(TSEVHU_RIPPLES);
        else if (name === 'heptapod') setLuaSource(HEPTAPOD_RING);
    };

    const loadScript = (id) => {
        setSelectedScriptId(id);
        setSaveMsg('');
        const sc = scriptSystems.find((s) => s.id === id);
        if (sc?.semagram?.luaSource) setLuaSource(sc.semagram.luaSource);
    };

    const newScript = () => {
        addScriptSystem({
            name: `Semagram ${semagraphicScripts.length + 1}`,
            type: 'semagraphic',
            semagram: { luaSource, viewBox: '0 0 400 200' },
        });
        setSelectedScriptId(useConfigStore.getState().activeScriptSystemId);
        setSaveMsg('Created a new semagraphic script system.');
    };

    const saveScript = () => {
        if (!selectedScriptId) { setSaveMsg('Pick or create a script first.'); return; }
        updateScriptSystem(selectedScriptId, {
            type: 'semagraphic',
            semagram: { luaSource, viewBox: '0 0 400 200' },
        });
        logActivity?.('Saved semagram script');
        setSaveMsg('Saved to script system.');
    };

    const run = useCallback(async () => {
        const { features, error } = getActiveFeatures();
        if (error) { setStatus({ ok: false, message: error }); return; }
        setRunning(true);
        setStatus(null);
        try {
            if (sceneCount > 0) {
                // Multi-clause scene: main clause + N tense-varied clauses, tiled with connectors.
                const placements = [{ id: 'main', ops: await runSemagram(luaSource, features), x: 0, y: 0 }];
                const baseIdx = TENSES.indexOf(features.tense);
                for (let i = 1; i <= sceneCount; i++) {
                    const t = TENSES[(baseIdx + i + TENSES.length) % TENSES.length];
                    const clone = { ...features, tense: t, tenseAngle: tenseToAngle(t) };
                    placements.push({ id: `c${i}`, ops: await runSemagram(luaSource, clone), x: i * 440, y: 0, parentId: 'main' });
                }
                const scene = composeScene(placements);
                setOps(scene.ops);
                setViewBox(scene.viewBox);
                setStatus({ ok: true, message: `Composed ${placements.length}-clause scene → ${scene.ops.length} ops.` });
            } else {
                const result = await runSemagram(luaSource, features);
                setOps(result);
                setViewBox('0 0 400 200');
                setStatus({ ok: true, message: `Rendered ${result.length} op${result.length === 1 ? '' : 's'}.` });
            }
        } catch (err) {
            setOps([]);
            const mapped = mapLuaError(err.message);
            setStatus({
                ok: false,
                message: mapped.line ? `Lua error (line ${mapped.line}): ${mapped.message}` : mapped.message,
            });
        } finally {
            setRunning(false);
        }
    }, [luaSource, getActiveFeatures, sceneCount]);

    const exportSvgNow = () => {
        if (!ops.length) return;
        const name = (semagraphicScripts.find((s) => s.id === selectedScriptId)?.name || 'semagram')
            .replace(/\s+/g, '-').toLowerCase();
        exportSvg(ops, viewBox, `${name}.svg`);
    };

    const precompute = () => {
        if (!selectedScriptId) { setSaveMsg('Select or create a script first.'); return; }
        if (!ops.length) { setSaveMsg('Run the script first, then cache.'); return; }
        const sc = scriptSystems.find((s) => s.id === selectedScriptId);
        updateScriptSystem(selectedScriptId, {
            type: 'semagraphic',
            semagram: {
                ...(sc?.semagram || {}),
                luaSource, viewBox,
                cachedOps: ops,
                precomputedAt: new Date().toISOString(),
            },
        });
        logActivity?.('Precomputed semagram for sharing');
        setSaveMsg(`Cached ${ops.length} ops — public viewers render these without running Lua.`);
    };

    const runAdversarial = useCallback(async (item) => {
        setAdversarialResults((prev) => ({ ...prev, [item.label]: { pending: true } }));
        let outcome;
        try {
            const result = await runSemagram(item.code, composedFeatures, { timeBudgetMs: 400 });
            outcome = { ok: true, message: `contained → ${result.length} valid op(s)` };
        } catch (err) {
            outcome = { ok: true, message: `blocked → ${err.message}` };
        }
        setAdversarialResults((prev) => ({ ...prev, [item.label]: outcome }));
    }, [composedFeatures]);

    const phonemeCount = composedFeatures.words.reduce((n, w) => n + w.phonemes.length, 0);

    return (
        <div className="sg-page">
            <div>
                <h1 className="sg-title"><Fish size={26} /> Semagram Studio <span className="sg-badge">Phase 1</span></h1>
                <p className="sg-desc">
                    Author a 2D semagraphic writing system in sandboxed <b>Lua</b>. Your script reads a{' '}
                    <code>features</code> table (grammar + phonology) and calls <code>emit(op)</code> to draw. The
                    script runs in an isolated WASM Worker; the host renders only validated geometry.
                </p>
            </div>

            <div className="sg-grid">
                {/* Editor + feature source */}
                <Card className="sg-editor-card">
                    <div className="sg-script-bar">
                        <select
                            value={selectedScriptId}
                            onChange={(e) => loadScript(e.target.value)}
                            title="Load a saved semagraphic script"
                        >
                            <option value="">— saved scripts —</option>
                            {semagraphicScripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select
                            value=""
                            onChange={(e) => { loadPreset(e.target.value); }}
                            title="Load a starter preset"
                        >
                            <option value="">Load preset…</option>
                            <option value="tsevhu">Tsevhu (ripples)</option>
                            <option value="heptapod">Heptapod (rings)</option>
                        </select>
                        <div className="sg-script-bar-spacer" />
                        <button className="sg-mini-btn" onClick={newScript} title="Save as a new script system">
                            <Plus size={14} /> New
                        </button>
                        <button className="sg-mini-btn" onClick={saveScript} disabled={!selectedScriptId} title="Save to the selected script system">
                            <Save size={14} /> Save
                        </button>
                    </div>

                    <label className="sg-label">Lua script</label>
                    <CodeEditor value={luaSource} onChange={setLuaSource} height={300} />
                    {saveMsg && <div className="sg-savemsg">{saveMsg}</div>}

                    <div className="sg-mode-row">
                        <button className={`sg-mode ${mode === 'compose' ? 'on' : ''}`} onClick={() => setMode('compose')}>
                            Compose clause
                        </button>
                        <button className={`sg-mode ${mode === 'sample' ? 'on' : ''}`} onClick={() => setMode('sample')}>
                            Sample JSON
                        </button>
                    </div>

                    {mode === 'compose' ? (
                        <div className="sg-compose">
                            <div className="sg-compose-grid">
                                <label>Tense
                                    <select value={clause.tense} onChange={(e) => setClauseField('tense', e.target.value)}>
                                        {TENSES.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </label>
                                <label>Aspect
                                    <select value={clause.aspect} onChange={(e) => setClauseField('aspect', e.target.value)}>
                                        {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </label>
                                <label>Mood
                                    <select value={clause.mood} onChange={(e) => setClauseField('mood', e.target.value)}>
                                        {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div className="sg-compose-grid">
                                <label>Verb
                                    <input value={clause.verb} onChange={(e) => setClauseField('verb', e.target.value)} placeholder="conlang word" />
                                </label>
                                <label>Active (subject)
                                    <input value={clause.active} onChange={(e) => setClauseField('active', e.target.value)} placeholder="conlang word" />
                                </label>
                                <label>Stative (object)
                                    <input value={clause.stative} onChange={(e) => setClauseField('stative', e.target.value)} placeholder="conlang word" />
                                </label>
                                <label>Oblique
                                    <input value={clause.oblique} onChange={(e) => setClauseField('oblique', e.target.value)} placeholder="optional" />
                                </label>
                            </div>
                            <p className="sg-hint">
                                Decomposed <b>{composedFeatures.words.length}</b> word(s) into <b>{phonemeCount}</b> phoneme(s)
                                using your project phonology. Head angle for <code>{composedFeatures.tense}</code> ={' '}
                                <code>{composedFeatures.tenseAngle}°</code>.
                            </p>
                            <details className="sg-details">
                                <summary>View generated features</summary>
                                <pre className="sg-json">{JSON.stringify(composedFeatures, null, 2)}</pre>
                            </details>
                        </div>
                    ) : (
                        <>
                            <label className="sg-label">features (JSON)</label>
                            <textarea
                                className="sg-code sg-code-sm"
                                spellCheck={false}
                                value={featuresText}
                                onChange={(e) => setFeaturesText(e.target.value)}
                            />
                        </>
                    )}

                    <div className="sg-actions">
                        <Button variant="save" onClick={run} disabled={running}>
                            {running ? <Loader2 size={16} className="sg-spin" /> : <Play size={16} />}
                            &nbsp;Run
                        </Button>
                        <label className="sg-scene-label">
                            Scene
                            <select value={sceneCount} onChange={(e) => setSceneCount(Number(e.target.value))} title="Tile multiple clauses with connectors">
                                <option value={0}>1 clause</option>
                                <option value={1}>2 clauses</option>
                                <option value={2}>3 clauses</option>
                                <option value={3}>4 clauses</option>
                            </select>
                        </label>
                        <Button variant="edit" onClick={exportSvgNow} disabled={!ops.length}>
                            <Download size={15} />&nbsp;SVG
                        </Button>
                        <Button variant="edit" onClick={precompute} disabled={!selectedScriptId || !ops.length}>
                            <Share2 size={15} />&nbsp;Precompute
                        </Button>
                    </div>
                    {status && <div className={`sg-status ${status.ok ? 'ok' : 'err'}`}>{status.message}</div>}
                </Card>

                {/* Preview */}
                <Card className="sg-preview-card">
                    <label className="sg-label">Preview <span className="sg-hint-inline">(scroll to zoom, drag to pan)</span></label>
                    <PanZoomContainer className="sg-preview-zoom">
                        <SemagramCanvas ops={ops} viewBox={viewBox} />
                    </PanZoomContainer>
                    <p className="sg-hint">
                        The host built {ops.length} SVG node{ops.length === 1 ? '' : 's'} from validated numbers —
                        no markup ever crossed the sandbox boundary.
                    </p>
                </Card>
            </div>

            {/* Adversarial harness */}
            <Card className="sg-adversarial">
                <h3 className="sg-sub"><ShieldAlert size={20} /> Sandbox acceptance suite</h3>
                <p className="sg-desc">
                    Each button runs a hostile or pathological script. “Contained” or “blocked” means the guarantee held.
                </p>
                <div className="sg-adv-list">
                    {ADVERSARIAL.map((item) => {
                        const res = adversarialResults[item.label];
                        return (
                            <div key={item.label} className="sg-adv-row">
                                <button className="sg-adv-btn" onClick={() => runAdversarial(item)}>{item.label}</button>
                                <span className="sg-adv-expect">expects: {item.expect}</span>
                                <span className={`sg-adv-result ${res ? (res.pending ? 'pending' : 'ok') : ''}`}>
                                    {res ? (res.pending ? 'running…' : `✓ ${res.message}`) : ''}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* In-app reference (Phase 4) */}
            <Card className="sg-reference">
                <h3 className="sg-sub"><BookOpen size={20} /> Reference</h3>
                <details className="sg-details" open>
                    <summary>emit(op) — drawing ops</summary>
                    <ul className="sg-ref-list">
                        {[...OP_TYPES].map((t) => (
                            <li key={t}><code>{t}</code> — {OP_DOCS[t]}</li>
                        ))}
                    </ul>
                </details>
                <details className="sg-details">
                    <summary>Built-in primitive helpers</summary>
                    <ul className="sg-ref-list">
                        {HELPER_DOCS.map((h) => <li key={h}><code>{h}</code></li>)}
                    </ul>
                </details>
                <details className="sg-details">
                    <summary>features table</summary>
                    <ul className="sg-ref-list">
                        {FEATURE_DOCS.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                </details>
            </Card>
        </div>
    );
}
