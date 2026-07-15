#!/usr/bin/env python3
"""Статик-сервер с SPA-фолбэком — локальная проверка deep-link'ов.

    python3 dev/spa-server.py [порт] [каталог]     # по умолчанию 8321 public

Любой путь, за которым нет файла на диске (/portfolios/analytics и т.п.),
отдаёт public/index.html — ровно как not_found_handling =
"single-page-application" у Cloudflare Workers Static Assets (wrangler.jsonc).
Обычный `python3 -m http.server` на такие пути отвечает 404, и глубокие
ссылки в превью проверить нельзя.
"""
import http.server
import os
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
root = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else 'public')


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=root, **kwargs)

    # send_head обслуживает и GET, и HEAD
    def send_head(self):
        if not os.path.exists(self.translate_path(self.path)):
            self.path = '/index.html'
        return super().send_head()


if __name__ == '__main__':
    print(f'SPA-фолбэк: http://127.0.0.1:{port} → {root}')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), SpaHandler).serve_forever()
