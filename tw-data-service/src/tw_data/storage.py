from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Iterable

import boto3
from botocore.exceptions import ClientError

from .conquests import Conquest
from .snapshots import Snapshot, StoredSnapshot


@dataclass(frozen=True, slots=True)
class Cursor:
    last_occurred_at: int
    updated_at: str


class R2Storage:
    def __init__(
        self,
        endpoint_url: str,
        access_key_id: str,
        secret_access_key: str,
        bucket: str,
    ) -> None:
        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
        )

    def read_cursor(self, world: str) -> Cursor | None:
        try:
            response = self.client.get_object(
                Bucket=self.bucket, Key=f"state/{world}/conquest-cursor.json"
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                return None
            raise
        payload = json.loads(response["Body"].read())
        return Cursor(**payload)

    def event_exists(self, event: Conquest) -> bool:
        key = self._event_key(event)
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                return False
            raise

    def write_events(self, events: Iterable[Conquest]) -> int:
        written = 0
        for event in events:
            if self.event_exists(event):
                continue
            body = json.dumps(event.to_dict(), separators=(",", ":")).encode()
            self.client.put_object(
                Bucket=self.bucket,
                Key=self._event_key(event),
                Body=body,
                ContentType="application/json",
            )
            written += 1
        return written

    def write_conquest_check(self, world: str, since: int, until: int, event_count: int) -> None:
        """Persist successful query coverage after all returned events are durable."""
        moment = datetime.fromtimestamp(until, timezone.utc)
        key = (
            f"state/{world}/conquest-checks/date={moment:%Y-%m-%d}/"
            f"{until}.json"
        )
        payload = {"world": world, "queried_from": since, "queried_until": until,
                   "event_count": event_count}
        self.client.put_object(
            Bucket=self.bucket, Key=key,
            Body=json.dumps(payload, separators=(",", ":")).encode(),
            ContentType="application/json",
        )

    def write_cursor(self, world: str, last_occurred_at: int) -> None:
        cursor = Cursor(
            last_occurred_at=last_occurred_at,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        self.client.put_object(
            Bucket=self.bucket,
            Key=f"state/{world}/conquest-cursor.json",
            Body=json.dumps(asdict(cursor), separators=(",", ":")).encode(),
            ContentType="application/json",
        )

    def write_snapshot(
        self, world: str, captured_at: datetime, snapshot: Snapshot
    ) -> StoredSnapshot:
        key = (
            f"snapshots/{world}/{snapshot.name}/"
            f"date={captured_at:%Y-%m-%d}/hour={captured_at:%H}/"
            f"{captured_at:%Y%m%dT%H%M%SZ}.gz"
        )
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=snapshot.body,
            ContentType=snapshot.content_type,
            ContentEncoding="gzip",
        )
        return StoredSnapshot(
            name=snapshot.name,
            key=key,
            source_url=snapshot.source_url,
            content_type=snapshot.content_type,
            size_bytes=len(snapshot.body),
            sha256=snapshot.sha256,
        )

    def write_snapshot_manifest(
        self,
        world: str,
        captured_at: datetime,
        snapshots: Iterable[StoredSnapshot],
    ) -> None:
        payload = {
            "world": world,
            "captured_at": captured_at.isoformat(),
            "snapshots": [snapshot.to_dict() for snapshot in snapshots],
        }
        self.client.put_object(
            Bucket=self.bucket,
            Key=f"state/{world}/snapshots/latest.json",
            Body=json.dumps(payload, separators=(",", ":")).encode(),
            ContentType="application/json",
        )

    def write_world_config_manifest(
        self,
        world: str,
        captured_at: datetime,
        snapshots: Iterable[StoredSnapshot],
    ) -> None:
        payload = {
            "world": world,
            "captured_at": captured_at.isoformat(),
            "snapshots": [snapshot.to_dict() for snapshot in snapshots],
        }
        self.client.put_object(
            Bucket=self.bucket,
            Key=f"state/{world}/world-config/latest.json",
            Body=json.dumps(payload, separators=(",", ":")).encode(),
            ContentType="application/json",
        )

    @staticmethod
    def _event_key(event: Conquest) -> str:
        moment = datetime.fromtimestamp(event.occurred_at, timezone.utc)
        return (
            f"events/{event.world}/conquests/"
            f"date={moment:%Y-%m-%d}/hour={moment:%H}/{event.event_id}.json"
        )
