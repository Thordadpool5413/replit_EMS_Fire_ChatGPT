/** A billing organization's legal name alone can identify a parent or facility.
 * Use a named operating service for the public directory. USFA has its own
 * department identifiers and does not need this name-based fallback.
 */
export function hasProviderServiceName(name: string): boolean {
  const service = name.replace(/\bE\.M\.S\.?/gi, 'EMS');
  return /\b(?:ambulances?|EMS|emergency medical services?|emergency medical transport(?:ation)?|fire(?:fighters?|\s+(?:and\s+)?(?:rescue|department|district|protection|company|brigade|emergency))|rescue (?:squad|service|department)|paramedic(?:s| services?)?)\b/i.test(service)
    && !/\b(?:equipment|manufacturing|consulting|academy|training center|supply|billing services?)\b/i.test(service);
}
