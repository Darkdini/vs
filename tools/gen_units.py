#!/usr/bin/env python3
"""Генератор data/units.json и таблицы юнитов для docs/02-game-design.md.

Баланс = шаблон роли (ROLES) x модификатор расы (RACES).
Меняете числа здесь -> перезапускаете -> получаете новый units.json и таблицу.

    python3 tools/gen_units.py            # пишет data/units.json
    python3 tools/gen_units.py --markdown # печатает markdown-таблицы
"""
import json
import math
import sys
from pathlib import Path

RESOURCES = ["food", "wood", "stone", "iron"]

# Базовый шаблон роли (до модификатора расы).
# type: infantry | cavalry | magic | siege | special
# atk — физическая атака, mag — магическая атака,
# d_inf / d_cav / d_mag — защита от пехоты / кавалерии / магии,
# speed — клеток карты в час, carry — грузоподъёмность,
# upkeep — еда в час, pop — занимаемое население,
# cost — суммарная стоимость (делится между ресурсами по профилю расы),
# time — секунд тренировки при 1 ур. здания,
# building — где тренируется, req — требования (здание: уровень).
ROLES = [
    # role,          type,       atk, mag, d_inf, d_cav, d_mag, speed, carry, upkeep, pop, cost, time,  building,       req
    ("def_inf",      "infantry",  20,   0,   45,    40,    15,    6,    30,    1,      1,   360,  600,  "barracks",     {"barracks": 1}),
    ("atk_inf",      "infantry",  50,   0,   25,    15,    10,    6,    50,    1,      1,   400,  700,  "barracks",     {"barracks": 1, "smithy": 1}),
    ("ranged",       "infantry",  35,   0,   50,    25,    20,    5,    25,    1,      1,   420,  800,  "barracks",     {"barracks": 3, "academy": 1}),
    ("elite_inf",    "infantry",  70,   0,   40,    60,    25,    5,    40,    1,      1,   700,  1300, "barracks",     {"barracks": 10, "academy": 10, "smithy": 5}),
    ("scout",        "cavalry",    0,   0,   10,    5,     5,     16,   0,     1,      2,   300,  600,  "stable",       {"stable": 1, "academy": 3}),
    ("light_cav",    "cavalry",   90,   0,   20,    30,    10,    14,   90,    2,      2,   900,  1500, "stable",       {"stable": 1, "academy": 5}),
    ("heavy_cav",    "cavalry",  130,   0,   70,    50,    30,    10,   60,    3,      3,   1500, 2400, "stable",       {"stable": 10, "academy": 15, "smithy": 10}),
    ("mage",         "magic",     10,  90,   20,    20,    60,    5,    0,     2,      2,   1300, 2000, "academy",      {"academy": 10, "temple": 3}),
    ("ram",          "siege",     60,   0,   30,    75,    10,    4,    0,     3,      3,   1100, 3000, "workshop",     {"workshop": 1, "academy": 8}),
    ("catapult",     "siege",     75,   0,   60,    10,    10,    3,    0,     6,      4,   1800, 5000, "workshop",     {"workshop": 10, "academy": 15}),
    ("merchant",     "special",    0,   0,   5,     5,     5,     12,   500,   1,      1,   400,  1200, "market",       {"market": 1}),
    ("settler",      "special",    0,   0,   80,    80,    80,    5,    3000,  1,      1,   5000, 9000, "residence",    {"residence": 10}),
    ("rebel",        "special",   40,   0,   30,    25,    20,    4,    0,     5,      5,   3000, 7000, "residence",    {"residence": 10, "academy": 20}),
    ("archaeologist","special",    0,   0,   10,    10,    10,    5,    0,     1,      1,   1200, 3600, "archaeology",  {"archaeology": 1}),
    ("general",      "special",  100,  20,  100,   100,    60,    7,    0,     6,      6,   6000, 14400,"general_hq",   {"general_hq": 1}),
    ("legendary",    "magic",    250,  50,  150,   150,   100,    7,    100,   6,      6,   6000, 10800,"temple",       {"temple": 10, "treasury": 10}),
]

ROLE_TITLES = {
    "def_inf": "Базовый защитник", "atk_inf": "Базовый атакующий", "ranged": "Стрелок",
    "elite_inf": "Элитная пехота", "scout": "Разведчик", "light_cav": "Лёгкая кавалерия",
    "heavy_cav": "Тяжёлая кавалерия", "mage": "Маг", "ram": "Таран (стены)",
    "catapult": "Катапульта (здания)", "merchant": "Торговец (караван)",
    "settler": "Поселенец (новый замок)", "rebel": "Бунтарь (лояльность)",
    "archaeologist": "Археолог (экспедиции)", "general": "Генерал (оазисы, командование)",
    "legendary": "Легендарный (нужен артефакт)",
}

# Модификаторы рас. main — основной ресурс (доля main_share от стоимости).
RACES = {
    "humans": {
        "title": "Люди", "main": "iron", "main_share": 0.40,
        "atk": 1.00, "mag": 1.00, "def": 1.00, "speed": 1.00,
        "cost": 1.00, "time": 0.85, "upkeep": 1.00, "pop": 1.00,
        "note": "Баланс; тренируются на 15% быстрее («учатся быстро»)",
    },
    "elves": {
        "title": "Эльфы", "main": "wood", "main_share": 0.40,
        "atk": 0.80, "mag": 1.20, "def": 1.30, "speed": 1.05,
        "cost": 1.00, "time": 1.00, "upkeep": 1.00, "pop": 1.00,
        "note": "Сильная защита и магия, слабая атака",
    },
    "dwarves": {
        "title": "Гномы", "main": "stone", "main_share": 0.40,
        "atk": 1.25, "mag": 0.80, "def": 0.85, "speed": 0.90,
        "cost": 1.00, "time": 1.00, "upkeep": 1.00, "pop": 1.00,
        "note": "Сильная атака, слабая защита, средняя скорость; тайники x2",
    },
    "orcs": {
        "title": "Орки", "main": "food", "main_share": 0.45,
        "atk": 2.50, "mag": 1.00, "def": 0.90, "speed": 1.00,
        "cost": 1.80, "time": 1.40, "upkeep": 2.00, "pop": 1.50,
        "note": "Атака в 2 раза выше гномьей, но юниты дорогие и «немногочисленные»; много еды на содержание",
    },
}

# Названия. src=True — название подтверждено в оригинале.
NAMES = {
    "humans": {
        "def_inf": "Ополченец", "atk_inf": "Мечник", "ranged": "Арбалетчик", "elite_inf": "Паладин",
        "scout": "Разведчик", "light_cav": "Всадник", "heavy_cav": "Рыцарь", "mage": "Боевой маг",
        "ram": "Таран", "catapult": "Катапульта", "merchant": "Торговец", "settler": "Поселенец",
        "rebel": "Бунтарь", "archaeologist": "Археолог", "general": "Генерал", "legendary": "Грифон-страж",
    },
    "elves": {
        "def_inf": "Страж рощи", "atk_inf": "Танцующий с клинками", "ranged": "Эльф-лучник",
        "elite_inf": "Зверь", "scout": "Разведчик", "light_cav": "Кентавр", "heavy_cav": "Единорог",
        "mage": "Друид", "ram": "Древень", "catapult": "Метатель лоз", "merchant": "Путешественник",
        "settler": "Создатель", "rebel": "Бунтарь", "archaeologist": "Учёный", "general": "Генерал",
        "legendary": "Химера",
    },
    "dwarves": {
        "def_inf": "Защитник гор", "atk_inf": "Топорщик", "ranged": "Гном-арбалетчик",
        "elite_inf": "Берсерк", "scout": "Лазутчик", "light_cav": "Наездник на вепре",
        "heavy_cav": "Бронированный вепрь", "mage": "Рунный жрец", "ram": "Бур", "catapult": "Паровая баллиста",
        "merchant": "Караванщик", "settler": "Переселенец", "rebel": "Бунтарь", "archaeologist": "Рудознатец",
        "general": "Генерал", "legendary": "Железный голем",
    },
    "orcs": {
        "def_inf": "Гоблин-страж", "atk_inf": "Мародёр", "ranged": "Метатель копий", "elite_inf": "Тролль",
        "scout": "Следопыт", "light_cav": "Волчий всадник", "heavy_cav": "Всадник на ящере", "mage": "Шаман",
        "ram": "Таран-бивень", "catapult": "Камнемёт", "merchant": "Гоблин-торговец", "settler": "Вождь клана",
        "rebel": "Бунтарь", "archaeologist": "Грабитель могил", "general": "Генерал", "legendary": "Демон бездны",
    },
}
CONFIRMED = {
    ("elves", r) for r in ["atk_inf", "ranged", "elite_inf", "scout", "light_cav", "heavy_cav", "ram",
                           "merchant", "settler", "rebel", "archaeologist", "general", "legendary"]
} | {("dwarves", "def_inf"), ("orcs", "atk_inf")} | {(r, "general") for r in RACES} | {(r, "rebel") for r in RACES}

NO_SCALE = {"merchant", "settler", "archaeologist"}  # не боевые — атаку/защиту не масштабируем


def split_cost(total, race):
    main = race["main"]
    others = [r for r in RESOURCES if r != main]
    main_part = total * race["main_share"]
    rest = (total - main_part) / len(others)
    cost = {r: rest for r in others}
    cost[main] = main_part
    return {r: int(round(cost[r] / 5) * 5) for r in RESOURCES}


def build():
    units = []
    for race_id, race in RACES.items():
        for (role, typ, atk, mag, d_inf, d_cav, d_mag, speed, carry, upkeep, pop, cost, time, building, req) in ROLES:
            combat = role not in NO_SCALE
            a = race["atk"] if combat else 1
            d = race["def"] if combat else 1
            units.append({
                "id": f"{race_id}.{role}",
                "race": race_id,
                "role": role,
                "name": NAMES[race_id][role],
                "nameConfirmedInOriginal": (race_id, role) in CONFIRMED,
                "type": typ,
                "attack": round(atk * a),
                "magicAttack": round(mag * race["mag"]),
                "defense": {"infantry": round(d_inf * d), "cavalry": round(d_cav * d), "magic": round(d_mag * d)},
                "speed": round(speed * race["speed"], 1),
                "carry": carry,
                "upkeepFoodPerHour": math.ceil(upkeep * race["upkeep"]),
                "population": math.ceil(pop * race["pop"]),
                "cost": split_cost(cost * race["cost"], race),
                "trainTimeSec": int(time * race["time"]),
                "building": building,
                "requires": req,
                **({"requiresArtifact": True} if role == "legendary" else {}),
                **({"uniquePerCastle": True} if role == "general" else {}),
            })
    return units


def markdown(units):
    out = []
    for race_id, race in RACES.items():
        out.append(f"#### {race['title']} — основной ресурс: {race['main']}; {race['note']}\n")
        out.append("| Юнит | Роль | Атк | Маг | Защ пех/кав/маг | Скор | Груз | Еда/ч | Нас | Еда | Дер | Кам | Жел | Время | Здание |")
        out.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
        for u in units:
            if u["race"] != race_id:
                continue
            c, dfn = u["cost"], u["defense"]
            mark = " ✅" if u["nameConfirmedInOriginal"] else ""
            t = u["trainTimeSec"]
            out.append(
                f"| {u['name']}{mark} | {ROLE_TITLES[u['role']]} | {u['attack']} | {u['magicAttack']} | "
                f"{dfn['infantry']}/{dfn['cavalry']}/{dfn['magic']} | {u['speed']} | {u['carry']} | "
                f"{u['upkeepFoodPerHour']} | {u['population']} | {c['food']} | {c['wood']} | {c['stone']} | {c['iron']} | "
                f"{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d} | {u['building']} |")
        out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    units = build()
    if "--markdown" in sys.argv:
        print(markdown(units))
    else:
        path = Path(__file__).resolve().parent.parent / "data" / "units.json"
        path.write_text(json.dumps({"version": 1, "races": {k: {kk: vv for kk, vv in v.items()} for k, v in RACES.items()},
                                    "units": units}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(units)} units)")
