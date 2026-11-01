import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import {
  createMedicareDenialImport,
  getImportedStateDenialMetric,
  getLocalMedicareDenialImport,
  MEDICARE_DENIAL_CSV_HEADERS,
  parseMedicareDenialCsv,
  saveLocalMedicareDenialImport,
  validateMedicareDenialImportCoverage,
  type MedicareDenialImportDataset,
} from "./medicareDenialImportService";
import { getAgencyMedicareDenialMetricForDisplay } from "./agencyMedicareDenialService";

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
      dispatchEvent: () => {
        dispatchedEvents += 1;
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
    };
    assert.equal(
      getAgencyMedicareDenialMetricForDisplay(verifiedAgency)?.ratePct,
      12,
      "the exact verified NPI can use its imported total",
    );
    assert.equal(getEventCount(), 1, "local import should notify the current app");

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
    const { ALL_NATIONWIDE_COUNTIES } = await import("../data/allCountiesDatabase");
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
    await validateMedicareDenialImportCoverage(dataset);
    saveLocalMedicareDenialImport(dataset);

    const floridaMetric = getImportedStateDenialMetric("fl");
    assert.equal(floridaMetric?.deniedClaims, 90);
    assert.equal(floridaMetric?.adjudicatedClaims, 500);
    assert.equal(floridaMetric?.ratePct, 18);
    assert.equal(getImportedStateDenialMetric("CA"), null);

    const incompleteStateDataset = {
      ...dataset,
      coverage: { ...dataset.coverage, completeStateTotals: false },
    };
    saveLocalMedicareDenialImport(incompleteStateDataset);
    assert.equal(getImportedStateDenialMetric("FL"), null);

    const zeroDenominatorDataset = {
      ...dataset,
      rows: rows.map((row) => ({ ...row, deniedClaims: 0, adjudicatedClaims: 0 })),
    };
    saveLocalMedicareDenialImport(zeroDenominatorDataset);
    assert.equal(getImportedStateDenialMetric("FL"), null);
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
