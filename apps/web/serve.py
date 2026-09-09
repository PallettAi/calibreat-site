#!/usr/bin/env python3
"""Static file server for apps/web with security headers.

The site's Content-Security-Policy is delivered as a real HTTP header (not a
<meta http-equiv> tag), so the browser console stays clean — meta-tag CSP is
ignored for `frame-ancestors` and warns on every page load.

Usage:
    python3 apps/web/serve.py [--port 4181]

Serves the directory this file lives in (apps/web), regardless of cwd.
"""

import argparse
import functools
import http.server
import os

# Keep in sync with the policy documented in .github/workflows/deploy-site.yml
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "form-action 'self' mailto: https:; "
    "frame-ancestors 'none'; "
    "img-src 'self' data: https:; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "connect-src https://fonts.googleapis.com https://fonts.gstatic.com"
)

SECURITY_HEADERS = [
    ("Content-Security-Policy", CONTENT_SECURITY_POLICY),
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
]


class HeaderedHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for name, value in SECURITY_HEADERS:
            self.send_header(name, value)
        # Dev convenience: always fetch fresh files so edits show up instantly.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4181)
    args = parser.parse_args()

    web_dir = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(HeaderedHandler, directory=web_dir)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {web_dir} on http://127.0.0.1:{args.port} (with security headers)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
