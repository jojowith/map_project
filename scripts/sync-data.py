#!/usr/bin/env python3
import csv
import json
import os
import ssl
from datetime import datetime, timezone
from io import StringIO
from urllib.request import urlopen

TAIPEI_SMOKING_CSV = "https://data.taipei/api/dataset/8b2fcdeb-d14b-46c4-92d8-66ad07b96a91/resource/acaa0f43-3b92-4241-b5eb-3f7fdd76b74f/download"
TAIPEI_NO_SMOKING_CSV = "https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=ccaeb9ba-fb75-45a6-8a1f-269527db8015"
NTPC_NO_SMOKING_JSON = "https://data.ntpc.gov.tw/api/datasets/6311e0c1-cd37-487f-95b9-83616dccaa02/json?page=0&size=1000"
YOUBIKE_JSON = "https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json"

DISTRICT_CODES = {
    "63000010": "松山區",
    "63000020": "信義區",
    "63000030": "大安區",
    "63000040": "中山區",
    "63000050": "中正區",
    "63000060": "大同區",
    "63000070": "萬華區",
    "63000080": "文山區",
    "63000090": "南港區",
    "63000100": "內湖區",
    "63000110": "士林區",
    "63000120": "北投區",
}

DEMO_NTPC_RESTRICTED_GEO = {
    ("蘆洲區", "永康公園"): (25.0842, 121.4628, 95),
    ("蘆洲區", "永平公園"): (25.0891, 121.4581, 85),
    ("蘆洲區", "三民公園"): (25.0919, 121.4621, 90),
    ("蘆洲區", "柳堤公園"): (25.0863, 121.4651, 75),
    ("蘆洲區", "仁愛公園"): (25.0868, 121.4687, 80),
}


def fetch_bytes(url):
    context = ssl._create_unverified_context()
    with urlopen(url, timeout=45, context=context) as response:
        return response.read()


def decode_text(payload):
    for encoding in ("utf-8-sig", "utf-8", "big5", "cp950"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("utf-8", errors="replace")


def fetch_text(url):
    return decode_text(fetch_bytes(url))


def parse_float(value):
    try:
        parsed = float(str(value).strip())
        return parsed if parsed else None
    except (TypeError, ValueError):
        return None


def parse_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def stable_crowd(index, district, name):
    seed = sum(ord(char) for char in f"{district}{name}") + index * 13
    return 28 + seed % 66


def sync_taipei_smoking():
    rows = csv.DictReader(StringIO(fetch_text(TAIPEI_SMOKING_CSV)))
    areas = []
    for index, row in enumerate(rows, start=1):
        lat = parse_float(row.get("緯度"))
        lng = parse_float(row.get("經度"))
        if lat is None or lng is None:
            continue
        district = row.get("行政區", "")
        name = row.get("地點", "")
        areas.append(
            {
                "id": f"taipei-smoking-{index}",
                "source": "臺北市指定吸菸區",
                "district": district,
                "name": name,
                "address": row.get("地址", ""),
                "type": row.get("樣態", ""),
                "openTime": row.get("開放時間", ""),
                "lat": lat,
                "lng": lng,
                "relativeLocation": row.get("相對位置", ""),
                "manager": row.get("管理單位", ""),
                "phone": row.get("管理單位電話", ""),
                "crowd": stable_crowd(index, district, name),
            }
        )
    return areas


def sync_taipei_restricted():
    rows = csv.DictReader(StringIO(fetch_text(TAIPEI_NO_SMOKING_CSV)))
    areas = []
    for index, row in enumerate(rows, start=1):
        lat = parse_float(row.get("Y"))
        lng = parse_float(row.get("X"))
        if lat is None or lng is None:
            continue
        district = DISTRICT_CODES.get(row.get("行政區"), row.get("行政區", ""))
        areas.append(
            {
                "id": f"taipei-no-smoking-{index}",
                "source": "臺北市公告禁菸場所",
                "city": "臺北市",
                "district": district,
                "name": row.get("地點", ""),
                "address": row.get("地址", ""),
                "lat": lat,
                "lng": lng,
                "radius": 65,
            }
        )
    return areas


def sync_ntpc_restricted():
    records = json.loads(fetch_text(NTPC_NO_SMOKING_JSON))
    areas = []
    for record in records:
        lat = parse_float(record.get("wgs84ay_latitude"))
        lng = parse_float(record.get("wgs84ax_longitude"))
        radius = 80
        if lat is None or lng is None:
            demo_geo = DEMO_NTPC_RESTRICTED_GEO.get((record.get("area"), record.get("name")))
            if not demo_geo:
                continue
            lat, lng, radius = demo_geo
        areas.append(
            {
                "id": f"ntpc-no-smoking-{record.get('seqno')}",
                "source": "新北市戶外無菸休憩空間",
                "city": "新北市",
                "district": record.get("area", ""),
                "name": record.get("name", ""),
                "address": record.get("address", ""),
                "lat": lat,
                "lng": lng,
                "radius": radius,
            }
        )
    return areas


def sync_youbike_nodes():
    records = json.loads(fetch_text(YOUBIKE_JSON))
    nodes = []
    for record in records:
        lat = parse_float(record.get("latitude"))
        lng = parse_float(record.get("longitude"))
        quantity = parse_int(record.get("Quantity"))
        rent = parse_int(record.get("available_rent_bikes"))
        returns = parse_int(record.get("available_return_bikes"))
        if lat is None or lng is None or quantity <= 0 or str(record.get("act")) != "1":
            continue
        used_ratio = 1 - min(quantity, max(0, rent)) / quantity
        imbalance = abs(rent - returns) / max(quantity, 1)
        pressure = max(0.05, min(1, used_ratio * 0.72 + imbalance * 0.28))
        nodes.append(
            {
                "id": f"youbike-{record.get('sno')}",
                "source": "YouBike2.0臺北市公共自行車即時資訊",
                "type": "youbike",
                "district": record.get("sarea", ""),
                "name": str(record.get("sna", "")).replace("YouBike2.0_", ""),
                "address": record.get("ar", ""),
                "lat": lat,
                "lng": lng,
                "capacity": quantity,
                "availableRentBikes": rent,
                "availableReturnBikes": returns,
                "pressure": round(pressure, 3),
                "updatedAt": record.get("updateTime") or record.get("mday", ""),
            }
        )
    return nodes


def write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def main():
    smoking = sync_taipei_smoking()
    restricted = sync_taipei_restricted() + sync_ntpc_restricted()
    mobility = sync_youbike_nodes()
    manifest = {
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sources": [
            {"name": "臺北市指定吸菸區", "url": TAIPEI_SMOKING_CSV, "count": len(smoking)},
            {"name": "臺北市公告禁菸場所", "url": TAIPEI_NO_SMOKING_CSV, "count": len([item for item in restricted if item["city"] == "臺北市"])},
            {"name": "新北市戶外無菸休憩空間", "url": NTPC_NO_SMOKING_JSON, "count": len([item for item in restricted if item["city"] == "新北市"])},
            {"name": "YouBike2.0臺北市公共自行車即時資訊", "url": YOUBIKE_JSON, "count": len(mobility)},
        ],
        "notes": [
            "臺北市公告禁菸場所使用具 X/Y 座標之製圖用子資源。",
            "新北市資料部分經緯度為空，僅同步官方有座標或本專案示範補點。正式版建議接地理編碼 API 補齊。",
            "YouBike pressure 為代理人流分數，不等於現場真實人數。",
        ],
    }

    write_json("data/smoking_areas.json", smoking)
    write_json("data/no_smoking_areas.json", restricted)
    write_json("data/mobility_nodes.json", mobility)
    write_json("data/source_manifest.json", manifest)

    print(f"Synced {len(smoking)} Taipei smoking areas")
    print(f"Synced {len(restricted)} no-smoking areas with coordinates")
    print(f"Synced {len(mobility)} YouBike proxy nodes")


if __name__ == "__main__":
    main()
