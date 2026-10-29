import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchWeeklyBaseWords,
  parseWeeklyBaseWordsQuery,
} from '../server/weeklyBaseWordMatches.js';
import { findGematriaRanges } from '../server/tanachGematriaSearch.js';

const parsha = {
  nameHe: 'בראשית',
  shabbatDate: '2026-10-10',
  portions: [{
    start: { bookSlug: 'Genesis', chapter: 1, verse: 1 },
    end: { bookSlug: 'Genesis', chapter: 1, verse: 2 },
  }],
};
const corpus = [
  {book_slug:'Genesis',book_name:'בראשית',chapter:1,verse:1,display_text:'בְּרֵאשִׁית בָּרָא אֱלֹהִים'},
  {book_slug:'Genesis',book_name:'בראשית',chapter:1,verse:2,display_text:'וְהָאָרֶץ הָיְתָה'},
  {book_slug:'Genesis',book_name:'בראשית',chapter:1,verse:3,display_text:'בְּרֵאשִׁית'},
];
test('weekly scan searches complete words only within Parsha and needs no calculator input', () => {
  const out = matchWeeklyBaseWords({ parsha, corpus, baseWords: [
    {id:1,original_text:'בראשית',full_gematria:913},
  ] });
  assert.equal(out.baseWordCount, 1);
  assert.equal(out.total, 1);
  assert.equal(out.selectedTotal, 1);
  assert.equal(out.results[0].bookSlug, 'Genesis');
  assert.equal(out.results[0].verse, 1);
  assert.equal(out.results[0].type, 'whole_word');
  assert.equal(out.words[0].count, 1);
  assert.equal(out.hasMore, false);
});
test('weekly scan empty saved collection and festival state remain safe', () => {
  const empty = matchWeeklyBaseWords({parsha,corpus,baseWords:[]});
  assert.equal(empty.baseWordCount, 0);
  assert.deepEqual(empty.results, []);
  assert.equal(empty.total, 0);
  const holiday = matchWeeklyBaseWords({parsha:null,corpus,baseWords:[]});
  assert.equal(holiday.parsha, null);
  assert.deepEqual(holiday.results, []);
});
test('every saved word independently receives matches for identical numeric values', () => {
  const out = matchWeeklyBaseWords({parsha,corpus,baseWords:[
    {id:1,original_text:'בראשית',full_gematria:913},
    {id:2,original_text:'מילה אחרת',full_gematria:913},
  ]});
  assert.equal(out.total, 2);
  assert.deepEqual(out.words.map(item=>item.count), [1,1]);
  const selected = matchWeeklyBaseWords({parsha,corpus,wordId:2,baseWords:[
    {id:1,original_text:'בראשית',full_gematria:913},
    {id:2,original_text:'מילה אחרת',full_gematria:913},
  ]});
  assert.equal(selected.total,2);
  assert.equal(selected.selectedTotal,1);
  assert.equal(selected.results.length,1);
  assert.equal(selected.results[0].baseWordId,2);
});
test('weekly scan pages across results and never hides a saved base word', () => {
  const many = Array.from({length:160},(_,i)=>({
    id:i+1,original_text:`מילה ${i}`,full_gematria:913,
  }));
  const first = matchWeeklyBaseWords({parsha,corpus,baseWords:many});
  const second = matchWeeklyBaseWords({parsha,corpus,baseWords:many,page:2});
  const fourth = matchWeeklyBaseWords({parsha,corpus,baseWords:many,page:4});
  assert.equal(first.total,160);
  assert.equal(first.results.length,50);
  assert.equal(first.hasMore,true);
  assert.equal(second.results.length,50);
  assert.equal(second.results[0].baseWordId,51);
  assert.equal(fourth.results.length,10);
  assert.equal(fourth.hasMore,false);
  const lastWord = matchWeeklyBaseWords({parsha,corpus,baseWords:many,wordId:160});
  assert.equal(lastWord.selectedTotal,1);
  assert.equal(lastWord.results[0].baseWordId,160);
});
test('optimized weekly scan agrees with original Gematria range engine on canonical word boundaries', () => {
  const verses = [
    'בְּרֵאשִׁית בָּרָא אֱלֹהִים',
    'א־ב ג ד ה',
    'א אב בא אבא',
    'וְהָאָרֶץ הָיְתָה תֹהוּ',
  ];
  const wordValues = [1, 3, 4, 5, 6, 7, 8, 10, 11, 203, 913, 1116];
  for (const verseText of verses) {
    const verse = {book_slug:'Genesis',book_name:'בראשית',chapter:1,verse:1,display_text:verseText};
    for (const value of wordValues) {
      const expected = findGematriaRanges(verseText,value).filter(m=>m.classification!=='partial')
        .map(m=>`${m.start}:${m.end}`).sort();
      const result = matchWeeklyBaseWords({parsha,corpus:[verse],baseWords:[
        {id:1,original_text:'בדיקה',full_gematria:value},
      ]});
      const actual = result.results.map(m=>`${m.start}:${m.end}`).sort();
      assert.deepEqual(actual,expected,`mismatch for value ${value}, verse ${verseText}`);
    }
  }
});
test('weekly scan rejects invalid pagination and word-id values', () => {
  for (const bad of ['0','-2','1.5','NaN','Infinity','100001']) {
    assert.equal(parseWeeklyBaseWordsQuery({page:bad}).error,'invalid_page');
  }
  for (const bad of ['0','-2','1.5','NaN','Infinity']) {
    assert.equal(parseWeeklyBaseWordsQuery({word_id:bad}).error,'invalid_base_word_id');
  }
  assert.deepEqual(parseWeeklyBaseWordsQuery({word_id:'5',page:'2'}),{wordId:5,page:2});
});
