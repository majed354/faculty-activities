#!/usr/bin/env python3
"""Split data/teaching_data.json into per-year files + metadata manifest.

Usage:
    python3 scripts/split_teaching_data.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "teaching_data.json"
OUT_DIR = ROOT / "data" / "teaching"
YEARS_DIR = OUT_DIR / "years"


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Source not found: {SOURCE}")

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))

    records = payload.get("records", [])
    by_year: dict[int, list[dict]] = defaultdict(list)
    for record in records:
        year = record.get("y")
        if year is None:
            continue
        by_year[int(year)].append(record)

    years = [int(y) for y in payload.get("years", [])]
    years = sorted(set(years) | set(by_year.keys()))

    year_files: dict[str, str] = {}
    record_counts: dict[str, int] = {}

    for year in years:
        year_records = by_year.get(year, [])
        year_payload = {
            "year": year,
            "records": year_records,
        }
        out_path = YEARS_DIR / f"{year}.json"
        write_json(out_path, year_payload)
        year_files[str(year)] = f"teaching/years/{year}.json"
        record_counts[str(year)] = len(year_records)

    meta = {
        "version": 1,
        "source": "teaching_data.json",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "years": years,
        "departments": payload.get("departments", []),
        "faculty_index": payload.get("faculty_index", {}),
        "year_files": year_files,
        "record_counts": record_counts,
        "total_records": sum(record_counts.values()),
    }
    write_json(OUT_DIR / "meta.json", meta)

    print(f"Split {meta['total_records']} records into {len(years)} files under {OUT_DIR}")
    for year in years:
        print(f"  {year}: {record_counts[str(year)]} -> {year_files[str(year)]}")


if __name__ == "__main__":
    main()
