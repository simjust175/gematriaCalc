import test from 'node:test';
import assert from 'node:assert/strict';
import { needsTanachRepresentationImport } from '../server/db.js';
import { UXLC_REPRESENTATION_VERSION } from '../server/uxlcText.js';

function databaseWith({ verseCount, representationVersion }) {
  return {
    async query() {
      return {
        rows: [{
          verse_count: verseCount,
          representation_version: representationVersion,
        }],
      };
    },
  };
}

test('an empty Tanach corpus is imported during production startup', async () => {
  const needsImport = await needsTanachRepresentationImport(databaseWith({
    verseCount: 0,
    representationVersion: UXLC_REPRESENTATION_VERSION,
  }));
  assert.equal(needsImport, true);
});

test('a current populated Tanach corpus does not re-import', async () => {
  const needsImport = await needsTanachRepresentationImport(databaseWith({
    verseCount: 23213,
    representationVersion: UXLC_REPRESENTATION_VERSION,
  }));
  assert.equal(needsImport, false);
});

test('an older Tanach representation is upgraded during startup', async () => {
  const needsImport = await needsTanachRepresentationImport(databaseWith({
    verseCount: 23213,
    representationVersion: UXLC_REPRESENTATION_VERSION - 1,
  }));
  assert.equal(needsImport, true);
});