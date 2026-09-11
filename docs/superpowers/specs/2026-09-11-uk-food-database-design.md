# UK food database expansion — design

Date: 2026-09-11

## Job

Expand Eat food search so UK users get **generic everyday foods** and **supermarket packs** from free sources. Barcode scan stays Open Food Facts. Logs stay on-device. Compare table stays No until this ships in an APK.

## Sources

| Source | Role | When |
| --- | --- | --- |
| **CoFID 2021** (McCance & Widdowson, GOV.UK Excel, Open Government Licence) | Generic UK foods and recipes, per 100 g | Always, on-device |
| **Open Food Facts UK** (`uk.openfoodfacts.org`) | Packaged products, name search + barcode | Name search only if the **startup network probe** succeeded; barcode when the scan itself can reach the network |
| USDA FoodData Central | — | Out of scope |
| Quadram / CoFID HTTP API | — | Out of scope (CC BY-NC-SA, not usable in a paid product) |

Do **not** fall back to `world.openfoodfacts.org` when the UK list is thin — that mixed in non-UK food.

## Startup network probe

Probe Open Food Facts **once when the app process starts** (after unlock, root layout), not on every search.

- **Online at start** → this run’s name searches include OFF. If a later search cannot reach OFF, still show CoFID hits and say packs did not load. Do not silently drop OFF from the catalogue for that query.
- **Offline at start** → CoFID only until the user quits and reopens. Turning wifi on mid-session must not change search results.
- Barcode lookup is a live request at scan time (CoFID has no barcodes). A miss or no network is the existing empty/error path.

The probe result is process memory only (not persisted). Consistency is per launch, not forever.

## Name search

One box, same meal-log sheet.

1. Filter CoFID locally (case-insensitive name; query length ≥ 2, same as today).
2. If the startup probe was online, query UK OFF (`page_size=24`).
3. Merge into **one list, max ~20 rows**. Never merge a CoFID row and an OFF row into a single food.

**Order**

1. Close CoFID name matches (prefix / whole-word).
2. Other CoFID substring hits.
3. UK OFF hits, with **major grocers first** when brands or stores tags match: Tesco, Sainsbury’s, Asda, Morrisons, Aldi, Lidl, Co-op, Waitrose, M&S (Marks & Spencer), Iceland, Ocado.
4. Remaining UK OFF hits.

Each row shows a source label: `UK CoFID` or `Open Food Facts`. Coverage of supermarket packs is whatever those retailers have in OFF — we do not invent barcodes or scrape store sites.

CoFID portions are always **100 g** (scale grams like unpackaged OFF). OFF portions stay serving-or-100 g as today.

## CoFID bundle

Slim JSON shipped with the app, generated from the official spreadsheet (not the “old foods” sheet).

Per food, **per 100 g**:

- name, CoFID food code
- kcal, protein g, carbs g, fat g
- fibre g, sugars g, saturated fat g, sodium mg

No extra micronutrient columns in this slice. Build script records the GOV.UK source URL so the extract can be refreshed later. APK size stays a slim JSON (thousands of rows, not the 4 MB workbook).

## Attribution

Required by the Open Government Licence. Show in **Settings** and on the meal search footer / empty state:

> Generic foods: McCance and Widdowson’s Composition of Foods Integrated Dataset, Public Health England, Open Government Licence. Packaged products: Open Food Facts contributors.

Privacy copy already notes OFF queries; keep that, and add that generic search is local CoFID.

## Logging and Eat remaining

Picking a CoFID or OFF hit still docks into the existing meal log (kcal + macros + extras when present). True Burn and remaining math are unchanged: remaining is still `target + Train kcal − food`.

## Out of scope

USDA, Quadram CoFID API, world OFF fallback, scraping supermarket sites, full CoFID micronutrient table, persisting the online/offline probe across launches, changing barcode to a second provider.
