import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test(
  "development preview backend reloads an imported route module instead of retaining a 404",
  { timeout: 20_000 },
  async (t) => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    const previewBackend = [...packageJson.scripts.dev.matchAll(/"([^"]+)"/g)]
      .map((match) => match[1])
      .find((command) => /^node\s+.*server\/index\.js$/.test(command));
    assert.ok(
      previewBackend,
      "the preview must declare its backend startup command",
    );
    assert.equal(
      previewBackend,
      packageJson.scripts["dev:backend"],
      "preview and standalone development must use the same backend startup",
    );
    const command = previewBackend.trim().split(/\s+/);
    assert.equal(command.shift(), "node");
    assert.equal(command.pop(), "server/index.js");

    const directory = await mkdtemp(join(tmpdir(), "gematria-dev-reload-"));
    const entry = join(directory, "server.mjs");
    const routes = join(directory, "routes.mjs");
    await writeFile(routes, "export const registered = false;\n");
    await writeFile(
      entry,
      `
    import { createServer } from 'node:http';
    import { registered } from './routes.mjs';
    const server = createServer((request, response) => {
      if (request.url === '/__watch_fixture_shutdown') {
        response.setHeader('connection', 'close');
        response.end('closing');
        server.close(() => process.exit(0));
        return;
      }
      const available = request.url === '/api/entries/curated-matches' && registered;
      response.writeHead(available ? 200 : 404, { 'content-type': 'application/json' });
      response.end(JSON.stringify(available ? { matches: [], routeRegistered: true } : { error: 'not_found' }));
    });
    server.listen(0, '127.0.0.1', () => console.log('WATCH_FIXTURE_READY:' + server.address().port));
  `,
    );

    const child = spawn(process.execPath, [...command, entry], {
      cwd: directory,
      env: { ...process.env, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let errors = "";
    let spawnError;
    const ports = [];
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      ports.splice(
        0,
        ports.length,
        ...[...output.matchAll(/WATCH_FIXTURE_READY:(\d+)/g)].map((match) =>
          Number(match[1]),
        ),
      );
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk.toString();
    });
    child.once("error", (error) => {
      spawnError = error;
    });
    const exited = new Promise((done) => child.once("exit", done));

    t.after(async () => {
      if (ports.length) {
        await fetch(
          `http://127.0.0.1:${ports.at(-1)}/__watch_fixture_shutdown`,
          {
            signal: AbortSignal.timeout(1_000),
          },
        )
          .then((response) => response.text())
          .catch(() => {});
      }
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await Promise.race([exited, delay(3_000, undefined, { ref: false })]);
        assert.ok(
          child.exitCode !== null || child.signalCode !== null,
          "the test-owned watch process must stop",
        );
      }
      const target = resolve(directory);
      assert.ok(target.startsWith(resolve(tmpdir()) + sep));
      assert.ok(basename(target).startsWith("gematria-dev-reload-"));
      await rm(target, { recursive: true, force: true });
    });

    async function nextStartup(count) {
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        if (spawnError) throw spawnError;
        if (ports.length >= count)
          return `http://127.0.0.1:${ports[count - 1]}`;
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`Development server exited: ${errors}`);
        }
        await delay(25);
      }
      assert.fail(
        `Development server did not reload the imported route module. ${output}\n${errors}`,
      );
    }

    const before = await nextStartup(1);
    assert.equal(
      (await fetch(`${before}/api/entries/curated-matches`)).status,
      404,
    );
    await writeFile(routes, "export const registered = true;\n");
    const after = await nextStartup(2);
    const response = await fetch(`${after}/api/entries/curated-matches`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      matches: [],
      routeRegistered: true,
    });
  },
);
