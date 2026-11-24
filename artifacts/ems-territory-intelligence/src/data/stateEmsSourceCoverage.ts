/**
 * State and territorial EMS source routes.
 *
 * A directory route is not a state license dataset. Ohio and Florida have staged state rosters;
 * the other direct state routes are manual references, not ingested license datasets.
 */
export type EmsJurisdictionCoverageStatus =
  | "official-agency-roster"
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
            coverageStatus: "official-agency-roster" as const,
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
              "Bundled report processed 2026-11-24; live lookup may be newer. Verify individual license status.",
            appConnection:
              "347 license listings in the bundled Florida report, including 332 Florida headquarters. Browse and review before creating or linking accounts; manual live MQA lookup remains available.",
            limitations:
              "Report snapshots can be stale or served in different versions. Address county is not a service boundary. License dates do not establish contract dates, apparatus, or active operations. Out-of-state headquarters are browse-only.",
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
        } : code === "OH" ? {
          code,name,level:"state" as const,coverageStatus:"official-agency-roster" as const,
          sourceName:"Ohio Division of EMS agency list",
          sourceUrl:"https://ems.ohio.gov/ems-trauma-data/data-center-resources/ohio-ems-agency-list",
          directoryUrl:"https://ems.ohio.gov/ems-trauma-data/data-center-resources/ohio-ems-agency-list",
          sourceScope:"State agency codes, names, headquarters cities and EMS service levels.",
          matchKeys:["Ohio agency code","Agency name","Headquarters city"],
          periodAndFreshness:"Bundled source update 2026-05-05; retrieved 2026-11-24.",
          appConnection:"1,520 state source listings staged in the searchable Ohio roster; explicit account creation for reported EMS service levels.",
          limitations:"Agency codes are not license numbers, FDIDs or NPIs. Listings are not current licensure or service-area proof."
        } : code === "PA" || code === "MA" ? {
          code,name,level:"state" as const,coverageStatus:"official-license-reference" as const,
          sourceName:code==="PA"?"Pennsylvania EMS agency public search":"Massachusetts licensed ambulance service directory",
          sourceUrl:code==="PA"?"https://ems.health.pa.gov/registry/Search/AgencyPublicSearch.aspx":"https://www.mass.gov/info-details/find-an-ambulance-service-in-massachusetts",
          directoryUrl:code==="PA"?"https://ems.health.pa.gov/registry/Search/AgencyPublicSearch.aspx":"https://www.mass.gov/info-details/find-an-ambulance-service-in-massachusetts",
          sourceScope:"Official state provider lookup or ambulance service listing.",
          matchKeys:["Agency name","State-issued identifier where published"],
          periodAndFreshness:"Check the source directly for the current record and reporting date.",
          appConnection:"Official manual reference only; no automated roster or license ingestion.",
          limitations:"A listing does not establish purchasing, fleet, service boundaries or current operating status."
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
