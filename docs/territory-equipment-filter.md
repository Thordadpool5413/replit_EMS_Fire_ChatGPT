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
