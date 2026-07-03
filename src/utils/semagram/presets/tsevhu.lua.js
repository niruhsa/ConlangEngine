// src/utils/semagram/presets/tsevhu.lua.js
//
// A Tsevhu-flavored example semagram rule-set, authored in the guest Lua.
// Exported as a plain string (data). Demonstrates: phoneme→ripple spelling,
// tense→orientation, and a recursive (L-system) "fin" to justify a real language
// over a purely declarative schema.

export const TSEVHU_RIPPLES = `-- Tsevhu-style: spell word[1] as a chain of quarter-circle "ripples".
local R = 24
local word = features.words[1]
if word then
  for i, ph in ipairs(word.phonemes) do
    local cx = 40 + (i - 1) * 42
    -- voiced phonemes sweep the other way; nasals get a dot above.
    emit({ type = 'arc', cx = cx, cy = 115, r = R,
           start = 180, stop = 300, sweep = ph.voiced and 1 or 0 })
    if ph.nasal then
      emit({ type = 'dot', cx = cx, cy = 115 - R - 7 })
    end
    if ph.isVowel then
      emit({ type = 'circle', cx = cx, cy = 115, r = 4, fill = true })
    end
  end
end

-- Encode tense as the orientation of a "head" marker (8 directions).
emit({ type = 'group', id = 'head', rotate = features.tenseAngle or 0 })

-- A little L-system flourish: a branching "fin" whose depth scales with mood.
local function fin(x, y, depth, ang)
  if depth <= 0 then return end
  local x2 = x + math.cos(ang) * 22
  local y2 = y + math.sin(ang) * 22
  emit({ type = 'line', x1 = x, y1 = y, x2 = x2, y2 = y2 })
  fin(x2, y2, depth - 1, ang - 0.5)
  fin(x2, y2, depth - 1, ang + 0.5)
end
fin(350, 115, (features.moodIntensity or 0) + 3, -math.pi / 2)
`;
