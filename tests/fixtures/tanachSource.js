import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const PINNED_SOURCE = Object.freeze({
  version: "UXLC 2.5",
  build: "27.6",
  verses: 23213,
  archiveSha256:
    "1bc6e006f43d3b18f2f718cefa3aa4774cac2c54092c28d173dd61996c43a050",
});

const DISPOSABLE_FIXTURES = Object.freeze({
  "uxlc-2.6-27.7": Object.freeze({
    version: "UXLC 2.6",
    build: "27.7",
    verses: 23213,
    archiveSha256:
      "423469bdcc4bfe36d7666f8e76fbd02c1674d77469093c06cee9779c0fba83e3",
  }),
});

// Production imports and ordinary API validation retain the application's
// pinned source. A newer upstream corpus is an explicit, hash-verified test
// fixture, never an expectation inferred from the database under test.
export async function expectedTanachSource(env = process.env) {
  const fixtureName = env.E2E_TANACH_FIXTURE;
  if (!fixtureName) return PINNED_SOURCE;
  if (
    !/^tanach_reader_e2e_[1-9]\d*$/.test(env.E2E_SCHEMA || "") ||
    env.NODE_ENV === "production" ||
    env.REPLIT_DEPLOYMENT
  ) {
    throw new Error(
      "An alternate Tanach fixture requires a disposable E2E schema",
    );
  }
  const fixture = Object.hasOwn(DISPOSABLE_FIXTURES, fixtureName)
    ? DISPOSABLE_FIXTURES[fixtureName]
    : null;
  if (!fixture) throw new Error(`Unknown Tanach test fixture: ${fixtureName}`);
  if (!env.E2E_TANACH_ARCHIVE_PATH) {
    throw new Error(
      "E2E_TANACH_ARCHIVE_PATH is required to verify the declared Tanach fixture",
    );
  }
  const archive = await readFile(env.E2E_TANACH_ARCHIVE_PATH);
  const hash = createHash("sha256").update(archive).digest("hex");
  if (hash !== fixture.archiveSha256) {
    throw new Error(`Tanach test fixture checksum mismatch for ${fixtureName}`);
  }
  return fixture;
}
