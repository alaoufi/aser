const { readFileSync } = require("node:fs");
if (process.env.STORAGE_GUARD_PATH) {
  try {
    if (
      readFileSync(process.env.STORAGE_GUARD_PATH, "utf8").trim() !==
      "jdatna-storage-ready"
    )
      throw new Error();
  } catch {
    console.error("Jdatna storage is unavailable; refusing to start.");
    process.exit(1);
  }
}
require("./server.js");
