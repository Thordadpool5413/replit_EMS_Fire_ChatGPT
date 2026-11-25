import assert from "node:assert/strict";
import test from "node:test";
import { publicAgencyProfilePayload } from "./publicAgencyProfile";

test("public agency profile view omits private work notes and local source reviews", () => {
  const profile = publicAgencyProfilePayload({
    id: "test-profile",
    name: "County Fire Department",
    stateCode: "FL",
    fieldNotes: [{ notes: "private field note" }],
    followUpTasks: [{ notes: "private follow-up" }],
    sourceRecordAssociations: [{ sourceFields: { internal: "private" } }],
    sourceFacts: [{ note: "private source note" }],
    _factReviews: [{ note: "local review" }],
    _reviewOriginalValues: { address: "prior value" },
    keyContacts: [{
      id: "public-contact",
      name: "Agency Contact",
      email: "public@example.invalid",
      notes: "private contact note",
    }],
  });

  assert.deepEqual(profile, {
    id: "test-profile",
    name: "County Fire Department",
    stateCode: "FL",
    keyContacts: [{
      id: "public-contact",
      name: "Agency Contact",
      email: "public@example.invalid",
    }],
  });
});
