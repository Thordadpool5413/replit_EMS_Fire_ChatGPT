"""Conservative, shared address keys for newly retained primary-location evidence.

The legacy source replayers deliberately keep their original normalizers. This
module expands only official USPS full street-suffix names and direction words;
it does not alter house numbers, ordinals, route authorities, or street spelling.
"""
import json
import pathlib
import re
import unicodedata

_TABLE = pathlib.Path(__file__).resolve().parents[1] / 'fixtures/usps-street-suffixes.json'
SUFFIXES = json.loads(_TABLE.read_text())['fullNames']
DIRECTIONS = dict(NORTH='N', SOUTH='S', EAST='E', WEST='W',
                  NORTHEAST='NE', NORTHWEST='NW', SOUTHEAST='SE', SOUTHWEST='SW')
ALIASES = {**SUFFIXES, **DIRECTIONS}
STATES = set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
_SECONDARY = re.compile(r'(?:,?\s+(?:STE|SUITE|UNIT|APT|APARTMENT|FL|FLOOR|RM|ROOM|BLDG|BUILDING|DEPT|DEPARTMENT|#)\s+)([A-Z0-9-]+)(?:\s.*)?$', re.I)
_MAILBOX = re.compile(r'\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX|RURAL ROUTE|RR\s+\d+\s+BOX)\b', re.I)

def normalize_street(text):
    if not isinstance(text, str):
        return ''
    words = re.sub(r'[.,]', ' ', unicodedata.normalize('NFKC', text).upper()).split()
    return ' '.join(ALIASES.get(word, word) for word in words)

def normalized_city(text):
    if not isinstance(text, str):
        return ''
    return ' '.join(re.sub(r'[.,]', ' ', unicodedata.normalize('NFKC', text).upper()).split())

def source_street_line(text):
    """Remove an explicit secondary identifier, preserving the reported street.

    A spelled-out word after a designator is not assumed to be a unit: e.g.
    '123 HANGAR ROAD' or '123 MAIN FLOOR ROAD' stays unchanged.
    """
    if not isinstance(text, str):
        return ''
    match = _SECONDARY.search(text)
    if match and (re.search(r'\d', match[1]) or re.fullmatch(r'[A-Z]', match[1], re.I)):
        return text[:match.start()].strip()
    return text.strip()

def physical_address(value):
    if not isinstance(value, dict):
        return False
    street = source_street_line(value.get('street'))
    return bool(value.get('state') in STATES and re.fullmatch(r'\d{5}', value.get('zip') or '')
                and normalized_city(value.get('city')) and not _MAILBOX.search(street)
                and re.match(r'^\d+[A-Z]?(?:[- ]\d+[A-Z]?)?\s+\S', street, re.I))

def address_key(value, include_city=True):
    if not physical_address(value):
        return None
    key = (value['state'], value['zip'], normalize_street(source_street_line(value['street'])))
    return (*key, normalized_city(value['city'])) if include_city else key

def same_address(left, right, include_city=True):
    key = address_key(left, include_city)
    return bool(key and key == address_key(right, include_city))
