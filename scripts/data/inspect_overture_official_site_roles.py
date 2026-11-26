#!/usr/bin/env python3
"""Bounded private inspection of official URLs already reported by native Places.

No search service receives provider names, phones, addresses, or query payloads.
This acquires public pages locally and creates review cues, never mapped entries.
A role keyword or a lone contact address is not automatically accepted as proof.
"""
import argparse
import collections
import concurrent.futures
import datetime
import hashlib
import html.parser
import ipaddress
import json
import pathlib
import re
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from address_normalization import normalize_street, normalized_city, source_street_line
from recover_nppes_phone_identity import agency_name, phone
from match_overture_primary_addresses import STATE_NAMES

DENIED = {
    'facebook.com', 'instagram.com', 'linkedin.com', 'yelp.com', 'mapquest.com',
    'yellowpages.com', 'google.com', 'bing.com', 'wikipedia.org', 'wikidata.org',
    'x.com', 'twitter.com', 'youtube.com', 'tiktok.com', 'tripadvisor.com',
    'chamberofcommerce.com', 'manta.com', 'zoominfo.com', 'dnb.com',
    'opencorporates.com', 'openstreetmap.org', 'foursquare.com', 'waze.com',
    'hub.biz', 'bizapedia.com', 'buzzfile.com', 'findglocal.com', 'govserv.org',
    'bit.ly', 'tinyurl.com', 'wixsite.com', 'sintra.site',
}
APPROVED_HOSTS = set()
URL_LOCKS = {}
URL_LOCK = threading.Lock()
ROLE = re.compile(
    r'\b(?:head\s*quarters?|head\s+office|main\s+(?:office|station|location)|'
    r'primary\s+(?:office|location|station|facility)|only\s+(?:location|station|office|facility)|'
    r'sole\s+(?:location|station|office|facility)|corporate\s+office|'
    r'administrative\s+office)\b', re.I)
LINK_ROLE = re.compile(r'contact|locations?|headquarters?|about|offices?|stations?', re.I)
MAX_BYTES = 3_000_000


def dump(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True,
                       separators=(',', ':'), allow_nan=False)+'\n').encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def host(url):
    value = (urllib.parse.urlsplit(url).hostname or '').lower().rstrip('.')
    return value[4:] if value.startswith('www.') else value


def allowed_url(url):
    if not isinstance(url, str):
        return False
    try:
        parsed = urllib.parse.urlsplit(url)
        hostname = host(url)
        if (parsed.scheme not in ('http', 'https') or not hostname or parsed.username or
                parsed.password or parsed.port not in (None, 80, 443)):
            return False
        if hostname in ('localhost', 'metadata.google.internal') or hostname.endswith(('.local', '.internal', '.localhost')):
            return False
        try:
            if not ipaddress.ip_address(hostname).is_global:
                return False
        except ValueError:
            pass
        return hostname in APPROVED_HOSTS and not any(
            hostname == denied or hostname.endswith('.'+denied) for denied in DENIED)
    except ValueError:
        return False


class BoundedRedirect(urllib.request.HTTPRedirectHandler):
    max_redirections = 5
    max_repeats = 2

    def redirect_request(self, request, fp, code, message, headers, new_url):
        if not allowed_url(new_url):
            raise ValueError('Redirect is outside allowed public website scope')
        return super().redirect_request(request, fp, code, message, headers, new_url)


class VisiblePage(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.links = []
        self.skip = 0
        self.current_link = None
        self.title = []
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'svg'):
            self.skip += 1
        if tag == 'title':
            self.in_title = True
        if tag in ('p', 'div', 'section', 'article', 'address', 'li', 'br', 'h1', 'h2', 'h3', 'h4', 'footer', 'header'):
            self.parts.append('\n')
        if tag == 'a' and attrs.get('href'):
            self.current_link = {'href': attrs['href'], 'text': ''}
            self.links.append(self.current_link)
        if tag == 'img' and attrs.get('alt') and not self.skip:
            self.parts.append(' '+attrs['alt']+' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'svg') and self.skip:
            self.skip -= 1
        if tag == 'title':
            self.in_title = False
        if tag == 'a':
            self.current_link = None
        if tag in ('p', 'div', 'section', 'article', 'address', 'li', 'h1', 'h2', 'h3', 'h4'):
            self.parts.append('\n')

    def handle_data(self, value):
        if self.skip:
            return
        self.parts.append(value)
        if self.in_title:
            self.title.append(value)
        if self.current_link is not None:
            self.current_link['text'] += value

    def text(self):
        return '\n'.join(line.strip() for line in
                         re.sub(r'[\t\r\f\v ]+', ' ', ''.join(self.parts)).splitlines() if line.strip())


def fetch_page(url, output):
    with URL_LOCK:
        lock = URL_LOCKS.setdefault(url, threading.Lock())
    with lock:
        return _fetch_page(url, output)


def _fetch_page(url, output):
    identity = sha(url.encode())
    receipt_path = output/'pages'/(identity+'.json')
    if receipt_path.exists():
        old = json.loads(receipt_path.read_bytes())
        if old['requestedUrl'] != url:
            raise ValueError('Website request digest collision')
        if not allowed_url(url) or old.get('finalUrl') and not allowed_url(old['finalUrl']):
            return {'requestedUrl': url, 'error': 'cached-page-outside-reviewed-official-host-scope',
                    'status': None, 'bodyFile': None, 'visibleTextFile': None}
        if old.get('bodyFile'):
            raw = (output/old['bodyFile']).read_bytes()
            if sha(raw) != old['bodySha256']:
                raise ValueError('Retained official page body changed')
        return old
    result = {'requestedUrl': url,
              'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'status': None, 'error': None, 'bodyFile': None, 'visibleTextFile': None}
    if not allowed_url(url):
        result['error'] = 'not-an-allowed-public-official-site-url'
    else:
        try:
            opener = urllib.request.build_opener(BoundedRedirect(),
                urllib.request.HTTPSHandler(context=ssl.create_default_context()))
            request = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2'})
            started = time.monotonic()
            with opener.open(request, timeout=15) as response:
                result.update(status=response.status, finalUrl=response.geturl(),
                              contentType=response.headers.get('Content-Type', ''),
                              lastModified=response.headers.get('Last-Modified'),
                              etag=response.headers.get('ETag'))
                if not allowed_url(result['finalUrl']):
                    raise ValueError('Final public URL is outside scope')
                pieces = []
                size = 0
                while True:
                    part = response.read(min(65536, MAX_BYTES-size+1))
                    if not part:
                        break
                    pieces.append(part)
                    size += len(part)
                    if size > MAX_BYTES or time.monotonic()-started > 35:
                        raise ValueError('Website body exceeds bounded acquisition budget')
                raw = b''.join(pieces)
                body_path = output/'bodies'/(identity+'.html')
                body_path.parent.mkdir(parents=True, exist_ok=True)
                body_path.write_bytes(raw)
                result.update(bodyFile=str(body_path.relative_to(output)), bodySha256=sha(raw), bodyBytes=len(raw))
                if 'html' not in result['contentType'].lower():
                    result['error'] = 'non-html-page-not-adjudicated'
                else:
                    charset = response.headers.get_content_charset() or 'utf-8'
                    try:
                        decoded = raw.decode(charset, errors='replace')
                    except LookupError:
                        decoded = raw.decode('utf-8', errors='replace')
                    parser = VisiblePage()
                    parser.feed(decoded)
                    text = parser.text()
                    text_path = output/'texts'/(identity+'.txt')
                    text_path.parent.mkdir(parents=True, exist_ok=True)
                    text_path.write_text(text)
                    result.update(visibleTextFile=str(text_path.relative_to(output)),
                                  visibleTextSha256=sha(text.encode()),
                                  pageTitle=' '.join(parser.title), links=parser.links)
        except (OSError, ValueError, urllib.error.URLError) as error:
            result['error'] = type(error).__name__+': '+str(error)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_bytes(dump(result))
    return result


def page_signals(page, observation, output):
    if page.get('error') or not page.get('visibleTextFile'):
        return {'identityCorroborated': False, 'roleCues': []}
    raw = (output/page['visibleTextFile']).read_bytes()
    if sha(raw) != page['visibleTextSha256']:
        raise ValueError('Official page text changed')
    text = raw.decode()
    normalized = agency_name(text)
    address = observation['sourceAddress']
    street = normalize_street(source_street_line(address['street']))
    normalized_address_text = normalize_street(text)
    names = [w['nameAsReported'] for w in observation['nativeNameBasis']]
    exact_names = [name for name in names if ' '+agency_name(name)+' ' in ' '+normalized+' ']
    tel_phones = {phone(urllib.parse.unquote(link['href'][4:]).split('?', 1)[0])
                  for link in page.get('links', []) if link['href'].lower().startswith('tel:')}
    phone_pattern = r'(?<!\d)'+r'[\s().-]*'.join(re.escape(digit) for digit in observation['phone'])+r'(?!\d)'
    exact_phone = observation['phone'] in tel_phones or bool(re.search(phone_pattern, text))
    exact_street = ' '+street+' ' in ' '+normalized_address_text+' '
    exact_city = ' '+normalized_city(address['city'])+' ' in ' '+normalized_city(text)+' '
    exact_postal = bool(re.search(r'(?<!\d)'+re.escape(address['zip'])+r'(?!\d)', text))
    state_forms = [address['state']]+[name for name, abbreviation in STATE_NAMES.items()
                                    if abbreviation == address['state']]
    exact_state = any(re.search(r'\b'+re.escape(value)+r'\b', text, re.I) for value in state_forms)
    cues = [{'phrase': match[0], 'start': match.start(), 'end': match.end(),
             'context': text[max(0, match.start()-350):min(len(text), match.end()+700)]}
            for match in ROLE.finditer(text)]
    return {'completeNativeNamePresent': bool(exact_names),
            'exactNameWitnesses': exact_names, 'exactPhonePresent': exact_phone,
            'exactNormalizedStreetPresent': exact_street, 'exactNativeCityPresent': exact_city,
            'exactPostalCodePresent': exact_postal, 'exactStatePresent': exact_state,
            'identityCorroborated': bool(exact_names and exact_phone and exact_street and exact_city and exact_postal and exact_state),
            'roleCues': cues, 'primaryRoleEstablished': False}


def inspect_target(row, output, max_pages):
    observation = row['observation']
    native = observation['record']['nativeRecord']
    urls = native.get('websites') or []
    result = {'key': row['key'], 'nativePlaceId': native['id'],
              'nativeRecordSha256': observation['record']['sourceSha256'],
              'nativeWebsiteUrls': urls, 'observation': observation,
              'pages': [], 'eligiblePrimaryRole': False, 'mappedCandidate': False}
    initial = [url for url in urls if allowed_url(url)]
    if not urls:
        result['outcome'] = 'no-retained-native-website'
        return result
    if not initial:
        result['outcome'] = 'only-third-party-or-invalid-retained-url'
        return result
    visited = set()
    queue = initial[:2]
    while queue and len(visited) < max_pages:
        url = queue.pop(0)
        url = urllib.parse.urlunsplit(urllib.parse.urlsplit(url)._replace(fragment=''))
        if url in visited:
            continue
        visited.add(url)
        page = fetch_page(url, output)
        signals = page_signals(page, observation, output)
        result['pages'].append({'receipt': page, 'signals': signals})
        if page.get('error'):
            continue
        base = page['finalUrl']
        links = []
        for link in page.get('links', []):
            target = urllib.parse.urljoin(base, link['href'])
            target = urllib.parse.urlunsplit(urllib.parse.urlsplit(target)._replace(fragment=''))
            label = link['text']+' '+urllib.parse.urlsplit(target).path
            if (allowed_url(target) and host(target) == host(base) and target not in visited
                    and LINK_ROLE.search(label) and not re.search(r'\.(?:pdf|jpg|png|gif|zip|mp4)$', target, re.I)):
                score = 0 if re.search(r'headquarters?|locations?|contact', label, re.I) else 1
                links.append((score, target))
        queue = list(dict.fromkeys(queue+[url for _, url in sorted(set(links))]))
    identity_pages = [page for page in result['pages'] if page['signals']['identityCorroborated']]
    role_pages = [page for page in result['pages'] if page['signals']['roleCues']]
    result['outcome'] = ('identity-and-role-cues-require-adjudication' if identity_pages and role_pages
                         else 'identity-only-no-explicit-role' if identity_pages
                         else 'website-identity-not-fully-corroborated')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--overlap', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--approved-hosts', type=pathlib.Path, required=True,
                        help='Private reviewed native organizational host allowlist; no directory/shortener/hosting domains')
    parser.add_argument('--max-pages', type=int, default=5)
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    if not 1 <= args.max_pages <= 5 or not 1 <= args.workers <= 6:
        raise ValueError('Official-site request budget exceeds authorized bounded scope')
    overlap_raw = args.overlap.read_bytes()
    overlap = json.loads(overlap_raw)
    rows = [row for row in overlap['observations'] if not row['alreadyUsable']
            and row['passesKnownRetainedSourceChecks']
            and row['observation']['streetCorroboration']['rule'] == 'primary-street-not-corroborated']
    if len(rows) != 56 or len({row['key'] for row in rows}) != 56:
        raise ValueError('Different-street role-review scope changed')
    host_review_raw = args.approved_hosts.read_bytes()
    host_review = json.loads(host_review_raw)
    global APPROVED_HOSTS
    APPROVED_HOSTS = set(host_review['approvedNativeOrganizationHosts'])
    source_hosts = {host(url) for row in rows for url in
                    row['observation']['record']['nativeRecord'].get('websites') or []}
    if (not APPROVED_HOSTS or not APPROVED_HOSTS <= source_hosts or
            any(not allowed_url('https://'+value) for value in APPROVED_HOSTS)):
        raise ValueError('Official-host review added an unreported or denied destination')
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(inspect_target, row, args.output, args.max_pages) for row in rows]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            print(json.dumps({'stage': 'bounded-official-site-inspection', 'completedTargets': len(results),
                              'totalTargets': len(rows)}), flush=True)
    results.sort(key=lambda row: row['key'])
    summary = {'scope': 56, 'maxPagesPerIdentity': args.max_pages,
               'source': 'native retained website URLs and bounded same-site public links only',
               'outcomes': dict(sorted(collections.Counter(row['outcome'] for row in results).items())),
               'uniquePageRequests': len(list((args.output/'pages').glob('*.json'))),
               'eligiblePrimaryRoles': 0, 'adjudicationComplete': False,
               'newMappedCount': 0, 'newRecordLevelOutputExported': False}
    report = {'summary': summary, 'overlapSha256': sha(overlap_raw),
              'officialHostReviewSha256': sha(host_review_raw),
              'codeSha256': sha(pathlib.Path(__file__).read_bytes()), 'records': results}
    (args.output/'private-site-inspection.json').write_bytes(dump(report))
    (args.output/'inspection-summary.json').write_bytes(dump({**summary, 'privateReportSha256': sha(dump(report))}))
    print(json.dumps(summary, sort_keys=True), flush=True)


if __name__ == '__main__':
    main()
