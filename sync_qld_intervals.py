#!/usr/bin/env python3
"""Sync official QLD predicted 10-minute tides, separately from working high/low sync.

Sources: Queensland Open Data, Shute Harbour & Bowen predicted interval datasets.
Fail closed: incomplete/invalid years never replace a previously validated year.
No external dependencies. Generated public JSON is compact (144 heights per AEST day).
"""
from __future__ import annotations
import argparse
import csv
import datetime as dt
import io
import json
from pathlib import Path
import re
import sys
import urllib.parse

# Reuse the government-only network and date validators proven in the high/low sync.
from sync_qld_tides import BASE, download, government_url, valid_date, valid_time

OUTPUT = Path(__file__).resolve().parent.parent / 'tide-data'
SOURCES = {
    'shute': 'shute-harbour-tide-gauge-predicted-interval-data',
    'bowen': 'bowen-tide-gauge-predicted-interval-data',
}
SLOTS_PER_DAY = 144


def expected_days(year: int) -> int:
    return (dt.date(year + 1, 1, 1) - dt.date(year, 1, 1)).days


def discover(station: str, years: set[int], fetch=download) -> dict[int, dict]:
    slug = SOURCES[station]
    url = f'{BASE}/api/3/action/package_show?id={urllib.parse.quote(slug)}'
    payload = json.loads(fetch(url).decode('utf-8-sig'))
    if payload.get('success') is not True or not isinstance(payload.get('result'), dict):
        raise ValueError('QLD interval catalogue did not return a valid package')
    found = {}
    for record in payload['result'].get('resources', []):
        label = str(record.get('name', ''))
        source = str(record.get('url', ''))
        uid = str(record.get('id', ''))
        if str(record.get('format', '')).lower() != 'csv' or not government_url(source):
            continue
        if not re.fullmatch(r'[\da-fA-F-]{36}', uid):
            continue
        if not ('10min' in (label + ' ' + source).lower() or 'interval' in label.lower()):
            continue
        for year in years:
            if re.search(rf'(?<!\d){year}(?!\d)', label + ' ' + source):
                found[year] = {'id': uid, 'url': source, 'active': bool(record.get('datastore_active', False))}
    return found


def process_rows(records, year: int) -> dict[str, list[float]]:
    """Accept Date/Time/Reading (plus optional Ind) and require the full 10-min grid."""
    data: dict[str, list[float | None]] = {}
    count = 0
    for rec in records:
        if not isinstance(rec, dict):
            raise ValueError('Malformed interval record')
        cols = {str(k).strip().lower().replace(' ', '').replace('_', ''): str(v if v is not None else '').strip()
                for k, v in rec.items()}
        date = valid_date(cols.get('date', ''))
        clock = valid_time(cols.get('time', ''))
        if not date or not clock or date[:4] != str(year):
            # A few files include headers/metadata or next year's midnight.
            continue
        hour, minute = (int(i) for i in clock.split(':'))
        if minute % 10:
            raise ValueError(f'Off-grid time in official 10-min series: {date} {clock}')
        try:
            reading = float(cols.get('reading', '').replace('m', '').strip())
        except ValueError as exc:
            raise ValueError(f'Non-numeric prediction at {date} {clock}') from exc
        if not -3.0 <= reading <= 20.0:
            raise ValueError(f'Out-of-range predicted tide at {date} {clock}')
        index = hour * 6 + minute // 10
        heights = data.setdefault(date, [None] * SLOTS_PER_DAY)
        if heights[index] is not None:
            raise ValueError(f'Duplicate predicted tide reading: {date} {clock}')
        heights[index] = round(reading, 3)
        count += 1
    days = expected_days(year)
    if len(data) != days or count != days * SLOTS_PER_DAY:
        raise ValueError(f'Incomplete {year} 10-min prediction: {len(data)}/{days} days, {count}/{days * SLOTS_PER_DAY} readings')
    for date, heights in data.items():
        if any(h is None for h in heights):
            raise ValueError(f'Missing 10-min predictions on {date}')
    return dict(sorted(data.items()))


def parse_csv(blob: bytes, year: int) -> dict[str, list[float]]:
    lines = blob.decode('utf-8-sig').splitlines()
    at = None
    for i, line in enumerate(lines[:80]):
        cols = [x.strip().lower().replace(' ', '').replace('_', '') for x in next(csv.reader([line]))]
        if all(field in cols for field in ('date', 'time', 'reading')):
            at = i
            break
    if at is None:
        preview = lines[0][:100] if lines else '<empty response>'
        raise ValueError(f'Expected QLD interval Date,Time,Reading columns, got: {preview}')
    reader = csv.DictReader(io.StringIO('\n'.join(lines[at:])))
    return process_rows(reader, year)


def parse_api_records(records: list[dict], year: int) -> dict[str, list[float]]:
    return process_rows(records, year)


def fetch_api(resource_id: str, year: int, fetch=download) -> dict[str, list[float]]:
    if not re.fullmatch(r'[\da-fA-F-]{36}', resource_id):
        raise ValueError('Invalid QLD interval resource ID')
    limit = 4000
    rows = []
    total = None
    while True:
        query = urllib.parse.urlencode({'resource_id': resource_id, 'limit': limit, 'offset': len(rows)})
        blob = fetch(f'{BASE}/api/action/datastore_search?{query}')
        payload = json.loads(blob.decode('utf-8-sig'))
        result = payload.get('result', {})
        chunk = result.get('records')
        if payload.get('success') is not True or not isinstance(chunk, list):
            raise ValueError('QLD interval API rejected query or returned no records')
        if total is None:
            total = result.get('total')
            expected = expected_days(year) * SLOTS_PER_DAY
            if not isinstance(total, int) or not expected <= total <= expected + 2:
                raise ValueError(f'Unexpected QLD interval API record count: {total} (expected {expected})')
        if result.get('total') != total or not chunk:
            raise ValueError('QLD interval API pagination incomplete or changed')
        rows.extend(chunk)
        if len(rows) >= total:
            if len(rows) != total:
                raise ValueError('QLD interval API returned duplicate/extra pages')
            break
    return parse_api_records(rows, year)


def verified_existing(station: str, year: int) -> dict | None:
    path = OUTPUT / f'{station}-{year}-10min.json'
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if data.get('schema') != 1 or data.get('station') != station or data.get('year') != year or data.get('interval_minutes') != 10:
            return None
        if not government_url(str(data.get('source_url', ''))):
            return None
        by_date = data.get('byDate')
        if not isinstance(by_date, dict) or len(by_date) != expected_days(year):
            return None
        if any(not isinstance(v, list) or len(v) != 144 or any(type(x) not in (float, int) or not -3 <= x <= 20 for x in v) for v in by_date.values()):
            return None
        return data
    except (ValueError, OSError, TypeError):
        return None


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n'
    if path.exists() and path.read_text(encoding='utf-8') == content:
        return
    path.write_text(content, encoding='utf-8')


def sync(years: set[int], fetch=download) -> dict:
    manifest = {'schema': 1, 'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'stations': {}}
    verified_total = 0
    for station in SOURCES:
        manifest['stations'][station] = {'years': {}}
        try:
            resource_map = discover(station, years, fetch)
        except Exception as exc:
            print(f'NOTICE {station} interval catalogue unavailable: {exc}', file=sys.stderr)
            resource_map = {}
        for year in sorted(years):
            resource = resource_map.get(year)
            record = None
            if resource:
                series = None
                source_url = ''
                source_method = ''
                if resource['active']:
                    try:
                        series = fetch_api(resource['id'], year, fetch)
                        source_url = f'{BASE}/api/action/datastore_search?resource_id={resource["id"]}'
                        source_method = 'QLD CKAN Web API'
                        print(f'OK {station} {year}: verified all {expected_days(year)*144} ten-minute API readings')
                    except Exception as exc:
                        print(f'NOTICE {station} {year} interval API unavailable/incomplete: {exc}', file=sys.stderr)
                if series is None:
                    try:
                        series = parse_csv(fetch(resource['url']), year)
                        source_url = resource['url']
                        source_method = 'QLD official CSV fallback'
                        print(f'OK {station} {year}: verified all {expected_days(year)*144} ten-minute CSV readings')
                    except Exception as exc:
                        print(f'NOTICE {station} {year} interval CSV unavailable/incomplete: {exc}', file=sys.stderr)
                if series is not None:
                    record = {'schema': 1, 'station': station, 'year': year, 'interval_minutes': 10,
                              'source_url': source_url, 'source_method': source_method,
                              'dataset_url': f'{BASE}/dataset/{SOURCES[station]}', 'license': 'CC BY 4.0',
                              'byDate': series}
                    write_json(OUTPUT / f'{station}-{year}-10min.json', record)
            if record is None:
                record = verified_existing(station, year)
                if record:
                    print(f'CACHED {station} {year}: keeping verified interval file')
            if record:
                verified_total += 1
                manifest['stations'][station]['years'][str(year)] = {
                    'file': f'./tide-data/{station}-{year}-10min.json',
                    'days': len(record['byDate']), 'source_url': record['source_url'],
                    'source_method': record.get('source_method', 'QLD verified interval data'),
                }
        for path in OUTPUT.glob(f'{station}-*-10min.json'):
            match = re.fullmatch(rf'{station}-(\d{{4}})-10min\.json', path.name)
            if match:
                year = int(match.group(1))
                previous = verified_existing(station, year)
                if previous:
                    manifest['stations'][station]['years'].setdefault(str(year), {
                        'file': f'./tide-data/{station}-{year}-10min.json',
                        'days': len(previous['byDate']), 'source_url': previous['source_url'],
                        'source_method': previous.get('source_method', 'QLD verified interval data'),
                    })
    path = OUTPUT / 'interval-manifest.json'
    if path.exists():
        try:
            prior = json.loads(path.read_text(encoding='utf-8'))
            if prior.get('stations') == manifest['stations']:
                manifest['generated_at'] = prior.get('generated_at', manifest['generated_at'])
        except (OSError, ValueError):
            pass
    write_json(path, manifest)
    if not any(station['years'] for station in manifest['stations'].values()):
        raise RuntimeError('No complete QLD 10-minute interval prediction currently available. Existing high/low integration is unaffected.')
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--years', nargs='*', type=int, help='Years to sync (default current and next year)')
    args = parser.parse_args()
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=10))).year
    sync(set(args.years or [now, now + 1]))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'INTERVAL SYNC UNAVAILABLE: {exc}', file=sys.stderr)
        sys.exit(1)
