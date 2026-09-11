#!/usr/bin/env python3
"""Build the slim on-device CoFID catalog from the GOV.UK 2021 workbook."""

from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

SOURCE_URL = (
    "https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/"
    "McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx"
)


def colrow(ref: str) -> tuple[str, int]:
    match = re.match(r"([A-Z]+)(\d+)", ref)
    if not match:
        raise ValueError(ref)
    return match.group(1), int(match.group(2))


def load_strings(zf: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    out: list[str] = []
    for si in root.findall(f"{NS}si"):
        out.append("".join((t.text or "") for t in si.iter(f"{NS}t")))
    return out


def sheet_target(zf: zipfile.ZipFile, sheet_name: str) -> str:
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    relmap = {el.attrib["Id"]: el.attrib["Target"] for el in rels}
    for sh in wb.find(f"{NS}sheets"):
        if sh.attrib["name"] == sheet_name:
            target = relmap[sh.attrib[f"{REL_NS}id"]]
            return target if target.startswith("xl/") else f"xl/{target}"
    raise KeyError(sheet_name)


def read_sheet(zf: zipfile.ZipFile, strings: list[str], path: str) -> dict[int, dict[str, str]]:
    root = ET.fromstring(zf.read(path))
    rows: dict[int, dict[str, str]] = defaultdict(dict)
    for cell in root.iter(f"{NS}c"):
        ref = cell.attrib.get("r")
        if not ref:
            continue
        col, row = colrow(ref)
        kind = cell.attrib.get("t")
        value = cell.find(f"{NS}v")
        inline = cell.find(f"{NS}is")
        if kind == "s" and value is not None and value.text is not None:
            text = strings[int(value.text)]
        elif kind == "inlineStr" and inline is not None:
            text = "".join((t.text or "") for t in inline.iter(f"{NS}t"))
        elif value is not None:
            text = value.text or ""
        else:
            text = ""
        rows[row][col] = text
    return rows


def parse_number(raw: str | None) -> float | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    lowered = text.lower()
    if lowered in {"tr", "trace"}:
        return 0.0
    if lowered == "n":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def round_or_none(value: float | None) -> int | None:
    if value is None:
        return None
    return int(round(value))


def main() -> int:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/cofid/cofid-2021.xlsx")
    dest = Path(
        sys.argv[2]
        if len(sys.argv) > 2
        else Path(__file__).resolve().parents[1] / "src/data/cofid-foods.json"
    )
    if not src.exists():
        raise SystemExit(f"missing workbook: {src}")

    with zipfile.ZipFile(src) as zf:
        strings = load_strings(zf)
        prox = read_sheet(zf, strings, sheet_target(zf, "1.3 Proximates"))
        inorg = read_sheet(zf, strings, sheet_target(zf, "1.4 Inorganics"))

    sodium_by_code: dict[str, int | None] = {}
    for row_n, cols in inorg.items():
        if row_n < 4:
            continue
        code = (cols.get("A") or "").strip()
        if not code:
            continue
        sodium_by_code[code] = round_or_none(parse_number(cols.get("H")))

    foods = []
    for row_n, cols in prox.items():
        if row_n < 4:
            continue
        code = (cols.get("A") or "").strip()
        name = (cols.get("B") or "").strip()
        kcal = round_or_none(parse_number(cols.get("M")))
        if not code or not name or kcal is None or kcal <= 0:
            continue
        aoac = parse_number(cols.get("Z"))
        nsp = parse_number(cols.get("Y"))
        fiber = aoac if aoac is not None else nsp
        foods.append(
            {
                "code": code,
                "name": name,
                "kcal": kcal,
                "proteinG": round_or_none(parse_number(cols.get("J"))),
                "carbsG": round_or_none(parse_number(cols.get("L"))),
                "fatG": round_or_none(parse_number(cols.get("K"))),
                "fiberG": round_or_none(fiber),
                "sugarG": round_or_none(parse_number(cols.get("Q"))),
                "satFatG": round_or_none(parse_number(cols.get("AB"))),
                "sodiumMg": sodium_by_code.get(code),
            }
        )

    foods.sort(key=lambda item: (item["name"].lower(), item["code"]))
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": SOURCE_URL,
        "licence": "Open Government Licence v3.0",
        "dataset": "McCance and Widdowson’s Composition of Foods Integrated Dataset 2021",
        "foods": foods,
    }
    dest.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {len(foods)} foods -> {dest} ({dest.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
