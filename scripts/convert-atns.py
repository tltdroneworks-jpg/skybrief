#!/usr/bin/env python3
"""Download (optional) and convert the official ATNS RSA DATA KMZ to a subset GeoJSON."""
from __future__ import annotations

import json
import math
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE_PAGE = "https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D"
DOWNLOAD_URL = (
    "https://www.atns.com/Aeronautical%20Information%20Management/"
    "RSA%20Airspaces%20in%203D/RSA%20DATA.zip"
)
ATTRIBUTION = (
    "Airspace data: ATNS RSA DATA KMZ (South African Aeronautical Information Product). "
    "This is a gross representation only. It is not intended and must not be used for "
    "navigation, automated flight guidance, or other precision activity involving the "
    "safety of aircraft and the public. ATNS makes no warranty as to accuracy, completeness "
    "or currency. Verify information before relying on it."
)
PART101 = {
    "citationDate": (
        "Wording checked 12 Nov 2026 against the Civil Aviation Regulations as published "
        "on acts.co.za (101.05.10 as substituted by the 26th Amendment, GG48228, 17 March 2023; "
        "101.05.3 as currently published)."
    ),
    "generalRestrictions": (
        "SA-CAR 101.05.10(3): Unless as otherwise authorised by the Director, a UA shall not "
        "be operated — (a) above 400 ft above the surface; (b) within a radius of 10 km from "
        "an aerodrome reference point; (c) within restricted or prohibited airspace; or (d) "
        "adjacent to or above a nuclear power plant, prison, police station, crime scene, "
        "court of law, national key point or strategic installation."
    ),
    "controlledAirspace": (
        "SA-CAR 101.05.3(1): A UAS shall not be operated in controlled airspace, except by a "
        "holder of a UASOC and as approved by the Director in the UASOC's operations manual. "
        "101.05.3(2): The Director may approve a UA operation in controlled airspace only in "
        "VMC in an ATZ and CTR below 400 ft, and subject to Document SA-CATS 101."
    ),
    "planningAid": (
        "Planning aid only — not permission to fly and not an official briefing. UASOC holders "
        "may operate in otherwise restricted circumstances if authorised by the Director. Always "
        "verify against current official sources (SACAA, ATNS File2Fly, the AIP) and your operations manual."
    ),
}

LIMIT_RE = re.compile(
    r"((?:GND|SFC|UNL|FL\s*\d{2,3}|\d+\s*(?:FT|ft)(?:\s*ALT)?)\s*[-–—toTO]+\s*"
    r"(?:GND|SFC|UNL|FL\s*\d{2,3}|\d+\s*(?:FT|ft)(?:\s*ALT)?))",
    re.I,
)
FREQ_RE = re.compile(r"(?:Freq|FREQ)\s*:\s*(.+)", re.I)


def local(tag: str) -> str:
    return tag.split("}")[-1] if tag else ""


def child(el, name):
    for c in list(el):
        if local(c.tag) == name:
            return c
    return None


def text_of(el) -> str:
    if el is None:
        return ""
    return "".join(el.itertext()).strip()


def parse_coords(s: str):
    pts = []
    for part in (s or "").split():
        bits = part.split(",")
        if len(bits) >= 2:
            try:
                lon = round(float(bits[0]), 5)
                lat = round(float(bits[1]), 5)
            except ValueError:
                continue
            if not pts or pts[-1] != (lon, lat):
                pts.append((lon, lat))
    return pts


def _perp(a, b, c):
    (x1, y1), (x2, y2), (x0, y0) = a, b, c
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x0 - x1, y0 - y1)
    t = max(0, min(1, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x0 - (x1 + t * dx), y0 - (y1 + t * dy))


def _rdp(points, eps):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    maxd, idx = -1, -1
    for i in range(1, len(points) - 1):
        d = _perp(a, b, points[i])
        if d > maxd:
            maxd, idx = d, i
    if maxd > eps:
        left = _rdp(points[: idx + 1], eps)
        right = _rdp(points[idx:], eps)
        return left[:-1] + right
    return [a, b]


def simplify(pts, tol=0.001):
    if len(pts) < 8:
        return pts
    closed = pts[0] == pts[-1]
    body = pts[:-1] if closed else pts
    simp = _rdp(body, tol)
    if closed and (not simp or simp[0] != simp[-1]):
        simp.append(simp[0])
    if closed and len(simp) < 4:
        return pts
    return simp


def parse_desc(desc: str):
    clean = re.sub(r"<[^>]+>", " ", desc or "")
    clean = clean.replace("&amp;", "&").replace("&apos;", "'")
    clean = re.sub(r"\s+", " ", clean).strip()
    m = LIMIT_RE.search(clean)
    fm = FREQ_RE.search(clean)
    return {
        "description": clean,
        "limits": m.group(1).replace("  ", " ").strip() if m else "",
        "freq": fm.group(1).strip() if fm else "",
    }


def classify(path, name, geom):
    parts = [p.upper() for p in path]
    p = " / ".join(parts)
    n = (name or "").upper()
    helistop_part = any("HELISTOP" in part and "AERODROME" not in part for part in parts)
    aerodrome_part = any("AERODROME" in part for part in parts)
    if helistop_part:
        return "helistop"
    if aerodrome_part:
        return "aerodrome"
    if any(s in p for s in ("NAVAID", "WAYPOINT", "ROUTES", "SIGNIFICANT POINT")):
        return None
    if any(s in p for s in ("06. FAD", "FAD,FAP,FAR", "PROHIBITED", "RESTRICTED", "DANGER")):
        if "PROHIBITED" in p or n.startswith("FAP"):
            return "prohibited"
        if "RESTRICTED" in p or n.startswith("FAR"):
            return "restricted"
        if "DANGER" in p or n.startswith("FAD"):
            return "danger"
    if "05. ATZ" in p or "ATZ'S & CTR" in p or "ATZ’S & CTR" in p:
        if " ATZ" in n or n.endswith("ATZ"):
            return "atz"
        if " CTR" in n or n.endswith("CTR"):
            return "ctr"
        last = parts[-1] if parts else ""
        if "ATZ" in last:
            return "atz"
        if "CTR" in last:
            return "ctr"
    if "04. TMA" in p or "TMA'S" in p or " TMA" in n or n.endswith("TMA") or "TMA (" in n:
        if geom == "polygon":
            return "tma"
    if "03. CTA" in p or "CTA'S" in p or re.search(r"\bCTA\b", n):
        if geom == "polygon":
            return "cta"
    return None


def harvest_geom(el):
    polys, points = [], []

    def walk_geom(node):
        t = local(node.tag)
        if t == "Polygon":
            rings = []
            for n2 in node.iter():
                if local(n2.tag) == "outerBoundaryIs":
                    for n3 in n2.iter():
                        if local(n3.tag) == "coordinates":
                            pts = simplify(parse_coords("".join(n3.itertext())))
                            if len(pts) >= 3:
                                rings.append(pts)
                if local(n2.tag) == "innerBoundaryIs":
                    for n3 in n2.iter():
                        if local(n3.tag) == "coordinates":
                            pts = simplify(parse_coords("".join(n3.itertext())))
                            if len(pts) >= 3:
                                rings.append(pts)
            if rings:
                polys.append(rings)
        elif t == "Point":
            for n2 in node.iter():
                if local(n2.tag) == "coordinates":
                    pts = parse_coords("".join(n2.itertext()))
                    if pts:
                        points.append(pts[0])
        else:
            for ch in list(node):
                walk_geom(ch)

    walk_geom(el)
    return polys, points


def walk(el, path, features):
    t = local(el.tag)
    if t == "Folder":
        name = text_of(child(el, "name")) or ""
        for c in list(el):
            walk(c, path + ([name] if name else []), features)
        return
    if t != "Placemark":
        for c in list(el):
            if local(c.tag) in ("Document", "Folder", "Placemark"):
                walk(c, path, features)
        return
    name = text_of(child(el, "name")) or ""
    parsed = parse_desc(text_of(child(el, "description")))
    polys, points = harvest_geom(el)
    geom = "polygon" if polys else ("point" if points else None)
    klass = classify(path, name, geom)
    if not klass:
        return
    props = {
        "name": name.replace("&amp;", "&").replace("&apos;", "'"),
        "class": klass,
        "limits": parsed["limits"],
        "freq": parsed["freq"],
        "description": parsed["description"],
        "folder": " / ".join(path),
    }
    m = re.search(r"\b(FA[A-Z]{2})\b", name.upper())
    if m:
        props["icao"] = m.group(1)
    if klass in ("aerodrome", "helistop") and points:
        lon, lat = points[0]
        features.append(
            {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}}
        )
        return
    if len(polys) == 1:
        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[x, y] for x, y in ring] for ring in polys[0]],
                },
            }
        )
    elif len(polys) > 1:
        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": [[[[x, y] for x, y in ring] for ring in poly] for poly in polys],
                },
            }
        )


def extract_kml(zip_path: Path) -> tuple[str, str]:
    # Outer zip or a bare kmz
    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        kmz = next((n for n in names if n.lower().endswith(".kmz")), None)
        kml = next((n for n in names if n.lower().endswith(".kml")), None)
        if kmz:
            tmp = zip_path.parent / "_inner.kmz"
            tmp.write_bytes(z.read(kmz))
            with zipfile.ZipFile(tmp) as z2:
                kml_name = next(n for n in z2.namelist() if n.lower().endswith(".kml"))
                return z2.read(kml_name).decode("utf-8", "replace"), Path(kmz).name
        if kml:
            return z.read(kml).decode("utf-8", "replace"), Path(kml).name
    raise SystemExit(f"No KML/KMZ in {zip_path}")


def download(dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = Request(DOWNLOAD_URL, headers={"User-Agent": "Skybrief/1.2 (personal pilot briefing desk)"})
    with urlopen(req, timeout=60) as res:
        dest.write_bytes(res.read())
    return dest


def convert(zip_path: Path) -> tuple[dict, dict]:
    kml_text, file_name = extract_kml(zip_path)
    kml_text = re.sub(r'xmlns="http://www.opengis.net/kml/2.2"', "", kml_text, count=1)
    root = ET.fromstring(kml_text)
    features: list[dict] = []
    walk(root, [], features)
    counts = defaultdict(int)
    for f in features:
        counts[f["properties"]["class"]] += 1
    doc_name = ""
    # first Document/name
    for n in root.iter():
        if local(n.tag) == "name":
            doc_name = (n.text or "").strip()
            break
    m = re.search(r"\d{1,2}\s*[A-Z]{3}\s*\d{4}", doc_name, re.I) or re.search(
        r"\d{1,2}[A-Z]{3}\d{4}", file_name, re.I
    )
    cycle = m.group(0) if m else ""
    geojson = {"type": "FeatureCollection", "name": "ATNS RSA DATA airspace (subset)", "features": features}
    meta = {
        "source": "ATNS RSA DATA KMZ",
        "sourceUrl": SOURCE_PAGE,
        "downloadUrl": DOWNLOAD_URL,
        "cycle": cycle,
        "fileName": file_name,
        "convertedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "featureCount": len(features),
        "counts": dict(counts),
        "attribution": ATTRIBUTION,
        "terms": (
            "Freely copied and adapted from the official ATNS RSA DATA KMZ as permitted by ATNS, "
            "with attribution. Not for navigation or automated flight guidance."
        ),
        "part101": PART101,
        "layers": ["ctr", "tma", "atz", "cta", "restricted", "prohibited", "danger", "aerodrome", "helistop"],
    }
    return geojson, meta


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if src is None:
        default = Path("/tmp/atns-kmz/RSA_DATA.zip")
        if default.exists():
            src = default
        else:
            src = DATA / "RSA_DATA.zip"
            print("Downloading", DOWNLOAD_URL)
            download(src)
    geojson, meta = convert(src)
    (DATA / "airspace.geojson").write_text(json.dumps(geojson, separators=(",", ":")))
    (DATA / "airspace-meta.json").write_text(json.dumps(meta, indent=2))
    print("wrote", DATA / "airspace.geojson", "features", meta["featureCount"], "counts", meta["counts"], "cycle", meta["cycle"])


if __name__ == "__main__":
    main()
