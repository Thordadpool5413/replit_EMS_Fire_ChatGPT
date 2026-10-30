import assert from "node:assert/strict";
import test from "node:test";
import {
  hasValidNpiCheckDigit,
  matchesExactProviderIdentity,
} from "./providerIdentity.ts";

const requested = {
  agencyName: "Riverview Fire & Rescue, Inc.",
  city: "Riverview",
  stateCode: "OR",
  npiNumber: "1234567893",
};

const registry = {
  legalName: "Riverview Fire & Rescue Inc.",
  city: "Riverview",
  stateCode: "OR",
  npiNumber: "1234567893",
};

test("validates known NPI check digits", () => {
  assert.equal(hasValidNpiCheckDigit("1881018208"), true);
  assert.equal(hasValidNpiCheckDigit("1538568928"), true);
  assert.equal(hasValidNpiCheckDigit("1881018200"), false);
  assert.equal(hasValidNpiCheckDigit("188101820"), false);
});

test("matches an exact legal name, city, state, and supplied NPI", () => {
  assert.equal(matchesExactProviderIdentity(requested, registry), true);
});

test("does not treat a partial or different legal name as an identity match", () => {
  assert.equal(
    matchesExactProviderIdentity(requested, {
      ...registry,
      legalName: "Riverview Fire Department",
    }),
    false,
  );
});

test("requires the requested city and state to match exactly", () => {
  assert.equal(
    matchesExactProviderIdentity({ ...requested, city: "" }, registry),
    false,
  );
  assert.equal(
    matchesExactProviderIdentity(requested, { ...registry, city: "Portland" }),
    false,
  );
  assert.equal(
    matchesExactProviderIdentity(requested, { ...registry, stateCode: "WA" }),
    false,
  );
});

test("does not match a different NPI when one was supplied", () => {
  assert.equal(
    matchesExactProviderIdentity(requested, {
      ...registry,
      npiNumber: "1098765432",
    }),
    false,
  );
});
