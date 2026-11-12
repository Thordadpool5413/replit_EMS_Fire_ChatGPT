---
name: App-wide visual density
description: User-stated sizing preference for the EMS & Fire Territory Intelligence app across screens.
---

Do not show the standalone “Recommended next action” section on individual EMS, fire or combined agency profiles.

**Why:** The user explicitly asked to remove that section.

**How to apply:** Keep the other profile sections and field-note functionality. This does not request removing evidence-backed opportunity findings or their supporting explanations.

Laptop size reductions must exclude Home; leave its current map, sizing and controls unchanged.

**Why:** The user explicitly said “everything but the homescreen needs to be reduced in size” on laptops.

**How to apply:** Scope compact spacing and display typography to non-Home workspaces, agency profiles and their dialogs. Preserve mobile layouts, readable labels and all available information.

Keep the entire app compact, clean, and scannable on laptop and phone. Reduce oversized cards, padding, spacing, typography, and persistent chrome that make screens feel overwhelming, but do not shrink text or controls until they become hard to read or use. For county directories, retain readable metadata and distinct metric hierarchy instead of compressing everything into tiny inline text; at short laptop heights, keep primary sidebar destinations and utility labels accessible without changing the logo. Preserve the map-only Home screen and all available data; remove duplicate or non-actionable notices rather than useful workflows. Avoid mock alerts and repeated connectivity popups, while retaining meaningful errors, offline-save status, and neutral source/estimate context.

**Why:** The user said the full app looked too large and overwhelming on a laptop and asked for a cleaner experience throughout the app, then asked to remove warnings and notifications that do not help end users. They later called out that over-compressed county cards and hidden sidebar destinations looked unprofessional.

**How to apply:** Tune shared shell and component density consistently across workspaces; check laptop and phone layouts, maintain readable type and tap targets, and keep all secondary information accessible rather than deleting it. Do not seed simulated alert feeds or show repeated network-state toasts; keep genuine errors, sync/offline consequences, and data-source or estimate disclosures.

For EMS and Fire profiles, use an agency intelligence brief: one identity/contact header, one agency-specific operational snapshot, and findings paired with their basis and a suggested next step. Distinguish EMS, fire, and combined operations without duplicate summaries. Use recognizable unboxed icons, aligned numbers and units, restrained colors, and shared theme tokens. Start supporting detail panels collapsed and avoid repeating the same figures in their collapsed labels; retain full facts and citations when expanded, and keep registry, planning, assessment, and review details at the profile end.

Individual profile cards and display fonts must be smaller, not merely restyled.

**Why:** After the icon/visual polish, the user repeated that the profile sheets were not impressive or polished and said “the cards and fonts needs to be reduced in size too. everything is too large.”

**How to apply:** Reduce actual rendered header, summary and equipment-block heights on laptop and phone through tighter typography and layout. Keep readable detail text, source notices and touch targets; more icon decoration is not a substitute for smaller, better-organized profiles. Do not repeat long contact names and roles in the executive snapshot when the full contact panel already displays them: a short contact count prevents that repetition from stretching all summary cards.

Current technology and equipment identification is a primary profile goal, not just supporting detail. Keep the installed-technology summary prominent on phones rather than burying all equipment in collapsed panels.

**Why:** The user clarified: “the goal is to identify what current technology and or equipment is being used as well.”

**How to apply:** Prioritize available device and software information alongside the agency overview. Distinguish reported equipment from historical purchases or planned replacements, and do not imply a dated or unconfirmed reference proves current use.

Include buy-back insights and knowledge alongside the prominent equipment information in agency profiles.

**Why:** The user explicitly requested “include buy-back insights and knowledge.”

**How to apply:** Distinguish cash buy-back from trade-in credit and general preparation guidance from agency-specific offers. Keep illustrative values clearly separate from documented quotes; never infer eligibility or guaranteed value from the equipment inventory alone.

**Why:** The user said profile sheets looked repetitive and oversized, asked for essentials first with secondary material moved to the bottom, and approved the agency intelligence brief redesign for both EMS and fire profiles.

**How to apply:** Keep one identity header, one operations summary, and one topic bar; derive findings from available records without invented thresholds or verification claims. Keep working-reference values visible until the user confirms or corrects them. Collapse supporting panels by default, reset profile state when the agency changes, and verify source details and layout on phone and laptop. Carry the same hierarchy into paper-safe exports.

Use recognizable topic-specific icons paired with clear labels throughout the app's data and information displays, including individual EMS and fire profile sheets. Icons must support readable text, not replace it or introduce decorative boxes.

**Why:** The user explicitly requested icons and labels for everything specific to data and information across the entire app, including individual profiles, to improve attention and the visual experience.

**How to apply:** Use the same topic icon consistently across workspaces, county displays, agency cards, profiles, comparisons, specialist information, and printable briefs. Put table icons in headers instead of repeating them in every cell. Preserve source-defined risk colors and avoid implying an unvalidated status through an icon or color.

The sidebar needs even layout, not merely enough space to fit. Keep navigation and utility rows aligned in width, height, icon position, and text baseline, with deliberate spacing between groups.

**Why:** The user again rejected the sidebar after the no-scroll correction, saying that not everything was evenly displayed and laid out.

**How to apply:** Check actual row and icon geometry as well as overflow. Avoid mixing cramped half-width utility controls with full-width destinations or introducing large gaps between related groups. Preserve the logo.

County cards should communicate a visual story through related groups, rather than a flat inventory of numbers. Apply compact sizing to all county cards, not only individual provider profiles or the selected county. Use the user's reading order: county identity → population and response → care access → risk → sources, with community context and supporting geography clearly labeled and all facts visible. Balance the county preview with the adjacent state map.

**Why:** The user repeatedly rejected both multicolor metric grids and compressed inline numbers, then specifically requested a visual story of the county's data and a preview sized to match its map. They reiterated that “all of the county cards are still to big.”

**How to apply:** Group related figures with clear captions and a deliberate reading order. Do not mistake smaller text or more decorative color for better hierarchy, and verify the actual map/preview geometry at laptop widths.

Mobile opening views should put the agency, county or equipment summary before secondary controls. Group those controls without silently hiding applied constraints, and explain missing model inputs instead of repeating “Not calculated.”

**Why:** The user explicitly selected these as the next mobile-polish goals.

**How to apply:** Keep summary and search immediately available, retain filter state when controls collapse, and use truthful missing-input explanations without inventing values or altering model eligibility.

The map/preview pair and individual county cards must be roughly half the height of the rejected oversized grouped layout, not taller “polished” versions.

**Why:** The user specifically repeated “1/2 its size” for both surfaces after the grouped redesign increased their height.

**How to apply:** Measure actual rendered laptop heights before declaring a density improvement. Remove nested panels and wasted vertical structure before reducing type size; retain all details and allow mobile content to grow naturally. The later approved intelligence-brief redesign prioritizes readable metric labels and figures over the former fixed height cap; disclose a height increase instead of silently shrinking type to pass a density check.

Compactness alone is not acceptance: county previews and cards must remain easy to read and understand, not compressed into running text.

**Why:** After the size reduction, the user again rejected both views as visually difficult and asked for clutter-free, clean, sharp, professionally formatted information that looks trustworthy. They also rejected the later measured reductions because “nothing is cleanly formatted.”

**How to apply:** Keep metric label/value ordering consistent, clearly separate source-defined hazard information from operational figures, and label place ZIPs instead of presenting bare numbers beside links. Check the final screenshots for aligned fields and clear reading order; passing height and page-overflow checks does not establish that the visual design is acceptable. Also check content against its card bounds: hidden overflow can conceal an oversized inner grid without making the page scroll horizontally.

County views need purposeful icons, better labels, and restrained color as well as readable spacing.

**Why:** The user rejected the plain label/value redesign and explicitly requested icons, color, and improved layout for both previews and directory cards.

**How to apply:** Give the primary individual metrics recognizable icons, including population, transport time, and cardiac arrests; section-level icons alone do not satisfy this requirement. Use unboxed icons, not colored icon tiles or ornamental county emblems: the user subsequently rejected those decorations as clutter. Do not turn every number into a different color. Preserve FEMA categories and distinguish a cardiac topic accent from a risk assessment.

Use the intelligence-brief direction for county previews and directory cards: stronger typography, fewer boxes, and clear hierarchy rather than a clinical dashboard.

**Why:** The user explicitly chose “Intelligence brief” after rejecting the tiled metric layout and small ornamental icons.

**How to apply:** Make county identity and operational figures prominent, use a few purposeful section icons, and keep geography and sources visible but secondary. Do not interpret this choice as approval of a particular implementation.

Measure the rendered geography and card content, not just the size of their enclosing panels.

**Why:** The user rejected a wide Home map panel whose stacked controls left the U.S. geography small, and county cards whose responsive label heights and wrapped actions created wasted vertical space.

**How to apply:** At the same laptop viewport, compare the actual geographic bounds and card heights. Check the narrow half-width county cards too; roomy full-width previews can conceal wrapping and spacing problems. Preserve readable text and visible details rather than meeting size goals through microtype.

When the user requests a percentage reduction in county cards, target rendered height on both laptop and phone, not a uniform scale transform.

**Why:** The user again rejected the compact version and explicitly requested a further 25% reduction. Phone wrapping and oversized repeated link targets can retain substantially more height than the same desktop card.

**How to apply:** Reflow supporting figures into aligned label/value rows and shorten unambiguous captions before reducing numeric hierarchy. Preserve all facts and icons. Secondary text links may use compact targets no smaller than 24 CSS pixels with clear spacing; keep the primary phone Inspect action at 44 pixels. Allow dense records and enlarged text to grow rather than clipping them to a fixed height.

County directory cards must share a consistent size within the displayed directory, not end at different heights based on their number of places.

**Why:** The user explicitly requested “make sure that all the cards are the same size” alongside further percentage reductions.

**How to apply:** Use responsive equal-height grid tracks that expand with the longest visible record rather than a fixed height or hidden content. Preserve all facts and allow enlarged text to grow. Measure percentage changes against the current version, and distinguish laptop reductions from phone reductions when reporting results. The user later rejected squeezed rows with unused space below: redistribute the available height among the content groups instead of pooling it above sources. Do not interpret the earlier reduction targets as permission to crowd the labels and figures.
