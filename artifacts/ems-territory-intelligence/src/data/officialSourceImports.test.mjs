import test from "node:test";
import assert from "node:assert/strict";
import {
  isExactFemaRecipientMatch,
  normalizeExactOrganizationName,
} from "./officialSourceImports.ts";

test("normalizes punctuation and spacing without dropping legal-name words", () => {
  assert.equal(
    normalizeExactOrganizationName("North-Harbor Fire Dept., Inc."),
    "north harbor fire dept inc",
  );
  assert.equal(
    isExactFemaRecipientMatch(
      "North-Harbor Fire Dept., Inc.",
      "NORTH HARBOR FIRE DEPT INC",
    ),
    true,
  );
});

test("does not treat similar organization names as the same grantee", () => {
  assert.equal(
    isExactFemaRecipientMatch(
      "North Harbor Fire Department",
      "North Harbor Fire District",
    ),
    false,
  );
  assert.equal(isExactFemaRecipientMatch("EMS", ""), false);
});
