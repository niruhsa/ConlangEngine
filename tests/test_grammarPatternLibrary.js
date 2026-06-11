// test_grammarPatternLibrary.js
// Root-level Node test for Grammar Pattern Library (utils + installer).
// Run: node test_grammarPatternLibrary.js
/* eslint-disable no-unused-vars, no-undef */

import { GRAMMAR_PATTERNS, GRAMMAR_PATTERN_CATEGORIES, CATEGORY_LABELS, MARKER_STYLES, convertAffix } from './src/utils/grammarPatternLibrary.js';
import {
    getPattern,
    getAllPatterns,
    getDefaultOptions,
    makeInstanceId,
    installPattern,
    uninstallPattern,
    detectPatternConflicts
} from './src/utils/grammarPatternInstaller.js';

// ── Minimal applyRuleToWord implementation for Node tests ───────────────────
// (Cannot import JSX module in plain Node, so we replicate the core logic)

function parseAffix(affixStr) {
    if (!affixStr) return null;
    const match = affixStr.match(/^([-=])?([^-=@]+)([-=])?(?:@(\w+))?$/);
    if (!match) return { clean: affixStr.replace(/^-|-$/g, ''), type: 'unknown' };
    const [_, hasStart, morpheme, hasEnd, position] = match;
    let type = 'suffix';
    if (hasStart && hasEnd) type = 'infix';
    else if (hasEnd) type = 'prefix';
    else if (hasStart) type = 'suffix';
    return { clean: morpheme, type, position };
}

function applyRuleToWord(baseWord, rule, _grammarRules, _vowels, _consonants, _otherPhonemes) {
    if (!baseWord || !rule || !rule.affix) return baseWord;
    if (rule.affix.includes('=>')) {
        const parts = rule.affix.split('=>');
        if (parts.length === 2) {
            try {
                const regex = new RegExp(parts[0].trim(), 'gi');
                return baseWord.replace(regex, parts[1].trim());
            } catch { return baseWord; }
        }
    }
    const parsed = parseAffix(rule.affix);
    if (!parsed) return baseWord;
    const { clean, type } = parsed;
    if (type === 'suffix') return baseWord + clean;
    if (type === 'prefix') return clean + baseWord;
    if (type === 'infix') {
        const mid = Math.floor(baseWord.length / 2);
        return baseWord.slice(0, mid) + clean + baseWord.slice(mid);
    }
    return baseWord;
}

// ── Test harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
    total++;
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${message}`);
    }
}

function assertEq(actual, expected, message) {
    total++;
    if (actual === expected) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${message} — expected "${expected}", got "${actual}"`);
    }
}

function assertIncludes(arr, item, message) {
    total++;
    if (Array.isArray(arr) && arr.includes(item)) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${message} — "${item}" not found in ${JSON.stringify(arr)}`);
    }
}

function assertNotIncludes(arr, item, message) {
    total++;
    if (!Array.isArray(arr) || !arr.includes(item)) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL: ${message} — "${item}" unexpectedly found`);
    }
}

// ── Test: Pattern catalog integrity ─────────────────────────────────────────

console.log('\n=== Pattern Catalog Integrity ===');

assert(GRAMMAR_PATTERNS.length >= 5, 'At least 5 patterns defined');
assert(GRAMMAR_PATTERN_CATEGORIES.length >= 5, 'At least 5 categories defined');
assert(typeof CATEGORY_LABELS === 'object' && Object.keys(CATEGORY_LABELS).length >= 5, 'Category labels populated');

const patternIds = new Set();
for (const p of GRAMMAR_PATTERNS) {
    assert(!patternIds.has(p.id), `Pattern ID "${p.id}" is unique`);
    patternIds.add(p.id);
    assert(typeof p.version === 'number', `${p.id}: has version`);
    assert(typeof p.category === 'string', `${p.id}: has category`);
    assert(typeof p.name === 'string' && p.name.length > 0, `${p.id}: has name`);
    assert(typeof p.summary === 'string' && p.summary.length > 0, `${p.id}: has summary`);
    assert(Array.isArray(p.options), `${p.id}: has options array`);
    assert(Array.isArray(p.examples), `${p.id}: has examples array`);
    assert(typeof p.build === 'function', `${p.id}: has build function`);
}

// ── Test: getPattern / getAllPatterns ────────────────────────────────────────

console.log('\n=== getPattern / getAllPatterns ===');

assert(getPattern('case.basic') !== null, 'getPattern finds case.basic');
assert(getPattern('nonexistent') === null, 'getPattern returns null for unknown');
assert(getAllPatterns().length === GRAMMAR_PATTERNS.length, 'getAllPatterns() returns all');
assert(getAllPatterns('case').length > 0, 'getAllPatterns("case") returns results');
assert(getAllPatterns('case').every(p => p.category === 'case'), 'category filter correct');

// ── Test: getDefaultOptions ─────────────────────────────────────────────────

console.log('\n=== getDefaultOptions ===');

const casePattern = getPattern('case.basic');
const caseDefaults = getDefaultOptions(casePattern);
assertEq(caseDefaults.appliesTo, 'noun', 'case default appliesTo');
assertEq(caseDefaults.markerStyle, 'suffix', 'case default markerStyle');
assert(Array.isArray(caseDefaults.cases), 'case default cases is array');
assert(caseDefaults.cases.length >= 2, 'case default has at least 2 cases');

// ── Test: Case pattern generation ───────────────────────────────────────────

console.log('\n=== Case Pattern (case.basic) ===');

const mockConfig = { grammarRules: [], customWordClasses: [], wordAssistConfig: { triggers: [] }, installedGrammarPatterns: [], vowels: 'a, e, i, o, u', consonants: 'p, t, k, m, n, s, l, r', otherPhonemes: '' };

{
    const { patch, report } = installPattern('case.basic', {
        appliesTo: 'noun',
        markerStyle: 'suffix',
        cases: ['accusative', 'genitive', 'dative']
    }, mockConfig);

    assert(!report.error, 'case install has no error');
    assertEq(patch.grammarRules.length, 3, 'case generates 3 rules for 3 cases');
    assert(report.addedRules.length === 3, 'report shows 3 added rules');

    const accRule = patch.grammarRules.find(r => r.gloss === 'ACC');
    assert(accRule, 'ACC rule created');
    assertEq(accRule.affix, '-n', 'ACC affix is -n');
    assertEq(accRule.appliesTo, 'noun', 'ACC appliesTo is noun');
    assertEq(accRule.source, 'grammarPatternLibrary', 'ACC has source metadata');
    assertEq(accRule.sourcePatternId, 'case.basic', 'ACC has sourcePatternId');
    assert(accRule.applyToPersons === true, 'ACC applies to persons');

    const genRule = patch.grammarRules.find(r => r.gloss === 'GEN');
    assert(genRule, 'GEN rule created');
    assertEq(genRule.affix, '-s', 'GEN affix is -s');

    // Test applyRuleToWord compatibility
    const kalaAcc = applyRuleToWord('kala', accRule, patch.grammarRules, 'a,e,i,o,u', 'p,t,k,m,n,s,l,r', '');
    assertEq(kalaAcc, 'kalan', 'applyRuleToWord(kala + ACC) = kalan');

    const kalaGen = applyRuleToWord('kala', genRule, patch.grammarRules, 'a,e,i,o,u', 'p,t,k,m,n,s,l,r', '');
    assertEq(kalaGen, 'kalas', 'applyRuleToWord(kala + GEN) = kalas');

    // Metadata
    assert(patch.installedGrammarPatterns.length === 1, 'installed metadata added');
    assertEq(patch.installedGrammarPatterns[0].patternId, 'case.basic', 'metadata patternId correct');
    assert(patch.installedGrammarPatterns[0].generatedRuleIds.length === 3, 'metadata tracks 3 rule IDs');
}

// ── Test: Case with prefix style ────────────────────────────────────────────

console.log('\n=== Case Prefix Style ===');

{
    const { patch } = installPattern('case.basic', {
        appliesTo: 'noun',
        markerStyle: 'prefix',
        cases: ['accusative']
    }, mockConfig);

    const accRule = patch.grammarRules[0];
    assertEq(accRule.affix, 'n-', 'prefix ACC affix is n-');
}

// ── Test: Case with infix style ─────────────────────────────────────────────

console.log('\n=== Case Infix Style ===');

{
    const { patch } = installPattern('case.basic', {
        appliesTo: 'noun',
        markerStyle: 'infix',
        infixPosition: '@V',
        cases: ['accusative', 'genitive']
    }, mockConfig);

    assertEq(patch.grammarRules.length, 2, 'infix generates 2 rules');
    const accRule = patch.grammarRules.find(r => r.gloss === 'ACC');
    assertEq(accRule.affix, '-n-@V', 'infix ACC affix is -n-@V');
    const genRule = patch.grammarRules.find(r => r.gloss === 'GEN');
    assertEq(genRule.affix, '-s-@V', 'infix GEN affix is -s-@V');
}

{
    const { patch } = installPattern('case.basic', {
        appliesTo: 'noun',
        markerStyle: 'infix',
        infixPosition: '@C',
        cases: ['accusative']
    }, mockConfig);

    const accRule = patch.grammarRules[0];
    assertEq(accRule.affix, '-n-@C', 'infix @C ACC affix is -n-@C');
}

// ── Test: Case with custom (regex) style ────────────────────────────────────

console.log('\n=== Case Custom (Regex) Style ===');

{
    const { patch } = installPattern('case.basic', {
        appliesTo: 'noun',
        markerStyle: 'custom',
        cases: ['accusative', 'genitive']
    }, mockConfig);

    assertEq(patch.grammarRules.length, 2, 'custom generates 2 rules');
    // Custom mode keeps default affixes as-is for user to edit
    const accRule = patch.grammarRules.find(r => r.gloss === 'ACC');
    assertEq(accRule.affix, '-n', 'custom ACC keeps default affix');
}

// ── Test: Affix overrides (preview updates when user edits affixes) ─────────

console.log('\n=== Affix Overrides ===');

{
    // User edits the ACC affix to '-mu' via the affix override table
    const { patch } = installPattern('case.basic', {
        appliesTo: 'noun',
        markerStyle: 'suffix',
        cases: ['accusative', 'genitive'],
        _affixOverrides: { accusative: '-mu' }
    }, mockConfig);

    const accRule = patch.grammarRules.find(r => r.gloss === 'ACC');
    const genRule = patch.grammarRules.find(r => r.gloss === 'GEN');
    assertEq(accRule.affix, '-mu', 'override replaces ACC affix with -mu');
    assertEq(genRule.affix, '-s', 'GEN affix unchanged (no override)');

    // Verify applyRuleToWord uses the overridden affix
    const result = applyRuleToWord('kala', accRule, patch.grammarRules, 'a,e,i,o,u', 'p,t,k,m,n,s,l,r', '');
    assertEq(result, 'kalamu', 'applyRuleToWord(kala + overridden ACC) = kalamu');
}

{
    // Override with infix style
    const { patch } = installPattern('case.basic', {
        appliesTo: 'noun',
        markerStyle: 'infix',
        infixPosition: '@V',
        cases: ['accusative'],
        _affixOverrides: { accusative: '-zo-@C' }
    }, mockConfig);

    const accRule = patch.grammarRules.find(r => r.gloss === 'ACC');
    assertEq(accRule.affix, '-zo-@C', 'infix override replaces computed affix');
}

{
    // Override in TAM pattern
    const { patch } = installPattern('tam.basic', {
        appliesTo: 'verb',
        markerStyle: 'suffix',
        features: ['past', 'future'],
        _affixOverrides: { past: 'ba-' }
    }, mockConfig);

    const pastRule = patch.grammarRules.find(r => r.gloss === 'PST');
    const futRule = patch.grammarRules.find(r => r.gloss === 'FUT');
    assertEq(pastRule.affix, 'ba-', 'TAM override replaces PST affix with ba-');
    assertEq(futRule.affix, '-ru', 'TAM FUT affix unchanged');

    const result = applyRuleToWord('mara', pastRule, patch.grammarRules, 'a,e,i,o,u', 'p,t,k,m,n,s,l,r', '');
    assertEq(result, 'bamara', 'applyRuleToWord(mara + overridden PST) = bamara');
}

{
    // Override in number pattern
    const { patch } = installPattern('number.basic', {
        appliesTo: 'noun',
        markerStyle: 'suffix',
        numbers: ['plural', 'dual'],
        _affixOverrides: { plural: '-ari' }
    }, mockConfig);

    const plRule = patch.grammarRules.find(r => r.gloss === 'PL');
    assertEq(plRule.affix, '-ari', 'number override replaces PL affix with -ari');

    const result = applyRuleToWord('kala', plRule, patch.grammarRules, 'a,e,i,o,u', 'p,t,k,m,n,s,l,r', '');
    assertEq(result, 'kalaari', 'applyRuleToWord(kala + overridden PL) = kalaari');
}

// ── Test: convertAffix helper ───────────────────────────────────────────────

console.log('\n=== convertAffix Helper ===');

assertEq(convertAffix('-n', 'suffix'), '-n', 'convertAffix suffix');
assertEq(convertAffix('-n', 'prefix'), 'n-', 'convertAffix prefix');
assertEq(convertAffix('-n', 'infix', '@V'), '-n-@V', 'convertAffix infix @V');
assertEq(convertAffix('-n', 'infix', '@C'), '-n-@C', 'convertAffix infix @C');
assertEq(convertAffix('', 'suffix'), '', 'convertAffix empty');
assertEq(convertAffix('-ma', 'infix', '@V'), '-ma-@V', 'convertAffix multi-char infix');
assertEq(convertAffix('-da', 'prefix'), 'da-', 'convertAffix multi-char prefix');

// ── Test: MARKER_STYLES constant ────────────────────────────────────────────

console.log('\n=== MARKER_STYLES ===');

assert(Array.isArray(MARKER_STYLES), 'MARKER_STYLES is array');
assert(MARKER_STYLES.includes('suffix'), 'includes suffix');
assert(MARKER_STYLES.includes('prefix'), 'includes prefix');
assert(MARKER_STYLES.includes('infix'), 'includes infix');
assert(MARKER_STYLES.includes('custom'), 'includes custom');

// ── Test: TAM pattern ───────────────────────────────────────────────────────

console.log('\n=== TAM Pattern (tam.basic) ===');

{
    const { patch, report } = installPattern('tam.basic', {
        appliesTo: 'verb',
        markerStyle: 'suffix',
        features: ['past', 'future', 'progressive', 'perfect']
    }, mockConfig);

    assert(!report.error, 'TAM install has no error');
    assertEq(patch.grammarRules.length, 4, 'TAM generates 4 rules');
    assertEq(report.addedTriggers, 4, 'TAM generates 4 Word Assist triggers');

    const pastRule = patch.grammarRules.find(r => r.gloss === 'PST');
    assert(pastRule, 'PST rule created');
    assertEq(pastRule.affix, '-ta', 'PST affix is -ta');
    assertEq(pastRule.appliesTo, 'verb', 'PST appliesTo is verb');

    const futRule = patch.grammarRules.find(r => r.gloss === 'FUT');
    assert(futRule, 'FUT rule created');
    assertEq(futRule.affix, '-ru', 'FUT affix is -ru');

    // Test applyRuleToWord
    const maraPast = applyRuleToWord('mara', pastRule, patch.grammarRules, 'a,e,i,o,u', 'p,t,k,m,n,s,l,r', '');
    assertEq(maraPast, 'marata', 'applyRuleToWord(mara + PST) = marata');

    // Verify Word Assist triggers were generated
    const triggers = patch.wordAssistConfig?.triggers || [];
    assert(triggers.length === 4, '4 Word Assist triggers generated');
    assert(triggers[0].sourcePatternInstanceId, 'triggers have sourcePatternInstanceId');
}

// TAM with infix style
{
    const { patch } = installPattern('tam.basic', {
        appliesTo: 'verb', markerStyle: 'infix', infixPosition: '@V', features: ['past']
    }, mockConfig);
    const pastRule = patch.grammarRules.find(r => r.gloss === 'PST');
    assertEq(pastRule.affix, '-ta-@V', 'TAM infix PST affix is -ta-@V');
}

// TAM with custom style
{
    const { patch } = installPattern('tam.basic', {
        appliesTo: 'verb', markerStyle: 'custom', features: ['past']
    }, mockConfig);
    const pastRule = patch.grammarRules.find(r => r.gloss === 'PST');
    assertEq(pastRule.affix, '-ta', 'TAM custom PST keeps default affix');
}

// ── Test: Number pattern ────────────────────────────────────────────────────

console.log('\n=== Number Pattern (number.basic) ===');

{
    const { patch, report } = installPattern('number.basic', {
        appliesTo: 'noun',
        markerStyle: 'suffix',
        numbers: ['plural', 'dual']
    }, mockConfig);

    assert(!report.error, 'number install has no error');
    assertEq(patch.grammarRules.length, 2, 'number generates 2 rules');

    const plRule = patch.grammarRules.find(r => r.gloss === 'PL');
    assert(plRule, 'PL rule created');
    assertEq(plRule.affix, '-i', 'PL affix is -i');

    const duRule = patch.grammarRules.find(r => r.gloss === 'DU');
    assert(duRule, 'DU rule created');
    assertEq(duRule.affix, '-du', 'DU affix is -du');

    const kalaPl = applyRuleToWord('kala', plRule, patch.grammarRules, 'a,e,i,o,u', 'p,t,k,m,n,s,l,r', '');
    assertEq(kalaPl, 'kalai', 'applyRuleToWord(kala + PL) = kalai');
}

// Number with infix style
{
    const { patch } = installPattern('number.basic', {
        appliesTo: 'noun', markerStyle: 'infix', infixPosition: '@C', numbers: ['plural']
    }, mockConfig);
    const plRule = patch.grammarRules.find(r => r.gloss === 'PL');
    assertEq(plRule.affix, '-i-@C', 'number infix PL affix is -i-@C');
}

// ── Test: Derivation pattern ────────────────────────────────────────────────

console.log('\n=== Derivation Pattern (derivation.basic) ===');

{
    const { patch, report } = installPattern('derivation.basic', {
        rules: ['agent', 'abstract', 'adjectivizer']
    }, mockConfig);

    assert(!report.error, 'derivation install has no error');
    assertEq(patch.grammarRules.length, 3, 'derivation generates 3 rules');

    const agentRule = patch.grammarRules.find(r => r.gloss === 'AGT');
    assert(agentRule, 'AGT rule created');
    assertEq(agentRule.affix, '-er', 'AGT affix is -er');
    assertEq(agentRule.appliesTo, 'verb', 'AGT appliesTo is verb');
    assertEq(agentRule.targetPOS, 'noun', 'AGT targetPOS is noun');
    assert(agentRule.standalone === true, 'AGT is standalone');

    const abstrRule = patch.grammarRules.find(r => r.gloss === 'ABST');
    assert(abstrRule, 'ABST rule created');
    assertEq(abstrRule.targetPOS, 'noun', 'ABST targetPOS is noun');

    const adjzRule = patch.grammarRules.find(r => r.gloss === 'ADJZ');
    assert(adjzRule, 'ADJZ rule created');
    assertEq(adjzRule.appliesTo, 'noun', 'ADJZ appliesTo is noun');
    assertEq(adjzRule.targetPOS, 'adjective', 'ADJZ targetPOS is adjective');
}

// ── Test: Alignment pattern ─────────────────────────────────────────────────

console.log('\n=== Alignment Pattern (alignment.basic) ===');

{
    const { patch: patch1 } = installPattern('alignment.basic', { type: 'nom-acc', appliesTo: 'noun, pronoun', markerStyle: 'suffix' }, mockConfig);
    assertEq(patch1.grammarRules.length, 1, 'nom-acc generates 1 rule (accusative)');
    assertEq(patch1.grammarRules[0].gloss, 'ACC', 'nom-acc generates ACC');

    const { patch: patch2 } = installPattern('alignment.basic', { type: 'erg-abs', appliesTo: 'noun, pronoun', markerStyle: 'suffix' }, mockConfig);
    assertEq(patch2.grammarRules.length, 1, 'erg-abs generates 1 rule (ergative)');
    assertEq(patch2.grammarRules[0].gloss, 'ERG', 'erg-abs generates ERG');
}

// ── Test: Negation pattern ──────────────────────────────────────────────────

console.log('\n=== Negation Pattern (particles.negative) ===');

{
    const { patch, report } = installPattern('particles.negative', {
        style: 'suffix',
        morpheme: '-na',
        appliesTo: 'verb'
    }, mockConfig);

    assert(!report.error, 'negation install has no error');
    assertEq(patch.grammarRules.length, 1, 'negation generates 1 rule');
    assertEq(patch.grammarRules[0].gloss, 'NEG', 'NEG gloss correct');
    assertEq(patch.grammarRules[0].affix, '-na', 'NEG affix correct');

    const triggers = patch.wordAssistConfig?.triggers || [];
    assert(triggers.length === 1, 'negation generates 1 Word Assist trigger');
    assertEq(triggers[0].trigger, 'not', 'WA trigger is "not"');
}

// ── Test: Conflict detection ────────────────────────────────────────────────

console.log('\n=== Conflict Detection ===');

{
    const configWithRules = {
        grammarRules: [
            { id: 'rule_test_acc', name: 'Accusative Case', affix: '-n', appliesTo: 'noun' }
        ],
        customWordClasses: [],
        wordAssistConfig: { triggers: [] },
        installedGrammarPatterns: []
    };

    const generated = {
        grammarRules: [
            { id: 'rule_test_acc', name: 'Accusative Case', affix: '-n', appliesTo: 'noun' }
        ],
        wordAssistConfigPatch: { triggers: [] }
    };

    const { conflicts, warnings } = detectPatternConflicts(generated, configWithRules);
    assert(conflicts.length > 0, 'detects ID conflict');
    assert(conflicts[0].includes('rule_test_acc'), 'conflict mentions rule ID');
}

{
    const configWithName = {
        grammarRules: [
            { id: 'rule_a', name: 'Plural', affix: '-s', appliesTo: 'noun' }
        ],
        customWordClasses: [],
        wordAssistConfig: { triggers: [] },
        installedGrammarPatterns: []
    };

    const generated = {
        grammarRules: [
            { id: 'rule_b', name: 'Plural', affix: '-i', appliesTo: 'noun' }
        ],
        wordAssistConfigPatch: { triggers: [] }
    };

    const { conflicts, warnings } = detectPatternConflicts(generated, configWithName);
    assert(conflicts.length === 0, 'name collision is warning not conflict');
    assert(warnings.length > 0, 'warns about duplicate name');
}

// ── Test: Install → Uninstall round-trip ────────────────────────────────────

console.log('\n=== Install → Uninstall Round-trip ===');

{
    // Start fresh
    const freshConfig = {
        grammarRules: [
            { id: 'user_rule_1', name: 'User Rule', affix: '-ur', appliesTo: 'all' }
        ],
        customWordClasses: ['particle'],
        wordAssistConfig: { triggers: [{ id: 'user_trigger', name: 'Test', trigger: 'the', type: 'word', position: 'before', priority: 0 }] },
        installedGrammarPatterns: [],
        vowels: 'a,e,i,o,u', consonants: 'p,t,k', otherPhonemes: ''
    };

    // Install TAM
    const { patch: installPatch, report: installReport } = installPattern('tam.basic', {
        appliesTo: 'verb', markerStyle: 'suffix', features: ['past', 'future']
    }, freshConfig);

    assert(!installReport.error, 'install succeeds');
    assertEq(installPatch.grammarRules.length, 3, '2 new + 1 existing = 3 rules');
    assert(installPatch.installedGrammarPatterns.length === 1, 'metadata added');

    // Build post-install config
    const postInstall = { ...freshConfig, ...installPatch };

    // Uninstall
    const instanceId = installPatch.installedGrammarPatterns[0].instanceId;
    const { patch: uninstallPatch, report: uninstallReport } = uninstallPattern(instanceId, postInstall);

    assert(!uninstallReport.error, 'uninstall succeeds');
    assertEq(uninstallReport.removedRuleCount, 2, 'removed 2 generated rules');
    assertEq(uninstallPatch.grammarRules.length, 1, '1 original rule remains');
    assertEq(uninstallPatch.grammarRules[0].id, 'user_rule_1', 'user rule preserved');
    assertEq(uninstallPatch.installedGrammarPatterns.length, 0, 'metadata removed');
}

// ── Test: Uninstall preserves user-edited rules ─────────────────────────────

console.log('\n=== Uninstall Preserves User Rules ===');

{
    const config = {
        grammarRules: [
            { id: 'my_noun_rule', name: 'My Noun Rule', affix: '-os', appliesTo: 'noun' },
            { id: 'my_verb_rule', name: 'Verb Thing', affix: '-ar', appliesTo: 'verb' }
        ],
        customWordClasses: [],
        wordAssistConfig: { triggers: [] },
        installedGrammarPatterns: [],
        vowels: 'a,e,i,o,u', consonants: '', otherPhonemes: ''
    };

    // Install case
    const { patch: casePatch } = installPattern('case.basic', {
        appliesTo: 'noun', markerStyle: 'suffix', cases: ['accusative', 'genitive']
    }, config);

    const afterCase = { ...config, ...casePatch };
    assertEq(afterCase.grammarRules.length, 4, '2 user + 2 generated = 4');

    // Install number
    const { patch: numPatch } = installPattern('number.basic', {
        appliesTo: 'noun', markerStyle: 'suffix', numbers: ['plural']
    }, afterCase);

    const afterNum = { ...afterCase, ...numPatch };
    assertEq(afterNum.grammarRules.length, 5, '4 + 1 generated = 5');

    // Uninstall case
    const caseInstanceId = casePatch.installedGrammarPatterns[0].instanceId;
    const { patch: uninstCasePatch } = uninstallPattern(caseInstanceId, afterNum);

    assertEq(uninstCasePatch.grammarRules.length, 3, '5 - 2 case rules = 3');
    const remainingIds = uninstCasePatch.grammarRules.map(r => r.id);
    assertIncludes(remainingIds, 'my_noun_rule', 'user noun rule preserved');
    assertIncludes(remainingIds, 'my_verb_rule', 'user verb rule preserved');
    assertNotIncludes(remainingIds, `rule_${caseInstanceId}_acc`, 'generated ACC removed');
    assertNotIncludes(remainingIds, `rule_${caseInstanceId}_gen`, 'generated GEN removed');
    // Number rule should still be there
    const numRule = uninstCasePatch.grammarRules.find(r => r.gloss === 'PL');
    assert(numRule, 'number PL rule still present after case uninstall');
}

// ── Test: Uninstall unknown instance ────────────────────────────────────────

console.log('\n=== Uninstall Unknown Instance ===');

{
    const { patch, report } = uninstallPattern('nonexistent_id', mockConfig);
    assert(report.error, 'error reported for unknown instance');
    assert(Object.keys(patch).length === 0, 'no patch for unknown instance');
}

// ── Test: Install unknown pattern ───────────────────────────────────────────

console.log('\n=== Install Unknown Pattern ===');

{
    const { patch, report } = installPattern('nonexistent.pattern', {}, mockConfig);
    assert(report.error, 'error reported for unknown pattern');
}

// ── Test: Schema validation (simulated) ─────────────────────────────────────

console.log('\n=== Schema Validation (simulated) ===');

// Simulate VALID_CONFIG_KEYS check
const VALID_CONFIG_KEYS = new Set([
    'projectId', 'conlangName', 'grammarRules', 'customWordClasses',
    'wordAssistConfig', 'installedGrammarPatterns', 'backupSettings'
]);

function sanitizeConfig(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const clean = {};
    for (const key of Object.keys(raw)) {
        if (VALID_CONFIG_KEYS.has(key)) clean[key] = raw[key];
    }
    return clean;
}

{
    const dirty = {
        grammarRules: [{ id: 'r1', name: 'Test' }],
        installedGrammarPatterns: [{ instanceId: 'x', patternId: 'case.basic' }],
        evilKey: 'should be stripped',
        anotherEvil: 42
    };
    const clean = sanitizeConfig(dirty);
    assert(clean.grammarRules, 'grammarRules kept');
    assert(clean.installedGrammarPatterns, 'installedGrammarPatterns kept');
    assert(!clean.evilKey, 'evilKey stripped');
    assert(!clean.anotherEvil, 'anotherEvil stripped');
}

// ── Test: makeInstanceId uniqueness ──────────────────────────────────────────

console.log('\n=== makeInstanceId Uniqueness ===');

{
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
        ids.add(makeInstanceId('case.basic'));
    }
    assertEq(ids.size, 100, '100 unique instance IDs generated');
}

// ── Test: Integration with existing mock config ─────────────────────────────

console.log('\n=== Integration: Install into config with existing rules ===');

{
    const configWithExisting = {
        grammarRules: [
            { id: 'plural_old', name: 'Old Plural', affix: '-ar', appliesTo: 'noun', condition: 'always', dependency: '', standalone: false, applyToPersons: false, gloss: 'PL' }
        ],
        customWordClasses: ['classifier'],
        wordAssistConfig: { copulaBehavior: 'normal', triggers: [{ id: 'existing_trigger', name: 'Test', trigger: 'not', type: 'word', position: 'before', priority: 0 }] },
        installedGrammarPatterns: [],
        vowels: 'a,e,i,o,u', consonants: 'p,t,k,m,n,s,l,r', otherPhonemes: ''
    };

    // Install number with plural
    const { patch, report } = installPattern('number.basic', {
        appliesTo: 'noun', markerStyle: 'suffix', numbers: ['plural', 'dual']
    }, configWithExisting);

    assert(!report.error, 'install succeeds alongside existing rules');
    assert(patch.grammarRules.length === 3, '1 existing + 2 generated = 3');
    // customWordClasses only in patch when new classes are added; existing classes preserved in config
    const mergedClasses = patch.customWordClasses || configWithExisting.customWordClasses;
    assert(mergedClasses.includes('classifier'), 'customWordClasses preserved');
    assert(patch.wordAssistConfig.copulaBehavior === 'normal', 'copulaBehavior preserved');
    assert(patch.wordAssistConfig.triggers.length === 2, '1 existing + 1 new trigger = 2');
    assertEq(patch.wordAssistConfig.triggers[0].id, 'existing_trigger', 'existing trigger preserved');
}

// ── Test: Multiple installs stack correctly ──────────────────────────────────

console.log('\n=== Multiple Installs Stack ===');

{
    let config = { grammarRules: [], customWordClasses: [], wordAssistConfig: { triggers: [] }, installedGrammarPatterns: [], vowels: 'a,e,i,o,u', consonants: 'p,t,k', otherPhonemes: '' };

    const { patch: p1 } = installPattern('case.basic', { appliesTo: 'noun', markerStyle: 'suffix', cases: ['accusative'] }, config);
    config = { ...config, ...p1 };

    const { patch: p2 } = installPattern('tam.basic', { appliesTo: 'verb', markerStyle: 'suffix', features: ['past'] }, config);
    config = { ...config, ...p2 };

    const { patch: p3 } = installPattern('number.basic', { appliesTo: 'noun', markerStyle: 'suffix', numbers: ['plural'] }, config);
    config = { ...config, ...p3 };

    assertEq(config.grammarRules.length, 3, '3 patterns installed = 3 rules');
    assertEq(config.installedGrammarPatterns.length, 3, '3 metadata entries');
    assert(config.installedGrammarPatterns.every(m => m.instanceId), 'all metadata have instanceId');
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${total} total`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed ✓');
}
