/* Собирает СТАТИЧЕСКУЮ версию мокапов: выполняет генерирующий скрипт исходника
   в Node с заглушкой document и запекает результат прямо в разметку. На выходе
   страница без единого <script> — она рисуется в любом просмотрщике, даже там,
   где скрипты не выполняются. */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SRC = path.join(DIR, 'trading-mockups.src.html');
const OUT = path.join(DIR, 'trading-mockups.html');

const html = fs.readFileSync(SRC, 'utf8');

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('нет <script> в исходнике'); process.exit(1); }

// заглушка DOM: ловим только присваивания innerHTML по id
const parts = {};
const shim = {
    getElementById(id) {
        return {
            set innerHTML(v) { parts[id] = v; },
            get innerHTML() { return parts[id] || ''; },
            insertAdjacentHTML(pos, h) { parts[id] = (parts[id] || '') + h; },
            querySelector() { return null; }
        };
    }
};
new Function('document', m[1])(shim);

let out = html;
Object.keys(parts).forEach(function (id) {
    const re = new RegExp('(<div[^>]*id="' + id + '"[^>]*>)\\s*</div>');
    if (!re.test(out)) { console.error('не нашёл контейнер #' + id); process.exit(1); }
    out = out.replace(re, function (_, open) { return open + parts[id] + '</div>'; });
});

// скрипт больше не нужен — страница уже нарисована
out = out.replace(/<script>[\s\S]*?<\/script>\s*/, '');

fs.writeFileSync(OUT, out, 'utf8');
console.log('файл:', path.basename(OUT), Math.round(out.length / 1024) + ' КБ, блоков:', Object.keys(parts).length);

/* версия для публикации: обёртку <html>/<head>/<body> ставит хостинг, а ссылки
   на шрифты CDN там всё равно режет CSP — снимаем их, стек фолбэков в --fU/--fN
   уже подобран (Georgia / системный гротеск / системный моно) */
const title = (out.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'Мокапы';
const style = (out.match(/<style>[\s\S]*?<\/style>/) || [])[0] || '';
const bodyInner = (out.match(/<body>([\s\S]*?)<\/body>/) || [])[1] || '';
const art = '<title>' + title + '</title>\n' + style + '\n' + bodyInner.trim() + '\n';
const ART = path.join(DIR, 'trading-mockups-artifact.html');
fs.writeFileSync(ART, art, 'utf8');
console.log('файл:', path.basename(ART), Math.round(art.length / 1024) + ' КБ');
