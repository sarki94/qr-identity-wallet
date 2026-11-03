"""Tamper-evident audit log: each record carries the hash of the previous one (FR-24, FR-25, NFR-S6).

Known limit: removing records from the END of the chain is not visible
from the chain alone. The Audit service therefore returns the latest
head hash to each verifier on upload, so truncation can be detected by
comparing heads.
"""
import hashlib
from typing import List, Mapping, NamedTuple, Optional, Sequence

from .encoding import canonical_json

GENESIS = "0" * 64


class ChainEntry(NamedTuple):
    record: dict
    prev_hash: str
    hash: str


def record_hash(record: Mapping, prev_hash: str) -> str:
    return hashlib.sha256(prev_hash.encode("ascii") + b"|" + canonical_json(dict(record))).hexdigest()


def append_record(chain: Sequence[ChainEntry], record: Mapping) -> List[ChainEntry]:
    prev = chain[-1].hash if chain else GENESIS
    return [*chain, ChainEntry(dict(record), prev, record_hash(record, prev))]


def verify_chain(chain: Sequence[ChainEntry]) -> Optional[int]:
    """Return the index of the first broken entry, or None if the chain is intact."""
    prev = GENESIS
    for i, entry in enumerate(chain):
        if entry.prev_hash != prev or record_hash(entry.record, entry.prev_hash) != entry.hash:
            return i
        prev = entry.hash
    return None
