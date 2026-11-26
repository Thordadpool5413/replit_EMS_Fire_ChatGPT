"""Publication contract for newly retained primary-address and inferred-site evidence."""
import math
from address_normalization import physical_address,normalize_street,normalized_city,source_street_line

METHODS={'neris-reported-address','nad-address-point','usgs-structure-address','hifld-ems-address','hifld-fire-address','overture-address'}

def rebuilt_entry(entry):
    match=entry.get('match') or {}
    return bool(entry.get('primaryAddressEvidence') or match.get('sourceAddress') or match.get('method') in METHODS-{'neris-reported-address','nad-address-point'})

def address_correspondence(address,match):
    source=match.get('sourceAddress');basis=match.get('matchBasis')
    if not physical_address(address) or not isinstance(source,dict) or set(source)!={'street','city','state','zip'} or not all(isinstance(v,str) for v in source.values()):return False
    if source['state']!=address['state'] or normalize_street(source_street_line(source['street']))!=normalize_street(source_street_line(address['street'])):return False
    if match.get('matchedAddress')!=', '.join((source_street_line(source['street']),source['city'],source['state'],source['zip'])):return False
    city=normalized_city(source['city'])==normalized_city(address['city']);postal=source['zip']==address['zip']
    if basis=='normalized-street-city-state-zip':return city and postal
    if basis=='normalized-street-state-zip':return postal
    if basis=='normalized-street-city-state':return city and match['method'] in ('neris-reported-address','nad-address-point')
    return False

def validate_primary_entry(entry,national_row=None):
    match=entry.get('match');county=entry.get('countyFips')
    if entry.get('status')!='mapped' or not isinstance(match,dict) or match.get('method') not in METHODS or not address_correspondence(entry.get('address'),match):return False
    if entry.get('sourceCounty') and entry['sourceCounty']!=county or match.get('point',{}).get('countyFips')!=county:return False
    y,x=match.get('latitude'),match.get('longitude')
    if not all(type(v) in (int,float) and math.isfinite(v) for v in (y,x)) or abs(y)>90 or abs(x)>180 or not (y or x):return False
    proof=entry.get('primaryAddressEvidence')
    if proof:
        if proof.get('method')=='neris-department-site-correlation':
            from recover_neris_primary import validate_primary_evidence
            return validate_primary_evidence(proof,entry,national_row)
        if proof.get('method')=='neris-department-geocoded-site-correlation':
            from retain_neris_geocoded_sites import validate_geocoded_primary_entry
            return validate_geocoded_primary_entry(entry)
        return False
    if match['method']=='neris-reported-address':
        from recover_neris_primary import validated_catalog
        candidates,originals,national=validated_catalog();candidate=candidates.get(entry['key']);original=originals.get(entry['key'])
        return bool(candidate and not candidate.get('primaryAddressEvidence') and original and all(entry.get(k)==original.get(k) for k in ('key','name','state','source','sourceDate','sourceCounty','address')) and all(entry.get(k)==candidate.get(k) for k in ('address','countyFips','match')) and (national_row is None or national_row==national.get(entry['key'])))
    if match['method'] in ('usgs-structure-address','hifld-ems-address','hifld-fire-address'):
        from retain_federal_primary_points import validate_federal_primary_entry
        return validate_federal_primary_entry(entry)
    if match['method']=='nad-address-point':
        from stage_nad_primary import validate_nad_primary_entry
        return validate_nad_primary_entry(entry)
    if match['method']=='overture-address':
        from retain_overture_primary_addresses import validate_overture_primary_entry
        return validate_overture_primary_entry(entry)
    return False
