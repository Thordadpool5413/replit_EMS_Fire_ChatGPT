# Agency briefing redesign

The profile now places the name, agency type and next action in a navy masthead. The location and people briefing follows it immediately, ahead of topic navigation. It replaces the former disconnected strip with one location column and up to three contact cards. Tablet and phone widths switch the contacts to compact rows.

Recorded address, copy, directions, main telephone and website have explicit labels. Missing phone and website values are displayed. The header main-phone action now uses headquartersPhone only, rather than silently selecting an individual contact's phone.

Contacts show names, actual titles, communication availability, and source disclosures. The current contact schema does not store established purchasing authority separately, so this view marks authority unconfirmed instead of inferring it from title or identity verification. Source periods and local review dates are labeled separately; absence remains explicit. Unsafe website/source URLs are not linked.

Outline icons share the same stroke weight and sizes. Contact initials identify people; numbered positions are visual ordering only. The dark masthead keeps the agency identity distinct from the lighter working panels. Source details remain in flow rather than floating over adjacent cards.

Validation includes server-rendered briefing tests for contact limits, missing fields, evidence display, safe links and authority labels; workspace type checking, unit suite, style ownership, and production build. Physical device and browser-rendered visual verification remain outstanding because the local Chromium audit could not start in this environment.
