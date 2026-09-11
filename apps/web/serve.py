#!/usr/bin/env python3
"""Static file server for apps/web, with the real production security headers.

Headers come from `_headers` (the same file Cloudflare Pages serves), so local
development and production cannot drift. A Content-Security-Policy has to be a
real HTTP header: a `<meta http-equiv>` CSP is ignored for `frame-ancestors` and
logs a warning on every page load.

Usage:
    python3 apps/web/serve.py [--port 4181]

Serves the directory this file lives in (apps/web), regardless of cwd.
"""

import argparse
import functools
import http.server
import os

HEADERS_FILE = "_headers"


def parse_headers(path):
    """Parse a Cloudflare Pages `_headers` file into {pattern: [(name, value)]}.

    A pattern line starts at column 0; the header lines under it are indented.
    `#` comments and blank lines are ignored.
    """
    rules = {}
    pattern = None
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line[0].isspace():
                pattern = line.strip()
                rules.setdefault(pattern, [])
                continue
            if pattern is None:
                raise ValueError(f"header line before any path pattern: {line!r}")
            name, _, value = line.strip().partition(":")
            if not name or not value.strip():
                raise ValueError(f"malformed header line: {line!r}")
            rules[pattern].append((name.strip(), value.strip()))
    return rules


def matches(pattern, path):
    """Minimal `_headers` pattern matching: `/*`, a `/*`-suffixed prefix, or exact."""
    if pattern == "/*":
        return True
    if pattern.endswith("/*"):
        return path.startswith(pattern[:-1])
    return path == pattern


def headers_for(request_path, rules):
    """Headers applying to a request path, in file order (later rules win)."""
    path = request_path.split("?", 1)[0]
    headers = []
    for pattern, pairs in rules.items():
        if matches(pattern, path):
            headers.extend(pairs)
    return headers


class HeaderedHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for name, value in headers_for(self.path, self.server.rules):
            if name.lower() == "cache-control":
                continue  # replaced below — in dev, edits must show up instantly
            self.send_header(name, value)
        # Dev convenience: never cache, so a reload always reflects the file.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class HeaderedServer(http.server.ThreadingHTTPServer):
    rules = {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4181)
    args = parser.parse_args()

    web_dir = os.path.dirname(os.path.abspath(__file__))
    headers_path = os.path.join(web_dir, HEADERS_FILE)
    rules = parse_headers(headers_path)

    handler = functools.partial(HeaderedHandler, directory=web_dir)
    server = HeaderedServer(("127.0.0.1", args.port), handler)
    server.rules = rules

    global_names = ", ".join(name for name, _ in rules.get("/*", []))
    print(f"Serving {web_dir} on http://127.0.0.1:{args.port}")
    print(f"Headers from {HEADERS_FILE} (/*): {global_names or 'none'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
