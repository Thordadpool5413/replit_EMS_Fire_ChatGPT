import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import {
  createMedicareDenialImport,
  getLocalMedicareDenialImport,
  MEDICARE_DENIAL_CSV_HEADERS,
  parseMedicareDenialCsv,
  saveLocalMedicareDenialImport,
  type MedicareDenialImportDataset,
} from "./medicareDenialImportService";

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
