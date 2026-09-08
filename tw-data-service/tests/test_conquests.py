import pytest

from tw_data.conquests import event_id_for, parse_conquests


def test_parse_conquests_uses_live_endpoint_column_order():
    events = parse_conquests(
        "de259",
        "5114,1788787294,9563463,1577510147\n1207,1788787653,1577268024,0\n",
    )

    assert events[0].village_id == 5114
    assert events[0].new_owner_id == 9563463
    assert events[0].old_owner_id == 1577510147
    assert events[1].old_owner_id == 0


def test_parse_conquests_deduplicates_replayed_overlap():
    line = "5114,1788787294,9563463,1577510147"
    events = parse_conquests("de259", f"{line}\n{line}\n")
    assert len(events) == 1


def test_event_id_is_stable():
    assert event_id_for("de259", 1, 2, 3, 4) == event_id_for(
        "de259", 1, 2, 3, 4
    )


def test_upstream_error_is_rejected():
    with pytest.raises(ValueError, match="ONLY_ONE_DAY_AGO"):
        parse_conquests("de259", "ERR ONLY_ONE_DAY_AGO - too old")
