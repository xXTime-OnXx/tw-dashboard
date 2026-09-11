import pytest
from tw_data import cli


def test_coverage_written_only_after_events_and_before_cursor(monkeypatch):
    calls = []

    class Storage:
        def __init__(self, **kwargs):
            pass

        def read_cursor(self, world):
            return None

        def write_events(self, events):
            calls.append("events")
            return 0

        def write_conquest_check(self, world, since, until, count):
            assert since == 6400
            assert until == 10000
            assert count == 0
            calls.append("coverage")

        def write_cursor(self, world, now):
            calls.append("cursor")

    class Client:
        def get_conquests(self, world, since):
            return []

    for key in ["R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]:
        monkeypatch.setenv(key, "test")
    monkeypatch.setattr(cli, "R2Storage", Storage)
    monkeypatch.setattr(cli, "TribalWarsClient", Client)
    monkeypatch.setattr(cli.time, "time", lambda: 10000)
    cli.collect_conquests("de259")
    assert calls == ["events", "coverage", "cursor"]

    calls.clear()

    def fail(self, events):
        raise RuntimeError("storage failed")

    monkeypatch.setattr(Storage, "write_events", fail)
    with pytest.raises(RuntimeError):
        cli.collect_conquests("de259")
    assert calls == []
