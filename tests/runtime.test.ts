import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
test("runtime refuses absent or incorrect project storage before starting server", () => {
  const dir = mkdtempSync(join(tmpdir(), "jdatna-guard-"));
  try {
    copyFileSync(resolve("scripts/start-runtime.cjs"), join(dir, "start.cjs"));
    writeFileSync(join(dir, "server.js"), "console.log('server-started')");
    const marker = join(dir, "marker");
    const run = () =>
      spawnSync(process.execPath, [join(dir, "start.cjs")], {
        env: { ...process.env, STORAGE_GUARD_PATH: marker },
        encoding: "utf8",
      });
    const absent = run();
    assert.equal(absent.status, 1);
    assert.doesNotMatch(absent.stdout, /server-started/);
    writeFileSync(marker, "wrong-project");
    assert.equal(run().status, 1);
    writeFileSync(marker, "jdatna-storage-ready\n");
    const valid = run();
    assert.equal(valid.status, 0);
    assert.match(valid.stdout, /server-started/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
