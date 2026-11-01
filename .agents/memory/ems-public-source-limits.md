---
name: EMS public-source limits
description: Scope and correct interpretation of public NPI, Medicare enrollment, NEMSIS, and Florida EMS license sources.
---

Treat a CMS NPPES Type 2 organization result as an identity candidate only. CMS explicitly warns that an NPI does not establish licensure or credentialing. Preserve the original NPPES name, NPI, address purpose, taxonomy entries, and registry update date as source-record fields; do not auto-merge these into operational agency facts.

NEMSIS public dashboards are aggregated. They can support national or regional operational context, but they are not an agency-by-agency public license registry.

Florida's Department of Health publishes a licensed EMS provider roster PDF from its EMS service-provider page. The roster includes provider identity, address, county, license number, type, and issue/expiration dates; use the current document and its own processed date. A source link is not an agency-level match until the record is independently matched.

CMS Medicare Fee-for-Service Public Provider Enrollment data is a quarterly snapshot of active Medicare enrollment. It is not a full EMS provider inventory or state license roster; an NPI crosswalk should be described as Medicare enrollment only.

**Why:** a public record can be authoritative for one field while being insufficient evidence for an agency's current operations, licensure, or equipment.

**How to apply:** keep candidate rows separate from app agency facts, show the exact source field and date, link users to the record, and label each dataset by its actual coverage and purpose.
