#!/usr/bin/env python3
"""Update faculty.csv with Islamic Studies instructors observed at branches.

Teaching locations come from section reports. Identity fields come from the
separately audited registry, which accepts only official or strongly corroborated
employee numbers and never generates substitute IDs.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


FIELDS = [
    "id",
    "year",
    "name",
    "rank",
    "email",
    "active",
    "department",
    "nationality",
    "gender",
    "branch",
]
REGISTRY_FIELDS = [
    "name",
    "id",
    "email",
    "rank",
    "nationality",
    "gender",
    "identity_source",
    "metadata_source",
]
UNRESOLVED_FIELDS = [
    "year",
    "name",
    "branch",
    "section_count",
    "shared_section_count",
    "observation_source",
    "observation_sha256",
    "identity_candidate",
    "identity_source",
    "note",
]
CORRECTION_FIELDS = [
    "year",
    "name",
    "incorrect_id",
    "corrected_id",
    "evidence_source",
    "evidence_level",
    "note",
]
SHARED_OBSERVATION_FIELDS = [
    "year",
    "name",
    "branch",
    "section_count",
    "exclusive_support_elsewhere_same_year",
    "source_files",
    "source_sha256s",
    "decision",
]
SOURCE_YEARS = (1445, 1446, 1447)
COPY_YEAR = 1448
BRANCH_ORDER = ("الحوية", "تربة", "رنية", "الخرمة")
LEGACY_GENERATED_ID_PREFIX = "BR-"


def clean(value: object) -> str:
    return " ".join(str(value or "").replace("\xa0", " ").split())


def normalized(value: object) -> str:
    text = unicodedata.normalize("NFKC", clean(value)).lower()
    text = re.sub(r"[\u064b-\u065f\u0670\u06d6-\u06ed]", "", text)
    text = (
        text.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ى", "ي")
        .replace("ة", "ه")
        .replace("ؤ", "و")
        .replace("ئ", "ي")
    )
    text = re.sub(
        r"^(?:\s*(?:ا\s*\.\s*د\s*\.?|د\s*\.?|ا\s*\.?|دكتور|الدكتور)\s*)+",
        "",
        text,
    )
    text = re.sub(r"[^0-9A-Za-z\u0600-\u06ff]+", " ", text)
    return " ".join(text.split())


def normalize_course_code(value: object) -> str:
    return re.sub(r"\D", "", clean(value))


def normalize_branch(value: object) -> str:
    text = clean(value)
    if "تربة" in text:
        return "تربة"
    if "رنية" in text:
        return "رنية"
    if "الخرمة" in text or "خرمة" in text:
        return "الخرمة"
    if "الحوية" in text or "حوية" in text:
        return "الحوية"
    return ""


def normalize_branches(value: object) -> list[str]:
    branches = {
        branch
        for part in re.split(r"[|,،]", clean(value))
        if (branch := normalize_branch(part))
    }
    return sorted(branches, key=lambda branch: (BRANCH_ORDER.index(branch), branch))


def load_registry(path: Path) -> dict[str, dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != REGISTRY_FIELDS:
            raise RuntimeError(f"مخطط سجل أعضاء الفروع غير متوقع: {reader.fieldnames!r}")
        rows = [
            {
                field: "" if row.get(field) is None else str(row.get(field))
                for field in REGISTRY_FIELDS
            }
            for row in reader
        ]

    result: dict[str, dict[str, str]] = {}
    seen_ids: dict[str, str] = {}
    for row in rows:
        key = normalized(row["name"])
        employee_id = clean(row["id"])
        if not key or not re.fullmatch(r"\d{7}", employee_id):
            raise RuntimeError(f"اسم أو رقم منسوب غير صالح في سجل الفروع: {row!r}")
        if not clean(row["identity_source"]):
            raise RuntimeError(f"لا يوجد مصدر هوية للعضو: {row['name']}")
        if key in result:
            raise RuntimeError(f"اسم مكرر في سجل الفروع: {row['name']}")
        if employee_id in seen_ids and seen_ids[employee_id] != key:
            raise RuntimeError(f"رقم منسوب مرتبط باسمين: {employee_id}")
        row["id"] = employee_id
        result[key] = row
        seen_ids[employee_id] = key
    return result


def load_unresolved(path: Path) -> dict[tuple[int, str], dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != UNRESOLVED_FIELDS:
            raise RuntimeError(f"مخطط سجل الحالات غير المحسومة غير متوقع: {reader.fieldnames!r}")
        rows = [
            {
                field: "" if row.get(field) is None else str(row.get(field))
                for field in UNRESOLVED_FIELDS
            }
            for row in reader
        ]

    result: dict[tuple[int, str], dict[str, str]] = {}
    for row in rows:
        try:
            year = int(clean(row["year"]))
            section_count = int(clean(row["section_count"]))
        except ValueError as error:
            raise RuntimeError(f"سنة أو عدد شعب غير صالح في سجل الحالات غير المحسومة: {row!r}") from error
        name_key = normalized(row["name"])
        branches = normalize_branches(row["branch"])
        branch = "|".join(branches)
        if year not in SOURCE_YEARS or not name_key or not branches or section_count <= 0:
            raise RuntimeError(f"حالة غير محسومة غير صالحة: {row!r}")
        candidate = clean(row["identity_candidate"])
        candidate_source = clean(row["identity_source"])
        if (
            not clean(row["observation_source"])
            or not re.fullmatch(r"[0-9a-f]{64}", clean(row["observation_sha256"]).lower())
            or bool(candidate) != bool(candidate_source)
            or not clean(row["note"])
        ):
            raise RuntimeError(f"الحالة غير المحسومة بلا مصدر أو تفسير: {row!r}")
        try:
            shared_section_count = int(clean(row["shared_section_count"]) or "0")
        except ValueError as error:
            raise RuntimeError(f"عدد الشعب المشتركة غير صالح: {row!r}") from error
        if shared_section_count < 0:
            raise RuntimeError(f"عدد الشعب المشتركة غير صالح: {row!r}")
        key = (year, name_key)
        if key in result:
            raise RuntimeError(f"حالة غير محسومة مكررة: {row['name']}")
        result[key] = {**row, "year": str(year), "branch": branch, "section_count": str(section_count)}
    return result


def is_islamic_studies_bachelor(program: dict[str, object]) -> bool:
    return (
        clean(program.get("name")) == "الدراسات الإسلامية"
        and "بكالوريوس" in clean(program.get("degree"))
    )


def load_specialty_codes(plan_path: Path) -> tuple[set[str], set[str]]:
    payload = json.loads(plan_path.read_text(encoding="utf-8"))
    programs = payload.get("programs") or []
    codes: set[str] = set()
    other_program_codes: set[str] = set()
    for program in programs:
        if not isinstance(program, dict):
            continue
        program_codes = {
            normalize_course_code(course.get("code"))
            for course in (program.get("courses") or [])
            if isinstance(course, dict) and normalize_course_code(course.get("code"))
        }
        if not is_islamic_studies_bachelor(program):
            other_program_codes.update(program_codes)
            continue
        for course in program.get("courses") or []:
            if not isinstance(course, dict):
                continue
            if clean(course.get("category")) != "إجبارية القسم":
                continue
            code = normalize_course_code(course.get("code"))
            if code:
                codes.add(code)
    exclusive_codes = codes - other_program_codes
    shared_codes = codes & other_program_codes
    if not exclusive_codes:
        raise RuntimeError("لم تُستخرج مقررات تخصصية غير مشتركة من خطة الدراسات الإسلامية.")
    return exclusive_codes, shared_codes


def source_path_for_audit(value: object) -> str:
    path = Path(clean(value))
    parts = path.parts
    try:
        index = parts.index("التفصيلي للفروع")
    except ValueError:
        return path.name
    return "/".join(parts[index:])


def extract_shared_course_observations(
    db_path: Path,
    exclusive_codes: set[str],
    shared_codes: set[str],
) -> list[dict[str, str]]:
    with sqlite3.connect(db_path) as connection:
        source_rows = connection.execute(
            """
            SELECT s.academic_year, s.campus, s.instructor, s.course_code,
                   so.path, so.sha256
            FROM sections AS s
            JOIN sources AS so ON so.id = s.source_id
            WHERE s.academic_year IN ('1445', '1446', '1447')
              AND TRIM(COALESCE(s.instructor, '')) <> ''
            """
        ).fetchall()

    exclusive_memberships: set[tuple[int, str, str]] = set()
    exclusive_names_by_year: set[tuple[int, str]] = set()
    shared_counts: Counter[tuple[int, str, str]] = Counter()
    display_names: dict[str, Counter[str]] = defaultdict(Counter)
    shared_sources: dict[tuple[int, str, str], set[tuple[str, str]]] = defaultdict(set)

    for year_raw, campus_raw, instructor_raw, course_code_raw, path_raw, sha_raw in source_rows:
        branch = normalize_branch(campus_raw)
        if branch not in {"تربة", "رنية", "الخرمة"}:
            continue
        code = normalize_course_code(course_code_raw)
        if code not in exclusive_codes and code not in shared_codes:
            continue
        year = int(year_raw)
        name = clean(instructor_raw)
        name_key = normalized(name)
        if not name_key:
            continue
        display_names[name_key][name] += 1
        membership = (year, name_key, branch)
        if code in exclusive_codes:
            exclusive_memberships.add(membership)
            exclusive_names_by_year.add((year, name_key))
            continue
        shared_counts[membership] += 1
        shared_sources[membership].add(
            (source_path_for_audit(path_raw), clean(sha_raw).lower())
        )

    result: list[dict[str, str]] = []
    for membership, section_count in sorted(shared_counts.items()):
        if membership in exclusive_memberships:
            continue
        year, name_key, branch = membership
        has_support_elsewhere = (year, name_key) in exclusive_names_by_year
        sources = sorted(shared_sources[membership])
        result.append(
            {
                "year": str(year),
                "name": display_names[name_key].most_common(1)[0][0],
                "branch": branch,
                "section_count": str(section_count),
                "exclusive_support_elsewhere_same_year": "نعم" if has_support_elsewhere else "لا",
                "source_files": "|".join(path for path, _ in sources),
                "source_sha256s": "|".join(sha for _, sha in sources),
                "decision": (
                    "استبعاد عضوية هذا الفرع؛ الإثبات التخصصي في فرع آخر فقط"
                    if has_support_elsewhere
                    else "استبعاد من قائمة البرنامج؛ لا يظهر إلا في مقررات خدمية مشتركة"
                ),
            }
        )
    return result


def write_csv_rows(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def load_identity_corrections(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != CORRECTION_FIELDS:
            raise RuntimeError(f"مخطط سجل تصحيحات الهوية غير متوقع: {reader.fieldnames!r}")
        rows = [
            {
                field: "" if row.get(field) is None else str(row.get(field))
                for field in CORRECTION_FIELDS
            }
            for row in reader
        ]

    seen: set[tuple[str, str]] = set()
    for row in rows:
        key = (clean(row["year"]), normalized(row["name"]))
        if (
            not key[0].isdigit()
            or not key[1]
            or not re.fullmatch(r"\d{7}", clean(row["incorrect_id"]))
            or not re.fullmatch(r"\d{7}", clean(row["corrected_id"]))
            or not clean(row["evidence_source"])
            or not clean(row["evidence_level"])
            or not clean(row["note"])
        ):
            raise RuntimeError(f"تصحيح هوية غير صالح: {row!r}")
        if key in seen:
            raise RuntimeError(f"تصحيح هوية مكرر: {row!r}")
        seen.add(key)
    return rows


def apply_identity_corrections(
    rows: list[dict[str, str]], corrections: list[dict[str, str]]
) -> None:
    for correction in corrections:
        matches = [
            row
            for row in rows
            if clean(row["year"]) == clean(correction["year"])
            and normalized(row["name"]) == normalized(correction["name"])
        ]
        if len(matches) != 1:
            raise RuntimeError(
                "لم يطابق تصحيح الهوية صفًا واحدًا: "
                f"{correction['year']}، {correction['name']}"
            )
        row = matches[0]
        if clean(row["id"]) == clean(correction["corrected_id"]):
            continue
        if clean(row["id"]) != clean(correction["incorrect_id"]):
            raise RuntimeError(f"الرقم السابق في تصحيح الهوية لا يطابق البيانات: {correction!r}")
        row["id"] = clean(correction["corrected_id"])


def extract_branch_rows(
    db_path: Path,
    specialty_codes: set[str],
    shared_codes: set[str],
    registry: dict[str, dict[str, str]],
    unresolved_registry: dict[tuple[int, str], dict[str, str]],
) -> tuple[list[dict[str, str]], list[dict[str, object]]]:
    with sqlite3.connect(db_path) as connection:
        source_rows = connection.execute(
            """
            SELECT academic_year, campus, instructor, course_code
            FROM sections
            WHERE academic_year IN ('1445', '1446', '1447')
              AND TRIM(COALESCE(instructor, '')) <> ''
            """
        ).fetchall()

    observations: dict[tuple[int, str], Counter[str]] = defaultdict(Counter)
    shared_observations: dict[tuple[int, str], Counter[str]] = defaultdict(Counter)
    display_names: dict[str, Counter[str]] = defaultdict(Counter)
    for year_raw, campus_raw, instructor_raw, course_code_raw in source_rows:
        year = int(year_raw)
        branch = normalize_branch(campus_raw)
        if branch not in {"تربة", "رنية", "الخرمة"}:
            continue
        course_code = normalize_course_code(course_code_raw)
        if course_code not in specialty_codes and course_code not in shared_codes:
            continue
        name = clean(instructor_raw)
        name_key = normalized(name)
        if not name_key:
            continue
        display_names[name_key][name] += 1
        if course_code in shared_codes:
            shared_observations[(year, name_key)][branch] += 1
            continue
        observations[(year, name_key)][branch] += 1

    unresolved: list[dict[str, object]] = []
    consumed_unresolved: set[tuple[int, str]] = set()
    result: list[dict[str, str]] = []
    for (year, name_key), branch_counts in observations.items():
        branches = sorted(
            branch_counts,
            key=lambda branch: (BRANCH_ORDER.index(branch), branch),
        )
        source_name = display_names[name_key].most_common(1)[0][0]
        identity = registry.get(name_key)
        if identity is None:
            unresolved_key = (year, name_key)
            registered_unresolved = unresolved_registry.get(unresolved_key)
            section_count = sum(branch_counts.values())
            shared_section_count = sum(shared_observations[(year, name_key)].values())
            observed_branch = "|".join(branches)
            if (
                registered_unresolved is None
                or registered_unresolved["branch"] != observed_branch
                or int(registered_unresolved["section_count"]) != section_count
                or int(registered_unresolved["shared_section_count"] or "0") != shared_section_count
            ):
                raise RuntimeError(
                    "مدرس بلا رقم منسوب موثق ولا توجد له حالة مطابقة في سجل "
                    f"الحالات غير المحسومة: {year}، {source_name}، {observed_branch}، "
                    f"{section_count} شعب تخصصية و{shared_section_count} مشتركة"
                )
            consumed_unresolved.add(unresolved_key)
            unresolved.append(
                {
                    "year": year,
                    "name": source_name,
                    "branch": observed_branch,
                    "section_count": section_count,
                    "shared_section_count": int(clean(registered_unresolved["shared_section_count"]) or "0"),
                    "observation_source": clean(registered_unresolved["observation_source"]),
                    "observation_sha256": clean(registered_unresolved["observation_sha256"]),
                    "identity_candidate": clean(registered_unresolved["identity_candidate"]),
                    "identity_source": clean(registered_unresolved["identity_source"]),
                    "note": clean(registered_unresolved["note"]),
                }
            )
            continue
        result.append(
            {
                "id": identity["id"],
                "year": str(year),
                "name": clean(identity["name"]),
                "rank": clean(identity["rank"]),
                "email": clean(identity["email"]),
                "active": "نعم",
                "department": "الثقافة الإسلامية",
                "nationality": clean(identity["nationality"]),
                "gender": clean(identity["gender"]),
                "branch": "|".join(branches),
            }
        )
    stale_unresolved = set(unresolved_registry) - consumed_unresolved
    if stale_unresolved:
        raise RuntimeError(f"حالات غير محسومة لم تعد مطابقة للمصدر: {sorted(stale_unresolved)!r}")
    return (
        sorted(result, key=lambda row: (int(row["year"]), normalized(row["name"]))),
        sorted(unresolved, key=lambda row: (int(row["year"]), normalized(row["name"]))),
    )


def read_faculty(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != FIELDS:
            raise RuntimeError(f"مخطط faculty.csv غير متوقع: {reader.fieldnames!r}")
        return [
            {
                field: "" if row.get(field) is None else str(row.get(field))
                for field in FIELDS
            }
            for row in reader
        ]


def write_faculty(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)


def build(
    faculty_path: Path,
    db_path: Path,
    plan_path: Path,
    registry_path: Path,
    unresolved_path: Path,
    corrections_path: Path,
    shared_observations_path: Path,
) -> dict[str, object]:
    original = read_faculty(faculty_path)
    registry = load_registry(registry_path)
    registry_ids = {row["id"] for row in registry.values()}

    # Remove the previously generated branch slice before rebuilding it. If a
    # registry member also has a Hawiyah record, preserve that central record
    # and merge the observed branch membership into it below.
    base_rows: list[dict[str, str]] = []
    for original_row in original:
        row = dict(original_row)
        year = clean(row["year"])
        employee_id = clean(row["id"])
        if year == str(COPY_YEAR):
            continue
        if employee_id.startswith(LEGACY_GENERATED_ID_PREFIX):
            continue
        if year in {str(value) for value in SOURCE_YEARS} and employee_id in registry_ids:
            if "الحوية" not in row["branch"].split("|"):
                continue
            row["branch"] = "الحوية"
        base_rows.append(row)
    apply_identity_corrections(base_rows, load_identity_corrections(corrections_path))

    exclusive_codes, shared_codes = load_specialty_codes(plan_path)
    generated, unresolved = extract_branch_rows(
        db_path,
        exclusive_codes,
        shared_codes,
        registry,
        load_unresolved(unresolved_path),
    )
    shared_observations = extract_shared_course_observations(
        db_path,
        exclusive_codes,
        shared_codes,
    )
    write_csv_rows(
        shared_observations_path,
        SHARED_OBSERVATION_FIELDS,
        shared_observations,
    )
    generated_by_year: dict[int, list[dict[str, str]]] = defaultdict(list)
    for row in generated:
        generated_by_year[int(row["year"])].append(row)
    generated_by_key = {(row["year"], row["id"]): row for row in generated}
    consumed: set[tuple[str, str]] = set()

    last_base_index_by_year = {
        row["year"]: index for index, row in enumerate(base_rows)
    }
    rows: list[dict[str, str]] = []
    for index, base_row in enumerate(base_rows):
        row = dict(base_row)
        key = (clean(row["year"]), clean(row["id"]))
        observed = generated_by_key.get(key)
        if observed is not None:
            merged_branches = sorted(
                set(filter(None, row["branch"].split("|")))
                | set(filter(None, observed["branch"].split("|"))),
                key=lambda branch: (BRANCH_ORDER.index(branch), branch),
            )
            row["branch"] = "|".join(merged_branches)
            row["active"] = "نعم"
            for field in ("rank", "email", "nationality", "gender"):
                if not clean(row[field]) and clean(observed[field]):
                    row[field] = observed[field]
            consumed.add(key)
        rows.append(row)
        year = int(row["year"] or 0)
        if last_base_index_by_year.get(row["year"]) == index and year in SOURCE_YEARS:
            rows.extend(
                item
                for item in generated_by_year[year]
                if (item["year"], item["id"]) not in consumed
            )

    year_1447 = [dict(row) for row in rows if row["year"] == "1447"]
    rows.extend([{**row, "year": str(COPY_YEAR)} for row in year_1447])

    validate(rows, registry_ids)
    write_faculty(faculty_path, rows)
    report = summary(rows, registry_ids, unresolved)
    report["shared_course_observations_excluded"] = len(shared_observations)
    return report


def validate(rows: list[dict[str, str]], registry_ids: set[str]) -> None:
    for row in rows:
        if list(row) != FIELDS:
            raise RuntimeError(f"مخطط صف غير متوقع: {list(row)!r}")
        if not row["year"] or not row["id"] or not row["name"]:
            raise RuntimeError(f"صف ينقصه مفتاح أو اسم: {row!r}")
        if row["active"] not in {"نعم", "لا"}:
            raise RuntimeError(f"حالة نشاط غير معروفة: {row!r}")

    keys = [(row["year"], row["id"]) for row in rows]
    duplicates = [key for key, count in Counter(keys).items() if count > 1]
    if duplicates:
        raise RuntimeError(f"مفاتيح (year,id) مكررة: {duplicates[:10]}")

    allowed_branches = set(BRANCH_ORDER)
    for row in rows:
        if set(filter(None, row["branch"].split("|"))) - allowed_branches:
            raise RuntimeError(f"قيمة فرع غير معروفة: {row!r}")
        if row["id"].startswith(LEGACY_GENERATED_ID_PREFIX):
            raise RuntimeError(f"معرف فرع مولد متبقٍ في الملف: {row!r}")
        if not re.fullmatch(r"\d{7}", row["id"]):
            raise RuntimeError(f"رقم منسوب غير صالح: {row!r}")

    year_1447 = [{**row, "year": ""} for row in rows if row["year"] == "1447"]
    year_1448 = [{**row, "year": ""} for row in rows if row["year"] == "1448"]
    if year_1447 != year_1448:
        raise RuntimeError("سنة 1448 ليست نسخة مطابقة لـ 1447 عدا السنة.")


def summary(
    rows: list[dict[str, str]],
    registry_ids: set[str],
    unresolved: list[dict[str, object]],
) -> dict[str, object]:
    result: dict[str, object] = {
        "total_rows": len(rows),
        "unresolved_instructors": unresolved,
        "years": {},
    }
    for year in (*SOURCE_YEARS, COPY_YEAR):
        year_rows = [row for row in rows if row["year"] == str(year)]
        branch_counts: Counter[str] = Counter()
        verified_branch_count = 0
        for row in year_rows:
            observed_branches = set(filter(None, row["branch"].split("|")))
            if row["id"] in registry_ids and observed_branches - {"الحوية"}:
                verified_branch_count += 1
            for branch in filter(None, row["branch"].split("|")):
                branch_counts[branch] += 1
        result["years"][str(year)] = {
            "rows": len(year_rows),
            "verified_branch_instructors": verified_branch_count,
            "branch_memberships": dict(branch_counts),
        }
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--faculty", type=Path, default=Path("data/faculty.csv"))
    parser.add_argument(
        "--registry",
        type=Path,
        default=Path("scripts/branch_faculty_registry.csv"),
    )
    parser.add_argument(
        "--unresolved",
        type=Path,
        default=Path("scripts/branch_faculty_unresolved.csv"),
    )
    parser.add_argument(
        "--corrections",
        type=Path,
        default=Path("scripts/faculty_identity_corrections.csv"),
    )
    parser.add_argument(
        "--shared-observations",
        type=Path,
        default=Path("scripts/branch_faculty_shared_courses.csv"),
    )
    parser.add_argument("--sections-db", type=Path, required=True)
    parser.add_argument("--plan-data", type=Path, required=True)
    args = parser.parse_args()
    report = build(
        args.faculty,
        args.sections_db,
        args.plan_data,
        args.registry,
        args.unresolved,
        args.corrections,
        args.shared_observations,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
