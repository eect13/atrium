import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "src/components/atrium-app.tsx"), "utf8");

test("the desk has one h1 for screen readers and outline", () => {
  assert.match(app, /<h1 className="sr-only">Atrium dashboard<\/h1>/);
  assert.equal((app.match(/<h1\b/g) || []).length, 1);
});
