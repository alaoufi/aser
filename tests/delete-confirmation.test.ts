import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeleteConfirmation } from "../src/lib/delete-confirmation";

test("account deletion is confirmed by «حذف حسابي» or DELETE (for reviewers without an Arabic keyboard)", () => {
  for (const ok of ["حذف حسابي", " حذف حسابي ", "DELETE", "delete", "Delete "])
    assert.equal(isDeleteConfirmation(ok), true, ok);
  for (const bad of ["", "حذف", "DELET", "delete account", "حذف حسابى"])
    assert.equal(isDeleteConfirmation(bad), false, bad);
});
