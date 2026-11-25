# Phase 6.2F — multi-state county recovery

Add public county services for Peoria and Lake (IL), Northampton (PA), Baldwin (AL). County bounds and FIPS are enforced; address, postal community, ZIP and source county must reconcile. Only known supported point placements are accepted, except Northampton whose selected layer is not used to assert a placement type. Lake requires an explicit Active or Current status; records lacking it are withheld. Baldwin uses the observed last-edit date, not a claimed lifecycle status. Postal prefix filters only bound requests; they never establish a county. Public address points are not proof of current EMS/fire operations and require end-user confirmation. This is not statewide coverage.

- il-peoria: https://services.arcgis.com/iPiPjILCMYxPZWTc/ArcGIS/rest/services/E_911_Addresses/FeatureServer/0
- il-lake: https://services3.arcgis.com/HESxeTbDliKKvec2/arcgis/rest/services/LakeCounty_AddressPoints/FeatureServer/0
- pa-northampton: https://gis.northamptoncounty.org/arcgisweb/rest/services/Assessment_Services/Land_Records_LGM/MapServer/6
- al-baldwin: https://gisportal.baldwincountyal.gov/server/rest/services/911/Addresses/FeatureServer/0

Run v5 as a review-only candidate, not a production write. Existing Texas run remains separate. Ohio LBRS and NC AddressNC are existing adapters; no new statewide data for them is claimed here. New coordinates are only counted after successful recovery and independent candidate comparison against current main. Replit remains sole runtime backend.