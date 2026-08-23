import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUxlcVerseText } from '../server/uxlcText.js';

test('UXLC resolution renders pointed qere and omits ketiv and editorial payloads', () => {
  const xml = `
    <w>לֶאֱכֹ֣ל</w>
    <w>אֶת<x>c</x></w>
    <k>חריהם</k>
    <q>צוֹאָתָ֗ם</q>
    <w>וְלִשְׁתּ֛וֹת</w>
    <w>אֶת־</w>
    <k>שיניהם</k>
    <q>מימֵ֥י</q>
    <q>רַגְלֵיהֶ֖ם</q>
  `;

  assert.equal(
    resolveUxlcVerseText(xml),
    'לֶאֱכֹ֣ל אֶת צוֹאָתָ֗ם וְלִשְׁתּ֛וֹת אֶת־מימֵ֥י רַגְלֵיהֶ֖ם'
  );
});

test('UXLC qere following a maqqef remains joined to the preceding token', () => {
  assert.equal(
    resolveUxlcVerseText('<w>אֶת־</w><k>חראיהם</k><q>צוֹאָתָ֗ם</q>'),
    'אֶת־צוֹאָתָ֗ם'
  );
});