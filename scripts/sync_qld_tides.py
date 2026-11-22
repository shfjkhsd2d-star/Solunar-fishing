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
