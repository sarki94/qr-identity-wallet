"""Start all five services on this machine without Docker (Windows, macOS, Linux).

Usage (from the repository root, with the virtual environment active):
    python services/scripts/run_local.py
Stop with Ctrl+C.
"""
import subprocess  # nosec B404 (developer launcher; runs fixed commands, no user input)
import sys
import time

SERVICES = [
    ("mock-nimc", 8005, ["qrw_services.nimc.app:app"]),
    ("trust", 8003, ["qrw_services.trust.app:get_app", "--factory"]),
    ("auth", 8001, ["qrw_services.auth.app:get_app", "--factory"]),
    ("audit", 8004, ["qrw_services.audit.app:get_app", "--factory"]),
    ("issuer", 8002, ["qrw_services.issuer.app:get_app", "--factory"]),
]


def main() -> None:
    subprocess.run([sys.executable, "-m", "qrw_services.secrets"], check=True)  # nosec B603
    procs = []
    for name, port, target in SERVICES:
        cmd = [sys.executable, "-m", "uvicorn", *target, "--port", str(port), "--host", "127.0.0.1"]
        procs.append((name, subprocess.Popen(cmd)))  # nosec B603
        print(f"started {name:10s} http://127.0.0.1:{port}/docs")
        time.sleep(1.0)
    print("All services running. Press Ctrl+C to stop.")
    try:
        while all(p.poll() is None for _, p in procs):
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for _, p in procs:
            p.terminate()


if __name__ == "__main__":
    main()
