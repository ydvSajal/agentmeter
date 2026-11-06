"""Bounded serial capture; closing the monitor releases the board for flashing."""
import argparse
import time
import serial

parser = argparse.ArgumentParser()
parser.add_argument("--port", default="COM3")
parser.add_argument("--seconds", type=int, default=15)
args = parser.parse_args()
if not 1 <= args.seconds <= 45:
    parser.error("Capture must be between 1 and 45 seconds")
with serial.Serial(args.port, 115200, timeout=0.5) as board:
    deadline = time.monotonic() + args.seconds
    while time.monotonic() < deadline:
        chunk = board.read(4096)
        if chunk:
            print(chunk.decode("utf-8", errors="replace"), end="", flush=True)
