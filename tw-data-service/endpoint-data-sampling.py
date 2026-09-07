from __future__ import annotations

import gzip
import time
from dataclasses import dataclass

import requests


WORLD = "de257"
BASE_URL = f"https://{WORLD}.die-staemme.de"

TIMEOUT = 30
SAMPLE_LINES = 5

# Use slightly less than 24 hours to avoid server/client clock drift issues.
CONQUER_SINCE = int(time.time()) - (24 * 60 * 60 - 5)


@dataclass
class Endpoint:
    name: str
    path: str
    gzipped: bool = False


ENDPOINTS = [
    Endpoint("players", "/map/player.txt.gz", True),
    Endpoint("villages", "/map/village.txt.gz", True),
    Endpoint("tribes", "/map/ally.txt.gz", True),
    Endpoint("conquers", "/map/conquer.txt.gz", True),

    Endpoint("player kills - attack", "/map/kill_att.txt.gz", True),
    Endpoint("player kills - defense", "/map/kill_def.txt.gz", True),
    Endpoint("player kills - support", "/map/kill_sup.txt.gz", True),
    Endpoint("player kills - all", "/map/kill_all.txt.gz", True),

    Endpoint("tribe kills - attack", "/map/kill_att_tribe.txt.gz", True),
    Endpoint("tribe kills - defense", "/map/kill_def_tribe.txt.gz", True),
    Endpoint("tribe kills - all", "/map/kill_all_tribe.txt.gz", True),

    Endpoint("world config", "/interface.php?func=get_config"),
    Endpoint("unit info", "/interface.php?func=get_unit_info"),
    Endpoint("building info", "/interface.php?func=get_building_info"),

    Endpoint(
        "conquer incremental (last 24h)",
        f"/interface.php?func=get_conquer&since={CONQUER_SINCE}",
    ),
]


def format_bytes(size: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    value = float(size)

    for unit in units:
        if value < 1024:
            return f"{value:.2f} {unit}"
        value /= 1024

    return f"{value:.2f} TB"


def download(endpoint: Endpoint) -> dict:
    url = BASE_URL + endpoint.path

    start = time.perf_counter()

    response = requests.get(
        url,
        timeout=TIMEOUT,
        headers={
            "User-Agent": "TribalWarsEndpointSizeAnalyzer/1.0"
        },
    )

    elapsed = time.perf_counter() - start

    response.raise_for_status()

    raw = response.content
    downloaded_size = len(raw)

    if endpoint.gzipped:
        try:
            data = gzip.decompress(raw)
        except gzip.BadGzipFile:
            # Some servers/clients may transparently decompress the response.
            data = raw
    else:
        data = raw

    decompressed_size = len(data)

    text = data.decode("utf-8", errors="replace")
    lines = text.splitlines()

    return {
        "name": endpoint.name,
        "url": url,
        "downloaded_size": downloaded_size,
        "decompressed_size": decompressed_size,
        "line_count": len(lines),
        "elapsed": elapsed,
        "sample": lines[:SAMPLE_LINES],
    }


def main():
    print(f"Analyzing Tribal Wars world: {WORLD}")
    print(f"Incremental conquer since: {CONQUER_SINCE}")
    print("=" * 100)

    results = []

    for endpoint in ENDPOINTS:
        try:
            result = download(endpoint)
            results.append(result)

            print(f"\n{result['name']}")
            print(f"URL:          {result['url']}")
            print(f"Download:     {format_bytes(result['downloaded_size'])}")
            print(f"Decompressed: {format_bytes(result['decompressed_size'])}")
            print(f"Rows:         {result['line_count']:,}")
            print(f"Time:         {result['elapsed']:.2f}s")

            if result["downloaded_size"] > 0:
                ratio = (
                    result["decompressed_size"]
                    / result["downloaded_size"]
                )
                print(f"Compression:  {ratio:.2f}x")

            print("Sample:")
            for line in result["sample"]:
                print(f"  {line[:200]}")

        except Exception as exc:
            print(f"\n{endpoint.name}")
            print(f"FAILED: {exc}")

    print("\n")
    print("=" * 100)
    print("SUMMARY")
    print("=" * 100)

    print(
        f"{'Endpoint':30}"
        f"{'Download':>15}"
        f"{'Uncompressed':>15}"
        f"{'Rows':>15}"
        f"{'Time':>10}"
    )

    total_downloaded = 0
    total_uncompressed = 0

    for result in results:
        total_downloaded += result["downloaded_size"]
        total_uncompressed += result["decompressed_size"]

        print(
            f"{result['name'][:30]:30}"
            f"{format_bytes(result['downloaded_size']):>15}"
            f"{format_bytes(result['decompressed_size']):>15}"
            f"{result['line_count']:>15,}"
            f"{result['elapsed']:>9.2f}s"
        )

    print("-" * 100)
    print(
        f"{'TOTAL':30}"
        f"{format_bytes(total_downloaded):>15}"
        f"{format_bytes(total_uncompressed):>15}"
    )


if __name__ == "__main__":
    main()