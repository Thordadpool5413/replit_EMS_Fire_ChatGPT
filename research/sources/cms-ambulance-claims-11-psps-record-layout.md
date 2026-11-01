Source: https://www.cms.gov/research-statistics-data-and-systems/files-for-order/nonidentifiabledatafiles/downloads/pspsrecordlayoutaugust2010.pdf
Title: Physician Supplier Procedure Summary (PSPS) on IDR File Layout
Fetched: 2026-11-01T05:16:18.207Z

Physician Supplier Procedure Summary (PSPS) on IDR File Layout
AS OF: 08/05/2015

| NAME | LENGTH | BEG | END | CONTENTS |
| --- | --- | --- | --- | --- |
| 1. HCPCS Code |  | 5 | 1 | The Health Care Common Procedure Coding System (HCPCS) is a collection of codes that represent procedures, supplies, products and services which may be provided to Medicare beneficiaries and to individuals enrolled in private health insurance programs. The codes are divided into three levels, or groups as described below: Level I Codes and descriptors copyrighted by the American Medical Association's Current Procedural Terminology, Fourth Edition (CPT-4). These are 5 position numeric codes representing physician and nonphysician services. **** Note: **** CPT-4 codes including both long and short descriptions shall be used in accordance with the CMS/AMA agreement. Any other use violates the AMA copyright. Level II Includes codes and descriptors copyrighted by the American Dental Association's Current Dental Terminology, Third Edition (CDT-3). These are 5 position alpha-numeric codes comprising the D series. All other level II codes and descriptors are approved and maintained jointly by the alpha-numeric editorial panel (consisting of CMS, the Health Insurance Association of America, and the Blue Cross and Blue Shield Association). These are 5 position alpha- numeric codes representing primarily items and nonphysician services that are not |

---

represented in the level I codes.

|  |  |  |  |  | represented in the level I codes. |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | Level III Codes and descriptors developed by Medicare carriers for use at the local (carrier) level. These are 5 position alpha-numeric codes in the W, X, Y or Z series representing physician and nonphysician services that are not represented in the level I or level II codes. |
| 2. | HCPCS Initial Modifier Code | 2 | 6 | 7 | A first modifier to the HCPCS procedure code to enable a more specific procedure identification for the line item service on the noninstitutional claim. |
| 3. | Provider Specialty Code | 2 | 8 | 9 | CMS specialty code used for pricing the line item service on the noninstitutional claim. |
| 4. | Carrier Number | 5 | 10 | 14 | The identification number assigned by CMS to a carrier authorized to process claims from a physician or supplier. |
| 5. | Pricing Locality Code | 2 | 15 | 16 | Code denoting the carrier-specific locality used for pricing the service for this line item on the carrier claim (non-DMERC). For DMERCs, this field contains the beneficiary SSA State Code |
| 6. | Type of Service Code | 1 | 17 | 17 | Code indicating the type of service, as defined in the CMS Medicare Carrier Manual, for this line item on the non-institutional claim. |

---

| 7. | Place of Service Code | 2 | 18 | 19 | The code indicating the place of service, as defined in the Medicare Carrier Manual, for this line item on the noninstitutional claim. |
| --- | --- | --- | --- | --- | --- |
| 8. | HCPCS Second Modifier Code | 2 | 20 | 21 | A second modifier to the HCPCS procedure code to make it more specific than the first modifier code to identify the line item procedures for this claim. |
| 9. | Physician/Supplier Procedure Summary (PSPS) | 14 | 22 | 35 | Submitted Service Count The count of the total number of submitted services. Format: 999999999.999 |
| 10. | Physician/Supplier Procedure Summary (PSPS) | 15 | 36 | 50 | Submitted Charge Amount The amount of charges submitted by the provider to Medicare. Format: +999999999.99 |
| 11. | Physician/Supplier Procedure Summary (PSPS) | 15 | 51 | 65 | Allowed Charge Amount The amount that is approved (allowed) for Medicare. Format: +999999999.99 |
| 12. | Physician/Supplier Procedure Summary (PSPS) | 14 | 66 | 79 | Denied Services Count The count of the number of submitted services that |

---

|  |  |  | are denied by Medicare. Format: 999999999.999 |
| --- | --- | --- | --- |
| 13. | Physician/Supplier Procedure 15 | Summary (PSPS) 80 94 | Denied Charge Amount The amount of submitted charges for which Medicare payment was denied. Format: +999999999.99 |
| 14. | Physician/Supplier Procedure 14 | Summary (PSPS) 95 108 | Assigned Services Count The count of the number of services from providers accepting Medicare assignment. Format: 999999999.999 |
| 15. | Physician/Supplier Procedure 15 | Summary (PSPS) 109 123 | NCH Payment Amount The amount of payment made from the trust fund (after deductible and coinsurance amounts have been paid). Format: +999999999.99 |
| 16. | Physician/Supplier Procedure 1 | Summary (PSPS) 124 124 | HCPCS ASC Indicator Code A Y/N code used to indicate whether the procedure is approved to be performed in an Ambulatory Surgical Center (ASC). |

17.  Physician Supplier Procedure Summary (PSPS) Error Indicator Code
2 125 126

The code used to indicate combinations of errors on key fields.

---

18.  HCPCS Berenson-Eggers Type of Service Code (BETOS)
3    127 129

This field is valid beginning with 2003 data.
The Berenson-Eggers Type of Service (BETOS) for the
procedure code based on generally agreed upon clinically
meaningful groupings of procedures and services.

---

TABLE OF CODES APPENDIX                            
FROM IDR V2 Reference Views

<u>BETOS Table</u>

SELECT

HCPCS_BETOS_CD,

HCPCS_BETOS_CD_DESC

FROM CMS_VDM_VIEW_PTB_PRD.V2_PTB_BETOS_CD

| HCPCS_BETOS_CD | HCPCS_BETOS_CD_DESC |
| --- | --- |
| D1A | Medical/surgical supplies |
| D1B | Hospital beds |
| D1C | Oxygen and supplies |
| D1D | Wheelchairs |
| D1E | Other DME |
| D1F | Prosthetic/Orthotic devices |
| D1G | Drugs Administered through DME |
| I1A | Standard imaging - chest |
| I1B | Standard imaging - musculoskeletal |
| I1C | Standard imaging - breast |
| I1D | Standard imaging - contrast gastrointestinal |
| I1E | Standard imaging - nuclear medicine |
| I1F | Standard imaging - other |
| I2A | Advanced imaging - CAT/CT/CTA: brain/head/neck |
| I2B | Advanced imaging - CAT/CT/CTA: other |
| I2C | Advanced imaging - MRI/MRA: brain/head/neck |
| I2D | Advanced imaging - MRI/MRA: other |
| I3A | Echography/ultrasonography - eye |
| I3B | Echography/ultrasonography - abdomen/pelvis |
| I3C | Echography/ultrasonography - heart |
| I3D | Echography/ultrasonography - carotid arteries |
| I3E | Echography/ultrasonography - prostate, transrectal |

---

| I3F | Echography/ultrasonography - other |
| --- | --- |
| I4A | Imaging/procedure - heart including cardiac catheter |
| I4B | Imaging/procedure - other |
| M1A | Office visits - new |
| M1B | Office visits - established |
| M2A | Hospital visit - initial |
| M2B | Hospital visit - subsequent |
| M2C | Hospital visit - critical care |
| M3 | Emergency room visit |
| M4A | Home visit |
| M4B | Nursing home visit |
| M5A | Specialist - pathology (HCPCS moved to T1G in 2003) |
| M5B | Specialist - psychiatry |
| M5C | Specialist - ophthalmology |
| M5D | Specialist - other |
| M6 | Consultations |
| O1A | Ambulance |
| O1B | Chiropractic |
| O1C | Enteral and parenteral |
| O1D | Chemotherapy |
| O1E | Other drugs |
| O1F | Hearing and speech services |
| O1G | Immunizations/Vaccinations |
| P0 | Anesthesia |
| P1A | Major procedure - breast |
| P1B | Major procedure - colectomy |
| P1C | Major procedure - cholecystectomy |
| P1D | Major procedure - turp |
| P1E | Major procedure - hysterectomy |
| P1F | Major procedure - explor/decompr/excis disc |

---

| P1G | Major procedure - Other |
| --- | --- |
| P2A | Major procedure, cardiovascular-CABG |
| P2B | Major procedure, cardiovascular-Aneurysm repair |
| P2C | Major Procedure, cardiovascular-Thromboendarterectomy |
| P2D | Major procedure, cardiovascular-Coronary angioplasty (PTCA) |
| P2E | Major procedure, cardiovascular-Pacemaker insertion |
| P2F | Major procedure, cardiovascular-Other |
| P3A | Major procedure, orthopedic - Hip fracture repair |
| P3B | Major procedure, orthopedic - Hip replacement |
| P3C | Major procedure, orthopedic - Knee replacement |
| P3D | Major procedure, orthopedic - other |
| P4A | Eye procedure - corneal transplant |
| P4B | Eye procedure - cataract removal/lens insertion |
| P4C | Eye procedure - retinal detachment |
| P4D | Eye procedure - treatment of retinal lesions |
| P4E | Eye procedure - other |
| P5A | Ambulatory procedures - skin |
| P5B | Ambulatory procedures - musculoskeletal |
| P5C | Ambulatory procedures - groin hernia repair |
| P5D | Ambulatory procedures - lithotripsy |
| P5E | Ambulatory procedures - other |
| P6A | Minor procedures - skin |
| P6B | Minor procedures - musculoskeletal |
| P6C | Minor procedures - other (Medicare fee schedule) |
| P6D | Minor procedures - other (non-Medicare fee schedule) |
| P7A | Oncology - radiation therapy |
| P7B | Oncology - other |
| P8A | Endoscopy - arthroscopy |
| P8B | Endoscopy - upper gastrointestinal |
| P8C | Endoscopy - sigmoidoscopy |

---

| P8D | Endoscopy - colonoscopy |
| --- | --- |
| P8E | Endoscopy - cystoscopy |
| P8F | Endoscopy - bronchoscopy |
| P8G | Endoscopy - laparoscopic cholecystectomy |
| P8H | Endoscopy - laryngoscopy |
| P8I | Endoscopy - other |
| P9A | Dialysis services (Medicare Fee Schedule) |
| P9B | Dialysis services (Non-Medicare Fee Schedule) |
| T1A | Lab tests - routine venipuncture (non Medicare fee schedule) |
| T1B | Lab tests - automated general profiles |
| T1C | Lab tests - urinalysis |
| T1D | Lab tests - blood counts |
| T1E | Lab tests - glucose |
| T1F | Lab tests - bacterial cultures |
| T1G | Lab tests - other (Medicare fee schedule) |
| T1H | Lab tests - other (non-Medicare fee schedule) |
| T2A | Other tests - electrocardiograms |
| T2B | Other tests - cardiovascular stress tests |
| T2C | Other tests - EKG monitoring |
| T2D | Other tests - other |
| Y1 | Other - Medicare fee schedule |
| Y2 | Other - non-Medicare fee schedule |
| Z1 | Local codes |
| Z2 | Undefined codes |
| ~ | No Description Available |

---

SELECT

CLM_CNTRCTR_NUM,

CLM_CNTRCTR_NUM_DESC

FROM CMS_VDM_VIEW_PTB_PRD.V2_PTB_CLM_CNTRCTR_NUM;

| CLM_CNTRCTR_NUM | CLM_CNTRCTR_NUM_DESC |
| --- | --- |
| 00000 | PALMETTO GOV. BENEFITS ADMIN. |
| 00010 | Alabama BC - Alabama |
| 00011 | Alabama BC - Iowa (replaced by MAC # 03401 -- see below) |
| 00012 | Alabama BC (terminated 5/01/2008, replaced by # 05101) |
| 00020 | Arkansas BC - Arkansas |
| 00021 | Arkansas BC - Rhode Island |
| 00030 | Arizona BC (replaced by MAC #03101 -- see below) |
| 00040 | California BC (term. 12/00) |
| 00050 | New Mexico BC/CO (term. 06/89) |
| 00060 | Connecticut BC (term. 06/99) |
| 00070 | Delaware BC - terminated 2/98 |
| 00080 | Florida BC (term. 03/88) |
| 00090 | Florida BC |
| 00101 | Georgia BC |
| 00121 | Illinois - HCSC (term. 08/98) |
| 00123 | Michigan - HCSC (term. 08/98) |
| 00130 | Indiana BC/Administrator Federal |
| 00131 | Illinois - National Government Services, Inc. |
| 00140 | Iowa - Wellmark (term. 6/2000) |
| 00150 | Kansas BC (term. 2008) (replaced with MAC # 05201 --see below) |
| 00160 | Kentucky/Administrator |
| 00170 | No description available |
| 00180 | Maine BC |
| 00181 | Maine BC - Massachusetts |

---

| 00190 | Maryland BC (term. 9/2005) |
| --- | --- |
| 00200 | Massachusetts BC (term. 7/97) |
| 00210 | Michigan BC (term. 9/94) |
| 00220 | Minnesota BC (term. 07/99) |
| 00230 | Mississippi BC |
| 00231 | Mississippi BC/LA (term. 09/92) |
| 00232 | Mississippi BC |
| 00233 | Mississippi BC |
| 00234 | Arkansas, Louisiana, and Mississippi (Part A Roll Up number) |
| 00241 | Missouri BC (term. 9/92) |
| 00242 | Mississippi BC (terminated 5/01/2008, replaced by # 05301) |
| 00250 | Montana BC (replaced by MAC #03201 -- see below) |
| 00260 | Nebraska BC (term. 2007) (replaced with MAC # 05401 --see below) |
| 00270 | New Hampshire BC |
| 00280 | New Jersey BC (term. 8/2000) |
| 00290 | New Mexico BC - terminated 11/95 |
| 00308 | New York - Empire BC |
| 00310 | North Carolina BC (term. 01/02) |
| 00320 | Minnesota - Noridian Administrative Services, LLC |
| 00322 | North Dakota BC - Washington &amp; Alaska |
| 00323 | North Dakota BC - Idaho, Oregon &amp; Utah (replaced with MAC # 03501 --see below) |
| 00325 | BCBS of ND |
| 00326 | Alaska, Washington, Idaho &amp; Oregon (Part A Roll Up number) |
| 00332 | Ohio-Administrar |
| 00340 | Oklahoma BC (term. 2008) (replaced with MAC # 04301 --see below) |
| 00350 | Oregon BC |
| 00351 | Oregon BC/ID. (term. 09/88) |
| 00355 | Oregon-CWF |

---

| 00362 | Independence BC - terminated 8/97 |
| --- | --- |
| 00363 | Pennsylvania/Highmark - Veritus |
| 00366 | Highmark (MD &amp; DC) - Part A (eff. 10/2005) |
| 00370 | Rhode Island BC |
| 00380 | South Carolina BC - South Carolina |
| 00382 | South Carolina BC - North Carolina |
| 00390 | Tennessee BC |
| 00400 | Texas BC |
| 00410 | Utah BC (term. 09/00) |
| 00423 | Virginia BC; Trigon (term. 08/99) |
| 00430 | Washington/Alaska BC |
| 00441 | No description available |
| 00450 | National Government Services, Inc. - RHHI |
| 00452 | Wisconsin BC - Michigan |
| 00453 | Wisconsin BC - Virginia &amp; West Virginia |
| 00454 | Wisconsin BC - California |
| 00456 | National Government Services, Inc. - RHHI |
| 00460 | Wyoming BC (replaced by MAC #03601 -- see below) |
| 00468 | N Carolina BC/CPRTIVA |
| 00510 | Alabama - CAHABA (eff. 1983) (replaced by MAC #10102 -- see below) |
| 00511 | Georgia - CAHABA (eff. 1998) (replaced by MAC #10202 -- see below) |
| 00512 | Mississippi - CAHABA (eff. 10/20/2012 replaced by 07302 - see below) |
| 00520 | Arkansas BC/BS (eff. 8/11/2012 replaced by 07102 - see below) |
| 00521 | New Mexico - Arkansas BC/BS (eff. 1998; term. 2008) (replaced by MAC #04202 -- see below) |
| 00522 | Oklahoma - Arkansas BC/BS (eff. 1998; term. 2008) (replaced by MAC #04302 -- see below) |

---

| 00523 | Missouri East - Arkansas BC/BS (eff. 1999; term. 2008) (replaced by MAC #05392 -- see below) |
| --- | --- |
| 00524 | Rhode Island - Arkansas BC/BS (eff. 2004) (replaced by MAC #14402 -- see below) |
| 00528 | Louisiana - Arkansas BS (eff. 8/11/2012 replaced by 07202 - see below) |
| 00542 | California BS (eff. 1983; term. 1996) |
| 00550 | Colorado BS (eff. 1983; term. 1994) |
| 00570 | Delaware - Pennsylvania BS (eff. 1983;term. 1997) |
| 00580 | District of Columbia - Pennsylvania BS (eff. 1983; term. 1997) |
| 00590 | Florida - First Coast (eff. 1983) (replaced by MAC #09102 -- see below) |
| 00591 | Connecticut - First Coast (eff. 2000) (replaced by MAC #13102 -- see below) |
| 00621 | Illinois BS - HCSC (eff. 1983; term. 1998) |
| 00623 | Michigan - Illinois Blue Shield (eff. 1995) (term. 1998) |
| 00630 | Indiana - Administar (eff. 8/20/2012 replaced by 08102 - see below) |
| 00635 | DMERC-B - Administar (eff. 1993) (replaced by MAC #17003 -- see below) |
| 00640 | Iowa - Wellmark, Inc. (eff. 1983; term. 1998) |
| 00645 | Nebraska - Iowa BS (eff. 1985; term. 1987) |
| 00650 | Kansas BCBS (eff. 1983) (term. 2008) (replaced by MAC #05202 -- see below) |
| 00655 | Nebraska - Kansas BC/BS (eff. 1988; term. 2008) (replaced by MAC #05402 -- see below) |
| 00660 | Kentucky - Administar (eff. 1983) |
| 00690 | Maryland BS (eff. 1983; term. 1994) |
| 00700 | Massachusetts BS (eff. 1983; term. 1997) |
| 00710 | Michigan BS (eff. 1983; term. 1994) |
| 00720 | Minnesota BS (eff. 1983; term. 1995) |

---

| 00740 | Western Missouri - Kansas BS (eff. 1983; term.2008) (replaced by MAC #05302 -- see below) |
| --- | --- |
| 00751 | Montana BC/BS (eff. 1983) (replaced by MAC # 03202 -- see below) |
| 00770 | New Hampshire/Vermont Physician Services (eff. 1983; term. 1984) |
| 00780 | New Hampshire/Vermont - Massachusetts BS (eff. 1985; term. 1997) |
| 00801 | New York - Healthnow (eff. 1983) (replaced by MAC #13282 -- see below) |
| 00803 | New York - Empire BS (eff. 1983) (replaced by MAC #13202 -- see below) |
| 00805 | New Jersey - Empire BS (eff. 3/99) (replaced by MAC # 12402 -- see below) |
| 00811 | DMERC (A) - Healthnow (eff. 2000) (replaced by MAC #16003 -- see below) |
| 00820 | North Dakota - Noridian (eff. 1983) (replaced by MAC #03302 -- see below) |
| 00823 | Utah - Noridian (eff. 12/01/2005) (replaced by MAC #03502 -- see below) |
| 00824 | Colorado - Noridian (eff. 1995) (term. 2008) (replaced by MAC #04102 -- see below) |
| 00825 | Wyoming - Noridian (eff. 1990) (replaced by MAC #03602 -- see below) |
| 00826 | Iowa - Noridian (eff. 1999) (term. 2008) (replaced by MAC #05102 -- see below) |
| 00831 | Alaska - Noridian (eff. 1998) (replaced by 02102 - see below) |
| 00832 | Arizona - Noridian (eff. 1998) (replaced by MAC # 03102 -- see below) |
| 00833 | Hawaii - Noridian (eff. 1998) (replaced by MAC # 01202 -- see below) |
| 00834 | Nevada - Noridian (eff. 1998) (replaced by MAC # 01302 -- see below) |

---

| 00835 | Oregon - Noridian (eff. 1998) (replaced by 02302 - see below) |
| --- | --- |
| 00836 | Washington - Noridian (eff. 1998) (replaced by 02402 - see below) |
| 00860 | New Jersey - Pennsylvania BS (eff. 1988; term. 1999) |
| 00865 | Pennsylvania - Highmark (eff. 1983) (replaced by MAC # 12502 -- see below) |
| 00870 | Rhode Island BS (eff. 1983; term. 2004) |
| 00880 | South Carolina - Palmetto (eff. 1983) |
| 00882 | RRB - South Carolina PGBA (eff. 2000) |
| 00883 | Ohio - Palmetto (eff. 2002) |
| 00884 | West Virginia - Palmetto (eff. 2002) |
| 00885 | DMERC C - Palmetto (eff. 1993) (replaced by MAC #18003 -- see below) |
| 00889 | South Dakota - Noridian (eff. 4/01/2006) (replaced by MAC # 03402 -- see below) |
| 00900 | Texas - Trailblazer (eff. 1983; term. 2008) (replaced by MAC # 04402 -- see below) |
| 00901 | Maryland - Trailblazer (eff. 1995) (replaced by MAC # 12302 -- see below) |
| 00902 | Delaware - Trailblazer (eff. 1998) (replaced by MAC # 12102 -- see below) |
| 00903 | District of Columbia - Trailblazer (eff. 1998) (replaced by MAC # 12202 -- see below) |
| 00904 | Virginia - Trailblazer (eff. 2000) (replaced by MAC # 11302 -- see below) |
| 00910 | Utah BS (eff. 1983) |
| 00930 | WASHINGTON (AENTNA LIFE) |
| 00932 | WASHINGTON (AENTNA LIFE) |
| 00951 | Wisconsin - Wisconsin Physicians Service Insurance Corporation (eff. 1983) (replaced by MAC # 06302 -- see below) |
| 00952 | Illinois - Wisconsin Physicians Service Insurance Corporation (eff. 1999) (replaced by MAC # 06102 -- see below) |

---

| 00953 | Michigan - Wisconsin Phy Svc Ins. (eff. 7/16/2012 replaced by 08202 - see below) |
| --- | --- |
| 00954 | Minnesota - Wisconsin Physicians Service Insurance Corporation (eff. 2000) (replaced by MAC # 06202 -- see below) |
| 00973 | Puerto Rico - Triple S, Inc. (eff. 1983) (replaced by MAC # 09202 -- see below) |
| 00974 | Triple-S, Inc. - Virgin Islands |
| 00993 | BC/BS Assoc. |
| 01001 | California, Hawaii, and Nevada (Part A roll up number) |
| 01011 | California, Hawaii, American Samoa, Guam, N. Marianas and Nevada (Part A roll up number) |
| 01020 | Alaska - AETNA (eff. 1983; term. 1997) |
| 01030 | Arizona - AETNA (eff. 1983; term. 1997) |
| 01040 | Georgia - AETNA (eff. 1988; term. 1997) |
| 01101 | California - Palmetto GBA (eff. 8/15/2008) (replaces FI #00454) Jurisdiction 1 - Part A MAC |
| 01102 | California - Palmetto GBA (eff. 9/01/08) (replaces carrier #00832) Jurisdiction 1 . Part B MAC (replaced by MAC #01112 -- see below) |
| 01111 | California - Noridian Administrative Services, LLC - Part A MAC |
| 01112 | N. California - Noridian Administrative Services, LLC (eff. 9/16/2013) |
| 01120 | Hawaii - AETNA (eff. 1983; term. 1997) |
| 01182 | S. California - Noridian Administrative Services, LLC (eff. 9/16/2013) |
| 01192 | S. California - Palmetto GBA (eff. 9/01/2008) |
| 01201 | Hawaii - Palmetto GBA (eff. 8/15/2008) (replaces FI #00454) Jurisdiction 1 - Part A MAC |
| 01202 | Hawaii - Palmetto GBA (eff. 8/01/08) (replaces carrier #00833) Jurisdiction 1 . Part B MAC (replaced by MAC #01212) |
| 01211 | Hawaii - Noridian Administrative Services, LLC (eff. 8/26/2013) |

---

| 01212 | Hawaii (including American Samoa, Guam &amp; Northern Mariana Islands) - Noridian Administrative Services, LLC (eff. 9/16/2013) |
| --- | --- |
| 01290 | Nevada - AETNA (eff. 1983; term. 1997) |
| 01301 | Nevada - Palmetto GBA (eff. 8/15/2008) (replaces FI #00454) Jurisdiction 1 - Part A MAC |
| 01302 | Nevada - Palmetto GBA (eff. 8/01/08) (replaces carrier #00834) Jurisdiction 1 . Part B MAC (replaced by MAC # 01312-- see below) |
| 01311 | Nevada - Noridian Administrative Services, LLC (eff. 8/26/2013) |
| 01312 | Nevada - Noridian Administrative Services, LLC (eff. 9/16/2013) |
| 01360 | New Mexico - AETNA (eff. 1986; term. 1997) |
| 01370 | Oklahoma - AETNA (eff. 1983; term. 1997) |
| 01380 | Oregon - AETNA (eff. 1983; term. 1997) |
| 01390 | Washington - AETNA (eff. 1994; term. 1997) |
| 01901 | Palmetto - Palmetto GBA (replaces # 52280) |
| 01911 | Noridian Administrative Services, LLC (eff. 8/26/2013) |
| 02001 | Alaska, Idaho, Oregon and Washington (Part A roll up number) |
| 02050 | California - TOLIC (eff. 1983; term. 2000) |
| 02101 | Alaska - Noridian Administrative Services, LLC (eff. 2/27/2012) (replaces FI #00322) |
| 02102 | Alaska - Noridian Administrative Services, LLC (eff. 2/27/2012) |
| 02201 | Idaho - Noridian Administrative Services, LLC (eff. 2/27/2012) (replaces FI #00325) |
| 02202 | Idaho - Noridian Administrative Services, LLC (eff. 2/01/2012) (replaces #05130) |
| 02301 | Oregon - Noridian Administrative Services, LLC (eff. 2/27/2012) (replaces FI #00325) |
| 02302 | Oregon - Noridian Administrative Services, LLC (eff. 2/27/2012) (replaces Carrier #00835) |
| 02401 | Washington - Noridian Administrative Services, LLC (eff. 2/27/2012) |

---

| 02402 | Washington - Noridian Administrative Services, LLC (eff. 2/27/2012) |
| --- | --- |
| 03001 | Arizona, Montana, N. Dakota, S. Dakota, Utah and Wyoming (Part A roll up number) |
| 03070 | Connecticut General Life Insurance Co. (eff. 1983; term. 1985) |
| 03101 | Arizona - Noridian Administrative Services, LLC (eff. 10/01/2006) (replaces FI #00030) JURISDICTION 3 - Part A MAC |
| 03102 | Arizona - Noridian Administrative Services, LLC (eff. 12/01/06) (replaces carrier #00832) Jurisdiction 3 . Part B MAC |
| 03201 | Montana - Noridian Administrative Services, LLC (eff. 12/01/2006) (replaces FI #00250) JURISDICTION 3 - Part A MAC |
| 03202 | Montana - Noridian Administrative Services, LLC (eff. 12/01/06) (replaces carrier #00751) Jurisdiction 3 . Part B MAC |
| 03301 | N. Dakota - Noridian Administrative Services, LLC (eff. 12/01/2006) (replaces FI #00320) JURISDICTION 3 - Part A MAC |
| 03302 | N. Dakota - Noridian Administrative Services, LLC (eff. 12/01/06) (replaces carrier #00820) Jurisdiction 3 . Part B MAC |
| 03401 | S. Dakota - Noridian Administrative Services, LLC (eff. 3/01/2007) (replaces FI #00011) JURISDICTION 3 - Part A MAC |
| 03402 | S. Dakota - Noridian Administrative Services, LLC (eff. 12/01/06) (replaces carrier #00889) Jurisdiction 3 . Part B MAC |
| 03501 | Utah - Noridian Administrative Services, LLC (eff. 12/01/2006) (replaces FI #00323) JURISDICTION 3 - Part A MAC |
| 03502 | Utah - Noridian Administrative Services, LLC (eff. 12/01/06) (replaces carrier #00823) Jurisdiction 3 . Part B MAC |
| 03601 | Wyoming - Noridian Administrative Services, LLC (eff. 11/01/2006) (replaces FI #00460) JURISDICTION 3 - Part A MAC |
| 03602 | Wyoming - Noridian Administrative Services, LLC (eff. 12/01/06) (replaces carrier #00825) Jurisdiction 3 . Part B MAC |
| 04001 | New Mexico, Texas, Colorado and Oklahoma (Part A roll up number) |

---

| 04011 | New Mexico, Texas, Colorado (Part A roll up number) |
| --- | --- |
| 04101 | Colorado (eff. 6/16/2008) (replaces FI #00400) JURISDICTION 4 - Part A MAC |
| 04102 | Colorado - (eff.11/17/2012 replaced by 04112 - see below) |
| 04111 | Colorado - Novitas Solutions, Inc (eff. 10/29/2012) (replaces FI #04101) |
| 04112 | Colorado - Novitas Solutions, Inc. (eff.11/17/2012) |
| 04201 | New Mexico (eff. 6/16/2008) (replaced FI #00400) JURISDICTION 4 - Part A MAC |
| 04202 | New Mexico (eff.11/17/2012 replaced by 04212 - see below) |
| 04211 | New Mexico - Novitas Solutions, Inc (eff. 10/29/2012) |
| 04212 | New Mexico - Novitas Solutions, Inc. (eff. 11/17/2012) |
| 04301 | Oklahoma (eff. 3/01/2008) (replaces FI #00340) JURISDICTION 4 - Part A MAC |
| 04302 | Oklahoma (eff.11/17/2012 replaced by 04312 - see below) |
| 04311 | Oklahoma - Novitas Solutions, Inc (eff. 10/29/2012) |
| 04312 | Oklahoma - Novitas Solutions, Inc. (eff. 11/17/2012) |
| 04401 | Texas (eff. 6/16/2008) (replaced FI #00400) JURISDICTION 4 - Part A MAC |
| 04402 | Texas (eff.11/17/2012 replaced by 04412 - see below) |
| 04411 | Texas - Novitas Solutions, Inc (eff. 10/29/2012) |
| 04412 | Texas - Novitas Solutions, Inc. (eff. 11/17/2012) |
| 04901 | TrailBlazer (replaces #52280) |
| 04911 | CO, NM, OK, TX - Novitas Solutions, Inc (eff. 10/29/2012) MAC Part A |
| 05001 | Iowa, Kansas, Missouri and Nebraska (Part A roll up number) |
| 05101 | Iowa - Wisconsin Physicians Service Insurance Corporation (eff. 5/01/2008) (replaces FI #00150) JURISDICTION 5 - Part A MAC |
| 05102 | Iowa - Wisconsin Physicians Service Insurance Corporation (eff.2/01/08) (replaces carrier #00826) Jurisdiction 5 . Part B MAC |
| 05130 | Idaho - CIGNA (eff. 1983) (replaced by # 02202 - see below) |

---

| 05201 | Kansas - Wisconsin Physicians Service Insurance Corporation (eff. 3/01/2008) (replaces FI #00150) JURISDICTION 5 - Part A MAC |
| --- | --- |
| 05202 | Kansas - Wisconsin Physicians Service Insurance Corporation (eff. 3/01/08) (replaces carrier #00650) Jurisdiction 5 . Part B MAC |
| 05301 | Missouri - Wisconsin Physicians Service Insurance Corporation (eff.5/01/2008) (replaces FI #00150) JURISDICTION 5 - Part A MAC |
| 05302 | W. Missouri - Wisconsin Physicians Service Insurance Corporation (eff. 3/01/08) (replaces carrier #00651 or 00740) Jurisdiction 5 . Part B MAC |
| 05320 | New Mexico - Equitable Insurance (eff. 1983; term. 1985) |
| 05392 | E. Missouri (eff. 6/01/08) (replaces carrier #00523) Jurisdiction 5 . Part B MAC |
| 05401 | Nebraska - Wisconsin Physicians Service Insurance Corporation (eff. 12/01/2007) (replaces FI #00260) JURISDICTION 5 - Part A MAC |
| 05402 | Nebraska -Wisconsin Physicians Service Insurance Corporation (eff. 3/01/08) (replaces carrier #00655) Jurisdiction 5 . Part B MAC |
| 05440 | Tennessee - CIGNA (eff. 1983) (replaced by MAC #10302 - see below) |
| 05530 | Wyoming - Equitable Insurance (eff. 1983) (term. 1989) |
| 05535 | North Carolina - CIGNA (eff. 1988) |
| 05655 | DMERC-D Alaska - CIGNA (eff. 1993) (replaced by MAC #19003 -- see below) |
| 05901 | Wisconsin Physicians Service Insurance Corporation - All WPS Legacy remaining (eff. 10/22/2012) |
| 06001 | HH+H Region D (WI, MN, MI, NY, NJ, PR and VI) and Wisconsin (Part A roll up number) |
| 06004 | National Government Services, Inc. HHH MAC (eff. 7/13/2013) |
| 06014 | HH+H Region D (AK, American Samoa, AZ, CA, Guam, HI, ID, Northern Marianas, NV, OR, WA (Part A roll up number) |

---

| 06101 | Illinois - National Government Services, Inc. MAC Part A (eff. 7/13/2013) |
| --- | --- |
| 06102 | Illinois - National Government Services, Inc. MAC Part B (eff. 9/7/2013) |
| 06201 | Minnesota - National Government Services, Inc. MAC Part A (eff. 8/10/2013) |
| 06202 | Minnesota - National Government Services, Inc. MAC Part B (eff. 9/7/2013) |
| 06301 | Wisconsin - National Government Services, Inc. MAC Part A (eff. 7/13/2013) |
| 06302 | Wisconsin - National Government Services Inc. MAC Part B (eff. 9/7/2013) |
| 07001 | Arkansas, Louisiana, Mississippi (Part A roll up number) |
| 07101 | Arkansas - Novitas Solutions, Inc (eff. 8/20/2012) |
| 07102 | Arkansas - Novitas Solutions, Inc (eff. 8/11/2012) |
| 07201 | Louisiana - Novitas Solutions, Inc (eff. 8/20/2012) |
| 07202 | Louisiana - Novitas Solutions, Inc (eff. 8/11/2012) |
| 07301 | Mississippi - Novitas Solutions, Inc (eff. 8/20/2012) |
| 07302 | Mississippi - Novitas Solutions, Inc (eff. 10/20/2012) |
| 08101 | Indiana - Wisconsin Physicians Service Insurance Corporation (eff. 7/23/2012) |
| 08102 | Indiana - Wisconsin Physicians Service Insurance Corporation (eff. 8/20/2012) |
| 08201 | Michigan - Wisconsin Physicians Service Insurance Corporation (eff. 7/23/2012) |
| 08202 | Michigan - Wisconsin Physicians Service Insurance Corporation (eff. 7/16/2012) |
| 09101 | Florida - First Coast Service Options, Inc. (eff. 2/13/2009) (replaces FI #00090) JURISDICTION 9 - Part A MAC |
| 09102 | Florida - First Coast Service Options, Inc. (eff.2/01/08) (replaces carrier #00590) Jurisdiction 9. Part B MAC |

---

| 09201 | PR/VI - First Coast Service Options, Inc. (eff. 03/01/2009) (replaces FI #57400) JURISDICTION 9 - Part A MAC |
| --- | --- |
| 09202 | Puerto Rico - First Coast Service Options, Inc. (eff.3/01/00) (replaces carrier #00973) Jurisdiction 9 . Part B MAC |
| 09302 | Virgin Islands - First Coast Service Options, Inc (eff. 3/01/2009) |
| 10071 | Railroad Board Travelers (eff. 1983) (term. 2000) |
| 10101 | Alabama - Cahaba Government Benefit Administrators LLC (eff. 5/18/2009) (replaces FI #00010) JURISDICTION 10 - Part A MAC |
| 10102 | Alabama - Cahaba Government Benefit Administrators LLC (eff.5/4/09) (replaces carrier #00510) Jurisdiction 10. Part B MAC |
| 10111 | Palmetto GBA LLC |
| 10112 | Palmetto GBA LLC |
| 10201 | Georgia - Cahaba Government Benefit Administrators LLC (eff. 8/3/2009) (replaces FI #00101) JURISDICTION 10 - Part A MAC |
| 10202 | Georgia - Cahaba Government Benefit Administrators LLC (eff.8/3/09) (replaces carrier #00511) Jurisdiction 10. Part B MAC |
| 10211 | Palmetto GBA LLC |
| 10212 | Palmetto GBA LLC |
| 10230 | Connecticut - Metra Health (eff. 1986) (term. 2000) |
| 10240 | Minnesota - Metra Health (eff. 1983) (term. 2000) |
| 10250 | Mississippi - Metra Health (eff. 1983) (term. 2000) |
| 10301 | Tennessee - Cahaba Government Benefit Administrators LLC (eff. 8/3/2009) (replaces FI #00390) JURISDICTION 10 - Part A MAC |
| 10302 | Tennessee - Cahaba Government Benefit Administrators LLC (eff.9/01/09) (replaces carrier #05440) Jurisdiction 10. Part B MAC |
| 10311 | Palmetto GBA LLC |
| 10312 | Palmetto GBA LLC |
| 10490 | Virginia - Metra Health (eff. 1983) (term. 2000) |
| 10492 | THE TRAVELERS (VA) (ORD STUDY) |
| 10555 | DMERC A - Travelers Insurance Co. (eff. 1993) (term. 2000) |

---

| 11001 | HH+H Region C, South Carolina (Part A roll up number) |
| --- | --- |
| 11003 | Virginia and West Virginia (Part A roll up number) |
| 11004 | Palmetto GBA - HHH MAC (eff. 1/24/2011) (replaces FI #00380) JURISDICTION 11 - Part A MAC |
| 11201 | South Carolina - Palmetto GBA (eff. 1/24/2011) (replaces FI #00380) JURISDICTION 11 - Part A MAC |
| 11202 | South Carolina - Palmetto GBA (eff. 6/20/2011) |
| 11260 | General American Life of Missouri (eff. 1983; term. 1998) |
| 11301 | Virginia - Palmetto GBA (eff. 5/16/2011) (replaces FI #00453) JURISDICTION 11 - Part A MAC |
| 11302 | Virginia - Palmetto GBA (eff.3/21/11) (replaces carrier #00904) Jurisdiction 11. Part B MAC |
| 11401 | West Virginia - Palmetto GBA (eff. 5/16/2011) (replaces FI #00453) JURISDICTION 11 - Part A MAC |
| 11402 | West Virginia - Palmetto GBA (eff. 6/20/2011) |
| 11501 | North Carolina - Palmetto GBA (eff. 9/30/2010) (replaces FI #00390) JURISDICTION 11 - Part A MAC |
| 11502 | North Carolina - Palmetto GBA |
| 12001 | DC, Delaware, New Jersey and Pennsylvania (Part A roll up number) |
| 12101 | Delaware - Novitas Solutions, Inc. (eff. 11/14/2008) (replaces FI # 00308) JURISDICTION 12 - Part A MAC |
| 12102 | Delaware - Novitas Solutions, Inc. (eff. 7/11/2008) (replaces carrier # 00902) Jurisdiction 12 – Part B MAC |
| 12201 | District of Columbia - Novitas Solutions, Inc. (replaces # 00366) |
| 12202 | District of Columbia - Novitas Solutions, Inc. (eff. 7/11/2008) (replaces carrier # 00903) NOTE: Includes Montgomery &amp; Prince Georges Counties in Maryland and Fairfax Counties and the City of Alexandria, VA Jurisdiction 12. Part B MAC |
| 12280 | NEBR, MUTUTAL OF OMAHA |
| 12301 | Maryland - Novitas Solutions, Inc. (replaces # 00366) |

---

| 12302 | Maryland - Novitas Solutions, Inc. (eff. 7/11/2008) (replaces carrier # 00901) Jurisdiction 12. Part B MAC |
| --- | --- |
| 12401 | New Jersey - Novitas Solutions, Inc. (replaces # 00390) |
| 12402 | New Jersey - Novitas Solutions, Inc. (eff. 11/14/2008) (replaces carrier # 00805) Jurisdiction 12. Part B MAC |
| 12501 | Pennsylvania - Novitas Solution, Inc. (replaces # 00363) |
| 12502 | Pennsylvania - Novitas Solutions, Inc. (eff. 12/8/2008) (replaces carrier # 00865) Jurisdiction 12. Part B MAC |
| 12901 | DE, DC, MD, PA - Novitas Solutions, Inc. (replaces # 52280) MAC Part A |
| 13001 | Connecticut and New York (Part A roll up number) |
| 13101 | Connecticut - National Government Services, Inc. (eff. 11/4/2008) (replaces FI #00308) JURISDICTION 13 - Part A MAC |
| 13102 | Connecticut - National Government Services, Inc. (eff. 8/01/2008) (replaces carrier # 00591) Jurisdiction 13. Part B MAC |
| 13201 | New York - National Government Services, Inc. (eff. 11/4/2008) (replaces FI #00308) JURISDICTION 13 - Part A MAC |
| 13202 | New York - National Government Services, Inc. (eff. 7/18/2008) (replaces carrier # 00803) Jurisdiction 13. Part B MAC |
| 13282 | New York (UN) - National Government Services, Inc. (eff. 9/01/2008) (replaces carrier # 00801) Jurisdiction 13. Part B MAC |
| 13292 | New York (QN) - National Government Services, Inc. (eff. 7/18/2008) (replaces carrier # 14330) Jurisdiction 13. Part B MAC |
| 14001 | New Hampshire, Vermont, Rhode Island, Maine and Massachusetts (Part A roll up number) |
| 14003 | New Hampshire and Vermont (Part A roll up number) |
| 14004 | NHIC, Corp. HHH MAC (eff.5/15/2009) (replaces FI #00180) JURISDICTION 14 - Part A MAC |
| 14011 | HH+H Region A and Maine (Part A roll up number) |
| 14013 | New Hampshire and Vermont (Part A roll up number) |

---

| 14014 | CT, ME, MA, NH, RI, VT - National Government Services, Inc., (HHH MAC) |
| --- | --- |
| 14101 | Maine - NHIC, Corp. (eff. 5/15/2009) (replaces FI #00180) JURISDICTION 14 - Part A MAC |
| 14102 | Maine - NHIC, Corp. (eff. 6/01/2009) (replaces carrier # 31142) Jurisdiction 14. Part B MAC (replaced by #14112 10/25/13) |
| 14111 | Maine - National Government Services Inc., (MAC - Part A) |
| 14112 | Maine - National Government Services Inc., (effective 10/25/2013 replaces Carrier #14102) |
| 14201 | Massachusetts - NHIC, Corp. (eff. 5/15/2009) (replaces FI #00181) JURISDICTION 14 - Part A MAC |
| 14202 | Massachusetts - NHIC, Corp. (eff. 6/01/2009) (replaces carrier # 31143) Jurisdiction 14. Part B MAC (replaced by #14212 10/25/13) |
| 14211 | Massachusetts - National Government Services Inc., (MAC - Part A) |
| 14212 | Massachusetts - National Government Services Inc., (effective 10/25/2013 replaces Carrier # 14202) |
| 14301 | New Hampshire - NHIC, Corp. (eff. 6/5/2009) (replaces FI #00270) JURISDICTION 14 - Part A MAC |
| 14302 | N. Hampshire - NHIC, Corp. (eff. 6/01/2009) (replaces carrier # 31144) Jurisdiction 14. Part B MAC (replaced by #14312 10/25/13) |
| 14311 | New Hampshire - National Government Services Inc., (MAC - Part A) |
| 14312 | New Hampshire - National Government Services Inc., (effective 10/25/2013 replaces Carrier # 14302) |
| 14330 | New York - GHI (eff. 1983) (replaced by MAC #13292 -- see below) |
| 14401 | Rhode Island - NHIC, Corp. (eff. 6/01/2009) (replaces FI #00370) JURISDICTION 14 - Part A MAC |

---

| 14402 | Rhode Island - NHIC, Corp. (eff. 5/01/2009) (replaces carrier # 00524) Jurisdiction 14. Part B MAC (replaced by #14412 10/25/13) |
| --- | --- |
| 14411 | Rhode Island - National Government Services Inc. (MAC - Part A) |
| 14412 | Rhode Island - National Government Services Inc., (effective 10/25/2013 replaces Carrier # 14402) |
| 14501 | Vermont - NHIC, Corp. (eff. 6/5/2009) (replaces FI #00270) JURISDICTION 14 - Part A MAC |
| 14502 | Vermont - NHIC, Corp. (eff. 6/01/2009) (replaces carrier # 31145) Jurisdiction 14. Part B MAC (replaced by #14512 10/25/13) |
| 14511 | Vermont - National Government Services Inc., (MAC - Part A) |
| 14512 | Vermont - National Government Services Inc., (effective 10/25/2013 replaces Carrier # 14502) |
| 15004 | CGS Administrators, LLC (replaces # 00011) HHH MAC |
| 15101 | Kentucky - CGS Administrators, LLC (eff.4/30/2011) (replaces FI #00160) JURISDICTION 15 - Part A MAC |
| 15102 | Kentucky - CGS Administrators, LLC |
| 15201 | Ohio - CGS Administrators, LLC (replaces # 00332) |
| 15202 | Ohio - CGS Administrators, LLC |
| 16003 | NHIC, Corp. (eff. 7/01/06) (replaces carrier #00811) Durable Medical Equipment (DME) MAC |
| 16013 | Noridian Healthcare Solutions, LLC (eff. 7/01/16) (replaces #16003) Durable Medical Equipment (DME) MAC Jurisdiction A |
| 16360 | Ohio - Nationwide Insurance Co. (eff. 1983) (term. 2002) |
| 16510 | West Virginia - Nationwide Insurance Co. (eff. 1983) (term. 2002) |
| 17003 | National Government Services, Inc. - (eff. 7/01/06) (replaces carrier # 00635) DME MAC |
| 17013 | CGS Administrators, LLC (eff. 7/01/16) (replaces #17003) Durable Medical Equipment (DME) MAC Jurisdiction B |
| 17120 | Hawaii Medical Service (term. 06/99) |

---

| 18003 | CGS Administrators, LLC (eff. 6/01/07) (replaces carrier #00885) Durable Medical Equipment (DME) MAC |
| --- | --- |
| 19003 | Noridan Administrative Services, LLC(eff. 10/01/06) (replaces carrier #05655) DME MAC |
| 21200 | Maine - Massachusetts BS (eff. 1983) (term. 1998) |
| 31140 | N. California - National Heritage Ins. (eff. 1997) (replaced by MAC #01102 -- see below) |
| 31142 | Maine - National Heritage Ins. (eff. 1998) (replaced with MAC # 14102 - see below) |
| 31143 | Massachusetts - National Heritage Ins. (eff. 1998) (replaced with MAC # 14202 - see below) |
| 31144 | New Hampshire - National Heritage Ins. (eff. 1998) (replaced with MAC # 14302 - see below) |
| 31145 | Vermont - National Heritage Ins. (eff. 1998) |
| 31146 | So. California - NHIC (eff. 2000) (replaced by MAC #01182-- see below) |
| 50333 | Travelers; Connecticut United Healthcare (terminated - date unknown) |
| 51051 | Aetna California - terminated 6/97 |
| 51070 | Aetna Connecticut - terminated 6/97 |
| 51100 | Aetna Florida - terminated 6/97 |
| 51140 | Aetna Illinois - terminated 6/97 |
| 51390 | Aetna Pennsylvania - terminated 6/97 |
| 52280 | NE -Wisconsin Physicians Service Insurance Corporation |
| 57400 | Puerto Rico - Cooperativa |
| 61000 | Aetna (term. 06/97) |
| 66001 | NORIDIAN (CAP DRUG CONTRACTOR) |
| 80883 | Contractor ID for Inpatient &amp; Outpatient Risk Adjustment Data (data not sent through CWF; but through Palmetto) |
| 80884 | Contractor ID for Physician Risk Adjustment Data (data not sent through CWF; but through Palmetto) |

---

### CMS Type of Service Table

**SELECT**

CLM_FED_TYPE_SRVC_CD,

CLM_FED_TYPE_SRVC_CD_DESC

**FROM** CMS_VDM_VIEW_PTB_PRD.V2_PTB_CLM_FED_TYPE_SRVC_CD

| CLM_FED_TYPE_SRVC_CD | CLM_FED_TYPE_SRVC_CD_DESC |
| --- | --- |
| 0 | Whole Blood |
| 1 | Medical Care |
| 2 | Surgery |
| 3 | Consultation |
| 4 | Diagnostic Radiology |
| 5 | Diagnostic Laboratory |
| 6 | Therapeutic Radiology |
| 7 | Anesthesia |
| 8 | Assistant at Surgery |
| 9 | Other Medical Items or Services |
| A | Used DME |
| B | High Risk Screening Mammography |
| C | Low Risk Screening Mammography |
| D | Ambulance |
| E | Enteral/Parenteral Nutrients/Supplies |
| F | Ambulatory Surgical Center (Facility Usage for Surgical Services) |
| G | Immunosuppressive Drugs |
| H | Hospice |
| J | Diabetic Shoes |
| K | Hearing Items and Services |
| L | ESRD Supplies |

---

| M | Monthly Capitation Payment for Dialysis |
| --- | --- |
| N | Kidney Donor |
| P | Lump Sum Purchase of DME, Prosthetics, Orthotics |
| Q | Vision Items or Services |
| R | Rental of DME |
| S | Surgical Dressings or Other Medical Supplies |
| T | Outpatient Mental Health Treatment Limitation |
| U | Occupational Therapy |
| V | Pneumococcal/Flu Vaccine |
| W | Physical Therapy |
| ~ | No Description Available |

### Provider Specialty Table

SELECT

CLM_FED_PRVDR_SPCLTY_CD,

CLM_FED_PRVDR_SPCLTY_CD_DESC

FROM CMS_VDM_VIEW_PTB_PRD.V2_PTB_CLM_FED_PRVDR_SPCLTY_CD

| CLM_FED_PRVDR_SPCLTY_CD | CLM_FED_PRVDR_SPCLTY_CD_DESC |
| --- | --- |
| 01 | General Practice |
| 02 | General Surgery |
| 03 | Allergy/Immunology |
| 04 | Otolaryngology |
| 05 | Anesthesiology |
| 06 | Cardiology |
| 07 | Dermatology |
| 08 | Family Practice |
| 09 | Interventional Pain Management |
| 10 | Gastroenterology |
| 11 | Internal Medicine |
| 12 | Osteopathic Manipulative Medicine |

---

| 13 | Neurology |
| --- | --- |
| 14 | Neurosurgery |
| 15 | Speech Language Pathologists |
| 16 | Obstetrics/Gynecology |
| 17 | Hospice and Palliative Care |
| 18 | Ophthalmology |
| 19 | Oral Surgery (dentists only) |
| 20 | Orthopedic Surgery |
| 21 | Cardiac Electrophysiology |
| 22 | Pathology |
| 23 | Sports Medicine |
| 24 | Plastic and Reconstructive Surgery |
| 25 | Physical Medicine and Rehabilitation |
| 26 | Psychiatry |
| 27 | Geriatric Psychiatry |
| 28 | Colorectal Surgery (formerly proctology) |
| 29 | Pulmonary Disease |
| 30 | Diagnostic Radiology |
| 31 | Intensive Cardiac Rehabilitation |
| 32 | Anesthesiologist Assistant |
| 33 | Thoracic Surgery |
| 34 | Urology |
| 35 | Chiropractic |
| 36 | Nuclear Medicine |
| 37 | Pediatric Medicine |
| 38 | Geriatric Medicine |
| 39 | Nephrology |
| 40 | Hand Surgery |
| 41 | Optometry |
| 42 | Certified Nurse Midwife (effective July 1, 1988) |

---

| 43 | Certified Registered Nurse Anesthetist (CRNA) |
| --- | --- |
| 44 | Infectious Disease |
| 45 | Mammography Screening Center |
| 46 | Endocrinology |
| 47 | Independent Diagnostic Testing Facility (IDTF) |
| 48 | Podiatry |
| 49 | Ambulatory Surgical Center |
| 50 | Nurse Practitioner |
| 51 | Medical supply company with orthotic personnel certified by an accrediting organization |
| 52 | Medical supply company with prosthetic personnel certified by an accrediting organization |
| 53 | Medical supply company with prosthetic/orthotic personnel certified by an accrediting organization |
| 54 | Medical supply company not included in 51, 52, or 53 |
| 55 | Individual orthotic personnel certified by an accrediting organization |
| 56 | Individual prosthetic personnel certified by an accrediting organization |
| 57 | Individual prosthetic/orthotic personnel certified by an accrediting organization |
| 58 | Medical Supply Company with registered pharmacist |
| 59 | Ambulance Service Supplier, e.g., private ambulance companies, funeral homes |
| 60 | Public Health or Welfare Agencies (Federal, State, and local) |
| 61 | Voluntary Health or Charitable Agencies (e.g., National Cancer Society, National Heart Association, Catholic Charities) |
| 62 | Psychologist (Billing Independently) |
| 63 | Portable X-Ray Supplier (Billing Independently) |

---

| 64 | Audiologist (Billing Independently) |
| --- | --- |
| 65 | Physical Therapist in Private Practice |
| 66 | Rheumatology |
| 67 | Occupational Therapist in Private Practice |
| 68 | Clinical Psychologist |
| 69 | Clinical Laboratory (Billing Independently) |
| 70 | Single or Multispecialty Clinic or Group Practice |
| 71 | Registered Dietician/Nutrition Professional |
| 72 | Pain Management |
| 73 | Mass Immunization Roster Billers (Mass Immunizers have to roster bill assigned claims and can only bill for immunizations) |
| 74 | Radiation Therapy Centers |
| 75 | Slide Preparation Facilities |
| 76 | Peripheral Vascular Disease |
| 77 | Vascular Surgery |
| 78 | Cardiac Surgery |
| 79 | Addiction Medicine |
| 80 | Licensed Clinical Social Worker |
| 81 | Critical Care (Intensivists) |
| 82 | Hematology |
| 83 | Hematology/Oncology |
| 84 | Preventive Medicine |
| 85 | Maxillofacial Surgery |
| 86 | Neuropsychiatry |
| 87 | All other suppliers, e.g., Drug Stores |
| 88 | Unknown Provider |
| 89 | Certified Clinical Nurse Specialist |
| 90 | Medical Oncology |
| 91 | Surgical Oncology |

---

| 92 | Radiation Oncology |
| --- | --- |
| 93 | Emergency Medicine |
| 94 | Interventional Radiology |
| 95 | Unknown Supplier |
| 96 | Optician |
| 97 | Physician Assistant |
| 98 | Gynecological/Oncology |
| 99 | Unknown Physician Specialty |
| A0 | Hospital |
| A1 | Skilled Nursing Facility |
| A2 | Intermediate Care Nursing Facility |
| A3 | Nursing Facility, Other |
| A4 | Home Health Agency |
| A5 | Pharmacy |
| A6 | Medical Supply Company with Respiratory Therapist |
| A7 | Department Store |
| A8 | Grocery Store |
| A9 | Indian Health Service Facility |
| B1 | Oxygen/Oxygen Related Equipment |
| B2 | Pedorthic Personnel |
| B3 | Medical Supply Company with Pedorthic Personnel |
| B4 | Rehabilitation Agency |
| B5 | Ocularist |
| C0 | Sleep Medicine |
| C1 | Centralized Flu |
| C2 | Indirect Payment Procedure |
| C3 | Interventional Cardiology |
| C4 | Non-Provider Convener Participants in the BPCI Advanced Model |
| C5 | Dentist |

---

| C6 | Hospitalist |
| --- | --- |
| C7 | Advanced Heart Failure and Transplant Cardiology |
| C8 | Medical Toxicology |
| C9 | Hematopoietic Cell Transplantation and Cellular Therapy |
| D1 | Medicare Diabetes Preventive Program |
| D2 | Restricted Use |
| D3 | Medical Genetics and Genomics |
| ~ | No Description Available |

---

SELECT

CLM_POS_CD,

CLM_POS_CD_DESC

FROM CMS_VDM_VIEW_PTB_PRD.V2_PTB_CLM_POS_CD

| CLM_POS_CD | CLM_POS_CD_DESC |
| --- | --- |
| 00 | Unassigned |
| 01 | Pharmacy (Effective October 1, 2005)- A facility or location where drugs and other medically related items and services are sold, dispensed, or otherwise provided directly to patients. |
| 02 | Telehealth (Effective January 1, 2017) - The location where health services and health related services are provided or received, through telecommunication technology |
| 03 | School (Effective January 1, 2003) - A facility whose primary purpose is education. |
| 04 | Homeless Shelter (Effective January 1, 2003) A facility or location whose primary purpose is to provide temporary housing to homeless individuals (e.g., emergency shelters, individual or family shelters). |
| 05 | Indian Health Service Free-standing Facility (Effective January 1, 2003) A facility or location, owned and operated by the Indian Health Service, which provides diagnostic, therapeutic (surgical and nonsurgical), and rehabilitation services to American Indians and Alaska Natives who do not require hospitalization. |
| 06 | Indian Health Service Provider-based Facility (Effective January 1, 2003) A facility or location, owned and operated by the Indian Health Service, which provides diagnostic, therapeutic (surgical and nonsurgical), and rehabilitation services rendered by, or under the supervision of, physicians to American Indians and Alaska Natives admitted a sinpatients or outpatients. |

---

| 07 | Tribal 638 Free-Standing Facility (Effective January 1, 2003) A facility or location owned and operated by a federally recognized American Indian or Alaska Native tribe or tribal organization under a 638 agreement, which provides diagnostic, therapeutic (surgical and nonsurgical), and rehabilitation services to tribal members who do not require hospitalization. |
| --- | --- |
| 08 | Tribal 638 Provider-Based Facility (Effective January 1, 2003) A facility or location owned and operated by a federally recognized American Indian or Alaska Native tribe or tribal organization under a 638 agreement, which provides diagnostic, therapeutic (surgical and nonsurgical), and rehabilitation services to tribal members admitted as inpatients or outpatients. |
| 09 | Prison/Correctional Facility (Effective July 1, 2006) A prison, jail, reformatory, work farm, detention center, or any other similar facility maintained by either Federal, State or local authorities for the purpose of confinement or rehabilitation of adult or juvenile criminal offenders. |
| 10 | Unassigned |
| 11 | Office - Location, other than a hospital, skilled nursing facility (SNF), military treatment facility, community health center, State or local public health clinic, or intermediate care facility (ICF), where the health professional routinely provides health examinations, diagnosis, and treatment of illness or injury on an ambulatory basis. |
| 12 | Home - Location, other than a hospital or other facility, where the patient receives care in a private residence. |
| 13 | Assisted Living Facility (Effective October 1, 2003)- Congregate residential facility with self-contained living units providing assessment of each resident’s needs and on-site support 24 hours a day, 7 days a week, with the capacity to deliver or arrange for services including some health care and other services |

---

| 14 | Group Home (Code effective, October 1, 2003; description revised,effective April 1, 2004) - A residence, with shared living areas, where clients receive supervision and other services such as social and/or behavioral services, custodial service, and minimal services (e.g., medication administration). |
| --- | --- |
| 15 | Mobile Unit (Effective January 1, 2003) - A facility/unit that moves from place-to-place equipped to provide preventive, screening, diagnostic, and/or treatment services. |
| 16 | Temporary Lodging (Effective April 1, 2008) - A short-term accommodation such as a hotel, camp ground, hostel, cruise ship or resort where the patient receives care, and which is not identified by any other POS code. |
| 17 | Walk-in Retail Health Clinic (Effective No later than May 1, 2010) - A walk-in health clinic, other than an office, urgent care facility, pharmacy or independent clinic and not described by any other Place of Service code, that is located within a retail operation and provides, on an ambulatory basis, preventive and primary care services. |
| 18 | Place of Employment/Worksite (Effective No later than May 1, 2013) - A location, not described by any other POS code, owned or operated by a public or private entity where the patient is employed, and where a health professional provides on-going or episodic occupational medical, therapeutic or rehabilitative services to the individual. |
| 19 | Off Campus-Outpatient Hospital (Effective January 1, 2016) - A portion of an off-campus hospital provider based department which provides diagnostic, therapeutic (both surgical and nonsurgical), and rehabilitation services to sick or injured persons who do not require hospitalization or institutionalization. |
| 20 | Urgent Care Facility (Effective January 1, 2003) - Location, distinct from a hospital emergency room, an office, or a clinic, whose purpose is to diagnose and treat illness or injury for unscheduled, ambulatory patients seeking immediate medical attention. |

---

| 21 | Inpatient Hospital - A facility, other than psychiatric, which primarily provides diagnostic, therapeutic (both surgical and nonsurgical), and rehabilitation services by, or under, the supervision of physicians to patients admitted for a variety of medical conditions. |
| --- | --- |
| 22 | On Campus-Outpatient Hospital (description revised January 1, 2016) - A portion of a hospital’s main campus which provides diagnostic, therapeutic (both surgical and nonsurgical), and rehabilitation services to sick or injured persons who do not require hospitalization or institutionalization. |
| 23 | Emergency Room-Hospital- A portion of a hospital where emergency diagnosis and treatment of illness or injury is provided. |
| 24 | Ambulatory Surgical Center - A freestanding facility, other than a physician’s office, where surgical and diagnostic services are provided on an ambulatory basis. |
| 25 | Birthing Center - A facility, other than a hospital’s maternity facilities or a physician’s office, which provides a setting for labor, delivery, and immediate postpartum care as well as immediate care of newborn infants. |
| 26 | Military Treatment Facility - A medical facility operated by one or more of the Uniformed Services. Military Treatment Facility (MTF) also refers to certain former U.S. Public Health Service (USPHS) facilities now designated as Uniformed Service Treatment Facilities (USTF). |
| 27 | Unassigned |
| 28 | Unassigned |
| 29 | Unassigned |
| 30 | Unassigned |
| 31 | Skilled Nursing Facility - A facility which primarily provides inpatient skilled nursing care and related services to patients who require medical, nursing, or rehabilitative services but does not provide the level of care or treatment available in a hospital. |

---

| 32 | Nursing Facility- A facility which primarily provides to residents skilled nursing care and related services for the rehabilitation of injured, disabled, or sick persons, or, on a regular basis, health-related care services above the level of custodial care to other than individuals with intellectual disabilities. |
| --- | --- |
| 33 | Custodial Care Facility - A facility which provides room, board and other personal assistance services, generally on a longterm basis, and which does not include a medical component. |
| 34 | Hospice - A facility, other than a patient's home, in which palliative and supportive care for terminally ill patients and their families are provided. |
| 35 | Unassigned |
| 36 | Unassigned |
| 37 | Unassigned |
| 38 | Unassigned |
| 39 | Unassigned |
| 40 | Unassigned |
| 41 | Ambulance—Land A land vehicle specifically designed, equipped and staffed for lifesaving and transporting the sick or injured. |
| 42 | Ambulance—Air or Water An air or water vehicle specifically designed, equipped and staffed for lifesaving and transporting the sick or injured |
| 43 | Unassigned |
| 44 | Unassigned |
| 45 | Unassigned |
| 46 | Unassigned |
| 47 | Unassigned |
| 48 | Unassigned |
| 49 | Independent Clinic (Effective October 1, 2003) - A location, not part of a hospital and not described by any other Place of Service code, that is organized and operated to provide preventive, diagnostic, therapeutic, rehabilitative, or palliative services to outpatients only. |

---

| 50 | Federally Qualified Health Center - A facility located in a medically underserved area that provides Medicare beneficiaries preventive primary medical care under the general direction of a physician. |
| --- | --- |
| 51 | Inpatient Psychiatric Facility - A facility that provides inpatient psychiatric services for the diagnosis and treatment of mental illness on a 24-hour basis, by or under the supervision of a physician. |
| 52 | Psychiatric Facility-Partial Hospitalization - A facility for the diagnosis and treatment of mental illness that provides a planned therapeutic program for patients who do not require full time hospitalization, but who need broader programs than are possible from outpatient visits to a hospital-based or hospital-affiliated facility. |
| 53 | Community Mental Health Center - A facility that provides the following services: outpatient services, including specialized outpatient services for children, the elderly, individuals who are chronically ill, and residents of the CMHC’s mental health services area who have been discharged from inpatient treatment at a mental health facility; 24 hour a day emergency care services; day treatment, other partial hospitalization services, or psychosocial rehabilitation services; screening for patients being considered for admission to State mental health facilities to determine the appropriateness of such admission; and consultation and education services. |
| 54 | Intermediate Care Facility/Individuals with Intellectual Disabilities - A facility which primarily provides health-related care and services above the level of custodial care to individuals but does not provide the level of care or treatment available in a hospital or SNF. |
| 55 | Residential Substance Abuse Treatment Facility - A facility which provides treatment for substance (alcohol and drug) abuse to live-in residents who do not require acute medical care. Services include individual and group therapy and counseling, family counseling, laboratory tests, drugs and supplies, psychological testing, and room and board. |

---

| 56 | Psychiatric Residential Treatment Center - A facility or distinct part of a facility for psychiatric care which provides a total 24-hour therapeutically planned and professionally staffed group living and learning environment. |
| --- | --- |
| 57 | Non-residential Substance Abuse Treatment Facility (October 1, 2003) - A location which provides treatment for substance (alcohol and drug) abuse on an ambulatory basis. Services include individual and group therapy and counseling, family counseling, laboratory tests, drugs and supplies, and psychological testing. |
| 58 | Non-residential Opioid Treatment Facility |
| 59 | Unassigned |
| 60 | Mass Immunization Center - A location where providers administer pneumococcal pneumonia and influenza virus vaccinations and submit these services as electronic media claims, paper claims, or using the roster billing method. This generally takes place in a mass immunization setting, such as, a public health center, pharmacy, or mall but may include a physician office setting. |
| 61 | Comprehensive Inpatient Rehabilitation Facility - A facility that provides comprehensive rehabilitation services under the supervision of a physician to inpatients with physical disabilities. Services include physical therapy, occupational therapy, speech pathology, social or psychological services, and orthotics and prosthetics services. |
| 62 | Comprehensive Outpatient Rehabilitation Facility A facility that provides comprehensive rehabilitation services under the supervision of a physician to outpatients with physical disabilities. Services include physical therapy, occupational therapy, and speech pathology services. |
| 63 | Unassigned |
| 64 | Unassigned |
| 65 | End-Stage Renal Disease Treatment Facility - A facility other than a hospital, which provides dialysis treatment, maintenance, and/or training to patients or caregivers on an ambulatory or home-care basis |

---

| 66 | Unassigned |
| --- | --- |
| 67 | Unassigned |
| 68 | Unassigned |
| 69 | Unassigned |
| 70 | Unassigned |
| 71 | State or Local Public Health Clinic - A facility maintained by either State or local health departments that provides ambulatory primary medical care under the general direction of a physician. |
| 72 | Rural Health Clinic - A certified facility which is located in a rural medically underserved area that provides ambulatory primary medical care under the general direction of a physician |
| 73 | Unassigned |
| 74 | Unassigned |
| 75 | Unassigned |
| 76 | Unassigned |
| 77 | Unassigned |
| 78 | Unassigned |
| 79 | Unassigned |
| 80 | Unassigned |
| 81 | Independent Laboratory - A laboratory certified to perform diagnostic and/or clinical tests independent of an institution or a physician's office |
| 82 | Unassigned |
| 83 | Unassigned |
| 84 | Unassigned |
| 85 | Unassigned |
| 86 | Unassigned |
| 87 | Unassigned |
| 88 | Unassigned |
| 89 | Unassigned |
| 90 | Unassigned |

---

| 91 | Unassigned |
| --- | --- |
| 92 | Unassigned |
| 93 | Unassigned |
| 94 | Unassigned |
| 95 | Unassigned |
| 96 | Unassigned |
| 97 | Unassigned |
| 98 | Unassigned |
| 99 | Other Place of Service - Other place of service not identified above. |
| ~ | No Description Available |

<u>Error Indicator Table</u>

SELECT

CLM_ERR_SGNTR_SK,

CLM_ERR_SGNTR_DESC

FROM CMS_VDM_VIEW_PTB_PRD.V2_PTB_CLM_ERR_SGNTR

| CLM_ERR_SGNTR_SK | CLM_ERR_SGNTR_DESC |
| --- | --- |
| -1 | ? |
| 0 | ? |
| 3 | ? |
| 4 | Invalid HCPCS |
| 5 | Invalid Specialty Code |
| 6 | Invalid Type of Service |
| 7 | Invalid Place of Service |
| 8 | Invalid HCPCS &amp; Specialty code |
| 9 | Invalid HCPCS &amp; Type of Service |
| 10 | Invalid HCPCS &amp; Place of Service |
| 11 | Invalid Specialty Code &amp; Type of Service |
| 12 | Invalid Specialty Code &amp; Place of Service |
| 13 | Invalid Type of service &amp; Place of Service |
| 14 | Invalid HCPCS, Specialty Code, &amp; Type of Service |

---

| 15 | Invalid HCPCS, Specialty Code &amp; Place of Service |
| --- | --- |
| 16 | Invalid HCPCS, Type of Service, &amp; Place of Service |
| 17 | Invalid HCPCS, Specialty Code, Type of Service, &amp; Place of Service |
| 18 | Invalid Specialty Code, Type of Service, &amp; Place of Service |
| 19 | ? |
| 20 | ? |
| 21 | ? |

## Disclaimer

New HCPCS codes **may be added, and existing codes may be updated or deleted during the year.**