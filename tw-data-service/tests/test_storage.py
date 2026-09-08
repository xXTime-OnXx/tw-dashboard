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

    def put_object(self, *, Bucket, Key, Body, ContentType):
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
