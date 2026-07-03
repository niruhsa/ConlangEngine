// src/utils/semagram/sampleFeatures.js
//
// A hardcoded sample `features` object for the Phase 0 spike. In Phase 1 this is
// replaced by featureExtractor.js (grammarAnalyzer + config → features). The
// shape mirrors SEMAGRAM.md §4.2.

export const SAMPLE_FEATURES = {
    clause: { type: 'main', role: null },
    tense: 'past',
    tenseAngle: -90,          // 8-way tense mapped to degrees (head direction)
    aspect: 'perfective',
    mood: 'indicative',
    moodIntensity: 2,
    words: [
        {
            text: 'tavnu',
            wordClass: 'verb',
            phonemes: [
                { symbol: 't', place: 'Alveolar',   manner: 'Plosive',   voiced: false, nasal: false, isVowel: false },
                { symbol: 'a', place: 'Front',       manner: 'Open',      voiced: true,  nasal: false, isVowel: true },
                { symbol: 'v', place: 'Labiodental', manner: 'Fricative', voiced: true,  nasal: false, isVowel: false },
                { symbol: 'n', place: 'Alveolar',    manner: 'Nasal',     voiced: true,  nasal: true,  isVowel: false },
                { symbol: 'u', place: 'Back',        manner: 'Close',     voiced: true,  nasal: false, isVowel: true },
            ],
        },
    ],
    arguments: {},
    verbs: [],
    modifiers: [],
    subordinates: [],
};
