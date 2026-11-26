#!/usr/bin/env python3
"""Publish recent *observed* Abbot Point waves for the static Solunar website.

Source: QLD Government near-real-time wave monitoring, CC BY 4.0.
This is wave-buoy observation (Hs), not predicted swell or site-specific reef conditions.
Requires only Python standard library. Does not touch tide-data or tide-sync jobs.
"""
import csv
import io
import json
import os
from datetime import datetime, timedelta, timezone
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


def clean(name):
    return ''.join(ch.lower() for ch in str(name or '') if ch.isalnum())


def field(row, *aliases):
    by_name = {clean(k): v for k, v in row.items()}
    for alias in aliases:
        key = clean(alias)
        if key in by_name: return by_name[key]
    return None


def number(value, low=None, high=None):
    try:
        v = float(str(value).strip())
        if not (-float('inf') < v < float('inf')): return None
        if low is not None and v < low: return None
        if high is not None and v > high: return None
        return v
    except (ValueError, TypeError): return None


def parse_time(row):
    seconds = number(field(row, 'Seconds'), 946684800, 4102444800)
    if seconds is not None:
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    raw = str(field(row, 'DateTime', 'Date/Time (AEST)', 'Date/Time') or '').strip()
    if not raw: return None
    # This QLD resource labels its date/time as AEST (UTC+10).
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M',
                '%d-%m-%Y %H:%M:%S', '%d-%m-%Y %H:%M'):
        try: return datetime.strptime(raw, fmt).replace(tzinfo=AEST).astimezone(timezone.utc)
        except ValueError: pass
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return (dt.replace(tzinfo=AEST) if dt.tzinfo is None else dt).astimezone(timezone.utc)
    except ValueError: return None


def parse_records(rows, now=None):
    now = now or datetime.now(timezone.utc)
    output = {}
    for row in rows:
        site = str(field(row, 'Site', 'Site Name') or '').casefold().replace('-', ' ')
        if clean(site) not in ('abbotpoint','abbottpoint'): continue
        at = parse_time(row)
        if at is None or at > now + timedelta(minutes=30) or at < now - timedelta(days=8): continue
        hs = number(field(row, 'Hs', 'Hsig', 'Significant Wave Height'), 0, 25)
        if hs is None: continue
        hmax = number(field(row, 'Hmax', 'Maximum Wave Height'), 0, 50)
        tp = number(field(row, 'Tp', 'Peak Period', 'Peak Energy Period'), 0, 40)
        direction = number(field(row, 'Direction', 'Peak Direction', 'Dir_Tp TRUE'), 0, 360)
        temp = number(field(row, 'SST', 'Sea Surface Temperature'), -5, 42)
        output[at.isoformat(timespec='seconds').replace('+00:00', 'Z')] = {
            'time': at.isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'hs': round(hs, 2), 'hmax': round(hmax, 2) if hmax is not None else None,
            'tp': round(tp, 1) if tp is not None else None,
            'direction': round(direction) if direction is not None else None,
            'sst': round(temp, 1) if temp is not None else None,
        }
    return sorted(output.values(), key=lambda x: x['time'])[-96:]


def read_csv(content):
    # QLD file may start with description/unit rows before the column header.
    text = content.decode('utf-8-sig', errors='replace')
    lines = text.splitlines()
    for i, line in enumerate(lines[:30]):
        try: cols = next(csv.reader([line]))
        except csv.Error: continue
        names = {clean(x) for x in cols}
        if 'site' in names and ('hs' in names or 'hsig' in names) and ('seconds' in names or 'datetime' in names):
            return list(csv.DictReader(io.StringIO('\n'.join(lines[i:]))))
    raise ValueError('QLD CSV header Site, Seconds/DateTime and Hs not found')


def http_get(url):
    req = Request(url, headers={'User-Agent': 'Solunar-Fishing/3.14 (+https://www.qld.gov.au/environment/coasts-waterways/beach/monitoring/waves-sites)',
                                'Accept': 'application/json,text/csv,text/plain;q=0.9,*/*;q=0.5'})
    with urlopen(req, timeout=28) as resp:
        if resp.status != 200: raise ValueError(f'HTTP {resp.status}')
        raw = resp.read(12_000_001)
        if len(raw) > 12_000_000: raise ValueError('Wave data response exceeds size limit')
        return raw


def load(now=None):
    now = now or datetime.now(timezone.utc)
    errors = []
    for url in URLS + [API_URL]:
        try:
            raw = http_get(url)
            if url == API_URL:
                obj = json.loads(raw)
                if obj.get('success') is not True: raise ValueError('QLD CKAN API returned an error')
                rows = obj.get('result', {}).get('records', [])
            else:
                rows = read_csv(raw)
            values = parse_records(rows, now)
            if not values: raise ValueError('No valid Abbot Point wave readings in response')
            newest = datetime.fromisoformat(values[-1]['time'].replace('Z', '+00:00'))
            if now - newest > timedelta(hours=18): raise ValueError('Latest wave reading exceeds 18-hour freshness requirement')
            return values, url
        except Exception as exc:
            errors.append(f'{url.split("?")[0]}: {type(exc).__name__}: {exc}')
    raise RuntimeError('No usable official Abbot Point readings; ' + ' | '.join(errors))


def build(values, used_url, now=None):
    now = now or datetime.now(timezone.utc)
    return {'schema': 1, 'station': 'abbot-point', 'site': 'Abbot Point', 'buoy': BUOY,
            'recordedAt': values[-1]['time'], 'generatedAt': now.isoformat(timespec='seconds').replace('+00:00','Z'),
            'sourcePage': SOURCE_PAGE, 'dataSource': DATASET, 'retrievedFrom': used_url,
            'measurement': 'Observed significant wave height (Hs), not isolated swell or a forecast',
            'license': 'CC BY 4.0 (State of Queensland)', 'observations': values}


def main():
    values, url = load()
    result = build(values, url)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        try:
            prev = json.loads(OUTPUT.read_text(encoding='utf-8'))
            if prev.get('recordedAt') == result['recordedAt']:
                print(f'No newer Abbot Point reading since {result["recordedAt"]}; unchanged')
                return
        except (ValueError, OSError): pass
    OUTPUT.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(f'OK Abbot Point: {len(values)} valid observed readings; latest {result["recordedAt"]}; source {url}')


if __name__ == '__main__': main()
