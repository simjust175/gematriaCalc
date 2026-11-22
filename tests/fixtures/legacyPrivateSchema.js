import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

function csvRows(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (character === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((row) => row.length === 4);
}

export async function createLegacyPrivateSchema() {
  const parent = process.env.E2E_SCHEMA;
  assert.match(
    parent || "",
    /^tanach_reader_e2e_[1-9]\d+$/,
    "Use scripts/run-e2e.js; this fixture must never target an application schema",
  );
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(!process.env.REPLIT_DEPLOYMENT);
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "The legacy compatibility fixture is restricted to disposable local PostgreSQL",
  );
  const schema = `${parent}_legacy`;
  const admin = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${parent}`,
  });
  await admin.connect();
  try {
    assert.equal(
      (await admin.query("SELECT current_schema() AS schema")).rows[0].schema,
      parent,
    );
    const snapshot = csvRows(
      await readFile(
        new URL("../../docs/production-schema-review.csv", import.meta.url),
        "utf8",
      ),
    );
    await admin.query("BEGIN");
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET LOCAL search_path TO "${schema}"`);
    const tables = new Map();
    for (const [kind, table, column, definition] of snapshot) {
      if (kind !== "column") continue;
      const [type, nullable, defaultValue] = definition.split("|");
      const sequence = defaultValue?.match(
        /^nextval\('([a-z_]+)'::regclass\)$/,
      )?.[1];
      if (sequence) await admin.query(`CREATE SEQUENCE "${sequence}"`);
      if (!tables.has(table)) tables.set(table, []);
      tables
        .get(table)
        .push(
          `"${column}" ${type}${nullable === "NO" ? " NOT NULL" : ""}${defaultValue ? ` DEFAULT ${defaultValue}` : ""}`,
        );
    }
    for (const [table, columns] of tables)
      await admin.query(`CREATE TABLE "${table}" (${columns.join(", ")})`);
    const constraints = snapshot.filter((row) => row[0] === "constraint");
    constraints.sort(
      (a, b) =>
        Number(a[3].startsWith("FOREIGN KEY")) -
        Number(b[3].startsWith("FOREIGN KEY")),
    );
    for (const [, table, name, definition] of constraints) {
      await admin.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${definition}`,
      );
    }
    for (const [kind, , , definition] of snapshot) {
      if (kind !== "index") continue;
      await admin.query(
        definition
          .replace(/^CREATE (UNIQUE )?INDEX /, "CREATE $1INDEX IF NOT EXISTS ")
          .replace(/ ON public\./, ` ON "${schema}".`),
      );
    }
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK").catch(() => {});
    await admin.end();
    throw error;
  }
  return {
    schema,
    async close() {
      try {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    },
  };
}
