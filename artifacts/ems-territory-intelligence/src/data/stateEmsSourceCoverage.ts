/**
 * State and territorial EMS source routes.
 *
 * A directory route is not a state license dataset. Florida and Virginia currently have
 * an identified official provider-license search route in this application.
 */
export type EmsJurisdictionCoverageStatus =
  | "official-license-reference"
  | "state-office-directory";

export interface EmsJurisdictionSourceCoverage {
  code: string;
  name: string;
  level: "state" | "district" | "territory";
  coverageStatus: EmsJurisdictionCoverageStatus;
  sourceName: string;
  sourceUrl: string;
  directoryUrl: string;
  sourceScope: string;
  matchKeys: string[];
  periodAndFreshness: string;
  appConnection: string;
  limitations: string;
}

const EMS_GOV_STATE_SYSTEMS =
  "https://www.ems.gov/issues/state-ems-systems/";
const NREMT_STATE_OFFICE_MAP =
  "https://www.nremt.org/resources/state-ems-offices";
const FLORIDA_EMS_PROGRAM =
  "https://www.floridahealth.gov/licensing-regulations/emergency-medical-services-system/ems-service-provider/";
const FLORIDA_MQA_LICENSE_SEARCH =
  "https://mqa-internet.doh.state.fl.us/MQASearchServices/healthcareproviders";

const STATE_JURISDICTIONS: Array<[string, string]> = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["DC", "District of Columbia"],
];

const TERRITORY_JURISDICTIONS: Array<[string, string]> = [
  ["AS", "American Samoa"],
  ["GU", "Guam"],
  ["MP", "Northern Mariana Islands"],
  ["PR", "Puerto Rico"],
  ["VI", "U.S. Virgin Islands"],
];

function directoryRoute(
  code: string,
  name: string,
  level: EmsJurisdictionSourceCoverage["level"],
): EmsJurisdictionSourceCoverage {
  return {
    code,
    name,
    level,
    coverageStatus: "state-office-directory",
    sourceName: "National Registry of EMTs State EMS Agency Map",
    sourceUrl: NREMT_STATE_OFFICE_MAP,
    directoryUrl: EMS_GOV_STATE_SYSTEMS,
    sourceScope: "Contact/discovery route to the jurisdiction's lead EMS office.",
    matchKeys: ["Jurisdiction name/code; confirm agency-issued license ID directly"],
    periodAndFreshness:
      "Directory page has no per-jurisdiction source date in this app; check the linked office.",
    appConnection:
      "Manual reference link only; no state license feed or provider records are connected.",
    limitations:
      "An office listing is not an agency roster, license status, active-service-area record, or apparatus inventory.",
  };
}

export const EMS_JURISDICTION_SOURCE_COVERAGE: EmsJurisdictionSourceCoverage[] =
  [
    ...STATE_JURISDICTIONS.map(([code, name]) =>
      code === "FL"
        ? {
            code,
            name,
            level: "state" as const,
            coverageStatus: "official-license-reference" as const,
            sourceName: "Florida DOH EMS Service Provider Licensing",
            sourceUrl: FLORIDA_MQA_LICENSE_SEARCH,
            directoryUrl: FLORIDA_EMS_PROGRAM,
            sourceScope:
              "Official Florida EMS provider license search; the program page links its provider roster and reports provider categories.",
            matchKeys: [
              "Florida EMS license number",
              "Provider name and license type",
              "Address of record and listed secondary locations",
            ],
            periodAndFreshness:
              "License search pages show a record-specific “Data As Of” date; the program page's aggregate provider count can change.",
            appConnection:
              "Official manual lookup linked in the app; no automated license search, roster ingestion, or agency match is implemented.",
            limitations:
              "The linked provider roster PDF has an embedded processed date of 10/23/2020 despite its 2025/08 URL path; use each MQA record's own “Data As Of” date instead. A license record does not alone prove dispatch/service boundaries, current apparatus, frontline status, leadership authority, or call volume.",
          }
        : code === "VA" ? {
          code,name,level:"state" as const,coverageStatus:"official-license-reference" as const,
          sourceName:"Virginia Office of EMS agency lookup",
          sourceUrl:"https://vdhems.vdh.virginia.gov/emsapps/f?p=200%3A2",
          directoryUrl:"https://www.vdh.virginia.gov/emergency-medical-services/",
          sourceScope:"Virginia Office of EMS public agency search.",
          matchKeys:["Agency name","Virginia agency/license identifier when published"],
          periodAndFreshness:"Check the state record and its current status directly.",
          appConnection:"Official manual lookup; no automatic statewide license ingestion.",
          limitations:"Source presence does not verify service area, purchasing, equipment or active license without checking the actual agency record."
        } : directoryRoute(code, name, code === "DC" ? "district" : "state"),
    ),
    ...TERRITORY_JURISDICTIONS.map(([code, name]) =>
      directoryRoute(code, name, "territory"),
    ),
  ];

export function getEmsJurisdictionSourceCoverage(
  code: string,
): EmsJurisdictionSourceCoverage | undefined {
  return EMS_JURISDICTION_SOURCE_COVERAGE.find(
    (entry) => entry.code === code.trim().toUpperCase(),
  );
}

export const EMS_JURISDICTION_SOURCE_URLS = {
  emsGovStateSystems: EMS_GOV_STATE_SYSTEMS,
  nremtStateOfficeMap: NREMT_STATE_OFFICE_MAP,
  floridaEmsProgram: FLORIDA_EMS_PROGRAM,
  floridaMqaLicenseSearch: FLORIDA_MQA_LICENSE_SEARCH,
};
