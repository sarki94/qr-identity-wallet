# Performance and capacity measurements (4 November 2026)

Measured by the performance tests themselves (run with `pytest -s` / `vitest run` to see the printed figures).
Environment: Linux x86-64 cloud container, Python 3.13, Node 22. A low-end Android phone will be slower; the
budgets leave a margin of several hundred times.

| Test | Requirement | Budget | Measured |
|---|---|---|---|
| TC-CORE-070 | NFR-P1 full offline check (signature + challenge) | 3,000 ms | 0.32 ms (Python) |
| TC-WEB-013 | NFR-P1 same check in the browser library | 3,000 ms (test asserts < 300 ms) | 4.3 ms |
| TC-SVC-040 | NFR-P2 issuance through the Issuer API | 5,000 ms | 8 ms |
| TC-CORE-071 | NFR-C3 100,000-entry revocation list | 2 MB | 2.40 MB plain, 0.94 MB compressed |
| TC-WEB-016 | NFR-C3 same list in the phone cache | 2 MB | 1.41 MB |
| TC-SVC-042 | NFR-C3 list served gzip-compressed | gzip | Content-Encoding: gzip |
| TC-WEB-015 | NFR-C2 five wallet profiles | 5 MB | 3.4 KB |
| TC-SVC-041 | NFR-C4 one day of 2,000 records in one batch | 1 request | Accepted, chain intact |
| TC-CORE-072 | Signing throughput | < 10 ms per credential | Pass (500 signatures) |

Defect found by these tests: the first 100,000-entry list was 2.40 MB, over the 2 MB budget (TC-CORE-071 red).
Fixed with gzip in transit and a packed, deflated phone cache.
