"""
Minimal Flask server to exercise BR_Bridge.tdl (v0).
Run: python scripts/bridge_test_server.py
Then trigger Gateway of Tally > Bridge Test (Alt+B) in TallyPrime.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse


HOST = "127.0.0.1"
PORT = 8000


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[bridge] {self.address_string()} - {fmt % args}")

    def do_POST(self) -> None:
        if self.path != "/tally/bridge":
            self.send_error(404, "Not Found")
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"_parse_error": raw[:500]}

        print("[bridge] headers:", dict(self.headers))
        print("[bridge] body:", body)

        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        mode = (qs.get("mode") or [""])[0]

        if mode == "import":
            xml = (
                "<ENVELOPE>"
                "<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST>"
                "<TYPE>Data</TYPE><ID>All Masters</ID></HEADER>"
                "<BODY><DATA></DATA></BODY>"
                "</ENVELOPE>"
            )
            out = {"cmd": "import_xml", "xml": xml}
        else:
            out = {"cmd": "show_message", "message": "Bridge connected"}

        payload = json.dumps(out).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    httpd = HTTPServer((HOST, PORT), Handler)
    print(f"Bridge mock listening on http://{HOST}:{PORT}/tally/bridge")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
