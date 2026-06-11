// src/components/pages/settings/grammarPatterns/GrammarPatternLibrary.jsx
import React, { useState, useMemo, useCallback } from 'react';
import { useConfigStore } from '../../../../store/useConfigStore.jsx';
import { applyRuleToWord } from '../../../../utils/morphologyEngine.jsx';
import { CATEGORY_LABELS } from '../../../../utils/grammarPatternLibrary.js';
import {
    getAllPatterns,
    getDefaultOptions,
    installPattern,
    uninstallPattern,
    previewPatternInstall
} from '../../../../utils/grammarPatternInstaller.js';
import {
    Languages, Clock, Hash, GitBranch, AlignJustify, X, BookOpen,
    ChevronRight, Search, CheckCircle2, AlertTriangle, ArrowLeft, Sparkles, Wand2
} from 'lucide-react';
import Card from '../../../UI/Card/Card.jsx';
import Infobox from '../../../UI/Infobox/Infobox.jsx';
import Button from '../../../UI/Buttons/Buttons.jsx';
import { VisualRuleBuilder } from '../grammarMatrix/VisualRuleBuilder.jsx';
import './grammarPatternLibrary.css';

// Map icon string names to components
const ICON_MAP = {
    Languages, Clock, Hash, GitBranch, AlignJustify, X, BookOpen, Sparkles
};
function getIcon(name) {
    return ICON_MAP[name] || BookOpen;
}

function renderIcon(name, props) {
    const IconComp = ICON_MAP[name] || BookOpen;
    return <IconComp {...props} />;
}

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────

const EMPTY_ARR = [];
const EMPTY_OBJ = {};

export default function GrammarPatternLibrary() {
    const updateConfig = useConfigStore((s) => s.updateConfig);
    const grammarRules = useConfigStore((s) => s.grammarRules) ?? EMPTY_ARR;
    const customWordClasses = useConfigStore((s) => s.customWordClasses) ?? EMPTY_ARR;
    const wordAssistConfig = useConfigStore((s) => s.wordAssistConfig) ?? EMPTY_OBJ;
    const installedGrammarPatterns = useConfigStore((s) => s.installedGrammarPatterns) ?? EMPTY_ARR;
    const vowels = useConfigStore((s) => s.vowels) ?? '';
    const consonants = useConfigStore((s) => s.consonants) ?? '';
    const otherPhonemes = useConfigStore((s) => s.otherPhonemes) ?? '';

    const [view, setView] = useState('browse'); // 'browse' | 'detail'
    const [selectedPattern, setSelectedPattern] = useState(null);
    const [options, setOptions] = useState({});
    const [affixOverrides, setAffixOverrides] = useState({});
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [installStatus, setInstallStatus] = useState(null); // { type, message }

    // ── Filtering ────────────────────────────────────────────

    const allPatterns = useMemo(() => getAllPatterns(), []);

    const filtered = useMemo(() => {
        let list = allPatterns;
        if (categoryFilter !== 'all') {
            list = list.filter(p => p.category === categoryFilter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.summary.toLowerCase().includes(q) ||
                p.tags.some(t => t.includes(q))
            );
        }
        return list;
    }, [allPatterns, categoryFilter, search]);

    const installedIds = useMemo(() => {
        return new Set(installedGrammarPatterns.map(m => m.patternId));
    }, [installedGrammarPatterns]);

    // ── Navigation ───────────────────────────────────────────

    const openPattern = useCallback((pattern) => {
        setSelectedPattern(pattern);
        setOptions(getDefaultOptions(pattern));
        setAffixOverrides({});
        setInstallStatus(null);
        setView('detail');
    }, []);

    const goBack = useCallback(() => {
        setView('browse');
        setSelectedPattern(null);
        setInstallStatus(null);
    }, []);

    // ── Preview ──────────────────────────────────────────────

    const currentConfig = useMemo(() => ({
        grammarRules,
        customWordClasses,
        wordAssistConfig,
        installedGrammarPatterns,
        vowels,
        consonants,
        otherPhonemes
    }), [grammarRules, customWordClasses, wordAssistConfig, installedGrammarPatterns, vowels, consonants, otherPhonemes]);

    const { previewRules, previewReport } = useMemo(() => {
        if (!selectedPattern) return { previewRules: [], previewReport: null };

        // Merge affix overrides into options before preview
        const opts = { ...options };
        // For multi options with affix overrides, store in a nested object
        if (Object.keys(affixOverrides).length > 0) {
            opts._affixOverrides = affixOverrides;
        }

        const { patch, report } = previewPatternInstall(selectedPattern.id, opts, currentConfig);
        const rules = patch.grammarRules || [];
        return { previewRules: rules, previewReport: report };
    }, [selectedPattern, options, affixOverrides, currentConfig]);

    const previewExamples = useMemo(() => {
        if (!selectedPattern || previewRules.length === 0) return [];
        const cfg = {
            grammarRules: [...grammarRules, ...previewRules],
            vowels, consonants, otherPhonemes
        };
        return previewRules.map(rule => {
            const ex = (selectedPattern.examples || []).find(
                e => rule.gloss && rule.gloss === e.label
            );
            if (!ex) return { rule, result: '—' };
            const result = applyRuleToWord(ex.base, rule, cfg.grammarRules, vowels, consonants, otherPhonemes);
            return { rule, example: ex, result: result || ex.base };
        });
    }, [selectedPattern, previewRules, grammarRules, vowels, consonants, otherPhonemes]);

    // ── Option changes ───────────────────────────────────────

    const handleOptionChange = useCallback((optId, value) => {
        setOptions(prev => ({ ...prev, [optId]: value }));
        setInstallStatus(null);
    }, []);

    const handleAffixOverride = useCallback((caseId, value) => {
        setAffixOverrides(prev => ({ ...prev, [caseId]: value }));
        setInstallStatus(null);
    }, []);

    // ── Install / Uninstall ──────────────────────────────────

    const handleInstall = useCallback(() => {
        if (!selectedPattern) return;

        // Merge affix overrides into options for the builder
        const opts = { ...options };
        if (Object.keys(affixOverrides).length > 0) {
            opts._affixOverrides = affixOverrides;
        }

        const { patch, report } = installPattern(selectedPattern.id, opts, currentConfig);

        if (report.error) {
            setInstallStatus({ type: 'error', message: report.error, details: report.conflicts });
            return;
        }

        updateConfig(patch);
        setInstallStatus({
            type: 'success',
            message: `Installed "${report.patternName}" — ${report.addedRules.length} rule(s) added.`
        });
    }, [selectedPattern, options, affixOverrides, currentConfig, updateConfig]);

    const handleUninstall = useCallback((instanceId) => {
        const { patch, report } = uninstallPattern(instanceId, currentConfig);
        if (report.error) {
            setInstallStatus({ type: 'error', message: report.error });
            return;
        }
        updateConfig(patch);
        setInstallStatus({
            type: 'success',
            message: `Removed "${report.patternName}" — ${report.removedRuleCount} rule(s) removed.`
        });
    }, [currentConfig, updateConfig]);

    // ── Render ───────────────────────────────────────────────

    return (
        <div className="grammar-pattern-library">
            <Infobox title="Grammar Pattern Library">
                Browse common linguistic systems and install pre-built grammar rules.
                <b> Generated rules are normal editable rules</b> — you can change them after installation.
                Installing never deletes your existing rules.
            </Infobox>

            {/* ── Installed patterns list ────────────────────── */}
            {installedGrammarPatterns.length > 0 && (
                <div className="gpl-installed-section">
                    <div className="gpl-installed-header">
                        <CheckCircle2 size={14} /> Installed Patterns
                    </div>
                    <div className="gpl-installed-list">
                        {installedGrammarPatterns.map(meta => (
                            <div className="gpl-installed-item" key={meta.instanceId}>
                                <div className="gpl-installed-info">
                                    <span className="gpl-installed-name">{meta.name}</span>
                                    <span className="gpl-installed-count">
                                        {meta.generatedRuleIds?.length || 0} rules
                                    </span>
                                    <span className="gpl-installed-date">
                                        {meta.installedAt ? new Date(meta.installedAt).toLocaleDateString() : ''}
                                    </span>
                                </div>
                                <button
                                    className="gpl-btn-remove-installed"
                                    onClick={() => handleUninstall(meta.instanceId)}
                                    title="Remove this pattern and its generated rules"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Status messages ────────────────────────────── */}
            {installStatus && (
                <div className={`gpl-conflict-box ${installStatus.type === 'error' ? 'error' : ''}`}>
                    {installStatus.type === 'error' && <AlertTriangle size={14} style={{ marginRight: 6 }} />}
                    {installStatus.type === 'success' && <CheckCircle2 size={14} style={{ marginRight: 6 }} />}
                    {installStatus.message}
                    {installStatus.details?.map((d, i) => <div key={i}>• {d}</div>)}
                </div>
            )}

            {/* ── Browse view ────────────────────────────────── */}
            {view === 'browse' && (
                <>
                    <div className="gpl-search-bar">
                        <Search size={16} color="var(--tx2)" />
                        <input
                            className="gpl-search-input fi"
                            type="text"
                            placeholder="Search patterns…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="gpl-category-pills">
                        <button
                            className={`gpl-category-pill ${categoryFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setCategoryFilter('all')}
                        >
                            All
                        </button>
                        {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                            <button
                                key={id}
                                className={`gpl-category-pill ${categoryFilter === id ? 'active' : ''}`}
                                onClick={() => setCategoryFilter(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {filtered.length === 0 ? (
                        <div className="gpl-empty">
                            <div className="gpl-empty-icon"><Search size={32} /></div>
                            No patterns found.
                        </div>
                    ) : (
                        <div className="gpl-grid">
                            {filtered.map(pattern => {
                                const Icon = getIcon(pattern.icon);
                                const isInstalled = installedIds.has(pattern.id);
                                return (
                                    <div
                                        key={pattern.id}
                                        className={`gpl-pattern-card ${isInstalled ? 'installed' : ''}`}
                                        onClick={() => openPattern(pattern)}
                                    >
                                        <div className="gpl-card-header">
                                            <Icon size={20} />
                                            <span className="gpl-card-title">{pattern.name}</span>
                                            {isInstalled && (
                                                <span className="gpl-installed-badge">
                                                    <CheckCircle2 size={11} /> Installed
                                                </span>
                                            )}
                                        </div>
                                        <div className="gpl-card-summary">{pattern.summary}</div>
                                        <div className="gpl-card-tags">
                                            {pattern.tags.slice(0, 4).map(tag => (
                                                <span key={tag} className="gpl-tag">{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ── Detail view ────────────────────────────────── */}
            {view === 'detail' && selectedPattern && (
                <PatternDetail
                    pattern={selectedPattern}
                    options={options}
                    affixOverrides={affixOverrides}
                    previewRules={previewRules}
                    previewReport={previewReport}
                    previewExamples={previewExamples}
                    isInstalled={installedIds.has(selectedPattern.id)}
                    onBack={goBack}
                    onOptionChange={handleOptionChange}
                    onAffixOverride={handleAffixOverride}
                    onInstall={handleInstall}
                />
            )}
        </div>
    );
}


// ────────────────────────────────────────────────────────────
// Detail sub-component
// ────────────────────────────────────────────────────────────

function PatternDetail({
    pattern,
    options,
    affixOverrides,
    previewRules,
    previewReport,
    previewExamples,
    isInstalled,
    onBack,
    onOptionChange,
    onAffixOverride,
    onInstall
}) {
    const iconProps = { size: 24 };
    const [vrbOpen, setVrbOpen] = useState(false);
    const [vrbTarget, setVrbTarget] = useState(null); // which affix field the VRB writes to

    // Determine which options are visible based on showWhen conditions
    const visibleOptions = useMemo(() => {
        return (pattern.options || []).filter(opt => {
            if (!opt.showWhen) return true;
            return Object.entries(opt.showWhen).every(([key, val]) => options[key] === val);
        });
    }, [pattern.options, options]);

    const markerStyle = options.markerStyle || 'suffix';
    const isCustomMode = markerStyle === 'custom';

    // Open VRB for a specific affix override field
    /* eslint-disable react-hooks/preserve-manual-memoization */
    const handleOpenVRB = useCallback((targetId, currentAffix) => {
        setVrbTarget({ id: targetId, currentAffix: currentAffix || '' });
        setVrbOpen(true);
    }, []);

    // VRB applies compiled rule to the target affix field
    const handleVRBApply = useCallback((compiledRule) => {
        if (vrbTarget) {
            onAffixOverride(vrbTarget.id, compiledRule);
        }
        setVrbOpen(false);
        setVrbTarget(null);
    }, [vrbTarget, onAffixOverride]);
    /* eslint-enable react-hooks/preserve-manual-memoization */

    return (
        <div className="gpl-detail-panel">
            <button className="gpl-btn-back" onClick={onBack}>
                <ArrowLeft size={14} /> Back to patterns
            </button>

            <div className="gpl-detail-header" style={{ marginTop: 12 }}>
                {renderIcon(pattern.icon, iconProps)}
                <span className="gpl-detail-title">{pattern.name}</span>
                {isInstalled && (
                    <span className="gpl-installed-badge">
                        <CheckCircle2 size={11} /> Installed
                    </span>
                )}
            </div>

            <div className="gpl-detail-summary">{pattern.summary}</div>

            {/* ── Options ──────────────────────────────────── */}
            <div className="gpl-options-section">
                {visibleOptions.map(opt => (
                    <OptionField
                        key={opt.id}
                        option={opt}
                        value={options[opt.id]}
                        onChange={(val) => onOptionChange(opt.id, val)}
                        allOptions={options}
                        affixOverrides={affixOverrides}
                        onAffixOverride={onAffixOverride}
                        onOpenVRB={handleOpenVRB}
                    />
                ))}
            </div>

            {/* ── Custom mode hint ──────────────────────────── */}
            {isCustomMode && (
                <div className="gpl-conflict-box" style={{ borderColor: 'var(--acc)', color: 'var(--acc)' }}>
                    <Wand2 size={14} style={{ marginRight: 6 }} />
                    <b>Custom mode:</b> Edit affixes in the table below as regex rules (e.g. <code>n(?=[pb]) =&gt; m</code> or <code>-ma-@V</code>).
                    Click the <Wand2 size={12} style={{ verticalAlign: 'middle' }} /> icon next to any affix to open the Visual Rule Builder.
                </div>
            )}

            {/* ── Preview table ────────────────────────────── */}
            {previewRules.length > 0 && (
                <>
                    <h4 style={{ color: 'var(--tx)', fontSize: '0.9rem', marginBottom: 8 }}>
                        Generated Rules Preview
                    </h4>
                    <table className="gpl-preview-table">
                        <thead>
                            <tr>
                                <th>Rule Name</th>
                                <th>Affix</th>
                                <th>Applies To</th>
                                <th>Gloss</th>
                                <th>Target POS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {previewRules.map(rule => (
                                <tr key={rule.id}>
                                    <td>{rule.name}</td>
                                    <td><span className="gpl-preview-word">{rule.affix}</span></td>
                                    <td>{rule.appliesTo}</td>
                                    <td>{rule.gloss || '—'}</td>
                                    <td>{rule.targetPOS || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* ── Example applications ─────────────────────── */}
            {previewExamples.length > 0 && (
                <>
                    <h4 style={{ color: 'var(--tx)', fontSize: '0.9rem', marginBottom: 8 }}>
                        Example Applications
                    </h4>
                    <table className="gpl-preview-table">
                        <thead>
                            <tr>
                                <th>Base Word</th>
                                <th>Rule</th>
                                <th>Output</th>
                            </tr>
                        </thead>
                        <tbody>
                            {previewExamples.map((ex, i) => (
                                <tr key={i}>
                                    <td><span className="gpl-preview-word">{ex.example?.base || '—'}</span></td>
                                    <td>{ex.rule.name} ({ex.rule.gloss})</td>
                                    <td><span className="gpl-preview-word">{ex.result}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* ── Conflict warnings ────────────────────────── */}
            {previewReport?.conflicts?.length > 0 && (
                <div className="gpl-conflict-box error">
                    <AlertTriangle size={14} style={{ marginRight: 6 }} />
                    Conflicts detected:
                    {previewReport.conflicts.map((c, i) => <div key={i}>• {c}</div>)}
                </div>
            )}
            {previewReport?.warnings?.length > 0 && (
                <div className="gpl-conflict-box">
                    <AlertTriangle size={14} style={{ marginRight: 6 }} />
                    {previewReport.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                </div>
            )}

            {/* ── Actions ──────────────────────────────────── */}
            <div className="gpl-actions">
                <button
                    className="gpl-btn-install"
                    onClick={onInstall}
                    disabled={previewRules.length === 0 || previewReport?.conflicts?.length > 0}
                >
                    {isInstalled ? 'Install Another Instance' : 'Install Pattern'}
                </button>
            </div>

            {/* ── Visual Rule Builder modal ─────────────────── */}
            <VisualRuleBuilder
                isOpen={vrbOpen}
                onClose={() => { setVrbOpen(false); setVrbTarget(null); }}
                onApply={handleVRBApply}
                currentAffix={vrbTarget?.currentAffix || ''}
                initialMode={isCustomMode ? 'mutation' : 'standard'}
            />
        </div>
    );
}


// ────────────────────────────────────────────────────────────
// Option field renderer
// ────────────────────────────────────────────────────────────

function OptionField({ option, value, onChange, allOptions, affixOverrides, onAffixOverride, onOpenVRB }) {
    const { type, label, choices, showWhen } = option;
    const currentValue = value !== undefined ? value : option.defaultValue;

    // Evaluate showWhen conditions
    if (showWhen && allOptions) {
        const shouldShow = Object.entries(showWhen).every(([key, val]) => allOptions[key] === val);
        if (!shouldShow) return null;
    }

    if (type === 'text') {
        return (
            <div className="gpl-option-group">
                <label className="gpl-option-label">{label}</label>
                <input
                    className="gpl-option-input fi"
                    type="text"
                    value={currentValue || ''}
                    onChange={e => onChange(e.target.value)}
                />
            </div>
        );
    }

    if (type === 'select') {
        return (
            <div className="gpl-option-group">
                <label className="gpl-option-label">{label}</label>
                <select
                    className="gpl-option-select fi"
                    value={currentValue || ''}
                    onChange={e => onChange(e.target.value)}
                >
                    {(choices || []).map(c => {
                        const val = typeof c === 'string' ? c : c.id;
                        const lbl = typeof c === 'string' ? c : c.label || c.id;
                        return <option key={val} value={val}>{lbl}</option>;
                    })}
                </select>
            </div>
        );
    }

    if (type === 'multi') {
        const selected = Array.isArray(currentValue) ? currentValue : [];
        const isCustomMode = allOptions?.markerStyle === 'custom' || allOptions?.style === 'custom';
        return (
            <div className="gpl-option-group">
                <label className="gpl-option-label">{label}</label>
                <div className="gpl-multi-options">
                    {(choices || []).map(c => {
                        const choiceId = typeof c === 'string' ? c : c.id;
                        const choiceLabel = typeof c === 'string' ? c : c.label || c.id;
                        const isSelected = selected.includes(choiceId);
                        return (
                            <button
                                key={choiceId}
                                className={`gpl-multi-chip ${isSelected ? 'selected' : ''}`}
                                onClick={() => {
                                    const next = isSelected
                                        ? selected.filter(s => s !== choiceId)
                                        : [...selected, choiceId];
                                    onChange(next);
                                }}
                            >
                                {choiceLabel}
                            </button>
                        );
                    })}
                </div>

                {/* Affix override table for multi-options with affix metadata */}
                {selected.length > 0 && choices?.[0]?.defaultAffix !== undefined && (
                    <table className="gpl-affix-table" style={{ marginTop: 8 }}>
                        <thead>
                            <tr>
                                <th>Feature</th>
                                <th>Affix</th>
                                <th>Gloss</th>
                                {onOpenVRB && <th>Builder</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {selected.map(selId => {
                                const meta = choices.find(c => (c.id || c) === selId);
                                if (!meta || typeof meta === 'string') return null;
                                const currentAffix = affixOverrides?.[selId] ?? meta.defaultAffix;
                                return (
                                    <tr key={selId}>
                                        <td>{meta.label}</td>
                                        <td>
                                            <input
                                                className="gpl-affix-input fi"
                                                value={currentAffix || ''}
                                                onChange={e => onAffixOverride(selId, e.target.value)}
                                                placeholder={isCustomMode ? 'regex: pattern => replacement' : meta.defaultAffix}
                                            />
                                        </td>
                                        <td>{meta.gloss || '—'}</td>
                                        {onOpenVRB && (
                                            <td>
                                                <button
                                                    className="gpl-vrb-btn"
                                                    onClick={() => onOpenVRB(selId, currentAffix)}
                                                    title="Open Visual Rule Builder"
                                                >
                                                    <Wand2 size={14} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        );
    }

    return null;
}
