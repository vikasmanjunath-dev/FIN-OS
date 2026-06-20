"""
Arya AI — In-memory TTL cache (L1).
Sits in front of SQLite (L2). Hot data lives here; avoids disk round-trips
for frequently-accessed quotes during market hours.
"""
import time
import threading
from typing import Any


class TTLCache:
    def __init__(self):
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock  = threading.Lock()

    def get(self, key: str, ttl: int) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry and (time.time() - entry[1]) < ttl:
                return entry[0]
        return None

    def set(self, key: str, value: Any):
        with self._lock:
            self._store[key] = (value, time.time())

    def delete(self, key: str):
        with self._lock:
            self._store.pop(key, None)

    def purge_stale(self, max_age: int = 3600):
        cutoff = time.time() - max_age
        with self._lock:
            self._store = {k: v for k, v in self._store.items() if v[1] > cutoff}

    def size(self) -> int:
        with self._lock:
            return len(self._store)


# Module-level singleton — import and use directly
_cache = TTLCache()

get    = _cache.get
set    = _cache.set
delete = _cache.delete
purge  = _cache.purge_stale
size   = _cache.size
