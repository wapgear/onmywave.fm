#!/usr/bin/env python3
"""Check finite, explicitly registered design consistency obligations."""
import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

ID = re.compile(r"[A-Za-z][A-Za-z0-9_.-]{0,79}\Z")
HEX = re.compile(r"#[0-9a-fA-F]{6}\Z")
MATCH_FIELDS = {"role", "variant", "state", "platform", "theme", "density"}
METHODS = {"dom", "accessibility", "source", "measured", "estimated"}


class Invalid(Exception):
    pass


def require(cond, message):
    if not cond:
        raise Invalid(message)


def obj(value, label):
    require(type(value) is dict, f"{label} must be an object")
    return value


def keys(value, required, optional, label):
    obj(value, label)
    require(required <= value.keys(), f"{label} missing fields: {sorted(required - value.keys())}")
    require(value.keys() <= required | optional, f"{label} has unknown fields: {sorted(value.keys() - required - optional)}")


def finite_num(x):
    return type(x) in (int, float) and math.isfinite(x)


def scalar(x):
    return x is None or type(x) in (str, int, float, bool) and (type(x) is not float or math.isfinite(x))


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"), parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
    except Exception as e:
        raise Invalid(f"cannot parse JSON {path}: {e}")


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def hash_file(base, entry, label):
    keys(entry, {"path", "sha256"}, set(), label)
    require(type(entry["path"]) is str and bool(entry["path"]), f"{label}.path must be nonempty")
    require(type(entry["sha256"]) is str and re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]) is not None, f"{label}.sha256 malformed")
    p = (base / entry["path"]).resolve()
    require(p.is_file(), f"missing {label} file: {entry['path']}")
    require(sha(p) == entry["sha256"], f"hash mismatch for {label}: {entry['path']}")
    return p


def typed_equal(a, b):
    return type(a) is type(b) and a == b


def luminance(hexcolor):
    rgb = [int(hexcolor[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    vals = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    return .2126 * vals[0] + .7152 * vals[1] + .0722 * vals[2]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("rules")
    ap.add_argument("evidence")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    rp, ep, out = map(lambda s: Path(s).resolve(), (args.rules, args.evidence, args.out))
    try:
        require(not out.exists(), f"output already exists: {out}")
        rules_doc, evidence = read_json(rp), read_json(ep)
        keys(rules_doc, {"version", "sources", "rules"}, set(), "rules document")
        keys(evidence, {"version", "captures", "blocks"}, {"sources", "provenance"}, "evidence")
        require(type(rules_doc["version"]) is int and rules_doc["version"] == 1, "unsupported rules version")
        require(type(evidence["version"]) is int and evidence["version"] == 1, "unsupported evidence version")
        classifier = read_json(Path(__file__).resolve().parent / "classifier.json")
        roles = {r["id"] for r in classifier.get("roles", []) if type(r) is dict and type(r.get("id")) is str}
        sources = rules_doc["sources"]
        require(type(sources) is list and len(sources) > 0, "at least one source required")
        source_ids = set()
        source_report = []
        for i, s in enumerate(sources):
            keys(s, {"id", "location", "kind"}, {"sha256"}, f"source[{i}]")
            require(type(s["id"]) is str and ID.fullmatch(s["id"]), f"invalid source ID at {i}")
            require(s["id"] not in source_ids, f"duplicate source ID: {s['id']}")
            source_ids.add(s["id"])
            require(type(s["location"]) is str and s["location"], f"invalid source location: {s['id']}")
            require(type(s["kind"]) is str and s["kind"], f"invalid source kind: {s['id']}")
            checked = False
            if "sha256" in s:
                require(type(s["sha256"]) is str, f"bad source hash: {s['id']}")
                require(not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", s["location"]), f"remote hashed source rejected: {s['id']}")
                require(re.fullmatch(r"[0-9a-f]{64}", s["sha256"]) is not None, f"bad source hash: {s['id']}")
                sp = (rp.parent / s["location"]).resolve()
                require(sp.is_file() and sha(sp) == s["sha256"], f"source missing or hash mismatch: {s['id']}")
                checked = True
            source_report.append({"id": s["id"], "freshness_checked": checked, "location": s["location"]})

        caps, blocks = evidence["captures"], evidence["blocks"]
        require(type(caps) is list and caps, "evidence needs captures")
        require(type(blocks) is list and blocks, "evidence needs blocks")
        capmap, blockmap = {}, {}
        for i, c in enumerate(caps):
            keys(c, {"id", "platform", "theme", "density", "state", "viewport", "scale", "image"}, set(), f"capture[{i}]")
            require(type(c["id"]) is str and ID.fullmatch(c["id"]) and c["id"] not in capmap, f"invalid/duplicate capture ID: {c.get('id')}")
            for fld in ("platform", "theme", "density", "state"):
                require(type(c[fld]) is str and c[fld], f"invalid capture {fld}")
            v = obj(c["viewport"], f"capture {c['id']} viewport")
            keys(v, {"width", "height"}, set(), "viewport")
            require(all(finite_num(v[k]) and v[k] > 0 for k in ("width", "height")), "viewport dimensions must be finite and positive")
            require(finite_num(c["scale"]) and c["scale"] > 0, "scale must be finite and positive")
            hash_file(ep.parent, c["image"], f"screenshot {c['id']}")
            capmap[c["id"]] = c
        for i, b in enumerate(blocks):
            keys(b, {"id", "capture_id", "role", "variant", "state", "rect", "properties", "crop"}, {"clipped", "rect_provenance"}, f"block[{i}]")
            require(type(b["id"]) is str and ID.fullmatch(b["id"]) and b["id"] not in blockmap, f"invalid/duplicate block ID: {b.get('id')}")
            require(type(b["capture_id"]) is str and b["capture_id"] in capmap, f"unknown capture reference for {b['id']}")
            require(type(b["role"]) is str and b["role"] in roles, f"unknown classifier role for {b['id']}: {b['role']}")
            require(type(b["variant"]) is str and b["variant"] and type(b["state"]) is str and b["state"], f"invalid block classification for {b['id']}")
            r = obj(b["rect"], f"block {b['id']} rect")
            keys(r, {"x", "y", "width", "height"}, set(), "rect")
            require(all(finite_num(x) for x in r.values()) and r["width"] > 0 and r["height"] > 0, f"invalid rect for {b['id']}")
            if "rect_provenance" in b:
                p = b["rect_provenance"]
                keys(p, {"method", "source"}, set(), f"rect provenance {b['id']}")
                require(type(p["method"]) is str and p["method"] in METHODS and type(p["source"]) is str and p["source"], f"invalid rect provenance for {b['id']}")
            if "clipped" in b:
                require(type(b["clipped"]) is bool, f"clipped must be boolean for {b['id']}")
            props = obj(b["properties"], f"block {b['id']} properties")
            for name, p in props.items():
                require(type(name) is str and name, f"invalid property name in {b['id']}")
                keys(p, {"value", "method"}, {"source"}, f"property {b['id']}.{name}")
                require(scalar(p["value"]), f"property value must be scalar: {b['id']}.{name}")
                require(type(p["method"]) is str and p["method"] in METHODS, f"unknown property method: {b['id']}.{name}")
                if "source" in p:
                    require(type(p["source"]) is str and p["source"], f"invalid property provenance: {b['id']}.{name}")
            hash_file(ep.parent, b["crop"], f"crop {b['id']}")
            blockmap[b["id"]] = b
        require(all(any(b["capture_id"] == cid for b in blocks) for cid in capmap), "every capture must contain at least one block")

        rules = rules_doc["rules"]
        require(type(rules) is list and rules, "at least one rule required")
        seen = set(); results = []
        for i, rule in enumerate(rules):
            keys(rule, {"id", "statement", "rationale", "severity", "source_ids", "match", "min_blocks", "assertion"}, set(), f"rule[{i}]")
            rid = rule["id"]
            require(type(rid) is str and ID.fullmatch(rid) and rid not in seen, f"invalid/duplicate rule ID: {rid}"); seen.add(rid)
            require(all(type(rule[k]) is str and rule[k] for k in ("statement", "rationale")), f"rule {rid} needs statement and rationale")
            require(type(rule["severity"]) is str and rule["severity"] in ("error", "warning"), f"invalid severity in {rid}")
            require(type(rule["source_ids"]) is list and rule["source_ids"] and all(type(x) is str and x in source_ids for x in rule["source_ids"]), f"invalid source_ids in {rid}")
            m = obj(rule["match"], f"rule {rid} match")
            require(m and m.keys() <= MATCH_FIELDS and "role" in m, f"invalid match in {rid}")
            require(type(m["role"]) is str and m["role"] in roles, f"unknown role in rule {rid}")
            require(all(type(x) is str and x for x in m.values()), f"invalid match values in {rid}")
            require(type(rule["min_blocks"]) is int and rule["min_blocks"] > 0, f"invalid min_blocks in {rid}")
            a = obj(rule["assertion"], f"rule {rid} assertion")
            op = a.get("op")
            if op == "one_of":
                keys(a, {"op", "property", "values"}, set(), f"assertion {rid}")
                require(type(a["property"]) is str and a["property"] and type(a["values"]) is list and a["values"] and all(scalar(x) for x in a["values"]), f"invalid one_of in {rid}")
            elif op == "range":
                keys(a, {"op", "property", "min", "max"}, set(), f"assertion {rid}")
                require(type(a["property"]) is str and a["property"] and finite_num(a["min"]) and finite_num(a["max"]) and a["min"] <= a["max"], f"invalid range in {rid}")
            elif op == "equal_to_reference":
                keys(a, {"op", "property", "reference_block"}, {"tolerance"}, f"assertion {rid}")
                require(type(a["property"]) is str and a["property"] and type(a["reference_block"]) is str and a["reference_block"] in blockmap, f"invalid reference in {rid}")
                tol = a.get("tolerance", 0)
                require(finite_num(tol) and tol >= 0, f"invalid tolerance in {rid}")
            elif op == "contained":
                keys(a, {"op"}, {"tolerance"}, f"assertion {rid}")
                tol = a.get("tolerance", 0)
                require(finite_num(tol) and tol >= 0, f"invalid tolerance in {rid}")
            elif op == "contrast":
                keys(a, {"op", "foreground", "background", "minimum"}, set(), f"assertion {rid}")
                require(all(type(a[k]) is str and a[k] for k in ("foreground", "background")) and finite_num(a["minimum"]) and 1 <= a["minimum"] <= 21, f"invalid contrast in {rid}")
            elif op == "review":
                keys(a, {"op", "question"}, set(), f"assertion {rid}")
                require(type(a["question"]) is str and a["question"], f"invalid review question in {rid}")
            else:
                raise Invalid(f"unknown assertion op in {rid}: {op}")

            matched = [b for b in blocks if all((b["role"] if k == "role" else b[k] if k in ("variant", "state") else capmap[b["capture_id"]][k]) == val for k, val in m.items())]
            ids = [b["id"] for b in matched]
            status, reasons, counter = "passed", [], []
            def missing(b, names):
                for name in names:
                    p = b["properties"].get(name)
                    if p is None: return f"{b['id']}.{name} is missing"
                    if p["method"] == "estimated": return f"{b['id']}.{name} is estimated"
                return None
            if op == "review":
                status = "review_required"; reasons.append(a["question"])
            elif len(matched) < rule["min_blocks"]:
                status = "unverified"; reasons.append(f"matched {len(matched)} blocks; min_blocks is {rule['min_blocks']}")
            elif op == "equal_to_reference":
                ref = blockmap[a["reference_block"]]
                peers = [x for x in matched if x["id"] != ref["id"]]
                if ref not in matched:
                    status = "unverified"; reasons.append("reference block does not match this rule profile")
                elif not peers:
                    status = "unverified"; reasons.append("no distinct matching peer for reference")
                else:
                    prop = a["property"]
                    missing_reason = missing(ref, [prop])
                    for pblock in peers:
                        missing_reason = missing_reason or missing(pblock, [prop])
                    if missing_reason:
                        status = "unverified"; reasons.append(missing_reason)
                    else:
                        rv = ref["properties"][prop]["value"]
                        for pblock in peers:
                            pv = pblock["properties"][prop]["value"]
                            ok = abs(rv - pv) <= a.get("tolerance", 0) if finite_num(rv) and finite_num(pv) else typed_equal(rv, pv)
                            if not ok:
                                counter.append({"block_id": pblock["id"], "reference_block": ref["id"], "property": prop, "observed": pv, "reference": rv})
                if counter: status = "failed"
            else:
                for b in matched:
                    why = None
                    if op in ("one_of", "range"):
                        prop = a["property"]; why = missing(b, [prop])
                        if not why:
                            val = b["properties"][prop]["value"]
                            ok = any(typed_equal(val, v) for v in a["values"]) if op == "one_of" else finite_num(val) and a["min"] <= val <= a["max"]
                            if not ok: counter.append({"block_id": b["id"], "property": prop, "observed": val, "predicate": "one_of" if op == "one_of" else {"min": a["min"], "max": a["max"]}})
                    elif op == "contained":
                        c = capmap[b["capture_id"]]; r = b["rect"]; t = a.get("tolerance", 0)
                        if "rect_provenance" not in b or b["rect_provenance"]["method"] == "estimated":
                            why = f"{b['id']} frame provenance is missing or estimated"
                        elif r["x"] < -t or r["y"] < -t or r["x"] + r["width"] > c["viewport"]["width"] + t or r["y"] + r["height"] > c["viewport"]["height"] + t:
                            counter.append({"block_id": b["id"], "rect": r, "viewport": c["viewport"]})
                    elif op == "contrast":
                        fg, bg = a["foreground"], a["background"]
                        why = missing(b, [fg, bg])
                        if not why:
                            fp, bp = b["properties"][fg], b["properties"][bg]
                            fv, bv = fp["value"], bp["value"]
                            if fp["method"] not in ("dom", "accessibility", "source", "measured") or bp["method"] not in ("dom", "accessibility", "source", "measured") or not isinstance(fv, str) or not isinstance(bv, str) or not HEX.fullmatch(fv) or not HEX.fullmatch(bv):
                                why = f"{b['id']} contrast requires opaque #RRGGBB colors with adequate provenance"
                            else:
                                l1, l2 = sorted((luminance(fv), luminance(bv)), reverse=True)
                                ratio = (l1 + .05) / (l2 + .05)
                                if ratio < a["minimum"]: counter.append({"block_id": b["id"], "foreground": fv, "background": bv, "ratio": round(ratio, 4), "minimum": a["minimum"]})
                    if why: status = "unverified"; reasons.append(why)
                if counter: status = "failed"
            results.append({"id": rid, "status": status, "matched_block_ids": ids, "reasons": list(dict.fromkeys(reasons)), "counterexamples": counter})
        counts = {s: sum(r["status"] == s for r in results) for s in ("passed", "failed", "unverified", "review_required")}
        report = {"version": 1, "scope": {"capture_count": len(caps), "block_count": len(blocks), "rules_sha256": sha(rp), "evidence_sha256": sha(ep)}, "source_freshness": source_report, "results": results, "summary": counts, "limitations": ["Covers only registered rules and supplied observations.", "A hash confirms byte identity, not screenshot origin, classification correctness, or measurement accuracy.", "Manual UX review remains required; estimated and absent properties cannot prove executable assertions."]}
        require(not out.exists(), f"output already exists: {out}")
        out.parent.mkdir(parents=True, exist_ok=True)
        # exclusive create avoids clobbering a concurrently-created report
        with out.open("x", encoding="utf-8") as f: json.dump(report, f, indent=2, ensure_ascii=False); f.write("\n")
        return 0 if all(x["status"] == "passed" for x in results) else 1
    except Invalid as e:
        print(f"check_rules: invalid input: {e}", file=sys.stderr); return 2
    except OSError as e:
        print(f"check_rules: I/O error: {e}", file=sys.stderr); return 2
    except (TypeError, ValueError, KeyError, AttributeError, OverflowError) as e:
        print(f"check_rules: invalid input: {e}", file=sys.stderr); return 2


if __name__ == "__main__":
    sys.exit(main())
