#!/usr/bin/env python3
"""Sync verified official QLD tide predictions using CKAN Web API, then CSV fallback.

Runs in GitHub Actions. Pure standard-library Python; no API key or browser CORS.
Never synthesises tide times and will reject incomplete API datasets.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tide-data"
BASE = "https://www.data.qld.gov.au"
STATIONS = {
    "shute": "shute-harbour-tide-gauge-predicted-high-low-data",
    "bowen": "bowen-tide-gauge-predicted-high-low-data",
}
# Verified official 2026 resources used if the metadata API is inaccessible.
FALLBACK_2026_IDS = {
    "shute": "35c2e31e-b648-4334-bcf9-b44a37c7b9ca",
    "bowen": "d4324ba3-322a-4d7c-b9d2-9b1703f96f76",
}
# Download URLs used when the Datastore API is incomplete or inaccessible.
FALLBACK_2026 = {
    "shute": "https://www.data.qld.gov.au/dataset/aa427579-32c5-4573-b3f5-79e6c2afb72a/resource/35c2e31e-b648-4334-bcf9-b44a37c7b9ca/download/q030003a_shute-harbour-storm-surge_2026_hilo.csv",
    "bowen": "https://www.data.qld.gov.au/dataset/b7436d8f-8ab7-4dad-aaa1-dc6abfacf6da/resource/d4324ba3-322a-4d7c-b9d2-9b1703f96f76/download/q061007a_bowen-storm-surge_2026_hilo.csv",
}
HEADERS = {"User-Agent": "SolunarFishingDataSync/3.1 (+https://github.com/shfjkhsd2d-star/Solunar-fishing)", "Accept": "text/csv, application/json, */*"}


def government_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (host == "qld.gov.au" or host.endswith(".qld.gov.au"))


def download(url: str) -> bytes:
    if not government_url(url):
        raise ValueError(f"Refusing non-government source URL: {url}")
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=35) as response:
                if not government_url(response.geturl()):
                    raise ValueError("Source redirected outside qld.gov.au")
                blob = response.read(5_000_001)
                if len(blob) > 5_000_000:
                    raise ValueError("Source file unexpectedly large")
                return blob
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(attempt + 1)
    raise RuntimeError(f"QLD download failed for {url}: {last_error}")


def valid_date(raw: str) -> str | None:
    raw = raw.strip().lstrip("\ufeff")
    # CKAN can serialise its text/date fields as ISO 8601 datetimes.
    # Use the calendar date as published by Queensland; never convert AEST to UTC here.
    match = re.match(r"^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$", raw)
    if match:
        return match.group(1)
    raw = raw.split(" ")[0]
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def valid_time(raw: str) -> str | None:
    raw = raw.strip().upper().replace(" ", "")
    if re.fullmatch(r"\d{3}", raw):
        raw = "0" + raw
    for fmt in ("%H:%M", "%H:%M:%S", "%H%M", "%I:%M%p", "%I%M%p"):
        try:
            value = dt.datetime.strptime(raw, fmt)
            return value.strftime("%H:%M")
        except ValueError:
            continue
    return None


def parse_official_csv(blob: bytes, year: int) -> dict:
    text = blob.decode("utf-8-sig")
    lines = text.splitlines()
    start = None
    for ix, line in enumerate(lines[:35]):
        titles = [part.strip().lower().replace(" ", "") for part in next(csv.reader([line]))]
        if {"date", "time", "ind", "reading"}.issubset(set(titles)):
            start = ix
            break
    if start is None:
        lower = text[:2000].lower()
        if "<html" in lower or "<!doctype html" in lower or "verify that you're not a robot" in lower:
            raise ValueError("Government download returned HTML instead of a tide CSV (website verification or access block)")
        sample = repr(lines[0][:150]) if lines else "<empty response>"
        raise ValueError(f"Missing expected QLD Date,Time,Ind,Reading CSV header; first line: {sample}")
    reader = csv.DictReader(io.StringIO("\n".join(lines[start:])))
    result = {}
    count = 0
    sample_record = None
    for rec in reader:
        if not rec or all(not str(v or "").strip() for v in rec.values()):
            continue
        rec = {str(k).strip().lower().replace(" ", ""): str(v or "").strip() for k, v in rec.items() if k is not None}
        if sample_record is None:
            # Tide data is a published open dataset; log one short example when parsing fails.
            sample_record = {k: v[:90] for k, v in rec.items() if k in {"date", "time", "ind", "reading"}}
        day = valid_date(rec.get("date", ""))
        clock = valid_time(rec.get("time", ""))
        indicator = rec.get("ind", "").lower()
        if not day or not clock or day[:4] != str(year) or indicator not in ("h", "l", "high", "low"):
            continue
        try:
            height = float(rec["reading"].replace("m", "").strip())
        except (ValueError, KeyError):
            continue
        if not (-3 <= height <= 20):
            continue
        kind = "high" if indicator.startswith("h") else "low"
        timestamp = int(dt.datetime.strptime(f"{day} {clock}", "%Y-%m-%d %H:%M").replace(tzinfo=dt.timezone(dt.timedelta(hours=10))).timestamp() * 1000)
        result.setdefault(day, []).append({"time": timestamp, "type": kind, "height": round(height, 3)})
        count += 1
    for day, events in result.items():
        events.sort(key=lambda e: e["time"])
        if len(events) < 2 or len(events) > 6 or len({e["time"] for e in events}) != len(events):
            raise ValueError(f"Unexpected tide events for {day}")
        if any(left["type"] == right["type"] for left, right in zip(events, events[1:])):
            raise ValueError(f"Non-alternating high/low events on {day}")
    # Annual prediction datasets are full-year files, not 1-week or HTML fragments.
    expected_days = (dt.date(year + 1, 1, 1) - dt.date(year, 1, 1)).days
    if len(result) != expected_days or count < 1100:
        extra = f"; example input fields: {sample_record}" if count == 0 else ""
        raise ValueError(f"Incomplete {year} prediction: {len(result)}/{expected_days} days / {count} events{extra}")
    return dict(sorted(result.items()))



def parse_api_records(records: list[dict], year: int) -> dict:
    """Convert CKAN record objects to our single validated annual high/low format.

    Both published station datasets advertise Date, Time, Ind and Reading columns.
    CSV and API records pass through the same validation checks.
    """
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Date", "Time", "Ind", "Reading"])
    if not isinstance(records, list):
        raise ValueError("Invalid QLD API records response")
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("Malformed QLD API record")
        cleaned = {str(k).strip().lower().replace(" ", ""): v for k,v in record.items()}
        writer.writerow([cleaned.get("date", ""), cleaned.get("time", ""),
                         cleaned.get("ind", ""), cleaned.get("reading", "")])
    return parse_official_csv(out.getvalue().encode("utf-8"), year)


def fetch_ckan_annual(resource_id: str, year: int, fetch=download) -> dict:
    """Page through a single published annual CKAN Datastore resource.

    Do not assume a datastore is complete; some QLD resources explicitly mark it
    incomplete. The full-year / 1100-event validator must approve the result.
    """
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", resource_id):
        raise ValueError("Invalid QLD CKAN resource identifier")
    page_size = 300
    offset = 0
    rows: list[dict] = []
    total = None
    while True:
        query = urllib.parse.urlencode({"resource_id": resource_id, "limit": page_size, "offset": offset})
        url = f"{BASE}/api/action/datastore_search?{query}"
        body = json.loads(fetch(url).decode("utf-8-sig"))
        if body.get("success") is not True or not isinstance(body.get("result"), dict):
            raise ValueError("QLD datastore_search did not return a successful record set")
        result = body["result"]
        page = result.get("records")
        if not isinstance(page, list) or any(not isinstance(r, dict) for r in page):
            raise ValueError("QLD datastore_search returned invalid records")
        if total is None:
            total = result.get("total")
            if not isinstance(total, int) or not 1000 <= total <= 2500:
                raise ValueError(f"Unexpected QLD annual datastore record count: {total!r}")
        elif result.get("total") != total:
            raise ValueError("QLD datastore changed while fetching pages")
        if not page and offset < total:
            raise ValueError("QLD datastore stopped before returning all records")
        rows.extend(page)
        offset += len(page)
        if len(rows) >= total:
            if len(rows) != total:
                raise ValueError("QLD datastore page totals inconsistent")
            break
        if offset > 2500:
            raise ValueError("Unexpectedly large annual tide datastore")
    return parse_api_records(rows, year)


def discover_annual_resources(station: str, years: set[int], fetch=download) -> dict[int, dict]:
    """Resolve annual resource IDs from the official CKAN package catalogue."""
    slug = STATIONS[station]
    catalog_url = f"{BASE}/api/3/action/package_show?id={urllib.parse.quote(slug)}"
    payload = json.loads(fetch(catalog_url).decode("utf-8-sig"))
    if payload.get("success") is not True:
        raise ValueError("QLD package_show returned success=false")
    links = {}
    for resource in payload["result"].get("resources", []):
        label = str(resource.get("name", ""))
        url = str(resource.get("url", ""))
        if str(resource.get("format", "")).lower() != "csv" or not government_url(url):
            continue
        if not any(term in (label + " " + url).lower() for term in ("hilo", "high/low", "high-low", "high low")):
            continue
        for year in years:
            if re.search(rf"(?<!\d){year}(?!\d)", label + " " + url):
                links[year] = {"url": url, "id": str(resource.get("id", "")),
                               "datastore_active": bool(resource.get("datastore_active", True))}
    return links

def load_existing(station: str, year: int) -> dict | None:
    path = OUTPUT / f"{station}-{year}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("station") == station and data.get("year") == year and len(data.get("byDate", {})) == (dt.date(year + 1, 1, 1) - dt.date(year, 1, 1)).days:
            return data
    except (ValueError, OSError):
        pass
    return None


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")


def sync(years: set[int], fetch=download) -> dict:
    # fetch injectable to make the complete download/parse flow locally testable.
    manifest = {"schema": 1, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "stations": {}}
    for station, slug in STATIONS.items():
        try:
            links = discover_annual_resources(station, years, fetch)
        except Exception as exc:
            links = {}
            print(f"NOTICE {station} CKAN catalogue unavailable: {exc}", file=sys.stderr)
        manifest["stations"][station] = {"years": {}}
        for year in sorted(years):
            resource = links.get(year) or ({"url": FALLBACK_2026[station],
                                            "id": FALLBACK_2026_IDS[station],
                                            "datastore_active": True} if year == 2026 else None)
            existing = load_existing(station, year)
            record = None
            if resource:
                source_url = None
                source_method = None
                by_date = None
                resource_id = resource.get("id", "")
                if resource.get("datastore_active", True):
                    try:
                        by_date = fetch_ckan_annual(resource_id, year, fetch)
                        source_url = f"{BASE}/api/action/datastore_search?resource_id={resource_id}"
                        source_method = "QLD CKAN Web API"
                        print(f"OK {station} {year}: complete validated QLD API resource")
                    except Exception as exc:
                        print(f"NOTICE {station} {year} API unavailable/incomplete: {exc}", file=sys.stderr)
                if by_date is None:
                    try:
                        by_date = parse_official_csv(fetch(resource["url"]), year)
                        source_url = resource["url"]
                        source_method = "QLD official CSV fallback"
                        print(f"OK {station} {year}: complete validated QLD CSV fallback")
                    except Exception as exc:
                        print(f"NOTICE {station} {year} CSV unavailable/incomplete: {exc}", file=sys.stderr)
                if by_date is not None:
                    record = {"schema": 1, "station": station, "year": year,
                              "source_url": source_url, "source_method": source_method,
                              "dataset_url": f"{BASE}/dataset/{slug}", "license": "CC BY 4.0",
                              "byDate": by_date}
                    write_json(OUTPUT / f"{station}-{year}.json", record)
            if record is None:
                record = existing
                if record:
                    print(f"CACHED {station} {year}: keeping last valid official file")
            if record:
                manifest["stations"][station]["years"][str(year)] = {
                    "file": f"./tide-data/{station}-{year}.json", "days": len(record["byDate"]),
                    "source_url": record["source_url"],
                    "source_method": record.get("source_method", "QLD official CSV")}
            else:
                print(f"UNAVAILABLE {station} {year}: no verified annual prediction")
        # Retain previously verified annual files across the calendar-year rollover.
        for saved in OUTPUT.glob(f"{station}-*.json"):
            match = re.fullmatch(rf"{station}-(\d{{4}})\.json", saved.name)
            if not match:
                continue
            past_year = int(match.group(1))
            old = load_existing(station, past_year)
            if old:
                manifest["stations"][station]["years"].setdefault(str(past_year), {
                    "file": f"./tide-data/{station}-{past_year}.json",
                    "days": len(old["byDate"]), "source_url": old["source_url"],
                    "source_method": old.get("source_method", "QLD official CSV")
                })
    # Avoid unnecessary commits and site redeploys when the underlying data is unchanged.
    manifest_file = OUTPUT / "manifest.json"
    if manifest_file.exists():
        try:
            earlier = json.loads(manifest_file.read_text(encoding="utf-8"))
            if earlier.get("stations") == manifest["stations"] and earlier.get("generated_at"):
                manifest["generated_at"] = earlier["generated_at"]
        except (ValueError, OSError):
            pass
    write_json(manifest_file, manifest)
    if not any(entry["years"] for entry in manifest["stations"].values()):
        raise RuntimeError("No official tide predictions available from the QLD API or CSV fallback. See Actions logs.")
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", nargs="*", type=int, help="years to obtain (default: current year and next year)")
    args = parser.parse_args()
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=10))).year
    years = set(args.years or [now, now + 1])
    sync(years)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
