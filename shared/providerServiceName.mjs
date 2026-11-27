/** Suppress facility, government parent and supplier listings unless the source identifies an operating service. */
export function unrelatedProviderName(name) {
  return /\b(?:hospitals?|clinics?|medical cent(?:er|re)|health systems?|holdings?|nursing homes?|schools?|universit(?:y|ies)|police|sheriff|dentist|pharmacy|training|supply|equipment)\b/i.test(name) && !hasProviderServiceName(name);
}
/** A billing organization's legal name alone can identify a parent or facility.
 * Use a named operating service for the public directory. USFA has its own
 * department identifiers and does not need this name-based fallback.
 */
export function hasProviderServiceName(name) {
  const service = name.replace(/\bE\.M\.S\.?/gi, 'EMS');
  return /\b(?:ambulances?|EMS|emergency medical services?|emergency medical transport(?:ation)?|fire(?:fighters?|\s+(?:and\s+)?(?:rescue|department|district|protection|company|brigade|emergency))|rescue (?:squad|service|department)|paramedic(?:s| services?)?)\b/i.test(service)
    && !/\b(?:equipment|manufacturing|consulting|academy|training center|supply|billing services?)\b/i.test(service);
}

/** Shared eligibility for stored accounts entering the app or the agency API. */
export function isAgencyOperator(record) {
  const name = String(record.name ?? '');
  const native = record.registryIdentity ?? {};
  if (unrelatedProviderName(name)) return false;
  if (native.sourceName === 'USFA NFDR' || native.sourceName === 'NERIS') return true;
  if (hasProviderServiceName(name)) return true;
  if (native.sourceName === 'NPPES') return false;
  return /\b(?:fire|EMS|ambulance|paramedics?)\b/i.test(String(record.agencyType ?? '')) ||
    (native.sourceName === 'State EMS' && !!native.serviceLevel && native.serviceLevel !== 'None');
}
