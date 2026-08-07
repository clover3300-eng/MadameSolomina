# -*- coding: utf-8 -*-
"""Генерирует public/css/calc-r9.css ИЗ мокапа dev/mockups/calc3-mockups.src.html.

Правила берутся один в один: меняются только селекторы —
  .sc          -> #panel-calc .cx9          (корень рабочей площади)
  .sc.dark     -> body.dark-mode #panel-calc .cx9
  .sc.narrow   -> @media (max-width: 1439px)
  .foo         -> .c9-foo                   (префикс от коллизий с проектом)
Блоки сайдбара (.bx*, .mark, .bname, .grp) не переносятся: колонка в проде своя.
"""
import re, sys, json

SRC = 'dev/mockups/calc3-mockups.src.html'
OUT = 'public/css/calc-r9.css'
MAP = 'dev/mockups/calc3-classmap.json'

html = open(SRC, encoding='utf-8').read()
start = html.index('СЦЕНА ══')
start = html.rindex('/*', 0, start)
end = html.index('</style>', start)
css = html[start:end]
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)          # комментарии не переносим

SKIP = re.compile(r'(^|,)\s*\.(bx\b|bx-|mark\b|bname\b|grp\b)|\.sc\.dark \.mark')
ROOT = '#panel-calc .cx9'
DARK = 'body.dark-mode #panel-calc .cx9'

rules, narrow, classes = [], [], set()

def rename(sel):
    def r(m):
        n = m.group(1)
        classes.add(n)
        return '.c9-' + n
    return re.sub(r'\.([A-Za-z][\w-]*)', r, sel)

for chunk in css.split('}'):
    if '{' not in chunk:
        continue
    sel, decls = chunk.split('{', 1)
    sel, decls = sel.strip(), decls.strip()
    if not sel or not decls:
        continue
    if SKIP.search(sel):
        continue
    is_narrow = '.sc.narrow' in sel
    if sel == '.sc':
        keep = [d for d in decls.split(';')
                if d.strip().startswith('--')
                or d.strip().startswith('font-family')
                or d.strip().startswith('color:')
                or d.strip().startswith('-webkit-font-smoothing')]
        decls = ';'.join(x.strip() for x in keep if x.strip())
    elif sel == '.sc.dark':
        keep = [d for d in decls.split(';') if d.strip().startswith('--')]
        decls = ';'.join(x.strip() for x in keep if x.strip())
    elif sel == '.sc.narrow':
        continue                                          # геометрия сцены — не переносится
    parts = []
    for one in sel.split(','):
        one = one.strip()
        one = one.replace('.sc.narrow', '%R%').replace('.sc.dark', '%D%').replace('.sc', '%R%')
        one = rename(one)
        if '%R%' not in one and '%D%' not in one:
            one = '%R% ' + one          # каждое правило живёт только внутри монтажа
        parts.append(one)
    sel = ', '.join(parts)
    line = sel + '{' + decls + '}'
    (narrow if is_narrow else rules).append(line)

def sub(line):
    return line.replace('%R%', ROOT).replace('%D%', DARK)

head = """/* ==========================================================================
   R9 · «ПОЛКИ» — рабочая площадь вкладки «Расчёт»
   ==========================================================================
   ФАЙЛ СГЕНЕРИРОВАН из утверждённого мокапа dev/mockups/calc3-mockups.src.html
   (вариант Б, сцены Б.1–Б.4) скриптом: числа перенесены машиной, руками не
   правились. Селекторы отличаются от мокапа ровно тремя подстановками:
     .sc        -> #panel-calc .cx9
     .sc.dark   -> body.dark-mode #panel-calc .cx9
     .sc.narrow -> @media (max-width: 1439px)
   и префиксом .c9-* у каждого класса: в проекте уже есть .bt (522 объявления),
   .v3, .btn, .big, .qty, .num — без префикса они бы протекли в новую вёрстку.

   Перегенерация: python3 dev/gen-calc-r9-css.py (из корня репозитория).
   Правки вносить в МОКАП и перегенерировать, иначе слой и макет разойдутся.
   Ручные блоки проекта (монтаж, гашение старого слоя, поле суммы) лежат
   в calc-r9-mount.css.
   ========================================================================== */

"""

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(head)
    f.write('\n'.join(sub(x) for x in rules))
    f.write('\n\n/* узкий экран: та же полочная раскладка, ужатая (сцена 1280x800) */\n')
    f.write('@media (max-width: 1439px) {\n  ')
    f.write('\n  '.join(sub(x) for x in narrow))
    f.write('\n}\n')

json.dump(sorted(classes), open(MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('правил:', len(rules), '+ узких:', len(narrow), '| классов:', len(classes))
print(', '.join(sorted(classes)))
