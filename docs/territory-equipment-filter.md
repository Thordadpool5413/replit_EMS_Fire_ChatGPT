# Territory map equipment filter

National map, agency-location map and fleet/response map now share a session-persisted recorded-equipment filter:

- All agencies
- ZOLL recorded, including mixed installations
- Competitor recorded, including mixed installations
- ZOLL and competitor recorded
- Unknown / no recognized vendor

A second dropdown scopes matching to monitors/defibrillators, mechanical CPR, transport ventilators, or ePCR/CAD/billing software. It does not filter on the agency's recommended product, grant, contract target or opportunity bundle. No product category selection by itself excludes agencies; choose a vendor view to filter.

Recognition uses explicit installed manufacturer/product strings. Unrecognized names, missing values, manual-only records, negative statements and planned products remain unknown. Generated prospects are excluded from vendor classification unless mapped equipment data is available through the existing fact-data helper. Recorded ownership remains subject to end-user confirmation; this is not a source-verification or current-use certification.

National map switches to agency-record counts while a vendor view is active. Other national shading choices are disabled until the equipment filter is cleared, avoiding a risk or population layer that could be mistaken for vendor coverage. Location and fleet maps filter their agency sets while retaining their existing geographic and metric controls. Equipment filters are retained when switching map views in the same session. Fleet map no longer substitutes a generated baseline when fewer than 500 records are loaded. Its active account cannot bypass the equipment filter.

Validation: unit classification/filter tests, full unit suite, workspace type checking, production build and built-module references. Interactive map/device checks remain unverified in this environment.

## Named competitors and match explanations

A named-competitor dropdown is available in competitor and mixed views, with per-brand loaded-record counts. The catalog recognizes Stryker/Physio-Control (including LIFEPAK/LUCAS), Philips, Hamilton Medical, WEINMANN, Dräger, Medtronic, Mindray, SCHILLER, Nihon Kohden, ESO, ImageTrend, Digitech, Optum, CentralSquare, Motorola Solutions, Hexagon, Tyler Technologies and Traumasoft. Names are recorded-brand recognition groups, not a corporate ownership graph or a complete competitive-market list. Generic billing-service descriptions remain unknown.

A collapsible breakdown shows observed vendor counts and a maximum of 12 matching loaded agencies, the original installed product string, and source attachment/local-review status. On location and fleet maps, agency names open profiles. Counts precede geographic, search, location and score filters and are labeled accordingly; they must not be interpreted as market share. A single agency is counted once per vendor but may appear in several vendor totals.

Public catalog references checked for product aliases:
- Stryker emergency-care catalog: https://www.stryker.com/us/en/emergency-care.html
- ZOLL technical-support product list: https://www.zoll.com/en-us/service-and-support/technical-support

These manufacturer references support product-name recognition only. They do not establish an agency's ownership, current deployment, purchasing timing, or product condition. Generic Propaq records remain unknown without an explicit recognized vendor, since historical manufacturer context can differ.
