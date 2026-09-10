import gzip

from tw_data.snapshots import HOURLY_ENDPOINTS, WORLD_CONFIG_ENDPOINTS, Snapshot


def test_hourly_endpoint_names_and_paths_are_unique():
    assert len(HOURLY_ENDPOINTS) == 10
    assert len({endpoint.name for endpoint in HOURLY_ENDPOINTS}) == 10
    assert len({endpoint.path for endpoint in HOURLY_ENDPOINTS}) == 10
    assert all("/map/" in endpoint.path for endpoint in HOURLY_ENDPOINTS)


def test_world_configuration_is_manual_collection_only():
    assert len(WORLD_CONFIG_ENDPOINTS) == 3
    assert {endpoint.name for endpoint in WORLD_CONFIG_ENDPOINTS} == {
        "world-config",
        "unit-info",
        "building-info",
    }
    assert all("/interface.php" in endpoint.path for endpoint in WORLD_CONFIG_ENDPOINTS)


def test_snapshot_compresses_plain_payload():
    snapshot = Snapshot.create("players", "https://example.test", "text/csv", b"row\n")

    assert snapshot.body.startswith(b"\x1f\x8b")
    assert gzip.decompress(snapshot.body) == b"row\n"


def test_snapshot_preserves_existing_gzip_payload():
    body = gzip.compress(b"row\n")
    snapshot = Snapshot.create("players", "https://example.test", "text/csv", body)

    assert snapshot.body == body
