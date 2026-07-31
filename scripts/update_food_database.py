"""Download and normalize Taiwan FDA food nutrition data for the public site."""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

SOURCE_PAGE = "https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178"
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "database" / "food_nutrition_db.xlsx"
DEFAULT_OUTPUT = ROOT / "public-site" / "data" / "foods.json"


def download_latest(destination: Path) -> None:
    session = requests.Session()
    session.headers.update({"User-Agent": "nutrition-app/1.0"})
    session.mount("https://", HTTPAdapter(max_retries=Retry(
        total=4,
        connect=4,
        read=4,
        backoff_factor=2,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
    )))
    response = session.get(SOURCE_PAGE, timeout=60)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    candidates = []
    for anchor in soup.select("a[href]"):
        href = anchor.get("href", "")
        label = f"{anchor.get('title', '')} {anchor.get_text(' ', strip=True)} {href}".lower()
        if ("xls" in label or "excel" in label) and "pdf" not in label:
            candidates.append(urljoin(SOURCE_PAGE, href))
    if not candidates:
        raise RuntimeError("Taiwan FDA page did not expose an Excel download link")
    with session.get(candidates[0], timeout=180) as data:
        data.raise_for_status()
        destination.write_bytes(data.content)


def download_or_keep_last_verified(destination: Path) -> bool:
    try:
        download_latest(destination)
        return True
    except requests.RequestException as error:
        if not destination.is_file() or destination.stat().st_size == 0:
            raise
        print(f"::warning title=FDA download unavailable::Using the last verified Excel source ({type(error).__name__}).")
        return False


def number(value) -> float:
    parsed = pd.to_numeric(value, errors="coerce")
    return 0.0 if pd.isna(parsed) else round(float(parsed), 4)


def detect_allergens(text: str, rules: dict[str, list[str]]) -> str:
    lowered = text.lower()
    found = [kind for kind, words in rules.items() if any(word.lower() in lowered for word in words)]
    return ",".join(found)


def normalize(source: Path) -> dict:
    frame = pd.read_excel(source, header=1)
    rules = json.loads((ROOT / "database" / "allergens.json").read_text(encoding="utf-8"))
    rows = []
    for _, row in frame.iterrows():
        code = str(row.get("整合編號", "")).strip()
        name = str(row.get("樣品名稱", "")).strip()
        if not code or code == "nan" or not name or name == "nan":
            continue
        description = "" if pd.isna(row.get("內容物描述")) else str(row.get("內容物描述"))
        aliases = "" if pd.isna(row.get("俗名")) else str(row.get("俗名"))
        rows.append({
            "source_code": code,
            "name": name,
            "category": "" if pd.isna(row.get("食品分類")) else str(row.get("食品分類")),
            "description": description,
            "aliases": aliases,
            "unit": "100g",
            "calorie": number(row.get("修正熱量(kcal)", row.get("熱量(kcal)"))),
            "protein": number(row.get("粗蛋白(g)")),
            "fat": number(row.get("粗脂肪(g)")),
            "carb": number(row.get("總碳水化合物(g)")),
            "fiber": number(row.get("膳食纖維(g)")),
            "allergens": detect_allergens(f"{name} {description} {aliases}", rules),
        })
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    return {
        "schema_version": 1,
        "source": SOURCE_PAGE,
        "source_sha256": digest,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(rows),
        "foods": rows,
    }


def sql(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_migration(dataset: dict, destination: Path) -> None:
    statements = [
        "ALTER TABLE users ADD COLUMN email TEXT;",
        "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);",
        "ALTER TABLE foods ADD COLUMN source_code TEXT;",
        "ALTER TABLE foods ADD COLUMN aliases TEXT NOT NULL DEFAULT '';",
        "ALTER TABLE foods ADD COLUMN source_updated_at TEXT;",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_food_source_code ON foods(source_code);",
        "CREATE TABLE IF NOT EXISTS sync_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);",
    ]
    for food in dataset["foods"]:
        columns = ["source_code", "name", "category", "description", "aliases", "unit", "calorie", "protein", "fat", "carb", "fiber", "allergens", "status", "source_updated_at"]
        values = [food[k] for k in columns[:12]] + [1, dataset["generated_at"]]
        updates = ",".join(f"{c}=excluded.{c}" for c in columns[1:])
        statements.append(f"INSERT INTO foods({','.join(columns)}) VALUES({','.join(sql(v) for v in values)}) ON CONFLICT(source_code) DO UPDATE SET {updates};")
    statements.append(f"INSERT INTO sync_state(key,value) VALUES('food_source_sha256',{sql(dataset['source_sha256'])}) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text("\n".join(statements) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--migration", type=Path)
    args = parser.parse_args()
    source = args.input
    if args.download:
        source.parent.mkdir(parents=True, exist_ok=True)
        download_or_keep_last_verified(source)
    dataset = normalize(source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if args.migration:
        write_migration(dataset, args.migration)
    print(f"Normalized {dataset['count']} foods ({dataset['source_sha256'][:12]})")


if __name__ == "__main__":
    main()
