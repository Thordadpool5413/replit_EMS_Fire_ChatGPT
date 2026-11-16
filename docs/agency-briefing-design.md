# Agency briefing design implementation

Built locally from GitHub main; no Replit work or deployment.

- Full recorded address is visible below provider name. New identity strip brings street address, copy/directions, main phone availability, website and up to three recorded contacts above profile navigation. Missing details and unconfirmed purchasing authority remain explicit. HTTP(S) website validation prevents unsafe links.
- Consistent outline symbols for address, people and communications, aligned contact actions, smaller sidebar logo, restrained typography and compact laptop control/row sizing.
- Deal Story is a primary agency tab. The main Prepare the conversation action now opens it rather than a separate meeting-summary section.
- New editable discovery plan captures objective, hypothesis, stakeholders and answers, with saved per-agency device drafts. Drafts use existing workspace backup. Next commitment creates a standalone task through existing durable task persistence, then becomes available in Activity. Failed task saves retain the text; failed draft storage is visible.
- Reduced county card padding, equipment illustration size, profile detail padding and contact row height. Expanded profile detail bodies use natural height to avoid clipped content. Map sizing remains independently owned.
- Generated prospects do not feed device quantities into the Deal Story opening or TCO input eligibility.

Validation: 197 unit/component tests, workspace type checks, stylesheet ownership and production build. Added rendered component tests for full address, contacts, missing identity, unsafe website rejection and the discovery-plan entry points.

Remaining verification: Chromium cannot launch because its socket operation is blocked, so no claim is made of a visually verified 1366x768/mobile layout or a resolved screenshot repetition bug. The long screenshots require reproduction to distinguish repeated rendering from stitching artifacts. The working discovery plan currently saves to the device and workspace backup; cloud collaboration for that plan is not implemented. Other profile features retain their existing behavior.
