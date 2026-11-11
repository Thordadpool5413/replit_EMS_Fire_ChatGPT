import { readFile, writeFile } from 'node:fs/promises';
const root='generated-artifacts/agency-transformation';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function image(file,label){
  const data=await readFile(`${root}/${file}`);
  return `<figure><img src="data:image/png;base64,${data.toString('base64')}" alt="${escape(label)}"><figcaption>${escape(label)}</figcaption></figure>`;
}
const beforeAfter=await Promise.all([
  image('before/ems-1366-overview.png','Before · Cleveland EMS · 1366 × 768'),
  image('after/ems-1366-overview.png','After · Cleveland EMS · 1366 × 768'),
  image('before/fire-1366-overview.png','Before · Miami-Dade Fire Rescue · 1366 × 768'),
  image('after/fire-1366-overview.png','After · Miami-Dade Fire Rescue · 1366 × 768'),
  image('before/ems-390-overview.png','Before · Cleveland EMS · 390 × 844'),
  image('after/ems-390-overview.png','After · Cleveland EMS · 390 × 844'),
]);
const details=await Promise.all([
  image('after/ems-1366-equipment.png','Equipment & technology · recorded inventory and buy-back checks'),
  image('after/ems-1366-purchasing.png','Purchasing & funding · recorded findings and chronology'),
  image('after/fire-1366-decision_makers.png','Decision makers · compact directory with source context'),
  image('after/fire-1366-operations.png','Operations & clinical · agency-appropriate recorded figures'),
  image('after/ems-1366-medicare.png','Financial intelligence · reported fields and hypothetical scenarios separated'),
  image('after/ems-1366-evidence.png','Evidence & verification · individual-field review workspace'),
  image('after/ems-390-equipment-content.png','Phone equipment · scrolled to the section, showing the stacked inventory'),
  image('after/fire-390-evidence-content.png','Phone evidence · scrolled to the section, showing the native fact picker and review form'),
]);
const qa=JSON.parse(await readFile(`${root}/qa-summary.json`,'utf8'));
const files=[
  'components/FocusedProviderProfile.tsx — profile composition, section ownership, guarded navigation and agency-switch resets',
  'components/profile/ProfileCommandOverview.tsx — four account summaries, next action, contact, dates and research gaps',
  'components/profile/AgencyIntelligenceBrief.tsx — focused equipment, purchasing and operational views',
  'components/profile/DecisionMakerDirectory.tsx — compact, title-based directory without inferred purchasing authority',
  'components/profile/ProcurementTimeline.tsx — purchasing chronology and past/recurring/upcoming distinctions',
  'components/profile/ClinicalMeasures.tsx — recorded rates, metric definitions, source periods and unavailable states',
  'components/profile/FinancialIntelligence.tsx — one selected comparison, assumptions and reconciled calculations',
  'components/profile/FieldNotesPanel.tsx — existing note workflow with an actual due-date input',
  'components/profile/ProfileDetail.tsx — dense research details without repeated parent sections',
  'components/profile/FactReviewPanel.tsx and FactReviewPanel.css — field-level review, correction and history',
  'services/factReviewStore.ts — append-only, agency-specific browser-local review records',
  'styles/profile/theme-bridge-command.css and index.css — profile-scoped visual system',
  'types/index.ts — honest “award recorded; disbursement not reported” profile status',
  'components/CompetitiveBattlecardView.tsx — shared wording corrected from guaranteed credit to an illustrative assumption',
  'Profile and persistence tests; capture/report scripts; generated-output ignore rules',
];
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agency profile transformation — implementation and QA</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#142238;font:15px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1250px;margin:auto;padding:36px 24px}header{border-top:5px solid #2454c6;padding:22px 0 28px}h1{font-size:32px;line-height:1.2;letter-spacing:-.035em;margin:10px 0}h2{font-size:23px;letter-spacing:-.025em;margin:0 0 12px}h3{font-size:17px}section{background:#fff;border:1px solid #dce4ef;border-radius:12px;padding:26px;margin:18px 0}.eyebrow{color:#087f8c;font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase}.sub{color:#526378}.notice{padding:13px 16px;background:#e9f5f4;border-left:3px solid #087f8c}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0;background:#f7f9fc;border:1px solid #dce4ef;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{font-size:13px;color:#526378;padding:12px 14px}li{margin:6px 0}code{font:12px ui-monospace,monospace;overflow-wrap:anywhere}.checks{padding-left:20px}.limitations{border-left:4px solid #b97713}.metric{font-variant-numeric:tabular-nums;font-weight:700} @media(max-width:700px){main{padding:18px 12px}section{padding:18px}.gallery{grid-template-columns:1fr}h1{font-size:26px}}@media print{body{background:#fff}section{break-inside:avoid}figure{break-inside:avoid}.gallery{display:block}figure{margin:14px 0}}
</style></head><body><main><header><div class="eyebrow">EMS & Fire Territory Intelligence</div><h1>Individual agency profile transformation</h1><p class="sub">Implementation, actual browser evidence, and verification limits. This report documents development Preview, not a published release.</p><p class="notice">Agency intelligence is provided for research and planning. Users must independently verify all information before relying on it.</p></header>
<section><h2>1. What was implemented</h2><p>A profile-only command workspace with a compact identity header, one seven-section navigation system, an executive account briefing and focused detailed sections. Equipment, procurement, people, operations, financial scenarios and evidence no longer appear as one expanded report.</p><p>The overview surfaces recorded equipment, purchasing context, people and operational scale alongside a practical next action. Missing data remain missing; unconfirmed research is preserved.</p></section>
<section><h2>2. Files and components</h2><p class="sub">App paths below are relative to artifacts/ems-territory-intelligence/src unless stated otherwise.</p><ul>${files.map(f=>`<li><code>${escape(f)}</code></li>`).join('')}</ul></section>
<section><h2>3. Visual changes and before/after evidence</h2><p>Actual running profiles at matching dimensions. The new composition places navigation and meaningful intelligence ahead of deep research. Topic color and icons support the reading order rather than replacing labels. Phone layouts use stacked content and native section/fact pickers.</p><div class="gallery">${beforeAfter.join('')}</div></section>
<section><h2>4. Functional improvements</h2><ul><li>Prepare for meeting reaches the agency’s deterministic briefing with recorded systems, cited opportunities and five discovery questions; copy and text download remain available.</li><li>Equipment inventory and buy-back research retain their existing source, eligibility, quote and device-check workflows.</li><li>Fact review supports review, confirmation, correction, discrepancy flags and notes, with reviewer name, method, date, source snapshot, original value and history.</li><li>Reviewing a model does not review quantity, age, warranty or supplier. Corrections are research overlays, not silent rewrites of imported records or calculations.</li><li>Unsaved fact reviews are guarded on fact selection, section navigation, profile exit and browser unload.</li><li>Financial inputs separate reported inventory from scenario units; trade-in is capped transparently, used once in capital, and excluded from operating comparisons.</li><li>Existing bookmarks, route tools, stage changes, comparison, registry lookup, sources, field notes and dossier access are retained.</li></ul></section>
<section><h2>5. Defects corrected</h2><ul><li>Removed Expand All and assigned each parent content group to one section. Split apparatus/receiving-hospital content from the defibrillator fleet ownership key.</li><li>Moved five-year financial comparisons out of Purchasing and replaced modeled clinical uplift on profiles with reported measures and explicit definitions.</li><li>Stopped counting populated fields as source-mapped evidence.</li><li>Stopped treating a manufacturer name alone as a specific monitor-model match. Unknown matches require an explicit comparison assumption.</li><li>Reconciled operating costs with the chart/table totals and removed duplicate trade-in benefit from that view.</li><li>Flagged inconsistent or out-of-range payer percentages without changing their displayed original values.</li><li>Past contract dates are history; a grant award is not an application deadline or proof that funds were disbursed.</li><li>Replaced the fixed note due date with a date control. Agency switching resets transient scenario and section state.</li><li>Corrected low-contrast source badges and replaced the mobile evidence list’s nested scroll with a native fact picker.</li></ul></section>
<section><h2>6. Agency variants tested</h2><ul><li>Real populated EMS record: Cleveland Division of Emergency Medical Service — rendered in the running app.</li><li>Real combined fire/EMS record: Miami-Dade County Fire Rescue Department — rendered in the running app.</li><li>Sparse EMS and fire-only/rescue records: isolated component-test fixtures; not inserted into app data or represented as real agency facts.</li></ul></section>
<section><h2>7. Detailed section evidence</h2><p>Actual running sections. Phone detail captures are scrolled to the section content; the before/after overview captures above show the opening viewport. Deeper preserved reference panels remain available by scrolling or opening their details.</p><div class="gallery">${details.join('')}</div></section>
<section><h2>8. Executed checks</h2><ul class="checks">${qa.checks.map(c=>`<li>${escape(c)}</li>`).join('')}</ul><h3>Interaction test findings</h3><p>${escape(qa.browser)}</p></section>
<section class="limitations"><h2>9. Limitations and unverified items</h2><ul>${qa.limitations.map(c=>`<li>${escape(c)}</li>`).join('')}</ul><p>No build result or screenshot is a certification that the underlying agency information is correct. Visual quality remains for user review; this report does not assign a design score.</p></section>
<section><h2>10. Scope confirmation</h2><p>The redesign is confined to individual EMS/fire agency profiles and their supporting components. No intentional redesign was made to Home, national/state/county maps, search results, sidebar/navigation, Opportunities, Territory, Field Work, specialist workspaces, settings, import pipelines, branding, authentication or PWA metadata.</p><p>Shared changes are limited to importing the scoped stylesheet, extending a status type for honest grant presentation, and correcting a battlecard phrase that previously called an illustrative credit “guaranteed.” No database migration or cloud review sync was introduced.</p></section>
</main></body></html>`;
await writeFile(`${root}/agency-profile-implementation-report.html`,html);
console.log(`${root}/agency-profile-implementation-report.html`);
