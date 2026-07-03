// src/utils/semagram/presets/heptapod.lua.js
//
// An Arrival-Heptapod-B-flavored example: a circular semagram where meaning is
// distributed around a ring, rather than along a linear spine. Shows that the
// SAME engine renders a completely different writing system from user rules — it
// just uses the built-in `ring`/`dotAt`/`branch`/`lineTo` primitive helpers.

export const HEPTAPOD_RING = `-- Heptapod-B-style circular semagram.
local cx, cy = 200, 100
local R = 62

ring(cx, cy, R, false)                       -- the base logogram ring

-- Distribute word[1]'s phonemes as marks around the ring.
local word = features.words[1]
if word then
  local n = math.max(#word.phonemes, 1)
  for i, ph in ipairs(word.phonemes) do
    local a = (i - 1) / n * math.pi * 2
    local px = cx + math.cos(a) * R
    local py = cy + math.sin(a) * R
    if ph.isVowel then
      dotAt(px, py, 4)                       -- vowels = solid nodes
    else
      ring(px, py, 8, false)                 -- consonants = small rings
    end
    if ph.voiced then
      branch(px, py, 2, a, 12)               -- voicing = outward tendrils
    end
  end
end

-- A radial spar whose direction encodes tense (the 8 tense directions).
local ta = (features.tenseAngle or 0) * math.pi / 180
lineTo(cx, cy, cx + math.cos(ta) * R, cy + math.sin(ta) * R)

-- Mood adds concentric inner rings.
for k = 1, (features.moodIntensity or 0) do
  ring(cx, cy, R - k * 12, false)
end
`;
