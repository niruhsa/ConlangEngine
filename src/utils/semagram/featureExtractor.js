// src/utils/semagram/featureExtractor.js
//
// PHASE 1 (SEMAGRAM.md §8). Turns real app data — the project's phonology config
// and lexicon — into the stable `features` object (§4.2) that a semagram Lua
// script reads. This replaces the hardcoded sampleFeatures.js.
//
// Design note: a semagram encodes a clause the author *composes* (pick tense,
// aspect, mood, and the words for each argument slot) — much like choosing the
// fish's head direction in Tsevhu. So the grammatical categories are inputs, and
// this module's real work is (a) decomposing each conlang word into phonemes with
// articulatory features (the ripple layer) and (b) packaging everything into the
// locked schema. We intentionally do NOT route through grammarAnalyzer.js here:
// that is an English→conlang, cursor-based word-assist engine (it imports the
// store and lemmatizes English), which is the wrong tool for rendering a clause
// and would break this module's purity/testability. A future phase can add an
// optional English-gloss adapter on top of it.

import { IPA_INFO } from '../ipaData.js';
import { generateIpaFromWord } from '../ipaGenerator.js';

// ── Controlled vocabularies (drive the composer UI + validation) ─────────────
export const CLAUSE_TYPES = ['main', 'subordinate'];
export const CLAUSE_ROLES = ['nom', 'adv', 'rel', 'adj']; // subordinate clause roles (Tsevhu)
export const TENSES = [
    'remotePast', 'past', 'nearPast', 'present',
    'nearFuture', 'future', 'remoteFuture', 'historicalFuture',
];
export const ASPECTS = ['base', 'perfective', 'continuous', 'none'];
export const MOODS = ['indicative', 'imperative', 'interrogative'];

// 8-way tense → head-orientation degrees (Tsevhu: "eight directions for tense").
const TENSE_ANGLES = {
    remotePast: -135, past: -90, nearPast: -45, present: 0,
    nearFuture: 45, future: 90, remoteFuture: 135, historicalFuture: 180,
};

/** Map a tense to its head-direction angle (degrees). Unknown → 0 (present). */
export function tenseToAngle(tense) {
    return TENSE_ANGLES[tense] ?? 0;
}

/** A small integer flourish knob derived from mood + aspect (for parametric fins). */
export function moodIntensity(mood, aspect) {
    let n = mood === 'imperative' ? 2 : mood === 'interrogative' ? 1 : 0;
    if (aspect === 'continuous') n += 1;
    return Math.max(0, Math.min(3, n));
}

// ── Phoneme decomposition (the ripple layer) ─────────────────────────────────

/** Split a comma/space separated inventory string into clean tokens. */
function parseInventory(str) {
    if (!str || typeof str !== 'string') return [];
    return str.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

/** Greedy longest-match segmentation of a word against an inventory of tokens. */
function greedySegment(word, tokens) {
    const sorted = [...tokens].filter(Boolean).sort((a, b) => b.length - a.length);
    const segments = [];
    let i = 0;
    while (i < word.length) {
        let matched = null;
        for (const t of sorted) {
            if (word.startsWith(t, i)) { matched = t; break; }
        }
        if (matched) { segments.push(matched); i += matched.length; }
        else { segments.push(word[i]); i += 1; } // unknown single char, kept as-is
    }
    return segments;
}

/** Look up IPA metadata for a symbol, tolerating diacritics/modifier letters. */
function lookupInfo(...candidates) {
    for (const c of candidates) {
        if (!c) continue;
        if (IPA_INFO[c]) return IPA_INFO[c];
        const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʰʷʲˠˤːˑ]/g, '');
        if (base && IPA_INFO[base]) return IPA_INFO[base];
    }
    return null;
}

/**
 * Decompose an orthographic conlang word into phonemes with articulatory features.
 * Uses the project's phoneme inventory to segment and the IPA mapping (if any) to
 * resolve each segment to IPA for feature lookup.
 * @returns {Array<{symbol,ipa,place,manner,voiced,nasal,isVowel}>}
 */
export function decomposePhonemes(word, config = {}) {
    const clean = String(word || '').replace(/\*/g, '').trim().toLowerCase();
    if (!clean) return [];

    const inventory = [
        ...parseInventory(config.consonants),
        ...parseInventory(config.vowels),
        ...parseInventory(config.otherPhonemes),
    ];
    const segments = greedySegment(clean, inventory);
    const rules = config.ipaMappingRules || '';

    return segments.map((seg) => {
        const mapped = rules ? generateIpaFromWord(seg, rules).ipa : seg;
        const ipa = mapped || seg;
        const info = lookupInfo(ipa, seg);
        return {
            symbol: seg,
            ipa,
            place: info?.place || null,
            manner: info?.manner || null,
            voiced: Boolean(info?.voiced),
            nasal: info?.manner === 'Nasal',
            isVowel: Boolean(info?.isVowel),
        };
    });
}

// ── Word + clause assembly ───────────────────────────────────────────────────

/** Find a lexicon entry whose (proto-marker-stripped) word matches `text`. */
function findLexeme(text, lexicon = []) {
    const q = String(text || '').replace(/\*/g, '').trim().toLowerCase();
    if (!q) return null;
    return lexicon.find((e) => e && typeof e.word === 'string'
        && e.word.replace(/\*/g, '').trim().toLowerCase() === q) || null;
}

/**
 * Build a `word` feature object from a string (conlang surface form) or an object
 * ({ text | word, wordClass?, ... }). Returns null for empty input.
 */
function buildWord(input, config, lexicon) {
    if (!input) return null;
    const text = typeof input === 'string' ? input : (input.text || input.word || '');
    if (!text) return null;
    const lex = findLexeme(text, lexicon);
    return {
        text: String(text).replace(/\*/g, ''),
        wordClass: (typeof input === 'object' && input.wordClass) || lex?.wordClass || '',
        translation: (typeof input === 'object' && input.translation) || lex?.translation || '',
        phonemes: decomposePhonemes(text, config),
    };
}

/**
 * Assemble the full `features` object (SEMAGRAM.md §4.2) from a composed clause.
 * @param {object} clause  { clauseType, role, tense, aspect, mood, moodIntensity?,
 *                           verb, active, stative, oblique, modifiers?, subordinates? }
 * @param {object} config  useConfigStore state (phonology fields used)
 * @param {Array}  lexicon
 */
export function extractClauseFeatures(clause = {}, config = {}, lexicon = []) {
    const {
        clauseType = 'main', role = null,
        tense = 'present', aspect = 'base', mood = 'indicative',
        verb, active, stative, oblique,
        modifiers = [], subordinates = [],
    } = clause;

    const mods = (Array.isArray(modifiers) ? modifiers : [])
        .map((m) => buildWord(m, config, lexicon)).filter(Boolean);

    const argSlots = {
        active: buildWord(active, config, lexicon),
        stative: buildWord(stative, config, lexicon),
        oblique: buildWord(oblique, config, lexicon),
    };
    const verbWord = buildWord(verb, config, lexicon);

    // Every word that carries phonology, for the ripple layer.
    const words = [verbWord, argSlots.active, argSlots.stative, argSlots.oblique, ...mods]
        .filter(Boolean);

    return {
        clause: { type: CLAUSE_TYPES.includes(clauseType) ? clauseType : 'main', role },
        tense: TENSES.includes(tense) ? tense : 'present',
        tenseAngle: tenseToAngle(tense),
        aspect: ASPECTS.includes(aspect) ? aspect : 'base',
        mood: MOODS.includes(mood) ? mood : 'indicative',
        moodIntensity: clause.moodIntensity ?? moodIntensity(mood, aspect),
        arguments: argSlots,
        verbs: verbWord ? [verbWord] : [],
        words,
        modifiers: mods,
        subordinates: (Array.isArray(subordinates) ? subordinates : [])
            .map((s) => extractClauseFeatures(s, config, lexicon)),
    };
}
