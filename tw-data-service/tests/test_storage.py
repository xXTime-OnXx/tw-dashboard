import json
from io import BytesIO

from botocore.exceptions import ClientError

from tw_data.conquests import Conquest, event_id_for
from tw_data.storage import R2Storage


class FakeS3Client:
    def __init__(self):
        self.objects = {}

    def get_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise missing_key_error("GetObject")
        return {"Body": BytesIO(self.objects[Key])}

    def head_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise missing_key_error("HeadObject")
        return {}

    def put_object(self, *, Bucket, Key, Body, ContentType, **kwargs):
        self.objects[Key] = Body


def missing_key_error(operation):
    return ClientError({"Error": {"Code": "NoSuchKey"}}, operation)


def storage_with(client):
    storage = object.__new__(R2Storage)
    storage.bucket = "test-bucket"
    storage.client = client
    return storage


def conquest():
    values = ("de259", 5114, 1_788_787_294, 9_563_463, 1_577_510_147)
    return Conquest(*values, event_id=event_id_for(*values))


def test_cursor_round_trip_with_slotted_dataclass():
    client = FakeS3Client()
    storage = storage_with(client)

    assert storage.read_cursor("de259") is None
    storage.write_cursor("de259", 1_788_787_294)

    cursor = storage.read_cursor("de259")
    assert cursor is not None
    assert cursor.last_occurred_at == 1_788_787_294
    assert cursor.updated_at.endswith("+00:00")


def test_write_events_is_idempotent():
    client = FakeS3Client()
    storage = storage_with(client)
    event = conquest()

    assert storage.write_events([event, event]) == 1
    assert storage.write_events([event]) == 0

    event_keys = [key for key in client.objects if key.startswith("events/")]
    assert len(event_keys) == 1
    assert json.loads(client.objects[event_keys[0]]) == event.to_dict()


def test_snapshot_and_latest_manifest_are_written():
    from datetime import datetime, timezone

    from tw_data.snapshots import Snapshot

    client = FakeS3Client()
    storage = storage_with(client)
    captured_at = datetime(2026, 9, 8, 12, 17, tzinfo=timezone.utc)
    snapshot = Snapshot.create(
        "players",
        "https://de259.die-staemme.de/map/player.txt.gz",
        "text/csv",
        b"1,Player,0,1,100,1\n",
    )

    stored = storage.write_snapshot("de259", captured_at, snapshot)
    storage.write_snapshot_manifest("de259", captured_at, [stored])

    assert stored.key == (
        "snapshots/de259/players/date=2026-09-08/hour=12/"
        "20260908T121700Z.gz"
    )
    manifest = json.loads(client.objects["state/de259/snapshots/latest.json"])
    assert manifest["world"] == "de259"
    assert manifest["snapshots"][0]["key"] == stored.key


def test_world_config_uses_separate_latest_manifest():
    from datetime import datetime, timezone

    from tw_data.snapshots import Snapshot

    client = FakeS3Client()
    storage = storage_with(client)
    captured_at = datetime(2026, 9, 8, 12, 17, tzinfo=timezone.utc)
    snapshot = Snapshot.create(
        "world-config",
        "https://de259.die-staemme.de/interface.php?func=get_config",
        "application/xml",
        b"<config />",
    )

    stored = storage.write_snapshot("de259", captured_at, snapshot)
    storage.write_world_config_manifest("de259", captured_at, [stored])

    assert "state/de259/world-config/latest.json" in client.objects
    assert "state/de259/snapshots/latest.json" not in client.objects


def test_successful_conquest_check_records_query_interval():
    client = FakeS3Client()
    storage = storage_with(client)
    storage.write_conquest_check("de259", 1_788_787_000, 1_788_787_294, 0)
    checks = [json.loads(body) for key, body in client.objects.items()
              if "/conquest-checks/" in key]
    assert checks == [{"world": "de259", "queried_from": 1_788_787_000,
                       "queried_until": 1_788_787_294, "event_count": 0}]
