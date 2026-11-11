# Physical phone acceptance checks

**Status: not run on physical devices.** Chromium viewport/touch emulation does not establish that Safari, native keyboards, installation menus or OS permission prompts work correctly.

Run on both an iPhone with Safari and an Android phone with Chrome, first in the browser and then as an installed PWA. Record OS/browser versions, orientation, result and a screenshot for any failure.

## Opening screens and data

- Open with the phone's system theme set to dark. The app should still start in Daylight.
- Open Agencies. The area/count summary and search should precede secondary controls.
- Expand **Filters & view**, select a discipline and state, and change the view/sort. Collapse and reopen: selections and results must persist, and applied constraints/current view must remain identifiable.
- Search for a string with no results. A real **0** and a useful empty-result explanation should appear, not a missing-value dash. Clear search and confirm records return.
- Open a state county directory. Read a county card in order: identity, population/response, care access, community context, FEMA risk, supporting geography and sources.
- Confirm units stay with numbers, no label crosses another field, and ZIPs/places/source access remain visible.
- Open a county provider list. Summary and search should be first; city, discipline, sort and view controls must remain usable when expanded.
- Open an EMS profile and a fire profile. Known equipment/software and their evidence must be distinguishable from unknown information, historical records and modeled estimates.

## Keyboard, safe areas and accessibility

- Focus search and form fields with the native keyboard open. The focused field, clear/cancel controls and primary action must be reachable without keyboard or navigation overlap.
- Rotate with the keyboard open and again after closing it. Check both viewport height and preserved values.
- Check top/bottom safe areas, the iPhone home indicator and browser-toolbar expansion/collapse.
- Increase system/browser text size. Content may grow vertically but must not clip or overlap.
- Use VoiceOver/TalkBack to confirm filter expansion state, labels, source links and reading order.

## Installation and offline behavior

- Use the browser's actual supported installation flow. The app must not claim installation merely because a prompt was accepted.
- Launch from the home-screen icon. Check branding, icon, orientation and navigation.
- After an online launch, enable airplane mode and reopen. The cached Home/app shell should load with an honest offline status.
- Do not expect live agency sources, uncached research pages or Google map tiles to work offline. Missing live information must not become zero or appear verified.

## Permissions and external actions

- Test location permission once with **Allow** and once with **Deny**. Denial should have an explicit explanation or retry path; no inferred current location.
- Check Directions, phone, email and source-link handoffs. Do not place calls or send messages as part of a layout check.
- Revoke location permission in OS settings and verify the app recovers without a blank screen.

## Updates and local research

- With a new build available, leave a fact review unfinished and try updating. The app should require finishing/saving it first.
- Cancel an update confirmation: the current screen and local data must remain.
- Save/finish the review, explicitly approve the update and confirm the app reloads without losing saved local research.
- Use disposable test notes, not real claim data, for this check. Never clear browser storage to force an update.

## Result record

| Device / OS / browser | Browser or PWA | Check | Result | Evidence / issue |
| --- | --- | --- | --- | --- |
| Not yet tested | — | — | Not run | Physical device required |
