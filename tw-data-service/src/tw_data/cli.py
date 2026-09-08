from __future__ import annotations

import argparse
import os
import time

from .client import TribalWarsClient
from .storage import R2Storage


OVERLAP_SECONDS = 120
INITIAL_LOOKBACK_SECONDS = 3600


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def collect_conquests(world: str) -> None:
    storage = R2Storage(
        endpoint_url=required_env("R2_ENDPOINT_URL"),
        access_key_id=required_env("R2_ACCESS_KEY_ID"),
        secret_access_key=required_env("R2_SECRET_ACCESS_KEY"),
        bucket=required_env("R2_BUCKET"),
    )
    cursor = storage.read_cursor(world)
    now = int(time.time())
    since = (
        cursor.last_occurred_at - OVERLAP_SECONDS
        if cursor
        else now - INITIAL_LOOKBACK_SECONDS
    )
    events = TribalWarsClient().get_conquests(world, since)
    written = storage.write_events(events)

    # Advance to observation time, not merely the newest event. This prevents an
    # empty interval from being fetched forever; overlap protects the boundary.
    storage.write_cursor(world, now)
    print(f"world={world} fetched={len(events)} written={written} cursor={now}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="tw-data")
    subparsers = parser.add_subparsers(dest="command", required=True)
    conquests = subparsers.add_parser("collect-conquests")
    conquests.add_argument("--world", default="de259")
    args = parser.parse_args()

    if args.command == "collect-conquests":
        collect_conquests(args.world)
