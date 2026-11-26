#!/usr/bin/env python3
"""Sync official near-real-time Abbot Point wave-buoy observations.

Uses Queensland's published near-real-time Coastal Data System CSV or CKAN
records, with the station's own published observation page as a last resort.
Only validated measurements are published; old or missing data does not get
presented as current. Python standard library only.

This script creates wave-data/abbot-point.json. It does not touch any tide files.
"""
import csv
import io
import json
import math
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

AEST = timezone(timedelta(hours=10))
RESOURCE = '2bbef99e-9974-49b9-a316-57402b00609c'
SOURCE_PAGE = 'https://www.qld.gov.au/environment/coasts-waterways/beach/monitoring/waves-sites/abbot-point'
DATASET = 'https://www.data.qld.gov.au/dataset/coastal-data-system-near-real-time-wave-data'
URLS = [
    'https://apps.des.qld.gov.au/data-sets/waves/wave-7dayopdata.csv',
    'https://www.data.qld.gov.au/dataset/e9a4670f-4d1f-4c56-9855-dbcb103cebfd/resource/' + RESOURCE + '/archive/wave-7dayopdata.csv',
]
API_URL = 'https://www.data.qld.gov.au/api/3/action/datastore_search?' + urlencode({'resource_id': RESOURCE, 'limit': 32000})
OUTPUT = Path('wave-data/abbot-point.json')
BUOY = {'lat': -19.860567, 'lon': 148.094333}
MAX_AGE_HOURS = 18


def clean(name):
    return ''.join(ch.lower() for ch in str(name or '') if ch.isalnum())


def field(row, *aliases):
    by_name = {clean(k): v for k, v in row.items()}
    for alias in aliases:
        if clean(alias) in by_name:
            return by_name[clean(alias)]
    return None


def number(value, low=None, high=None):
    try:
        if value is None or isinstance(value, bool):
            return None
        text = str(value).strip().replace(',', '')
        if not text or text.casefold() in ('na','n/a','nan','null','none','-','--','inf','infinity'):
            return None
        # The CSV should contain bare numbers; accept common unit suffixes
        # without silently treating unrelated text as a number.
        match = re.fullmatch(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)\s*(?:m|metres?|s|seconds?|°|c|km/h)?', text, re.I)
        if not match:
            return None
        v = float(match.group(1))
        if not math.isfinite(v) or (low is not None and v < low) or (high is not None and v > high):
            return None
        return v
    except (ValueError, TypeError):
        return None


def epoch_time(value):
    seconds = number(value)
    if seconds is None:
        return None
    if seconds >= 10**14:  # microseconds since 1970
        seconds /= 1_000_000
    elif seconds >= 10**11:  # milliseconds since 1970
        seconds /= 1000
    if not 946684800 <= seconds <= 4102444800:
        return None
    try:
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None


def parse_time(row, now=None):
    """Take valid recent epoch seconds first; otherwise use published AEST time."""
    now = now or datetime.now(timezone.utc)
    by_seconds = epoch_time(field(row, 'Seconds', 'Unix Time', 'UnixTimestamp'))
    if by_seconds and now - timedelta(days=8) <= by_seconds <= now + timedelta(minutes=30):
        return by_seconds
    raw = str(field(row, 'DateTime', 'Date/Time (AEST)', 'Date/Time', 'Timestamp', 'Time') or '').strip()
    if not raw:
        return by_seconds
    by_raw = epoch_time(raw)
    if by_raw:
        return by_raw
    # Timestamp formats seen in govt CSV and CKAN exports (12h + 24h, with or
    # without seconds). Strptime handles non-zero-padded day/month/hour too.
    raw = re.sub(r'\s+', ' ', raw)
    for fmt in (
        '%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M',
        '%Y/%m/%d %H:%M:%S', '%Y/%m/%d %H:%M',
        '%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M',
        '%d-%m-%Y %H:%M:%S', '%d-%m-%Y %H:%M',
        '%d/%m/%Y %I:%M:%S %p', '%d/%m/%Y %I:%M %p',
        '%d-%m-%Y %I:%M:%S %p', '%d-%m-%Y %I:%M %p',
        '%Y-%m-%d %I:%M:%S %p', '%Y-%m-%d %I:%M %p',
        '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M',
    ):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=AEST).astimezone(timezone.utc)
        except ValueError:
            pass
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return (dt.replace(tzinfo=AEST) if dt.tzinfo is None else dt).astimezone(timezone.utc)
    except ValueError:
        return by_seconds


def is_abbot(row):
    site = clean(field(row, 'Site', 'Site Name', 'Station', 'Location'))
    if site.startswith(('abbotpoint', 'abbottpoint', 'abbotpt', 'abbottpt')):
        return True
    # Match coordinates only for unnamed/variant-named rows, never a known
    # different station (e.g. Hay Point). Require location to be very close.
    latitude = number(field(row, 'Latitude', 'Lat'), -90, 90)
    longitude = number(field(row, 'Longitude', 'Lon', 'Long'), -180, 180)
    return (latitude is not None and longitude is not None and
            abs(latitude-BUOY['lat']) < .045 and abs(longitude-BUOY['lon']) < .045)


def parse_records(rows, now=None, diagnostics=None):
    now = now or datetime.now(timezone.utc)
    output = {}
    counts = Counter()
    examples = []
    sites = Counter()
    for row in rows:
        counts['rows'] += 1
        if not isinstance(row, dict):
            counts['bad_record'] += 1
            continue
        site = str(field(row, 'Site', 'Site Name', 'Station', 'Location') or '').strip()
        sites[site[:60] or '(empty site)'] += 1
        if not is_abbot(row):
            counts['other_station'] += 1
            continue
        counts['matched_station'] += 1
        at = parse_time(row, now)
        if at is None:
            counts['invalid_time'] += 1
        elif at > now + timedelta(minutes=30):
            counts['future_time'] += 1
        elif at < now - timedelta(days=8):
            counts['old_time'] += 1
        hs = number(field(row, 'Hs', 'Hsig', 'Significant Wave Height'), 0, 25)
        if hs is None:
            counts['missing_hs'] += 1
        if len(examples) < 3:
            examples.append({
                'site': site[:45], 'seconds': str(field(row, 'Seconds') or '')[:35],
                'datetime': str(field(row, 'DateTime', 'Date/Time') or '')[:45],
                'parsed_utc': at.isoformat() if at else None,
                'hs': str(field(row, 'Hs', 'Hsig') or '')[:30],
            })
        if at is None or at > now + timedelta(minutes=30) or at < now - timedelta(days=8) or hs is None:
            continue
        hmax = number(field(row, 'Hmax', 'Maximum Wave Height'), 0, 50)
        tp = number(field(row, 'Tp', 'Peak Period', 'Peak Energy Period'), 0, 40)
        direction = number(field(row, 'Direction', 'Peak Direction', 'Dir_Tp TRUE'), 0, 360)
        temp = number(field(row, 'SST', 'Sea Surface Temperature'), -5, 42)
        at_text = at.isoformat(timespec='seconds').replace('+00:00','Z')
        output[at_text] = {
            'time': at_text, 'hs': round(hs, 2),
            'hmax': round(hmax, 2) if hmax is not None else None,
            'tp': round(tp, 1) if tp is not None else None,
            'direction': round(direction) if direction is not None else None,
            'sst': round(temp, 1) if temp is not None else None,
        }
        counts['valid'] += 1
    if diagnostics is not None:
        diagnostics.update({'counts': dict(counts), 'site_samples': sites.most_common(8),
                            'abbot_samples': examples})
    return sorted(output.values(), key=lambda x:x['time'])[-96:]


def read_csv(content):
    text = content.decode('utf-8-sig', errors='replace')
    lines = text.splitlines()
    for i,line in enumerate(lines[:35]):
        try:
            cols = next(csv.reader([line]))
        except csv.Error:
            continue
        names = {clean(x) for x in cols}
        if 'site' in names and ('hs' in names or 'hsig' in names) and ('seconds' in names or 'datetime' in names):
            return list(csv.DictReader(io.StringIO('\n'.join(lines[i:]))))
    raise ValueError('CSV headers not found; preview ' + repr(' '.join(lines[:2])[:160]))


def http_get(url):
    req = Request(url, headers={
        'User-Agent': 'Solunar-Fishing-Wave-Sync/3.15 (Public QLD open data)',
        'Accept': 'application/json,text/csv,text/html,text/plain;q=0.9,*/*;q=0.5',
    })
    with urlopen(req, timeout=28) as resp:
        if resp.status != 200: raise ValueError(f'HTTP {resp.status}')
        raw = resp.read(12_000_001)
        if len(raw) > 12_000_000: raise ValueError('Wave data response exceeds size limit')
        return raw


class _HTMLText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.bits = []
        self.suppressed = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'):
            self.suppressed += 1
    def handle_endtag(self, tag):
        if tag in ('script','style'):
            self.suppressed = max(0,self.suppressed-1)
    def handle_data(self, data):
        if not self.suppressed:
            self.bits.append(data)


def parse_station_page(content, now=None):
    """Fallback: parse official Abbot Point station's Recent activity summary.

    This is strictly a secondary source when the seven-day open-data endpoints
    are unavailable. Never infer a timestamp or return an unverified reading.
    """
    now = now or datetime.now(timezone.utc)
    parser = _HTMLText()
    parser.feed(content.decode('utf-8-sig', errors='replace'))
    text = re.sub(r'\s+', ' ', ' '.join(parser.bits))
    head = re.search(r'Recent activity', text, re.I)
    if not head:
        raise ValueError('No Recent activity block found on official station page')
    text = text[head.end():head.end()+1800]
    def reading(label, suffix, minval, maxval):
        match = re.search(re.escape(label) + r'\s*([\d.]+)\s*' + suffix, text, re.I)
        return number(match.group(1), minval, maxval) if match else None
    hs = reading('Significant wave height', r'm\b', 0, 25)
    hmax = reading('Maximum wave height', r'm\b', 0, 50)
    tp = reading('Peak energy period', r's\b', 0, 40)
    direction = reading('Wave direction', r'°', 0, 360)
    temp = reading('Sea surface temperature', r'°\s*C', -5, 42)
    if hs is None:
        raise ValueError('Missing numeric significant wave height in station summary')
    stamp = re.search(r'Recorded\s+(Today|Yesterday)\s+(\d{1,2})[.:](\d{2})\s*(am|pm)', text, re.I)
    if not stamp:
        raise ValueError('Official station summary has no parseable observation timestamp')
    local_day = now.astimezone(AEST).date() - timedelta(days=(1 if stamp.group(1).lower()=='yesterday' else 0))
    hour = int(stamp.group(2)) % 12 + (12 if stamp.group(4).lower()=='pm' else 0)
    minute = int(stamp.group(3))
    at = datetime(local_day.year, local_day.month, local_day.day,hour,minute,tzinfo=AEST).astimezone(timezone.utc)
    if at > now + timedelta(minutes=30) or now-at > timedelta(hours=MAX_AGE_HOURS):
        raise ValueError('Station page observation is missing, future-dated or stale')
    return [{'time':at.isoformat(timespec='seconds').replace('+00:00','Z'),
             'hs':round(hs,2),'hmax':hmax,'tp':tp,
             'direction':round(direction) if direction is not None else None,
             'sst':temp}]


def load(now=None):
    now = now or datetime.now(timezone.utc)
    errors=[]
    for url in URLS + [API_URL, SOURCE_PAGE]:
        try:
            raw = http_get(url)
            if url == SOURCE_PAGE:
                values = parse_station_page(raw, now)
            else:
                if url == API_URL:
                    obj = json.loads(raw)
                    if obj.get('success') is not True:
                        raise ValueError('QLD CKAN API returned an error')
                    rows = obj.get('result',{}).get('records',[])
                else:
                    rows = read_csv(raw)
                diagnostics={}
                values = parse_records(rows, now, diagnostics)
                if not values:
                    raise ValueError('No usable readings; '+json.dumps(diagnostics,ensure_ascii=False)[:900])
            if not values:
                raise ValueError('No usable observations')
            newest = datetime.fromisoformat(values[-1]['time'].replace('Z','+00:00'))
            if now-newest > timedelta(hours=MAX_AGE_HOURS):
                raise ValueError('Latest official reading exceeds 18-hour freshness threshold')
            return values, url
        except Exception as exc:
            message=f'{url.split("?")[0]}: {type(exc).__name__}: {exc}'
            print('NOTICE '+message)
            errors.append(message)
    raise RuntimeError('No usable official Abbot Point readings. '+ ' | '.join(errors)[-2200:])


def build(values, used_url, now=None):
    now=now or datetime.now(timezone.utc)
    return {'schema':1,'station':'abbot-point','site':'Abbot Point','buoy':BUOY,
            'recordedAt':values[-1]['time'],
            'generatedAt':now.isoformat(timespec='seconds').replace('+00:00','Z'),
            'sourcePage':SOURCE_PAGE,'dataSource':DATASET,'retrievedFrom':used_url,
            'measurement':'Observed significant wave height (Hs), not isolated swell or a forecast',
            'license':'CC BY 4.0 (State of Queensland)','observations':values}


def main():
    values,url=load()
    result=build(values,url)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    if OUTPUT.exists():
        try:
            prev=json.loads(OUTPUT.read_text(encoding='utf-8'))
            if prev.get('recordedAt')==result['recordedAt']:
                print(f'No newer Abbot Point reading since {result["recordedAt"]}; unchanged')
                return
        except (ValueError,OSError):
            pass
    OUTPUT.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(f'OK Abbot Point: {len(values)} verified observations; latest {result["recordedAt"]}; source {url}')

if __name__ == '__main__':
    main()
