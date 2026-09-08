from __future__ import annotations

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .conquests import Conquest, parse_conquests


class TribalWarsClient:
    def __init__(self, timeout: int = 30) -> None:
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers["User-Agent"] = (
            "tw-dashboard-data-collector/0.1 "
            "(https://github.com/xXTime-OnXx/tw-dashboard)"
        )
        retries = Retry(
            total=4,
            backoff_factor=1,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET",),
            respect_retry_after_header=True,
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retries))

    def get_conquests(self, world: str, since: int) -> list[Conquest]:
        response = self.session.get(
            f"https://{world}.die-staemme.de/interface.php",
            params={"func": "get_conquer", "since": since},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return parse_conquests(world, response.text)
