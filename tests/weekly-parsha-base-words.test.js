import test from 'node:test';
import assert from 'node:assert/strict';
import { matchWeeklyBaseWords } from '../server/weeklyBaseWordMatches.js';

const parsha = {
  nameHe: 'בראשית',
  shabbatDate: '2026-10-10',
  portions: [{start:{bookSlug:'Genesis',chapter:1,verse:1},end:{bookSlug:'Genesis',chapter:1,verse:2}}],
};
const corpus = [
  {book_slug:'Genesis',book_name:'בראשית',chapter:1,verse:1,display_text:'בְּרֵאשִׁית בָּרָא אֱלֹהִים'},
  {book_slug:'Genesis',book_name:'בראשית',chapter:1,verse:2,display_text:'וְהָאָרֶץ הָיְתָה'},
  {book_slug:'Genesis',book_name:'בראשית',chapter:1,verse:3,display_text:'בְּרֵאשִׁית'},
];
test('weekly scan independent of calculator input, matches canonical whole words in Parsha only', () => {
  const out = matchWeeklyBaseWords({parsha,corpus,baseWords:[{id:1,original_text:'בראשית',full_gematria:913}]});
  assert.equal(out.baseWordCount,1);
  assert.equal(out.total,1);
  assert.equal(out.results[0].bookSlug,'Genesis');
  assert.equal(out.results[0].chapter,1);
  assert.equal(out.results[0].verse,1);
  assert.equal(out.results[0].type,'whole_word');
  assert.equal(out.words[0].count,1);
});
test('weekly scan returns an actionable empty library state', () => {
  const out = matchWeeklyBaseWords({parsha,corpus,baseWords:[]});
  assert.equal(out.baseWordCount,0);
  assert.deepEqual(out.results,[]);
});
test('weekly scan counts independently saved words with identical numeric values', () => {
  const out = matchWeeklyBaseWords({parsha,corpus,baseWords:[
    {id:1,original_text:'בראשית',full_gematria:913},
    {id:2,original_text:'מילה אחרת',full_gematria:913},
  ]});
  assert.equal(out.total,2);
  assert.deepEqual(out.words.map(item=>item.count),[1,1]);
});
test('weekly scan preserves a finite result cap and accurate total counts', () => {
  const many = Array.from({length:160},(_,i)=>({id:i+1,original_text:`מילה ${i}`,full_gematria:913}));
  const out = matchWeeklyBaseWords({parsha,corpus,baseWords:many});
  assert.equal(out.total,160);
  assert.equal(out.results.length,150);
});
