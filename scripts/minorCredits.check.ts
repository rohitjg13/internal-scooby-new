// Runnable self-check for the minor-tracker credit parser. No framework.
//   node scripts/minorCredits.check.ts
import assert from "node:assert";
import { creditsOf } from "../src/lib/minorCredits.ts";

// A stated number wins, in every shape the tables use it.
assert.equal(creditsOf(["3"]), 3);
assert.equal(creditsOf(["04"]), 4); // zero-padded, not "0"
assert.equal(creditsOf(["4 (3:1:0)"]), 4);
assert.equal(creditsOf(["3 (3:1:1)"]), 3); // the sum would say 5

// L:T:P only — both separators appear in the documents.
assert.equal(creditsOf(["3:1:0"]), 4);
assert.equal(creditsOf(["2:0:1"]), 3);
assert.equal(creditsOf(["2-0-2"]), 4);

// Nothing usable is zero, not NaN — a blank cell must not poison a total.
for (const v of [[], [""], ["--"], ["—"], ["NA"]]) assert.equal(creditsOf(v), 0);

// Several credit columns on one row: the first readable one answers.
assert.equal(creditsOf(["", "3:0:1"]), 4);

console.log("minorCredits.check.ts OK");
