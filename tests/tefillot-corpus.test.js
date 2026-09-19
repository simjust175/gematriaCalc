import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contextsForSiddurPath,
  describeContext,
  flattenHebrewText,
} from '../server/tefillotCorpus.js';

const path = (...names) => names.map(en => ({ en, he: en }));

test('weekday and Shabbat paths resolve to their exact navigation context', () => {
  assert.deepEqual(
    describeContext(contextsForSiddurPath(path('Weekday Shacharit', 'Morning Blessings'))[0]),
    {
      occasionSlug: 'weekday',
      occasionLabel: 'ימות החול',
      occasionOrder: 1,
      serviceSlug: 'shacharit',
      serviceLabel: 'שחרית',
      serviceOrder: 3,
    }
  );
  assert.equal(
    describeContext(contextsForSiddurPath(path('Musaf'))[0]).serviceSlug,
    'musaf'
  );
});

test('shared festival Amidah is associated with all five occasions and three services', () => {
  const contexts = contextsForSiddurPath(
    path('Holidays', 'Maariv, Shacharit & Mincha Amidah')
  ).map(describeContext);
  assert.equal(contexts.length, 15);
  assert.deepEqual(new Set(contexts.map(item => item.occasionSlug)), new Set([
    'pesach', 'shavuot', 'sukkot', 'shemini-atzeret', 'simchat-torah',
  ]));
  assert.deepEqual(new Set(contexts.map(item => item.serviceSlug)), new Set([
    'maariv', 'shacharit', 'mincha',
  ]));
});

test('festival-only prayers never leak into the wrong occasion', () => {
  const dew = contextsForSiddurPath(path('Holidays', 'Prayer for Dew')).map(describeContext);
  const rain = contextsForSiddurPath(path('Holidays', 'Prayer for Rain')).map(describeContext);
  const sukkah = contextsForSiddurPath(path('Holidays', 'Prayer Upon Entering Sukkah')).map(describeContext);
  const yizkor = contextsForSiddurPath(path('Holidays', 'Yizkor')).map(describeContext);

  assert.deepEqual(dew.map(item => item.occasionSlug), ['pesach']);
  assert.deepEqual(rain.map(item => item.occasionSlug), ['shemini-atzeret']);
  assert.deepEqual(sukkah.map(item => item.occasionSlug), ['sukkot']);
  assert.deepEqual(yizkor.map(item => item.occasionSlug), ['pesach', 'shavuot', 'shemini-atzeret']);
});

test('festival services compose reusable common sections around Yom Tov liturgy', () => {
  const weekdayMaarivShema = contextsForSiddurPath(path('Weekday Maariv', 'The Shema'))
    .map(describeContext);
  const festivalMaarivShema = contextsForSiddurPath(
    path('Shabbat Eve Maariv', 'Shema & Blessings')
  )
    .map(describeContext);
  const morningBlessings = contextsForSiddurPath(path('Weekday Shacharit', 'Morning Blessings'))
    .map(describeContext);
  const festivalPesukei = contextsForSiddurPath(
    path('Shabbat Morning Services', "Pesukei D'Zimrah")
  ).map(describeContext);
  const festivalShema = contextsForSiddurPath(
    path('Shabbat Morning Services', 'Shema & Blessings')
  ).map(describeContext);
  const weekdayHodu = contextsForSiddurPath(path('Weekday Shacharit', 'Hodu'))
    .map(describeContext);
  const weekdayShacharitShema = contextsForSiddurPath(path('Weekday Shacharit', 'The Shema'))
    .map(describeContext);
  const hallel = contextsForSiddurPath(path('Rosh Chodesh', 'Hallel')).map(describeContext);

  assert.deepEqual(weekdayMaarivShema.map(item => item.occasionSlug), ['weekday']);
  assert.equal(festivalMaarivShema.filter(item => item.occasionSlug !== 'shabbat').length, 5);
  assert.equal(morningBlessings.filter(item => item.occasionSlug !== 'weekday').length, 5);
  assert.equal(festivalPesukei.filter(item => item.occasionSlug !== 'shabbat').length, 5);
  assert.equal(festivalShema.filter(item => item.occasionSlug !== 'shabbat').length, 5);
  assert.deepEqual(weekdayHodu.map(item => item.occasionSlug), ['weekday']);
  assert.deepEqual(weekdayShacharitShema.map(item => item.occasionSlug), ['weekday']);
  assert.deepEqual(new Set(hallel.map(item => item.serviceSlug)), new Set(['shacharit']));
  assert.equal(hallel.length, 5);
});

test('Hebrew arrays flatten into searchable plain-text units with stable addresses', () => {
  assert.deepEqual(
    flattenHebrewText(['<b>מודה</b> אני', ['לפניך<br>מלך']]),
    [
      { text: 'מודה אני', address: [1] },
      { text: 'לפניך\nמלך', address: [2, 1] },
    ]
  );
});