// src/utils/grammarPatternLibrary.js
// Pure data catalog of reusable grammar patterns.
// No React imports. No store imports. Testable with plain Node.

/**
 * Pattern categories for filtering/grouping in the UI.
 */
export const GRAMMAR_PATTERN_CATEGORIES = [
    'case',
    'tense-aspect-mood',
    'number',
    'alignment',
    'derivation',
    'particles'
];

/**
 * Category display labels for UI.
 */
export const CATEGORY_LABELS = {
    'case': 'Case Systems',
    'tense-aspect-mood': 'Tense / Aspect / Mood',
    'number': 'Number',
    'alignment': 'Alignment',
    'derivation': 'Derivation',
    'particles': 'Particles & Markers'
};

/**
 * All supported marker styles.
 * 'suffix'    → -morpheme
 * 'prefix'    → morpheme-
 * 'infix'     → -morpheme-@V  or  -morpheme-@C
 * 'custom'    → regex pattern => replacement (SCA-style)
 */
export const MARKER_STYLES = ['suffix', 'prefix', 'infix', 'custom'];

/**
 * Shared helper — converts a default affix string to a different marker style.
 * e.g. convertAffix('-n', 'prefix') → 'n-'
 *      convertAffix('-n', 'infix', '@V') → '-n-@V'
 *      convertAffix('-n', 'infix', '@C') → '-n-@C'
 *      convertAffix('-n', 'custom', null, 'n', '') → 'n => '  (not useful alone; custom uses raw regex)
 */
export function convertAffix(affix, style, infixPos = '@V') {
    if (!affix) return '';
    const clean = affix.replace(/^-|-$/g, '');
    if (!clean) return '';
    switch (style) {
        case 'prefix': return clean + '-';
        case 'infix':  return '-' + clean + '-' + infixPos;
        case 'suffix': return '-' + clean;
        default:       return '-' + clean;
    }
}

/**
 * Resolve the final affix for a rule, preferring user overrides from the affix table.
 * @param {string} choiceId
 * @param {string} computedAffix — affix after convertAffix or default
 * @param {object} [affixOverrides] — { [choiceId]: userEditedAffix }
 * @returns {string}
 */
function resolveAffix(choiceId, computedAffix, affixOverrides) {
    if (affixOverrides && affixOverrides[choiceId] !== undefined && affixOverrides[choiceId] !== '') {
        return affixOverrides[choiceId];
    }
    return computedAffix;
}

/**
 * Each pattern definition contains:
 *   id        — stable identifier (e.g. 'case.basic')
 *   version   — schema version for migration
 *   category  — one of GRAMMAR_PATTERN_CATEGORIES
 *   name      — user-facing name
 *   summary   — short description
 *   icon      — lucide icon name (string)
 *   tags      — search/filter tags
 *   options   — array of user-configurable parameters
 *   examples  — array of { base, output, label } for preview
 *   build     — function({ options, currentConfig, instanceId }) → PatchData
 */
export const GRAMMAR_PATTERNS = [

    // ─────────────────────────────────────────────
    // CASE SYSTEMS
    // ─────────────────────────────────────────────
    {
        id: 'case.basic',
        version: 2,
        category: 'case',
        name: 'Noun Case System',
        summary: 'Add case markers to nouns and pronouns — suffix, prefix, infix, or custom regex.',
        icon: 'Languages',
        tags: ['noun', 'case', 'syntax', 'nom-acc', 'erg-abs'],
        options: [
            { id: 'appliesTo',     type: 'text',   label: 'Applies To (POS)', defaultValue: 'noun' },
            { id: 'markerStyle',   type: 'select', label: 'Marker Style',     defaultValue: 'suffix',
              choices: ['suffix', 'prefix', 'infix', 'custom'] },
            { id: 'infixPosition', type: 'select', label: 'Infix Position',   defaultValue: '@V',
              choices: ['@V', '@C'], showWhen: { markerStyle: 'infix' } },
            { id: 'cases',         type: 'multi',  label: 'Cases to Generate', defaultValue: ['accusative', 'genitive', 'dative'],
              choices: [
                { id: 'nominative',   label: 'Nominative',   defaultAffix: '',   gloss: 'NOM' },
                { id: 'accusative',   label: 'Accusative',   defaultAffix: '-n', gloss: 'ACC' },
                { id: 'genitive',     label: 'Genitive',     defaultAffix: '-s', gloss: 'GEN' },
                { id: 'dative',       label: 'Dative',       defaultAffix: '-da', gloss: 'DAT' },
                { id: 'locative',     label: 'Locative',     defaultAffix: '-la', gloss: 'LOC' },
                { id: 'instrumental', label: 'Instrumental', defaultAffix: '-in', gloss: 'INS' },
                { id: 'ablative',     label: 'Ablative',     defaultAffix: '-at', gloss: 'ABL' },
                { id: 'vocative',     label: 'Vocative',     defaultAffix: '-o', gloss: 'VOC' }
              ]
            }
        ],
        examples: [
            { base: 'kala', output: 'kalan',  label: 'ACC' },
            { base: 'kala', output: 'kalas',  label: 'GEN' },
            { base: 'kala', output: 'kalada', label: 'DAT' }
        ],
        build({ options, instanceId }) {
            const { appliesTo = 'noun', markerStyle = 'suffix', infixPosition = '@V', cases = [] } = options;
            const overrides = options._affixOverrides || {};
            const rules = [];

            for (const caseId of cases) {
                const choiceMeta = (this.options.find(o => o.id === 'cases')?.choices || [])
                    .find(c => c.id === caseId);
                if (!choiceMeta) continue;

                const rawAffix = choiceMeta.defaultAffix || '';
                if (!rawAffix && !overrides[caseId]) continue;

                let computed;
                if (markerStyle === 'custom') {
                    computed = rawAffix;
                } else {
                    computed = convertAffix(rawAffix, markerStyle, infixPosition);
                }

                const affix = resolveAffix(caseId, computed, overrides);

                rules.push({
                    id:         `rule_${instanceId}_${caseId}`,
                    name:       `${caseId.charAt(0).toUpperCase() + caseId.slice(1)} Case`,
                    affix,
                    appliesTo,
                    condition:  'always',
                    dependency: '',
                    standalone: false,
                    applyToPersons: true,
                    gloss:      caseId.slice(0, 3).toUpperCase(),
                    targetPOS:  '',
                    source:             'grammarPatternLibrary',
                    sourcePatternId:    'case.basic',
                    sourcePatternInstanceId: instanceId
                });
            }

            return { grammarRules: rules, customWordClasses: [], wordAssistConfigPatch: {} };
        }
    },

    // ─────────────────────────────────────────────
    // TENSE / ASPECT / MOOD
    // ─────────────────────────────────────────────
    {
        id: 'tam.basic',
        version: 2,
        category: 'tense-aspect-mood',
        name: 'Tense & Aspect System',
        summary: 'Generate tense and aspect markers for verbs — suffix, prefix, infix, or custom regex.',
        icon: 'Clock',
        tags: ['verb', 'tense', 'aspect', 'morphology'],
        options: [
            { id: 'appliesTo', type: 'text', label: 'Applies To (POS)', defaultValue: 'verb' },
            { id: 'markerStyle', type: 'select', label: 'Marker Style', defaultValue: 'suffix',
              choices: ['suffix', 'prefix', 'infix', 'custom'] },
            { id: 'infixPosition', type: 'select', label: 'Infix Position', defaultValue: '@V',
              choices: ['@V', '@C'], showWhen: { markerStyle: 'infix' } },
            { id: 'features', type: 'multi', label: 'Features to Generate', defaultValue: ['past', 'future', 'progressive', 'perfect'],
              choices: [
                { id: 'past',        label: 'Past',        defaultAffix: '-ta', gloss: 'PST',  waTrigger: { trigger: 'was, did', type: 'word', position: 'suffix' } },
                { id: 'future',      label: 'Future',      defaultAffix: '-ru', gloss: 'FUT',  waTrigger: { trigger: 'will', type: 'word', position: 'suffix' } },
                { id: 'progressive', label: 'Progressive', defaultAffix: '-na', gloss: 'PROG', waTrigger: { trigger: '-ing', type: 'suffix', position: 'suffix' } },
                { id: 'perfect',     label: 'Perfect',     defaultAffix: '-ka', gloss: 'PRF',  waTrigger: { trigger: 'have, has, had', type: 'word', position: 'suffix' } },
                { id: 'habitual',    label: 'Habitual',    defaultAffix: '-zu', gloss: 'HAB',  waTrigger: null }
              ]
            }
        ],
        examples: [
            { base: 'mara', output: 'marata',  label: 'PST' },
            { base: 'mara', output: 'mararu',  label: 'FUT' },
            { base: 'mara', output: 'marana',  label: 'PROG' }
        ],
        build({ options, instanceId }) {
            const { appliesTo = 'verb', markerStyle = 'suffix', infixPosition = '@V', features = [] } = options;
            const overrides = options._affixOverrides || {};
            const rules = [];
            const waTriggers = [];

            for (const featId of features) {
                const choiceMeta = (this.options.find(o => o.id === 'features')?.choices || [])
                    .find(c => c.id === featId);
                if (!choiceMeta) continue;

                const rawAffix = choiceMeta.defaultAffix || '';
                if (!rawAffix && !overrides[featId]) continue;

                let computed;
                if (markerStyle === 'custom') {
                    computed = rawAffix;
                } else {
                    computed = convertAffix(rawAffix, markerStyle, infixPosition);
                }

                const affix = resolveAffix(featId, computed, overrides);

                rules.push({
                    id:         `rule_${instanceId}_${featId}`,
                    name:       `${choiceMeta.label} Tense`,
                    affix,
                    appliesTo,
                    condition:  'always',
                    dependency: '',
                    standalone: false,
                    applyToPersons: false,
                    gloss:      choiceMeta.gloss,
                    targetPOS:  '',
                    source:             'grammarPatternLibrary',
                    sourcePatternId:    'tam.basic',
                    sourcePatternInstanceId: instanceId
                });

                if (choiceMeta.waTrigger) {
                    waTriggers.push({
                        id:       `gpl_${instanceId}_${featId}`,
                        name:     `${choiceMeta.label} (${choiceMeta.gloss})`,
                        ...choiceMeta.waTrigger,
                        type:     choiceMeta.waTrigger.type || 'word',
                        priority: 5
                    });
                }
            }

            return { grammarRules: rules, customWordClasses: [], wordAssistConfigPatch: { triggers: waTriggers } };
        }
    },

    // ─────────────────────────────────────────────
    // NUMBER SYSTEM
    // ─────────────────────────────────────────────
    {
        id: 'number.basic',
        version: 2,
        category: 'number',
        name: 'Number System',
        summary: 'Generate plural, dual, and other number markers — suffix, prefix, infix, or custom regex.',
        icon: 'Hash',
        tags: ['noun', 'number', 'plural', 'dual', 'collective'],
        options: [
            { id: 'appliesTo',   type: 'text',   label: 'Applies To (POS)', defaultValue: 'noun' },
            { id: 'markerStyle', type: 'select', label: 'Marker Style',     defaultValue: 'suffix',
              choices: ['suffix', 'prefix', 'infix', 'custom'] },
            { id: 'infixPosition', type: 'select', label: 'Infix Position', defaultValue: '@V',
              choices: ['@V', '@C'], showWhen: { markerStyle: 'infix' } },
            { id: 'numbers',     type: 'multi',  label: 'Numbers to Generate', defaultValue: ['plural'],
              choices: [
                { id: 'plural',     label: 'Plural',     defaultAffix: '-i',  gloss: 'PL',   waTrigger: { trigger: '-s', type: 'suffix', position: 'suffix' } },
                { id: 'dual',       label: 'Dual',       defaultAffix: '-du', gloss: 'DU',   waTrigger: null },
                { id: 'trial',      label: 'Trial',      defaultAffix: '-tri', gloss: 'TRI', waTrigger: null },
                { id: 'paucal',     label: 'Paucal',     defaultAffix: '-po', gloss: 'PAUC', waTrigger: null },
                { id: 'collective', label: 'Collective',  defaultAffix: '-om', gloss: 'COLL', waTrigger: null }
              ]
            }
        ],
        examples: [
            { base: 'kala', output: 'kalai',  label: 'PL' },
            { base: 'kala', output: 'kaladu', label: 'DU' }
        ],
        build({ options, instanceId }) {
            const { appliesTo = 'noun', markerStyle = 'suffix', infixPosition = '@V', numbers = [] } = options;
            const overrides = options._affixOverrides || {};
            const rules = [];
            const waTriggers = [];

            for (const numId of numbers) {
                const choiceMeta = (this.options.find(o => o.id === 'numbers')?.choices || [])
                    .find(c => c.id === numId);
                if (!choiceMeta) continue;

                const rawAffix = choiceMeta.defaultAffix || '';
                if (!rawAffix && !overrides[numId]) continue;

                let computed;
                if (markerStyle === 'custom') {
                    computed = rawAffix;
                } else {
                    computed = convertAffix(rawAffix, markerStyle, infixPosition);
                }

                const affix = resolveAffix(numId, computed, overrides);

                rules.push({
                    id:         `rule_${instanceId}_${numId}`,
                    name:       `${choiceMeta.label} Number`,
                    affix,
                    appliesTo,
                    condition:  'always',
                    dependency: '',
                    standalone: false,
                    applyToPersons: false,
                    gloss:      choiceMeta.gloss,
                    targetPOS:  '',
                    source:             'grammarPatternLibrary',
                    sourcePatternId:    'number.basic',
                    sourcePatternInstanceId: instanceId
                });

                if (choiceMeta.waTrigger) {
                    waTriggers.push({
                        id:       `gpl_${instanceId}_${numId}`,
                        name:     `${choiceMeta.label} (${choiceMeta.gloss})`,
                        ...choiceMeta.waTrigger,
                        type:     choiceMeta.waTrigger.type || 'suffix',
                        priority: 3
                    });
                }
            }

            return { grammarRules: rules, customWordClasses: [], wordAssistConfigPatch: { triggers: waTriggers } };
        }
    },

    // ─────────────────────────────────────────────
    // DERIVATIONAL MORPHOLOGY
    // ─────────────────────────────────────────────
    {
        id: 'derivation.basic',
        version: 2,
        category: 'derivation',
        name: 'Derivational Morphology',
        summary: 'Generate rules that change word class — agent nouns, abstract nouns, adjectivizers, causatives. Supports suffix, prefix, infix, or custom regex.',
        icon: 'GitBranch',
        tags: ['derivation', 'word-class', 'agent', 'causative'],
        options: [
            { id: 'markerStyle', type: 'select', label: 'Marker Style', defaultValue: 'suffix',
              choices: ['suffix', 'prefix', 'infix', 'custom'] },
            { id: 'infixPosition', type: 'select', label: 'Infix Position', defaultValue: '@V',
              choices: ['@V', '@C'], showWhen: { markerStyle: 'infix' } },
            { id: 'rules', type: 'multi', label: 'Derivations to Generate', defaultValue: ['agent', 'abstract', 'adjectivizer'],
              choices: [
                { id: 'agent',        label: 'Agent Noun (verb→noun)',     defaultAffix: '-er',  gloss: 'AGT',  appliesTo: 'verb',    targetPOS: 'noun' },
                { id: 'abstract',     label: 'Abstract Noun (adj→noun)',   defaultAffix: '-ness', gloss: 'ABST', appliesTo: 'adjective', targetPOS: 'noun' },
                { id: 'adjectivizer', label: 'Adjectivizer (noun→adj)',    defaultAffix: '-ful',  gloss: 'ADJZ', appliesTo: 'noun',    targetPOS: 'adjective' },
                { id: 'causative',    label: 'Causative (verb→verb)',      defaultAffix: '-caus', gloss: 'CAUS', appliesTo: 'verb',    targetPOS: 'verb' },
                { id: 'diminutive',   label: 'Diminutive (noun→noun)',     defaultAffix: '-li',   gloss: 'DIM',  appliesTo: 'noun',    targetPOS: 'noun' },
                { id: 'augmentative', label: 'Augmentative (noun→noun)',   defaultAffix: '-go',   gloss: 'AUG',  appliesTo: 'noun',    targetPOS: 'noun' }
              ]
            }
        ],
        examples: [
            { base: 'teach', output: 'teacher',  label: 'AGT' },
            { base: 'kind',  output: 'kindness', label: 'ABST' },
            { base: 'hope',  output: 'hopeful',  label: 'ADJZ' }
        ],
        build({ options, instanceId }) {
            const { rules: ruleIds = [], markerStyle = 'suffix', infixPosition = '@V' } = options;
            const overrides = options._affixOverrides || {};
            const rules = [];

            for (const ruleId of ruleIds) {
                const choiceMeta = (this.options.find(o => o.id === 'rules')?.choices || [])
                    .find(c => c.id === ruleId);
                if (!choiceMeta) continue;

                const rawAffix = choiceMeta.defaultAffix || '';
                let computed;
                if (markerStyle === 'custom') {
                    computed = rawAffix;
                } else {
                    computed = convertAffix(rawAffix, markerStyle, infixPosition);
                }

                const affix = resolveAffix(ruleId, computed, overrides);

                rules.push({
                    id:         `rule_${instanceId}_${ruleId}`,
                    name:       `${choiceMeta.label} Rule`,
                    affix,
                    appliesTo:  choiceMeta.appliesTo || 'all',
                    condition:  'always',
                    dependency: '',
                    standalone: true,
                    applyToPersons: false,
                    gloss:      choiceMeta.gloss,
                    targetPOS:  choiceMeta.targetPOS || '',
                    source:             'grammarPatternLibrary',
                    sourcePatternId:    'derivation.basic',
                    sourcePatternInstanceId: instanceId
                });
            }

            return { grammarRules: rules, customWordClasses: [], wordAssistConfigPatch: {} };
        }
    },

    // ─────────────────────────────────────────────
    // ALIGNMENT
    // ─────────────────────────────────────────────
    {
        id: 'alignment.basic',
        version: 2,
        category: 'alignment',
        name: 'Basic Alignment Markers',
        summary: 'Generate subject/object markers for nominative-accusative or ergative-absolutive alignment.',
        icon: 'AlignJustify',
        tags: ['alignment', 'case', 'syntax', 'nom-acc', 'erg-abs'],
        options: [
            { id: 'type',        type: 'select', label: 'Alignment Type', defaultValue: 'nom-acc',
              choices: ['nom-acc', 'erg-abs'] },
            { id: 'appliesTo',   type: 'text',   label: 'Applies To (POS)', defaultValue: 'noun, pronoun' },
            { id: 'markerStyle', type: 'select', label: 'Marker Style',     defaultValue: 'suffix',
              choices: ['suffix', 'prefix', 'infix', 'custom'] },
            { id: 'infixPosition', type: 'select', label: 'Infix Position', defaultValue: '@V',
              choices: ['@V', '@C'], showWhen: { markerStyle: 'infix' } }
        ],
        examples: [
            { base: 'kala', output: 'kalan', label: 'ACC (nom-acc)' }
        ],
        build({ options, instanceId }) {
            const { type: alignType = 'nom-acc', appliesTo = 'noun, pronoun', markerStyle = 'suffix', infixPosition = '@V' } = options;
            const rules = [];

            const rawAffix = alignType === 'nom-acc' ? '-n' : '-ga';
            let affix;
            if (markerStyle === 'custom') {
                affix = rawAffix;
            } else {
                affix = convertAffix(rawAffix, markerStyle, infixPosition);
            }

            const gloss = alignType === 'nom-acc' ? 'ACC' : 'ERG';
            const name  = alignType === 'nom-acc' ? 'Accusative Case' : 'Ergative Case';

            rules.push({
                id:         `rule_${instanceId}_${gloss.toLowerCase()}`,
                name,
                affix,
                appliesTo,
                condition:  'always',
                dependency: '',
                standalone: false,
                applyToPersons: true,
                gloss,
                targetPOS:  '',
                source:             'grammarPatternLibrary',
                sourcePatternId:    'alignment.basic',
                sourcePatternInstanceId: instanceId
            });

            return { grammarRules: rules, customWordClasses: [], wordAssistConfigPatch: {} };
        }
    },

    // ─────────────────────────────────────────────
    // PARTICLES & MARKERS
    // ─────────────────────────────────────────────
    {
        id: 'particles.negative',
        version: 2,
        category: 'particles',
        name: 'Negation Marker',
        summary: 'Add a negation particle or affix — suffix, prefix, infix, free word, or custom regex.',
        icon: 'X',
        tags: ['negation', 'particle', 'syntax'],
        options: [
            { id: 'style',     type: 'select', label: 'Style',     defaultValue: 'suffix',
              choices: ['suffix', 'prefix', 'infix', 'free-word', 'custom'] },
            { id: 'infixPosition', type: 'select', label: 'Infix Position', defaultValue: '@V',
              choices: ['@V', '@C'], showWhen: { style: 'infix' } },
            { id: 'morpheme',  type: 'text',   label: 'Morpheme',  defaultValue: '-na' },
            { id: 'appliesTo', type: 'text',   label: 'Applies To', defaultValue: 'verb' }
        ],
        examples: [
            { base: 'mara', output: 'marana', label: 'NEG' }
        ],
        build({ options, instanceId }) {
            const { style = 'suffix', infixPosition = '@V', morpheme = '-na', appliesTo = 'verb' } = options;
            let affix = morpheme;

            if (style === 'free-word') {
                affix = morpheme.replace(/^-|-$/g, '');
            } else if (style === 'infix') {
                const clean = morpheme.replace(/^-|-$/g, '');
                affix = '-' + clean + '-' + infixPosition;
            } else if (style === 'prefix') {
                const clean = morpheme.replace(/^-|-$/g, '');
                affix = clean + '-';
            } else if (style === 'custom') {
                affix = morpheme; // user provides raw regex
            }

            const rules = [{
                id:         `rule_${instanceId}_neg`,
                name:       'Negation',
                affix,
                appliesTo,
                condition:  'always',
                dependency: '',
                standalone: style === 'free-word',
                applyToPersons: false,
                gloss:      'NEG',
                targetPOS:  '',
                source:             'grammarPatternLibrary',
                sourcePatternId:    'particles.negative',
                sourcePatternInstanceId: instanceId
            }];

            const waTriggers = [{
                id:       `gpl_${instanceId}_neg`,
                name:     'Negation (NEG)',
                trigger:  'not',
                type:     'word',
                position: style === 'prefix' ? 'prefix' : style === 'free-word' ? 'beforeVerb' : 'suffix',
                priority: 1
            }];

            return { grammarRules: rules, customWordClasses: [], wordAssistConfigPatch: { triggers: waTriggers } };
        }
    }
];

/**
 * Get a pattern by ID.
 * @param {string} patternId
 * @returns {object|null}
 */
export function getPatternById(patternId) {
    return GRAMMAR_PATTERNS.find(p => p.id === patternId) || null;
}
