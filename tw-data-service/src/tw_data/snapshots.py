from __future__ import annotations

import gzip
import hashlib
from dataclasses import asdict, dataclass


@dataclass(frozen=True, slots=True)
class SnapshotEndpoint:
    name: str
    path: str
    content_type: str


@dataclass(frozen=True, slots=True)
class Snapshot:
    name: str
    source_url: str
    content_type: str
    body: bytes
    sha256: str

    @classmethod
    def create(
        cls, name: str, source_url: str, content_type: str, body: bytes
    ) -> "Snapshot":
        compressed = body if body.startswith(b"\x1f\x8b") else gzip.compress(body)
        return cls(
            name=name,
            source_url=source_url,
            content_type=content_type,
            body=compressed,
            sha256=hashlib.sha256(compressed).hexdigest(),
        )


@dataclass(frozen=True, slots=True)
class StoredSnapshot:
    name: str
    key: str
    source_url: str
    content_type: str
    size_bytes: int
    sha256: str

    def to_dict(self) -> dict[str, str | int]:
        return asdict(self)


HOURLY_ENDPOINTS = (
    SnapshotEndpoint("players", "/map/player.txt.gz", "text/csv"),
    SnapshotEndpoint("villages", "/map/village.txt.gz", "text/csv"),
    SnapshotEndpoint("tribes", "/map/ally.txt.gz", "text/csv"),
    SnapshotEndpoint("player-kills-attack", "/map/kill_att.txt.gz", "text/csv"),
    SnapshotEndpoint("player-kills-defense", "/map/kill_def.txt.gz", "text/csv"),
    SnapshotEndpoint("player-kills-support", "/map/kill_sup.txt.gz", "text/csv"),
    SnapshotEndpoint("player-kills-all", "/map/kill_all.txt.gz", "text/csv"),
    SnapshotEndpoint(
        "tribe-kills-attack", "/map/kill_att_tribe.txt.gz", "text/csv"
    ),
    SnapshotEndpoint(
        "tribe-kills-defense", "/map/kill_def_tribe.txt.gz", "text/csv"
    ),
    SnapshotEndpoint("tribe-kills-all", "/map/kill_all_tribe.txt.gz", "text/csv"),
)


WORLD_CONFIG_ENDPOINTS = (
    SnapshotEndpoint("world-config", "/interface.php?func=get_config", "application/xml"),
    SnapshotEndpoint(
        "unit-info", "/interface.php?func=get_unit_info", "application/xml"
    ),
    SnapshotEndpoint(
        "building-info", "/interface.php?func=get_building_info", "application/xml"
    ),
)
