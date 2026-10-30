import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseUsfaFireCsv } from "./floridaOfficialData.ts";

test("parseCsv handles quoted commas, escaped quotes, and line breaks", () => {
  assert.deepEqual(
    parseCsv('A,B\r\n"Fire, Rescue","A ""quoted"" name"\r\n'),
    [
      ["A", "B"],
      ["Fire, Rescue", 'A "quoted" name'],
    ],
  );
});

test("USFA parser preserves Florida rows with a missing FDID and omits contact fields", () => {
  const csv = [
    "FDID, Fire dept name, HQ city, HQ state, County, Dept Type, Organization Type, HQ phone",
    'F1,"Station, One",Miami,FL,Miami-Dade,Career,"City government",305-555-0100',
    ',Unnumbered Volunteer Unit,Palmdale,FL,Glades,Volunteer,Volunteer,',
    "F2,Out of state department,Mobile,AL,Mobile,Career,County,",
  ].join("\n");

  const records = parseUsfaFireCsv(csv);
  assert.equal(records.length, 2);
  assert.equal(records[0].fdid, "F1");
  assert.equal(records[0].departmentName, "Station, One");
  assert.equal(records[1].fdid, null);
  assert.equal(records[1].departmentName, "Unnumbered Volunteer Unit");
  assert.equal(
    Object.keys(records[0]).some((key) => /phone|fax|staff|station/i.test(key)),
    false,
  );
});
