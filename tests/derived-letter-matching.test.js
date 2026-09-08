import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDerivedLetterProfile,
  derivedLetterProfilesMatch,
  matchesAnyDerivedLetterProfile,
  normalizeDerivedLetters,
} from '../server/derivedLetterMatching.js';

function matches(target, candidate, kind = 'initials') {
  return derivedLetterProfilesMatch(
    createDerivedLetterProfile(target, kind),
    createDerivedLetterProfile(candidate, kind)
  );
}

for (const kind of ['initials', 'finals']) {
  test(`${kind} match every exact permutation and reject missing, extra, or changed letters`, () => {
    for (const candidate of ['שבת', 'בתש', 'תשב', 'שתב', 'תבש', 'בשת']) {
      assert.equal(matches('שבת', candidate, kind), true, candidate);
    }
    for (const candidate of ['שבש', 'שבתא', 'שב', 'תש', 'אבשת']) {
      assert.equal(matches('שבת', candidate, kind), false, candidate);
    }
  });

  test(`${kind} preserve duplicate quantities exactly`, () => {
    for (const candidate of ['שבש', 'בשש', 'ששב']) {
      assert.equal(matches('שבש', candidate, kind), true, candidate);
    }
    for (const candidate of ['שבת', 'בש', 'ששבת', 'בבש']) {
      assert.equal(matches('שבש', candidate, kind), false, candidate);
    }
  });

  test(`${kind} normalization ignores marks, punctuation, and repeated spacing`, () => {
    assert.equal(normalizeDerivedLetters(' שָׁ ״ ב\t  ת! ', kind), 'שבת');
    assert.equal(matches('שבת', 'תּ־שׁ, ב', kind), true);
  });
}

test('finals use the existing final-form equivalence while preserving exact counts', () => {
  assert.equal(matches('כםץ', 'צמכ', 'finals'), true);
  assert.equal(matches('כםץ', 'צמכך', 'finals'), false);
  assert.equal(matches('כםץ', 'צממ', 'finals'), false);
});

test('matching against multiple current derived candidates succeeds once', () => {
  const profiles = [
    createDerivedLetterProfile('שבת', 'initials'),
    createDerivedLetterProfile('אבג', 'initials'),
  ];
  assert.equal(matchesAnyDerivedLetterProfile('בתש', profiles, 'initials'), true);
  assert.equal(matchesAnyDerivedLetterProfile('בתא', profiles, 'initials'), false);
});