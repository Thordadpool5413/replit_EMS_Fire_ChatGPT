import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderDenialDetails } from "../components/ProviderDenialDetails";
import {
  createMedicareDenialImport,
  getImportedStateDenialMetric,
  getLocalMedicareDenialImport,
  MEDICARE_DENIAL_CSV_HEADERS,
  MEDICARE_DENIAL_IMPORT_EVENT,
  parseMedicareDenialCsv,
  saveLocalMedicareDenialImport,
  type MedicareDenialImportDataset,
} from "./medicareDenialImportService";
import { getAgencyMedicareDenialMetric, getAgencyMedicareDenialMetricForDisplay } from "./agencyMedicareDenialService";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function setBrowserStorage(storage: MemoryStorage) {
  let dispatchedEvents = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
      dispatchEvent: (event: Event) => {
        if(event.type===MEDICARE_DENIAL_IMPORT_EVENT) dispatchedEvents += 1;
        return true;
      },
    },
  });
  return () => dispatchedEvents;
}

test("validated aggregate claim summaries persist only in the current browser profile", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const profileA = new MemoryStorage();
  const profileB = new MemoryStorage();

  try {
    const getEventCount = setBrowserStorage(profileA);
    const csv = [
      MEDICARE_DENIAL_CSV_HEADERS.join(","),
      "1234567893,12086,12,100",
    ].join("\n");
    const rows = parseMedicareDenialCsv(csv);

    const dataset = createMedicareDenialImport(
      rows,
      {
        claimScope: "Medicare FFS ground ambulance",
        reportingPeriod: "2025",
        denialDefinition: "fully_denied_claim",
        sourceName: "Billing summary",
        sourceReference: "Report 2025",
        coverage: {
          completeProviderGroups: true,
          completeProviderTotals: true,
          completeCountyTotals: true,
          completeStateTotals: false,
        },
      },
      "summary.csv",
    );

    saveLocalMedicareDenialImport(dataset);
    assert.deepEqual(
      getLocalMedicareDenialImport(),
      JSON.parse(JSON.stringify(dataset)),
    );
    const unverifiedAgency = {
      npiNumber: "1234567893",
      cmsData: {},
      isVerifiedRecord: false,
      lastVerifiedAt: undefined,
      nppesRegistryUrl: undefined,
    } as Parameters<typeof getAgencyMedicareDenialMetricForDisplay>[0];
    assert.equal(
      getAgencyMedicareDenialMetricForDisplay(unverifiedAgency),
      null,
      "an imported NPI total must not be attached to an unverified agency",
    );
    const verifiedAgency = {
      ...unverifiedAgency,
      isVerifiedRecord: true,
      lastVerifiedAt: "2026-10-01T00:00:00.000Z",
      nppesRegistryUrl: "https://npiregistry.cms.hhs.gov/provider-view/1234567893",
      operatingRelationship: "OPERATING_RELATIONSHIP_CONFIRMED",
    };
    assert.equal(
      getAgencyMedicareDenialMetricForDisplay({ ...verifiedAgency, operatingRelationship: undefined }),
      null,
      "verified NPPES registry identity without a confirmed operating relationship must not receive an agency rate",
    );
    assert.equal(
      getAgencyMedicareDenialMetricForDisplay(verifiedAgency)?.ratePct,
      12,
      "the exact verified NPI can use its imported total",
    );
    for (const relationship of [
      "PARENT_MUNICIPALITY",
      "POSSIBLE_RELATED_ENTITY",
      "RELATIONSHIP_UNRESOLVED",
      "UNRESOLVED",
      "UNRELATED_ENTITY",
      "REGISTRY_ENTITY_CONFIRMED",
      "CONTRACTED_PROVIDER",
      "UNKNOWN_FUTURE_RELATIONSHIP",
    ]) {
      assert.equal(
        getAgencyMedicareDenialMetricForDisplay({ ...verifiedAgency, operatingRelationship: relationship }),
        null,
        `${relationship} must not attribute another entity's rate to this department`,
      );
    }
    for (const relationship of ["DIRECT_OPERATING_AGENCY", "OPERATING_RELATIONSHIP_CONFIRMED"]) {
      assert.equal(
        getAgencyMedicareDenialMetricForDisplay({ ...verifiedAgency, operatingRelationship: relationship })?.ratePct,
        12,
        `${relationship} retains the exact operating-agency NPI match`,
      );
    }
    assert.equal(
      getAgencyMedicareDenialMetricForDisplay({
        ...verifiedAgency,
        nppesRegistryUrl: "https://npiregistry.cms.hhs.gov/provider-view/1111111111",
      }),
      null,
      "the verified registry citation must identify the exact NPI",
    );
    saveLocalMedicareDenialImport({
      ...dataset,
      coverage: { ...dataset.coverage, completeProviderTotals: false },
    });
    assert.equal(getAgencyMedicareDenialMetricForDisplay(verifiedAgency), null);
    saveLocalMedicareDenialImport(dataset);
    assert.equal(getEventCount(), 3, "local imports should notify the current app");
    const invalidNpiDataset = {
      ...dataset,
      rows: dataset.rows.map((row) => ({ ...row, npi: "1234567890" })),
    };
    assert.throws(() => saveLocalMedicareDenialImport(invalidNpiDataset), /not valid for local storage/);
    profileA.setItem("ems-territory-intelligence.medicare-denial-import.v1", JSON.stringify(invalidNpiDataset));
    assert.equal(getLocalMedicareDenialImport(), null, "invalid check digits must also be rejected after reload");
    saveLocalMedicareDenialImport(dataset);

    setBrowserStorage(profileB);
    assert.equal(
      getLocalMedicareDenialImport(),
      null,
      "a separate browser profile must not receive this browser's summary",
    );

    setBrowserStorage(profileA);
    const alteredDataset = {
      ...dataset,
      rows: [{ ...dataset.rows[0], beneficiaryId: "dummy-not-real" }],
    };
    profileA.setItem(
      "ems-territory-intelligence.medicare-denial-import.v1",
      JSON.stringify(alteredDataset),
    );
    assert.equal(
      getLocalMedicareDenialImport(),
      null,
      "stored rows with fields outside the aggregate schema must be rejected",
    );
    assert.throws(
      () =>
        saveLocalMedicareDenialImport(
          alteredDataset as unknown as MedicareDenialImportDataset,
        ),
      /not valid for local storage/,
    );
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
});

test("state denial rates sum counts, require complete county coverage, and reject zero denominators", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new MemoryStorage();
  try {
    setBrowserStorage(storage);
    const ALL_NATIONWIDE_COUNTIES = JSON.parse(gunzipSync(await readFile(
      new URL("../data/all-counties-database.json.gz", import.meta.url),
    )).toString("utf8")) as Array<{ countyFips: string }>;
    const floridaFips = ALL_NATIONWIDE_COUNTIES
      .map((county) => county.countyFips)
      .filter((fips) => fips.startsWith("12"));
    assert.ok(floridaFips.length > 0, "the reference must include Florida counties");

    const rows = floridaFips.map((countyFips, index) => ({
      npi: "1234567893",
      countyFips,
      stateCode: "FL",
      deniedClaims: index === 0 ? 10 : index === 1 ? 80 : 0,
      adjudicatedClaims: index === 0 ? 100 : index === 1 ? 400 : 0,
    }));
    const dataset = createMedicareDenialImport(
      rows,
      {
        claimScope: "Medicare FFS ground ambulance",
        reportingPeriod: "2025",
        denialDefinition: "fully_denied_claim",
        sourceName: "Billing summary",
        sourceReference: "Report 2025",
        coverage: {
          completeProviderGroups: true,
          completeProviderTotals: true,
          completeCountyTotals: true,
          completeStateTotals: true,
        },
      },
      "summary.csv",
    );
    saveLocalMedicareDenialImport(dataset);

    const floridaMetric = getImportedStateDenialMetric("fl", floridaFips);
    assert.equal(floridaMetric?.deniedClaims, 90);
    assert.equal(floridaMetric?.adjudicatedClaims, 500);
    assert.equal(floridaMetric?.ratePct, 18);
    assert.equal(getImportedStateDenialMetric("CA", ["06001"]), null);
    saveLocalMedicareDenialImport({ ...dataset, rows: rows.slice(1) });
    assert.equal(getImportedStateDenialMetric("FL", floridaFips), null, "a completeness flag cannot substitute for a missing county");

    const incompleteStateDataset = {
      ...dataset,
      coverage: { ...dataset.coverage, completeStateTotals: false },
    };
    saveLocalMedicareDenialImport(incompleteStateDataset);
    assert.equal(getImportedStateDenialMetric("FL", floridaFips), null);

    const zeroDenominatorDataset = {
      ...dataset,
      rows: rows.map((row) => ({ ...row, deniedClaims: 0, adjudicatedClaims: 0 })),
    };
    saveLocalMedicareDenialImport(zeroDenominatorDataset);
    assert.equal(getImportedStateDenialMetric("FL", floridaFips), null);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
});

test("CSV import rejects patient-level columns rather than storing them", () => {
  const csv = [
    [...MEDICARE_DENIAL_CSV_HEADERS, "beneficiary_id"].join(","),
    "1234567893,12086,12,100,dummy-not-real",
  ].join("\n");
  assert.throws(
    () => parseMedicareDenialCsv(csv),
    /Extra columns are rejected/,
  );
});

test("invalid NPI check digits are rejected and reported zero is not missing", () => {
  assert.throws(
    () => parseMedicareDenialCsv(`${MEDICARE_DENIAL_CSV_HEADERS.join(",")}\n1234567890,12086,12,100`),
    /invalid 10-digit NPI/,
  );
  const agency = {
    npiNumber: "1234567893",
    cmsData: {
      medicareDeniedClaimCount: 0,
      medicareAdjudicatedClaimCount: 100,
      medicareDenialClaimScope: "Medicare FFS ground ambulance",
      medicareDenialDefinition: "Entire claim denied",
      medicareDenialReportingPeriod: "2025",
      medicareDenialSource: "Billing summary",
      medicareDenialSourceUrl: "https://example.org/report",
    },
  } as Parameters<typeof getAgencyMedicareDenialMetric>[0];
  assert.equal(getAgencyMedicareDenialMetric(agency)?.ratePct, 0);
  assert.equal(getAgencyMedicareDenialMetric({ ...agency, npiNumber: "1234567890" }), null);
  assert.equal(getAgencyMedicareDenialMetric({
    ...agency,
    cmsData: { ...agency.cmsData, medicareAdjudicatedClaimCount: 0 },
  }), null);
  assert.equal(getAgencyMedicareDenialMetric({
    ...agency,
    cmsData: { ...agency.cmsData, medicareDenialDefinition: undefined },
  }), null);
});

test("provider display keeps raw claim counts and report citation without showing a local percentage", () => {
  const metric = {
    npi: "1234567893",
    ratePct: 12,
    deniedClaimCount: 12,
    adjudicatedClaimCount: 100,
    reportingPeriod: "2025",
    claimScope: "Medicare FFS ground ambulance",
    denialDefinition: "Entire claim denied",
    source: "Billing summary",
    sourceReference: "Report 2025",
    sourceType: "local-import" as const,
  };
  const markup = renderToStaticMarkup(React.createElement(ProviderDenialDetails, { metric }));
  assert.match(markup, /12 denied \/ 100 adjudicated/);
  assert.doesNotMatch(markup, /12\.0%/);
  assert.match(markup, /Period: 2025/);
  assert.match(markup, /Entire claim denied/);
  assert.match(markup, /Billing summary · Report 2025/);
  assert.doesNotMatch(markup, /href=/);
  const linked = renderToStaticMarkup(React.createElement(ProviderDenialDetails, {
    metric: { ...metric, sourceUrl: "https://example.org/report" },
  }));
  assert.match(linked, /href="https:\/\/example\.org\/report"/);
});

test("the local-only boundary is explicit and no claim-summary API is exposed", async () => {
  const panelSource = await readFile(
    new URL("../components/MedicareDenialImportPanel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(panelSource, /Workspace sharing is disabled for now/);
  assert.match(panelSource, /Firestore access rules are not available here to verify/);

  const routesDirectory = new URL("../../../api-server/src/routes/", import.meta.url);
  const routeFiles = (await readdir(routesDirectory)).filter((file) =>
    file.endsWith(".ts"),
  );
  const routeSources = await Promise.all(
    routeFiles.map((file) =>
      readFile(new URL(file, routesDirectory), "utf8"),
    ),
  );
  assert.doesNotMatch(
    routeSources.join("\n"),
    /medicare-denial-import|claims-summary/i,
    "claim summaries must not be sent to an unauthenticated shared API",
  );
});
