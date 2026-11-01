Source: https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1
Title: Non-Disaster and Assistance to Firefighter Grants - v1 | FEMA.gov
Fetched: 2026-11-01T05:15:02.532Z

[Skip to main content](https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1#main-content)

![Dot gov](https://www.fema.gov/profiles/femad8_gov/themes/fema_uswds/assets/img/icon-dot-gov.svg)

**Official websites use .gov**

A **.gov** website belongs to an official government organization in the United States.


![Https](https://www.fema.gov/profiles/femad8_gov/themes/fema_uswds/assets/img/icon-https.svg)

**Secure .gov websites use HTTPS**

A **lock** (
LockA locked padlock
) or **https://** means you’ve safely connected to the .gov website. Share sensitive information only on official, secure websites.
.


# OpenFEMA Dataset:  Non-Disaster and Assistance to Firefighter Grants - v1

Version: 1

Last Data Refresh: 06-04-2026

| Key | Value |
| --- | --- |
| **Key** Entity Name | **Value** NonDisasterAssistanceFirefighterGrants |
| **Key** API Endpoint | **Value**[https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants](https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants) |
| **Key** Update Frequency | **Value** R/P1Y |
| **Key** Program URL | **Value**[https://www.fema.gov/grants](https://www.fema.gov/grants) |
| **Key** Category | **Value** Emergency Management/Preparedness/Alerts |
| **Key** Keywords | **Value**<br> non-disaster assistance |

## Description

The Grant Programs Directorate strategically and effectively administers and manages FEMA grants to ensure critical and measurable results for customers and stakeholders. The grants represented in this dataset are Preparedness (Non-Disaster or ND) Grants and Assistance to Firefighters Grants (AFG).

ND Grants and AFG are awarded and managed differently within the Grants Program Directorate (GPD) and should be treated with discretion.

The only measure in this dataset is Award Amount. It is an additive measure that can be applied across multiple dimensions to create various views of the data.

AFG awards are assigned to individual Fire Departments. ND Grants are typically assigned to state agencies; however, exceptions do exist such as Port Security Grant Program which is assigned to port areas and not States. It is important to know that when looking at Award Amount by State it does not mean the State actually received that money. In addition, some grant programs may have pass-through requirements where the recipient State is required to sub-grant a minimum amount of the award and only retain a portion of the award.

Grants guidance is described in the Funding Opportunity Announcement (FOA). Each grant program has its own grant guidance containing eligibility requirements, program objectives, and funding restrictions which are published annually. FOAs are public documents and may be found online at www.fema.gov/grants

For more information on grants, visit [https://www.fema.gov/grants/preparedness](https://www.fema.gov/grants/preparedness) and [https://www.fema.gov/grants/preparedness/firefighters](https://www.fema.gov/grants/preparedness/firefighters)

If you have media inquiries about this dataset, please email the FEMA Press Office at [FEMA-Press-Office@fema.dhs.gov](mailto:FEMA-Press-Office@fema.dhs.gov). For inquiries about FEMA's data and Open Government program, please email the OpenFEMA team at [OpenFEMA@fema.dhs.gov](mailto:OpenFEMA@fema.dhs.gov).

## Full Data

| Format | Address | Record Count | Approximate File Size |
| --- | --- | --- | --- |
| **Format** csv | **Address**[Link to csv](https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants.csv "Link to csv") | **Record Count**<br> 77925 | **Approximate File Size**<br> tiny (< 10MB) |
| **Format** json | **Address**[Link to json](https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants.json "Link to json") | **Record Count**<br> 77925 | **Approximate File Size**<br> tiny (< 10MB) |
| **Format** jsona | **Address**[Link to jsona](https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants.jsona "Link to jsona") | **Record Count**<br> 77925 | **Approximate File Size**<br> tiny (< 10MB) |
| **Format** jsonl | **Address**[Link to jsonl](https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants.jsonl "Link to jsonl") | **Record Count**<br> 77925 | **Approximate File Size**<br> tiny (< 10MB) |
| **Format** parquet | **Address**[Link to parquet](https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants.parquet "Link to parquet") | **Record Count**<br> 77925 | **Approximate File Size**<br> tiny (< 10MB) |

## Data Fields

| Name | Title | Type | Description | Is Searchable |
| --- | --- | --- | --- | --- |
| **Name** awardNumber | **Title** Award Number | **Type**<br>text | **Description** The agreed upon term for the number assigned to each individual award within the grant program and fiscal year. Each award number is unique to that year and recipient. This is sometimes referred to as 'Contract Number', 'Purchase Order Number', or 'Obligation Number' | **Is Searchable** yes |
| **Name** fiscalYear | **Title** Fiscal Year | **Type**<br>smallint | **Description** Represents the government budget fiscal year, which is from October 1st - September 30th. Note: Some grant programs are budgeted for a fiscal year and spent in another ' i.e. multi-year funded awards place money from current fiscal year appending a prior award number | **Is Searchable** yes |
| **Name** programName | **Title** Program Name | **Type**<br>text | **Description** The program name and fiscal year in which the money was appropriated. Name of the grant program from [grants.gov](http://grants.gov/) and set in the funding notification announcement. This term is also referred to in other sources as 'Solicitation' or 'Grant Title' | **Is Searchable** yes |
| **Name** programAbbreviation | **Title** Program Abbreviation | **Type**<br>text | **Description** Abbreviation for Program Name. NOTE: FIELD NOT AVAILABLE AT THIS TIME. | **Is Searchable** yes |
| **Name** vendorState | **Title** Vendor State | **Type**<br>text | **Description** The state in which the awardee is located. This is also referred to as 'Vendor State Code' | **Is Searchable** yes |
| **Name** awardAmount | **Title** Award Amount | **Type**<br>decimal | **Description** The amount of allocated funds that are obligated to an awardee. While this is synonymous to 'Obligated Amount', Award Amount is the agreed upon term for use in R&IM reports. Note: Funds can be de-obligated so this amount is not final until award is closed. Therefore, in reports, terms such as 'Initial Award Amount' and 'Current Award Amount' can and should be used where necessary | **Is Searchable** yes |
| **Name** region | **Title** Region | **Type**<br>smallint | **Description** Vendor States are assigned to a geographic regions. There are 58 US states and territories and each is assigned to 1 of 10 regions. Regions are 1-5 are rolled up to Eastern and 6-10 are Western | **Is Searchable** yes |
| **Name** vendorName | **Title** Vendor Name | **Type**<br>text | **Description** This term refers to the award recipient, as documented in IFMIS. This field is also known as 'Awardee', 'Grantee', 'Recipient' or 'Project' (the latter only in ARRA Reporting) | **Is Searchable** yes |
| **Name** id | **Title** ID | **Type**<br>uuid | **Description** Unique ID assigned to the record | **Is Searchable** yes |

## See Also

**Access the metadata API calls for additional information:**

- [https://www.fema.gov/api/open/v1/OpenFemaDataSets?$filter=name%20eq%20%27NonDisasterAssistanceFirefighterGrants%27](https://www.fema.gov/api/open/v1/OpenFemaDataSets?$filter=name%20eq%20%27NonDisasterAssistanceFirefighterGrants%27)
- [https://www.fema.gov/api/open/v1/OpenFemaDataSetFields?$filter=openFemaDataSet%20eq%20%27NonDisasterAssistanceFirefighterGrants%27%20and%20datasetVersion%20eq%201](https://www.fema.gov/api/open/v1/OpenFemaDataSetFields?$filter=openFemaDataSet%20eq%20%27NonDisasterAssistanceFirefighterGrants%27%20and%20datasetVersion%20eq%201)

Last updated June 5, 2026

[Return to top](https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1#)

![ Logo](https://www.fema.gov/profiles/femad8_gov/themes/fema_uswds/images/fema-logo-blue.svg)

Would you like to take a brief survey regarding your experience with fema.gov?