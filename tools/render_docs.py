#!/usr/bin/env python3
"""Вставляет таблицы из data/*.json в docs/02-game-design.md между маркерами
<!-- GEN:name --> ... <!-- /GEN:name -->.

    python3 tools/gen_units.py && python3 tools/render_docs.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "docs" / "02-game-design.md"

sys_path = str(Path(__file__).resolve().parent)
import sys  # noqa: E402
sys.path.insert(0, sys_path)
import gen_units  # noqa: E402

LAYER = {"castle": "Замок", "lands": "Земли"}
TERRAIN = {"grass": "трава", "forest": "лес", "stone": "камни", "iron": "железо", "any": "любая"}
RACE = {"humans": "Люди", "elves": "Эльфы", "dwarves": "Гномы", "orcs": "Орки"}


def hms(sec):
    sec = int(sec)
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def buildings_table(b):
    names = {x["id"]: x["name"] for x in b["buildings"]}
    out = ["| Здание | Слой | Макс. ур. | Несколько? | Требования | Что даёт | Оригинал |",
           "|---|---|---|---|---|---|---|"]
    for x in b["buildings"]:
        req = ", ".join(f"{names[k]} {v}" for k, v in x["requires"].items()) or "—"
        layer = LAYER[x["layer"]] + (f" ({TERRAIN[x['terrain']]})" if "terrain" in x else "")
        if "race" in x:
            layer += f", только {RACE[x['race']]}"
        mx = str(x["maxLevel"]) + (f" (столица {x['capitalMaxLevel']})" if "capitalMaxLevel" in x else "")
        eff = "; ".join(f"`{k}`: {v if isinstance(v, str) else ', '.join(v)}" for k, v in x["effect"].items())
        out.append(f"| **{x['name']}** `{x['id']}` | {layer} | {mx} | {'да' if x['multiple'] else 'нет'} | {req} | "
                   f"{x['description']}<br>{eff} | {'✅' if x['confirmed'] else '🔶'} |")
    return "\n".join(out)


def levels_table(b, ids=("townhall", "warehouse", "barracks", "wall", "sawmill")):
    by = {x["id"]: x for x in b["buildings"]}
    out = []
    for bid in ids:
        x = by[bid]
        out.append(f"**{x['name']}** (рост стоимости ×{x['costGrowth']}, времени ×{x['timeGrowth']} за уровень)\n")
        out.append("| Ур. | Еда | Дерево | Камень | Железо | Время (Ратуша 0) | Время (Ратуша 10) |")
        out.append("|---|---|---|---|---|---|---|")
        levels = [l for l in (1, 2, 3, 5, 10, 15, 20) if l <= x.get("capitalMaxLevel", x["maxLevel"])]
        for l in levels:
            c = {k: int(round(v * x["costGrowth"] ** (l - 1) / 5) * 5) for k, v in x["baseCost"].items()}
            t = x["baseTimeSec"] * x["timeGrowth"] ** (l - 1)
            out.append(f"| {l} | {c['food']} | {c['wood']} | {c['stone']} | {c['iron']} | {hms(t)} | {hms(t * 0.964 ** 10)} |")
        out.append("")
    return "\n".join(out)


def storage_table(b):
    prod = b["productionTable"]["values"]
    out = ["| Ур. | Добыча клетки, ед/час | Вместимость склада/амбара | Спрятано в тайнике (гномы ×2) |",
           "|---|---|---|---|"]
    for l in range(0, 21):
        p = prod[l] if l < len(prod) else "—"
        cap = int(round(1000 * 1.22 ** l / 100) * 100) if l >= 1 else "—"
        cache = int(200 * 1.3 ** (l - 1)) if 1 <= l <= 10 else "—"
        out.append(f"| {l} | {p} | {cap} | {cache} |")
    return "\n".join(out)


def replace(doc, name, content):
    pat = re.compile(rf"(<!-- GEN:{name} -->\n)(?:.*?\n)?(<!-- /GEN:{name} -->)", re.S)
    if not pat.search(doc):
        raise SystemExit(f"marker GEN:{name} not found")
    return pat.sub(lambda m: m.group(1) + content.rstrip("\n") + "\n" + m.group(2), doc)


if __name__ == "__main__":
    b = json.loads((ROOT / "data" / "buildings.json").read_text(encoding="utf-8"))
    units = gen_units.build()
    doc = DOC.read_text(encoding="utf-8")
    doc = replace(doc, "buildings", buildings_table(b))
    doc = replace(doc, "levels", levels_table(b))
    doc = replace(doc, "storage", storage_table(b))
    doc = replace(doc, "units", gen_units.markdown(units))
    DOC.write_text(doc, encoding="utf-8")
    print(f"rendered {DOC}")
