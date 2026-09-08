from __future__ import annotations

import csv
import hashlib
from dataclasses import asdict, dataclass
from io import StringIO


@dataclass(frozen=True, slots=True)
class Conquest:
    world: str
    village_id: int
    occurred_at: int
    new_owner_id: int
    old_owner_id: int
    event_id: str

    def to_dict(self) -> dict[str, str | int]:
        return asdict(self)


def event_id_for(
    world: str,
    village_id: int,
    occurred_at: int,
    new_owner_id: int,
    old_owner_id: int,
) -> str:
    value = f"{world}:{village_id}:{occurred_at}:{new_owner_id}:{old_owner_id}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def parse_conquests(world: str, body: str) -> list[Conquest]:
    if body.startswith("ERR "):
        raise ValueError(f"upstream returned: {body.strip()}")

    events: dict[str, Conquest] = {}
    for line_number, row in enumerate(csv.reader(StringIO(body)), start=1):
        if not row or (len(row) == 1 and not row[0].strip()):
            continue
        if len(row) != 4:
            raise ValueError(
                f"invalid conquest row {line_number}: expected 4 columns, got {len(row)}"
            )
        try:
            village_id, occurred_at, new_owner_id, old_owner_id = map(int, row)
        except ValueError as exc:
            raise ValueError(f"invalid integer in conquest row {line_number}") from exc

        identifier = event_id_for(
            world, village_id, occurred_at, new_owner_id, old_owner_id
        )
        events[identifier] = Conquest(
            world=world,
            village_id=village_id,
            occurred_at=occurred_at,
            new_owner_id=new_owner_id,
            old_owner_id=old_owner_id,
            event_id=identifier,
        )

    return sorted(events.values(), key=lambda event: (event.occurred_at, event.event_id))
