"""Run this file to set up MehrAI and open it in your browser."""

import hashlib
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser


ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8000"


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def main():
    if sys.version_info < (3, 10):
        raise RuntimeError("MehrAI requires Python 3.10 or newer.")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm or not shutil.which("node"):
        raise RuntimeError("Install Node.js (including npm), then run this file again.")

    with socket.socket() as port_check:
        try:
            port_check.bind(("127.0.0.1", 8000))
        except OSError as exc:
            raise RuntimeError("Port 8000 is already in use. Stop that server and try again.") from exc

    venv = ROOT / "backend" / ".venv"
    python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        print("Creating the Python environment...", flush=True)
        # Prefer the native Windows installation over an MSYS2 Python on PATH.
        launcher = shutil.which("py") if os.name == "nt" else None
        if launcher:
            run(launcher, "-3", "-m", "venv", str(venv))
        else:
            run(sys.executable, "-m", "venv", str(venv))

    requirements = ROOT / "backend" / "requirements.txt"
    dependency_key = hashlib.sha256(requirements.read_bytes() + b"\nlauncher-tzdata-v1").hexdigest()
    dependency_stamp = venv / ".mehr-dependencies"
    if not dependency_stamp.exists() or dependency_stamp.read_text() != dependency_key:
        print("Installing Python dependencies...", flush=True)
        run(str(python), "-m", "pip", "install", "-r", str(requirements), "tzdata")
        dependency_stamp.write_text(dependency_key)

    node_modules = ROOT / "node_modules"
    package_key = hashlib.sha256((ROOT / "package-lock.json").read_bytes() + (ROOT / "package.json").read_bytes()).hexdigest()
    package_stamp = node_modules / ".mehr-dependencies"
    if not package_stamp.exists() or package_stamp.read_text() != package_key:
        print("Installing frontend dependencies...", flush=True)
        run(npm, "ci")
        package_stamp.write_text(package_key)

    print("Building the frontend...", flush=True)
    run(npm, "run", "build")

    print(f"Starting MehrAI at {URL}. Press Ctrl+C to stop.", flush=True)
    server = subprocess.Popen(
        [str(python), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=ROOT,
    )
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if server.poll() is not None:
                raise RuntimeError("The server stopped during startup. See the error above.")
            try:
                with urllib.request.urlopen(URL, timeout=1) as response:
                    if response.status == 200:
                        webbrowser.open(URL)
                        break
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError("The server did not become ready within 60 seconds.")
        if server.wait() != 0:
            raise RuntimeError("The server stopped unexpectedly. See the error above.")
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nMehrAI stopped.")
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"\nCould not start MehrAI: {exc}", file=sys.stderr)
        sys.exit(1)
