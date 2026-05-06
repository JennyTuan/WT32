from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

ROOT = Path(r'C:\CT-Prototype-backup\CT-Prototype\backend\data')
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:5175')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()
    def translate_path(self, path):
        if path.startswith('/dicom-out/'):
            rel = path[len('/dicom-out/'):]
            return str(ROOT / 'dicom_out' / rel.replace('/', os.sep))
        return str(ROOT / path.lstrip('/').replace('/', os.sep))

httpd = ThreadingHTTPServer(('127.0.0.1', 8000), Handler)
httpd.serve_forever()
