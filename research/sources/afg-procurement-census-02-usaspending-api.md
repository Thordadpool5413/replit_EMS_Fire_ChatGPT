Source: https://api.usaspending.gov/docs/endpoints
Title: USAspending API
Fetched: 2026-11-01T05:09:09.659Z

# API Endpoints

This page is intended as a reference for available USAspending API endpoints. The [Documentation Index](https://api.usaspending.gov/docs/) provides links to introductory resources and tutorials to help you get started.

Endpoints do not currently require any authorization.

### Status Codes

In general, status codes returned are as follows:

- 200 if the request is successful
- 400 if the request is malformed
- 500 for server-side errors

## Endpoints and Methods

The currently available endpoints are listed in the following table.

## Endpoint Index

| Endpoint | Methods | Description |
| --- | --- | --- |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/](https://api.usaspending.gov/api/v2/agency/012/) | GET | Returns agency overview information for USAspending.gov's Agency Details page for agencies that have ever awarded |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/awards/](https://api.usaspending.gov/api/v2/agency/012/awards/) | GET | Returns agency summary information, specifically the number of transactions and award obligations for the sub agency section of USAspending.gov's Agency Details page |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/awards/new/count/](https://api.usaspending.gov/api/v2/agency/012/awards/new/count/) | GET | Returns a count of New Awards for the agency in a single fiscal year |
| [/api/v2/agency/awards/count/](https://api.usaspending.gov/api/v2/agency/awards/count/) | GET | Returns a count of Awards types for agencies in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/budget\_function/](https://api.usaspending.gov/api/v2/agency/012/budget_function/) | GET | Returns a list of Budget Functions and Budget Subfunctions for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/budget\_function/count/](https://api.usaspending.gov/api/v2/agency/012/budget_function/count/) | GET | Returns the count of Budget Functions for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/budgetary\_resources/](https://api.usaspending.gov/api/v2/agency/012/budgetary_resources/) | GET | Returns budgetary resources and obligations for the agency and fiscal year requested |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/federal\_account/](https://api.usaspending.gov/api/v2/agency/012/federal_account/) | GET | Returns a list of Federal Accounts and Treasury Accounts for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/federal\_account/count/](https://api.usaspending.gov/api/v2/agency/012/federal_account/count/) | GET | Returns the count of Federal Accounts and Treasury Accounts for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/object\_class/](https://api.usaspending.gov/api/v2/agency/012/object_class/) | GET | Returns a list of Object Classes for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/object\_class/count/](https://api.usaspending.gov/api/v2/agency/012/object_class/count/) | GET | Returns the count of Object Classes for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/obligations\_by\_award\_category/](https://api.usaspending.gov/api/v2/agency/012/obligations_by_award_category/) | GET | Returns a breakdown of obligations by award category within a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/program\_activity/](https://api.usaspending.gov/api/v2/agency/012/program_activity/) | GET | Returns a list of Program Activity categories for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/program\_activity/count/](https://api.usaspending.gov/api/v2/agency/012/program_activity/count/) | GET | Returns the count of Program Activity categories for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/sub\_agency/](https://api.usaspending.gov/api/v2/agency/012/sub_agency/) | GET | Returns a list of sub-agencies and offices with obligated amounts, transaction counts and new award counts for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/sub\_agency/count/](https://api.usaspending.gov/api/v2/agency/012/sub_agency/count/) | GET | Returns the number of sub-agencies and offices for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/sub\_components/<BUREAU\_SLUG>/](https://api.usaspending.gov/api/v2/agency/012/sub_components/farm-service-agency/) | GET | Returns a list of federal\_accounts by bureau for the agency in a single fiscal year |
| [/api/v2/agency/<TOPTIER\_AGENCY\_CODE>/sub\_components/](https://api.usaspending.gov/api/v2/agency/012/sub_components/) | GET | Returns a list of bureaus for the agency in a single fiscal year |
| [/api/v2/agency/treasury\_account/<TREASURY\_ACCOUNT\_SYMBOL>/object\_class/](https://api.usaspending.gov/api/v2/agency/treasury_account/001-X-0000-000/object_class/) | GET | Returns a list of Object Classes for the specified Treasury Account Symbol (tas). |
| [/api/v2/agency/treasury\_account/<TREASURY\_ACCOUNT\_SYMBOL>/program\_activity/](https://api.usaspending.gov/api/v2/agency/treasury_account/001-X-0000-000/program_activity/) | GET | Returns a list of Program Activities for the specified Treasury Account Symbol (tas). |
| [/api/v2/autocomplete/accounts/a/](https://api.usaspending.gov/api/v2/autocomplete/accounts/a/) | POST | Returns Treasury Account Symbol Availability Type Code (A) filtered by other components provided in the request filter |
| [/api/v2/autocomplete/accounts/aid/](https://api.usaspending.gov/api/v2/autocomplete/accounts/aid/) | POST | Returns Treasury Account Symbol/Federal Account Agency Identifier (AID) filtered by other components provided in the request filter |
| [/api/v2/autocomplete/accounts/ata/](https://api.usaspending.gov/api/v2/autocomplete/accounts/ata/) | POST | Returns Treasury Account Symbol Allocation Transfer Agency Identifier (ATA) filtered by other components provided in the request filter |
| [/api/v2/autocomplete/accounts/bpoa/](https://api.usaspending.gov/api/v2/autocomplete/accounts/bpoa/) | POST | Returns Treasury Account Symbol Beginning Period of Availability (BPOA) filtered by other components provided in the request filter |
| [/api/v2/autocomplete/accounts/epoa/](https://api.usaspending.gov/api/v2/autocomplete/accounts/epoa/) | POST | Returns Treasury Account Symbol Ending Period of Availability (EPOA) filtered by other components provided in the request filter |
| [/api/v2/autocomplete/accounts/main/](https://api.usaspending.gov/api/v2/autocomplete/accounts/main/) | POST | Returns Treasury Account Symbol/Federal Account Main Account Code (MAIN) filtered by other components provided in the request filter |
| [/api/v2/autocomplete/accounts/sub/](https://api.usaspending.gov/api/v2/autocomplete/accounts/sub/) | POST | Returns Treasury Account Symbol Sub-Account Code (SUB) filtered by other components provided in the request filter |
| [/api/v2/autocomplete/awarding\_agency/](https://api.usaspending.gov/api/v2/autocomplete/awarding_agency/) | POST | Returns awarding agencies matching the specified search text |
| [/api/v2/autocomplete/awarding\_agency\_office/](https://api.usaspending.gov/api/v2/autocomplete/awarding_agency_office/) | POST | Returns awarding agencies and office matching the specified search text |
| [/api/v2/autocomplete/funding\_agency\_office/](https://api.usaspending.gov/api/v2/autocomplete/funding_agency_office/) | POST | Returns funding agencies and office matching the specified search text |
| [/api/v2/autocomplete/cfda/](https://api.usaspending.gov/api/v2/autocomplete/cfda/) | POST | Returns CFDA programs matching the specified search text |
| [/api/v2/autocomplete/city/](https://api.usaspending.gov/api/v2/autocomplete/city/) | POST | Returns city names matching the search text, sorted by relevance |
| [/api/v2/autocomplete/recipient/](https://api.usaspending.gov/api/v2/autocomplete/recipient/) | POST | Returns recipient names and uei based on search text |
| [/api/v2/autocomplete/funding\_agency/](https://api.usaspending.gov/api/v2/autocomplete/funding_agency/) | POST | Returns funding agencies matching the specified search text |
| [/api/v2/autocomplete/glossary/](https://api.usaspending.gov/api/v2/autocomplete/glossary/) | POST | Returns glossary terms matching provided search text |
| [/api/v2/autocomplete/naics/](https://api.usaspending.gov/api/v2/autocomplete/naics/) | POST | Returns NAICS objects matching the specified search text |
| [/api/v2/autocomplete/psc/](https://api.usaspending.gov/api/v2/autocomplete/psc/) | POST | Returns product or service (PSC) codes and their descriptions based on a search string. This may be the 4-character PSC code or a description string. |
| [/api/v2/autocomplete/program\_activity/](https://api.usaspending.gov/api/v2/autocomplete/program_activity/) | POST | Returns program activities and their names based on a search string. This may be the 4-character program activity code or a name string. |
| [/api/v2/autocomplete/location](https://api.usaspending.gov/api/v2/autocomplete/location) | POST | Returns locations based on search text |
| [/api/v2/award\_spending/recipient/](https://api.usaspending.gov/api/v2/award_spending/recipient/?fiscal_year=2016&awarding_agency_id=183) | GET | Returns all award spending by recipient for a given fiscal year and agency id |
| [/api/v2/awards/<AWARD\_ID>/](https://api.usaspending.gov/api/v2/awards/CONT_IDV_TMHQ10C0040_2044/) | GET | Returns details about specific award |
| [/api/v2/awards/accounts/](https://api.usaspending.gov/api/v2/awards/accounts/) | POST | Returns a list of federal accounts for the indicated award |
| [/api/v2/awards/count/federal\_account/<AWARD\_ID>/](https://api.usaspending.gov/api/v2/awards/count/federal_account/CONT_IDV_TMHQ10C0040_2044/) | GET | Returns the number of federal accounts associated with the award |
| [/api/v2/awards/count/subaward/<AWARD\_ID>/](https://api.usaspending.gov/api/v2/awards/count/subaward/66945037/) | GET | Returns the number of subawards associated with the award |
| [/api/v2/awards/count/subaward/<AWARD\_ID>/](https://api.usaspending.gov/api/v2/awards/count/subaward/CONT_IDV_TMHQ10C0040_2044/) | GET | Returns the number of subawards associated with the award |
| [/api/v2/awards/count/transaction/<AWARD\_ID>/](https://api.usaspending.gov/api/v2/awards/count/transaction/CONT_IDV_TMHQ10C0040_2044/) | GET | Returns the number of transactions associated with the award |
| [/api/v2/awards/funding](https://api.usaspending.gov/api/v2/awards/funding) | POST | Returns federal account, awarding agencies, funding agencies, and transaction obligated amount information for a requested award |
| [/api/v2/awards/funding\_rollup](https://api.usaspending.gov/api/v2/awards/funding_rollup) | POST | Returns aggregated count of awarding agencies, federal accounts, and total transaction obligated amount for an award |
| [/api/v2/awards/last\_updated/](https://api.usaspending.gov/api/v2/awards/last_updated/) | GET | Returns date of last update |
| [/api/v2/budget\_functions/list\_budget\_functions/](https://api.usaspending.gov/api/v2/budget_functions/list_budget_functions/) | GET | Returns all Budget Functions associated with a TAS, ordered by Budget Function code |
| [/api/v2/budget\_functions/list\_budget\_subfunctions/](https://api.usaspending.gov/api/v2/budget_functions/list_budget_subfunctions/) | POST | Returns all Budget Functions associated with a TAS, ordered by Budget Function code |
| [/api/v2/bulk\_download/awards/](https://api.usaspending.gov/api/v2/bulk_download/awards/) | POST | Generates zip file for download of award data in CSV format |
| [/api/v2/bulk\_download/list\_agencies/](https://api.usaspending.gov/api/v2/bulk_download/list_agencies/) | POST | Lists all the agencies and the subagencies or federal accounts associated under specific agencies |
| [/api/v2/bulk\_download/list\_monthly\_files/](https://api.usaspending.gov/api/v2/bulk_download/list_monthly_files/) | POST | Lists the monthly files associated with the requested params |
| [/api/v2/bulk\_download/status/](https://api.usaspending.gov/api/v2/bulk_download/status/) | GET | Returns the current status of a download job that that has been requested with the `v2/bulk_download/awards/` or `v2/bulk_download/transaction/` endpoint that same day. |
| [/api/v2/disaster/agency/count/](https://api.usaspending.gov/api/v2/disaster/agency/count/) | POST | Returns the count of Agencies which received disaster/emergency funding |
| [/api/v2/disaster/agency/loans/](https://api.usaspending.gov/api/v2/disaster/agency/loans/) | POST | Returns insights on the Agencies awarding loans from disaster/emergency funding |
| [/api/v2/disaster/agency/spending/](https://api.usaspending.gov/api/v2/disaster/agency/spending/) | POST | Returns insights on the Agencies which received disaster/emergency funding |
| [/api/v2/disaster/award/amount/](https://api.usaspending.gov/api/v2/disaster/award/amount/) | POST | Returns account data obligation and outlay spending aggregations of all (File D) Awards which received disaster/emergency funding |
| [/api/v2/disaster/award/count/](https://api.usaspending.gov/api/v2/disaster/award/count/) | POST | Returns the count of account data obligation and outlay spending aggregations of all (File D) Awards which received disaster/emergency funding |
| [/api/v2/disaster/cfda/count/](https://api.usaspending.gov/api/v2/disaster/cfda/count/) | POST | Dimension Count of Disaster/Emergency funding data |
| [/api/v2/disaster/cfda/loans/](https://api.usaspending.gov/api/v2/disaster/cfda/loans/) | POST | Records of loan Disaster/Emergency funding data by dimension |
| [/api/v2/disaster/cfda/spending/](https://api.usaspending.gov/api/v2/disaster/cfda/spending/) | POST | Records of spending Disaster/Emergency funding data by dimension |
| [/api/v2/disaster/def\_code/count/](https://api.usaspending.gov/api/v2/disaster/def_code/count/) | POST | Dimension Count of Disaster/Emergency funding data |
| [/api/v2/disaster/federal\_account/count/](https://api.usaspending.gov/api/v2/disaster/federal_account/count/) | POST | Dimension Count of Disaster/Emergency funding data |
| [/api/v2/disaster/federal\_account/loans/](https://api.usaspending.gov/api/v2/disaster/federal_account/loans/) | POST | Records of loan Disaster/Emergency funding data by dimension |
| [/api/v2/disaster/federal\_account/spending/](https://api.usaspending.gov/api/v2/disaster/federal_account/spending/) | POST | Records of spending Disaster/Emergency funding data by dimension |
| [/api/v2/disaster/object\_class/count/](https://api.usaspending.gov/api/v2/disaster/object_class/count/) | POST | Dimension Count of Disaster/Emergency funding data |
| [/api/v2/disaster/object\_class/loans/](https://api.usaspending.gov/api/v2/disaster/object_class/loans/) | POST | Records of loan Disaster/Emergency funding data by dimension |
| [/api/v2/disaster/object\_class/spending/](https://api.usaspending.gov/api/v2/disaster/object_class/spending/) | POST | Records of spending Disaster/Emergency funding data by dimension |
| [/api/v2/disaster/overview/](https://api.usaspending.gov/api/v2/disaster/overview/) | GET | Overview of Disaster/Emergency funding and spending |
| [/api/v2/disaster/recipient/count/](https://api.usaspending.gov/api/v2/disaster/recipient/count/) | POST | Dimension Count of Disaster/Emergency funding data |
| [/api/v2/disaster/recipient/loans/](https://api.usaspending.gov/api/v2/disaster/recipient/loans/) | POST | Records of loan Disaster/Emergency funding data by dimension |
| [/api/v2/disaster/recipient/spending/](https://api.usaspending.gov/api/v2/disaster/recipient/spending/) | POST | Records of spending Disaster/Emergency funding data by dimension |
| [/api/v2/disaster/spending\_by\_geography/](https://api.usaspending.gov/api/v2/disaster/spending_by_geography/) | POST | Geographic award spending of Disaster/Emergency funding |
| [/api/v2/download/accounts/](https://api.usaspending.gov/api/v2/download/accounts/) | POST | Generates zip file for download of account data in CSV format |
| [/api/v2/download/assistance/](https://api.usaspending.gov/api/v2/download/assistance/) | POST | Returns a zipped file containing Assistance data |
| [/api/v2/download/awards/](https://api.usaspending.gov/api/v2/download/awards/) | POST | Generates zip file for download of award data in CSV format |
| [/api/v2/download/contract/](https://api.usaspending.gov/api/v2/download/contract/) | POST | Returns a zipped file containing Contract data |
| [/api/v2/download/count/](https://api.usaspending.gov/api/v2/download/count/) | POST | Returns the number of transactions that would be included in a download request for the given filter set |
| [/api/v2/download/disaster/](https://api.usaspending.gov/api/v2/download/disaster/) | POST | Returns a zipped file containing Account and Award data for the Disaster Funding |
| [/api/v2/download/disaster/recipients/](https://api.usaspending.gov/api/v2/download/disaster/recipients/) | POST | Returns a zipped file containing Disaster Recipient Funding data |
| [/api/v2/download/idv/](https://api.usaspending.gov/api/v2/download/idv/) | POST | Returns a zipped file containing IDV data |
| [/api/v2/download/search/](https://api.usaspending.gov/api/v2/download/search/) | POST | Generates zip file for download of award data in CSV format for Awards, Subawards, and Transactions |
| [/api/v2/download/status/](https://api.usaspending.gov/api/v2/download/status/) | GET | gets the current status of a download job that that has been requested with the `v2/download/awards/` or `v2/download/transaction/` endpoint that same day |
| [/api/v2/download/transactions/](https://api.usaspending.gov/api/v2/download/transactions/) | POST | Generates zip file for download of award data in CSV format |
| [/api/v2/federal\_accounts/<ACCOUNT\_CODE>/](https://api.usaspending.gov/api/v2/federal_accounts/020-0550/) | GET | Returns a federal account based on its federal account code |
| [/api/v2/federal\_accounts/<ACCOUNT\_CODE>/available\_object\_classes/](https://api.usaspending.gov/api/v2/federal_accounts/4324/available_object_classes/) | GET | Returns financial spending data by object class based on account's internal ID |
| [/api/v2/federal\_accounts/<ACCOUNT\_CODE>/fiscal\_year\_snapshot/<YEAR>/](https://api.usaspending.gov/api/v2/federal_accounts/4324/fiscal_year_snapshot/2017/) | GET | Returns budget information for a federal account for the year provided based on account's internal ID |
| [/api/v2/federal\_accounts/<ACCOUNT\_CODE>/fiscal\_year\_snapshot/](https://api.usaspending.gov/api/v2/federal_accounts/4324/fiscal_year_snapshot/) | GET | Returns budget information for a federal account for the most recent year based on account's internal ID |
| [/api/v2/federal\_accounts/<ACCOUNT\_CODE>/object\_classes/total/](https://api.usaspending.gov/api/v2/federal_accounts/020-0550/object_classes/total/) | POST | Return a list of object classes under a federal account including the sum of their obligation |
| [/api/v2/federal\_accounts/<ACCOUNT\_CODE>/program\_activities/](https://api.usaspending.gov/api/v2/federal_accounts/020-0550/program_activities/) | GET | Returns a list of program activities under a federal account based on its federal account code |
| [/api/v2/federal\_accounts/<ACCOUNT\_CODE>/program\_activities/total](https://api.usaspending.gov/api/v2/federal_accounts/020-0550/program_activities/total/) | POST | Returns a list of program activities including the sum of their obligations under a federal account based on its federal account code in |
| [/api/v2/federal\_accounts/](https://api.usaspending.gov/api/v2/federal_accounts/) | POST | Returns financial spending data by object class |
| [/api/v2/federal\_obligations/](https://api.usaspending.gov/api/v2/federal_obligations/?fiscal_year=2019&funding_agency_id=315&limit=10&page=1) | GET | Returns a paginated list of obligations for the provided agency for the provided year |
| [/api/v2/financial\_balances/agencies/](https://api.usaspending.gov/api/v2/financial_balances/agencies/?fiscal_year=2017&funding_agency_id=4324) | GET | Returns financial balances by agency and the latest quarter for the given fiscal year |
| [/api/v2/financial\_spending/major\_object\_class/](https://api.usaspending.gov/api/v2/financial_spending/major_object_class/?fiscal_year=2017&funding_agency_id=4324) | GET | Returns financial spending data by object class for the latest quarter based on the given fiscal year |
| [/api/v2/financial\_spending/object\_class/](https://api.usaspending.gov/api/v2/financial_spending/object_class/?fiscal_year=2017&funding_agency_id=4324&major_object_class_code=20) | GET | Returns financial spending data by object class for the latest quarter based on the given fiscal year |
| [/api/v2/idvs/accounts/](https://api.usaspending.gov/api/v2/idvs/accounts/) | POST | Returns a list of federal accounts for the indicated IDV |
| [/api/v2/idvs/activity/](https://api.usaspending.gov/api/v2/idvs/activity/) | POST | Returns information about child awards and grandchild awards for a given IDV (Indefinite Delivery Vehicle). |
| [/api/v2/idvs/amounts/<AWARD\_ID>/](https://api.usaspending.gov/api/v2/idvs/amounts/CONT_IDV_NNK14MA74C_8000/) | GET | Returns the direct children of an IDV |
| [/api/v2/idvs/awards/](https://api.usaspending.gov/api/v2/idvs/awards/) | POST | Returns IDVs or contracts related to the requested Indefinite Delivery Vehicle award (IDV) |
| [/api/v2/idvs/count/federal\_account/<AWARD\_ID>/](https://api.usaspending.gov/api/v2/idvs/count/federal_account/CONT_IDV_NNK14MA74C_8000/) | GET | Returns the number of federal accounts associated with children and grandchild awards of an IDV. |
| [/api/v2/idvs/funding/](https://api.usaspending.gov/api/v2/idvs/funding/) | POST | Returns File C funding records associated with an IDV |
| [/api/v2/idvs/funding\_rollup/](https://api.usaspending.gov/api/v2/idvs/funding_rollup/) | POST | Returns aggregated count of awarding agencies, federal accounts, and total transaction obligated amount for all contracts under an IDV |
| [/api/v2/llm/filter-search/](https://api.usaspending.gov/api/v2/llm/filter-search/) | POST | Returns a streaming response for LLM-powered search operations with advanced filtering capabilities |
| [/api/v2/recipient/](https://api.usaspending.gov/api/v2/recipient/) | POST | Returns a list of recipients in USAspending DB |
| [/api/v2/recipient/children/<DUNS\_OR\_UEI>/](https://api.usaspending.gov/api/v2/recipient/children/006928857/) | GET | Returns recipient details based on DUNS or UEI number |
| [/api/v2/recipient/count/](https://api.usaspending.gov/api/v2/recipient/count/) | POST | Returns the count of recipents for the given filters |
| [/api/v2/recipient/duns/<HASH\_VALUE>/](https://api.usaspending.gov/api/v2/recipient/duns/99a44eeb-23ef-e7c4-1f84-9a695b6f5d2e-R/) | GET | Returns a high-level overview of a specific recipient, given its id |
| [/api/v2/recipient/duns/](https://api.usaspending.gov/api/v2/recipient/duns/) | POST | Returns a list of recipients in USAspending DB |
| [/api/v2/recipient/<HASH\_VAlUE>/](https://api.usaspending.gov/api/v2/recipient/99a44eeb-23ef-e7c4-1f84-9a695b6f5d2e-R/) | GET | Returns an individual recipient in USAspending DB |
| [/api/v2/recipient/state/<FIPS>/](https://api.usaspending.gov/api/v2/recipient/state/51/) | GET | Returns basic information about the specified state |
| [/api/v2/recipient/state/](https://api.usaspending.gov/api/v2/recipient/state/) | GET | Returns basic information about the specified state |
| [/api/v2/recipient/state/awards/<FIPS>/](https://api.usaspending.gov/api/v2/recipient/state/awards/51/) | GET | Returns award breakdown based on FIPS |
| [/api/v2/reporting/agencies/<TOPTIER\_CODE>/differences/](https://api.usaspending.gov/api/v2/reporting/agencies/097/differences/) | GET | Returns About the Data information about differences in account balance and spending obligations for a specific agency/year/period |
| [/api/v2/reporting/agencies/<TOPTIER\_CODE>/discrepancies/](https://api.usaspending.gov/api/v2/reporting/agencies/097/discrepancies/) | GET | Returns TAS discrepancies of the specified agency's submission data for a specific FY/FP |
| [/api/v2/references/agency/<AGENCY\_ID>/](https://api.usaspending.gov/api/v2/references/agency/479/) | GET | Returns basic information about a federal agency |
| [api/v2/references/assistance\_listing/](https://api.usaspending.gov/api/v2/references/assistance_listing/) | GET | Returns all Tier 1 (2-digit) CFDAs and their children |
| [api/v2/references/assistance\_listing/](https://api.usaspending.gov/api/v2/references/assistance_listing/) | GET | Returns Tier 1 (2-digit) for provided CFDAs and their children |
| [/api/v2/references/award\_types/](https://api.usaspending.gov/api/v2/references/award_types/) | GET | Returns a map of award types by award grouping. |
| [/api/v2/references/countries/](https://api.usaspending.gov/api/v2/references/countries/) | GET | Returns a full list of 3-digit Country codes and Names |
| [/api/v2/references/cfda/totals//](https://api.usaspending.gov/api/v2/references/cfda/totals/10.555/) | GET | Provides total values for provided CFDA |
| [/api/v2/references/cfda/totals/](https://api.usaspending.gov/api/v2/references/cfda/totals/) | GET | Provides total values for all CFDAs |
| [/api/v2/references/data\_dictionary/](https://api.usaspending.gov/api/v2/references/data_dictionary/) | GET | Returns a JSON structure of the Schema team's Rosetta Crosswalk Data Dictionary |
| [/api/v2/references/def\_codes/](https://api.usaspending.gov/api/v2/references/def_codes/) | GET | Returns an object of Disaster Emergency Fund (DEF) Codes (DEFC) and titles |
| [/api/v2/references/filter/](https://api.usaspending.gov/api/v2/references/filter/) | POST | Accepts an Advanced Search filter object and returns a hash which can be used as a lookup key by `/api/v2/references/hash/` |
| [/api/v2/references/filter\_tree/psc/<GROUP>/<PSC>/<PSC>/](https://api.usaspending.gov/api/v2/references/filter_tree/psc/Service/C/C1/) | GET | Returns a list of PSC under the provided path |
| [/api/v2/references/filter\_tree/psc/<GROUP>/<PSC>/](https://api.usaspending.gov/api/v2/references/filter_tree/psc/Product/10/) | GET | Returns a list of PSC under the provided path |
| [/api/v2/references/filter\_tree/psc/<GROUP>/](https://api.usaspending.gov/api/v2/references/filter_tree/psc/Product/) | GET | Returns a list of PSC under the provided path |
| [/api/v2/references/filter\_tree/psc/](https://api.usaspending.gov/api/v2/references/filter_tree/psc/) | GET | Returns a list of PSC groupings |
| [/api/v2/references/filter\_tree/tas/<AGENCY>/<FEDERAL\_ACCOUNT>/](https://api.usaspending.gov/api/v2/references/filter_tree/tas/020/020-0550/) | GET | Returns a list of Treasury Account Symbols associated with the specified federal account |
| [/api/v2/references/filter\_tree/tas/<AGENCY>/](https://api.usaspending.gov/api/v2/references/filter_tree/tas/020/) | GET | Returns a list of federal accounts associated with the specified agency |
| [/api/v2/references/filter\_tree/tas/](https://api.usaspending.gov/api/v2/references/filter_tree/tas/) | GET | Returns a list of toptier agencies that have at least one TAS affiliated with them |
| [/api/v2/references/glossary/](https://api.usaspending.gov/api/v2/references/glossary/) | GET | Returns a list of glossary terms and definitions |
| [/api/v2/references/hash/](https://api.usaspending.gov/api/v2/references/hash/) | POST | Accepts a hash generated by `/api/v2/references/filter/` and returns an Advanced Search filter object |
| [/api/v2/references/naics/<NAICS\_CODE>/](https://api.usaspending.gov/api/v2/references/naics/11/) | GET | Returns the requested NAICS and immediate children, as well as related, relevant data. |
| [/api/v2/references/naics/](https://api.usaspending.gov/api/v2/references/naics/) | GET | Returns all Tier 1 (2-digit) NAICS and related, relevant data. |
| [/api/v2/references/states/](https://api.usaspending.gov/api/v2/references/states/) | GET | Returns latest state, district and territory entries from the state\_data table |
| [/api/v2/references/submission\_periods/](https://api.usaspending.gov/api/v2/references/submission_periods/) | GET | Returns a list of all available submission periods with essential information about start and end dates. |
| [/api/v2/references/toptier\_agencies/](https://api.usaspending.gov/api/v2/references/toptier_agencies/) | GET | Returns all toptier agencies and related, relevant data. |
| [/api/v2/references/total\_budgetary\_resources/](https://api.usaspending.gov/api/v2/references/total_budgetary_resources/) | GET | Returns a list of total budgetary resources totalled by fiscal year and period. |
| [/api/v2/reporting/agencies/<TOPTIER\_CODE>/overview/](https://api.usaspending.gov/api/v2/reporting/agencies/020/overview/) | GET | Returns a list of submission data for the provided agency. |
| [/api/v2/reporting/agencies/overview/](https://api.usaspending.gov/api/v2/reporting/agencies/overview/) | GET | Returns About the Data information about all agencies with submissions in a provided fiscal year and period |
| [/api/v2/reporting/agencies/publish\_dates/](https://api.usaspending.gov/api/v2/reporting/agencies/publish_dates/) | GET | Returns submission publication and certification information about all agencies with submissions in a provided fiscal year and period |
| [/api/v2/reporting/agencies/<TOPTIER\_CODE>/<FISCAL\_YEAR>/<FISCAL\_PERIOD>/submission\_history/](https://api.usaspending.gov/api/v2/reporting/agencies/020/2020/12/submission_history/) | GET | Returns a list of submission publication dates and certified dates for the provided agency for the provided fiscal year and period. |
| [/api/v2/reporting/agencies/<TOPTIER\_CODE>/<FISCAL\_YEAR>/<FISCAL\_PERIOD>/unlinked\_awards/<TYPE>/](https://api.usaspending.gov/api/v2/reporting/agencies/020/2020/12/unlinked_awards/procurement/) | GET | Returns counts of an agency's linked and unlinked awards for a given period. |
| [/api/v2/search/new\_awards\_over\_time/](https://api.usaspending.gov/api/v2/search/new_awards_over_time/) | POST | Returns a list of time periods with the new awards in the appropriate period within the provided time range |
| [/api/v2/search/spending\_by\_award/](https://api.usaspending.gov/api/v2/search/spending_by_award/) | POST | Returns the fields of the filtered awards |
| [/api/v2/search/spending\_by\_award\_count/](https://api.usaspending.gov/api/v2/search/spending_by_award_count/) | POST | Returns the number of awards in each award type (Contracts, IDV, Loans, Direct Payments, Grants, and Other) |
| [/api/v2/search/spending\_by\_category/](https://api.usaspending.gov/api/v2/search/spending_by_category/) | POST | Returns data that is grouped in preset units to support the various data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/awarding\_agency/](https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_agency/) | POST | Returns data that is grouped in preset units to support the Spending by Awarding Agency data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/awarding\_subagency/](https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_subagency/) | POST | Returns data that is grouped in preset units to support the Spending by Awarding Subgency data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/cfda/](https://api.usaspending.gov/api/v2/search/spending_by_category/cfda/) | POST | Returns data that is grouped in preset units to support the Spending by CFDA data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/country/](https://api.usaspending.gov/api/v2/search/spending_by_category/country/) | POST | Returns data that is grouped in preset units to support the Spending by Country data visualizations on USAspending.gov's Recipient Profile page |
| [/api/v2/search/spending\_by\_category/county/](https://api.usaspending.gov/api/v2/search/spending_by_category/county/) | POST | Returns data that is grouped in preset units to support the Spending by County data visualizations on USAspending.gov's State Profile page |
| [/api/v2/search/spending\_by\_category/district/](https://api.usaspending.gov/api/v2/search/spending_by_category/district/) | POST | Returns data that is grouped in preset units to support the Spending by Congressional District data visualizations on USAspending.gov's State Profile page |
| [/api/v2/search/spending\_by\_category/federal\_account/](https://api.usaspending.gov/api/v2/search/spending_by_category/federal_account/) | POST | Returns data that is grouped in preset units to support the Spending by Federal Account data visualizations on USAspending.gov's Recipient Profile page |
| [/api/v2/search/spending\_by\_category/funding\_agency/](https://api.usaspending.gov/api/v2/search/spending_by_category/funding_agency/) | POST | Returns data that is grouped in preset units to support the Spending by Funding Agency data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/funding\_subagency/](https://api.usaspending.gov/api/v2/search/spending_by_category/funding_subagency/) | POST | Returns data that is grouped in preset units to support the Spending by Funding Subgency data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/naics/](https://api.usaspending.gov/api/v2/search/spending_by_category/naics/) | POST | Returns data that is grouped in preset units to support the Spending by NAICS data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/psc/](https://api.usaspending.gov/api/v2/search/spending_by_category/psc/) | POST | Returns data that is grouped in preset units to support the Spending by PSC data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/recipient](https://api.usaspending.gov/api/v2/search/spending_by_category/recipient) | POST | Returns data that is grouped in preset units to support the Spending by Recipient data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/recipient\_duns/](https://api.usaspending.gov/api/v2/search/spending_by_category/recipient_duns/) | POST | Returns data that is grouped in preset units to support the Spending by Recipient DUNS data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_category/state\_territory/](https://api.usaspending.gov/api/v2/search/spending_by_category/state_territory/) | POST | Returns data that is grouped in preset units to support the Spending by State Territory data visualizations on USAspending.gov's Recipient Profile page |
| [/api/v2/search/spending\_by\_category/defc/](https://api.usaspending.gov/api/v2/search/spending_by_category/defc/) | POST | Returns data that is grouped in preset units to support the Spending by DEFC data visualizations on USAspending.gov's Advanced Search page |
| [/api/v2/search/spending\_by\_geography/](https://api.usaspending.gov/api/v2/search/spending_by_geography/) | POST | Returns Spending by state code, county code, or congressional district code |
| [/api/v2/search/spending\_by\_subaward\_grouped/](https://api.usaspending.gov/api/v2/search/spending_by_subaward_grouped/) | POST | Returns the award id, number of Subawards for the award, total amount of Subaward obligations, prime award obligation, subaward-to-award ratio, and the award generated internal id |
| [/api/v2/search/spending\_by\_transaction/](https://api.usaspending.gov/api/v2/search/spending_by_transaction/) | POST | Returns awards where a certain subset of fields match against search term |
| [/api/v2/search/spending\_by\_transaction\_count/](https://api.usaspending.gov/api/v2/search/spending_by_transaction_count/) | POST | Returns counts of awards where a certain subset of fields match against search term |
| [/api/v2/search/spending\_by\_transaction\_grouped/](https://api.usaspending.gov/api/v2/search/spending_by_transaction_grouped/) | POST | Returns information about transactions where a certain subset of fields match against search terms and results are grouped by their prime award. |
| [/api/v2/search/spending\_over\_time/](https://api.usaspending.gov/api/v2/search/spending_over_time/) | POST | Returns transaction aggregated amounts for Spending Over Time data visualizations on USAspending.gov |
| [/api/v2/search/transaction\_spending\_summary/](https://api.usaspending.gov/api/v2/search/transaction_spending_summary/) | POST | Returns the number of transactions and the sum of federal action obligations for prime awards given a set of award of filters |
| [/api/v2/spending/](https://api.usaspending.gov/api/v2/spending/) | POST | Returns spending data information through various types and filters |
| [/api/v2/subawards/](https://api.usaspending.gov/api/v2/subawards/) | POST | Returns subawards either related, optionally, to a specific parent award, or for all parent awards if desired |
| [/api/v2/transactions/](https://api.usaspending.gov/api/v2/transactions/) | POST | Returns transactions related to a specific parent award |