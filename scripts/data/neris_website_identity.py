"""Conservative native website identity; never performs website navigation."""
import collections
import ipaddress
import re
import urllib.parse
from recover_neris_primary import identity_key, source_zip
from retain_usfa_native_source import native_identity

GENERIC = {'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'youtu.be',
           'google.com', 'google.org', 'goo.gl', 'bing.com', 'yahoo.com', 'linkedin.com', 'tiktok.com',
           'bit.ly', 'tinyurl.com', 'linktr.ee', 'wix.com', 'wordpress.com', 'blogspot.com', 'godaddysites.com',
           'myspace.com', 'aol.com', 'hotmail.com', 'gmail.com', 'outlook.com', 'msn.com', 'geocities.com'}


def canonical_host(value):
    host = value.lower().rstrip('.')
    if host.startswith('www.'): host = host[4:]
    if len(host)>253 or '.' not in host or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', part) for part in host.split('.')):
        return None
    if not re.fullmatch(r'[a-z]{2,63}', host.rsplit('.', 1)[1]): return None
    if any(host == generic or host.endswith('.'+generic) for generic in GENERIC): return None
    try:
        ipaddress.ip_address(host)
        return None
    except ValueError:
        return host


def canonical_website(value):
    if not isinstance(value, str): return None
    raw = value.strip()
    if not raw or len(raw)>4096 or re.search(r'\s|[<>"\\]', raw): return None
    if '://' not in raw: raw = 'https://'+raw
    try:
        url = urllib.parse.urlsplit(raw)
        if url.scheme.lower() not in ('http', 'https') or url.username is not None or url.password is not None or not url.hostname:
            return None
        host = canonical_host(url.hostname)
        if not host: return None
        port = url.port
        authority = host + (':'+str(port) if port is not None and port != (80 if url.scheme.lower()=='http' else 443) else '')
        canonical = authority + url.path.rstrip('/')
        if url.query: canonical += '?'+url.query
        if url.fragment: canonical += '#'+url.fragment
        return {'host': host, 'canonicalUrl': canonical}
    except (ValueError, UnicodeError):
        return None


def host_witnesses(value):
    if not isinstance(value, str): return set()
    result = set()
    parsed = canonical_website(value)
    if parsed: result.add(parsed['host'])
    for candidate in re.findall(r'(?i)(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}', value):
        host = canonical_host(candidate)
        if host: result.add(host)
    return result


def identity_indices(supplement, usfa_report):
    neris_hosts = collections.defaultdict(set); usfa_hosts = collections.defaultdict(set)
    neris_rows = {}; usfa_keys = collections.defaultdict(list)
    for feature in supplement['features']:
        row = feature['attributes']; oid = row['OBJECTID']; neris_rows[oid] = row
        for host in host_witnesses(row.get('website')): neris_hosts[host].add(oid)
    for row in usfa_report['rows']:
        for host in host_witnesses(row['native'].get('Website')): usfa_hosts[host].add(row['sourceRowNumber'])
        key = native_identity(row['native'])
        if key: usfa_keys[key].append(row)
    quarantine_hosts = set(); quarantine_fdids = set()
    for row in usfa_report['quarantined']:
        quarantine_hosts.update(host_witnesses(row['rawFragment']))
        first = re.match(r'^\s*"?([^",\r\n]+)', row['rawFragment'])
        if first: quarantine_fdids.add(first.group(1).strip())
    exact = {row['primaryKey'] for row in usfa_report['baselineReconciliation'] if row['outcome']=='exact-fdid-state-name-city-zip'}
    return {'nerisHosts': neris_hosts, 'usfaHosts': usfa_hosts, 'nerisRows': neris_rows,
            'usfaKeys': usfa_keys, 'quarantineHosts': quarantine_hosts, 'quarantineFdids': quarantine_fdids,
            'completeUsfaRows': len(usfa_report['rows'])+len(usfa_report['quarantined']), 'exactOriginalKeys': exact}


def correlate(entry, national_row, indices, departments):
    key = entry['key']
    if key.split(':', 2)[-1] in indices['quarantineFdids'] or key not in indices['exactOriginalKeys'] or len(indices['usfaKeys'].get(key, [])) != 1:
        return None, 'no-exact-native-usfa-identity'
    row = indices['usfaKeys'][key][0]; usfa = row['native']; website = canonical_website(usfa['Website'])
    if not website: return None, 'no-nongeneric-native-website'
    host = website['host']
    if host in indices['quarantineHosts']: return None, 'malformed-native-row-website-ambiguity'
    source_ids = indices['nerisHosts'].get(host, set())
    if len(source_ids) != 1 or indices['usfaHosts'].get(host) != {row['sourceRowNumber']}:
        return None, 'nonreciprocal-complete-native-website'
    oid = next(iter(source_ids)); department = departments.get(oid); attrs = indices['nerisRows'][oid]
    native_web = canonical_website(attrs.get('website'))
    if not department or not native_web or native_web['host'] != host:
        return None, 'unbound-native-neris-website'
    identity = identity_key(national_row[2], national_row[4], national_row[3], national_row[5])
    if not identity: return None, 'incomplete-original-name-locality'
    roles = []
    for role, prefix in (('physical', ''), ('mailing', 'mail_')):
        fields = ['address_line_1', 'address_line_2', 'city', 'state', 'zip_code'] if not prefix else ['mail_address_line_1', 'mail_address_line_2', 'mail_city', 'mail_state', 'mail_zip_code']
        if identity_key(attrs['name'], attrs[fields[2]], attrs[fields[3]], attrs[fields[4]]) == identity:
            roles.append(role)
    if not roles:
        return None, 'website-identity-lacks-complete-native-city-and-zip'
    correlation = {'nameBasis': 'normalized-complete-name-unique-website-city-state-zip',
                   'primaryKey': key, 'primaryName': national_row[2], 'primaryCity': national_row[4],
                   'primaryPostalCode': national_row[5], 'normalizedName': identity[0], 'normalizedCity': identity[1],
                   'state': identity[2], 'zip': identity[3], 'reciprocalSourceCount': 1, 'reciprocalPrimaryCount': 1,
                   'websiteBasis': 'canonical-url' if website['canonicalUrl'] == native_web['canonicalUrl'] else 'exact-host',
                   'canonicalHost': host, 'usfaCanonicalUrl': website['canonicalUrl'], 'nerisCanonicalUrl': native_web['canonicalUrl'],
                   'nativeUsfaWebsiteAsReported': usfa['Website'], 'nativeNerisWebsiteAsReported': attrs['website'],
                   'nativeLocalityRoles': roles, 'nativeUsfaSourceRowNumber': row['sourceRowNumber'],
                   'nativeUsfaRecordSha256': row['nativeRecordSha256'],
                   'nativeUsfaIdentityAsReported': {field: usfa[field] for field in ('FDID', 'Fire dept name', 'HQ addr1', 'HQ addr2', 'HQ city', 'HQ state', 'HQ zip', 'Website')},
                   'sourceIdentityInventoryCount': len(indices['nerisRows']),
                   'primaryIdentityInventoryCount': indices['completeUsfaRows'],
                   'completeUsfaSourceRows': 27117, 'malformedUsfaSourceRows': 2,
                   'normalizationRule': 'http-https-public-dns-single-www-default-port-trailing-path-slash; preserve-path-case-query-fragment',
                   'websiteOwnershipChecked': False}
    return (department, correlation), None
