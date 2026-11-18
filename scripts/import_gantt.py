"""Convert the "General GANTT" Excel sheet into the portfolio app's JSON format.

    python -I scripts/import_gantt.py "<path to General GANTT.xlsx>" data/real.json

Uses only the standard library. The output contains real names, so it is written to
data/, which git ignores. Load it in the app with "Import data".

How the sheet is read
  - Column A starts a project; rows below it with an empty A are further budget years.
  - Columns H-K, M-P, Q-T, U-X are the quarters of 2026-2029 (L is a yearly total).
  - A quarter cell lists people as INITIALS(person-months), e.g. "DS(1), SC(1,5)".
  - Column E (MM) is the effort promised for that budget year; it is spread evenly
    over the quarters of that year in which the project runs.
  - Column B gives the grant and, in brackets, whether we take part as imec or UGent.
  - The names under "SIL people" are the team; initials are first + last name.
Anything the script could not read with confidence is listed at the end.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
QUARTER_COLS = {}  # column letter -> quarter index (year * 4 + quarter - 1)
for year, cols in ((2026, 'HIJK'), (2027, 'MNOP'), (2028, 'QRST'), (2029, 'UVWX')):
    for i, c in enumerate(cols):
        QUARTER_COLS[c] = year * 4 + i
notes = []


def read_sheet(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    first = wb.find('m:sheets', NS)[0]
    target = rels[first.get('{%s}id' % NS['r'])]
    root = ET.fromstring(z.read(target.lstrip('/') if target.startswith('/') else 'xl/' + target))
    rows = {}
    for row in root.iter('{%s}row' % NS['m']):
        cells = {}
        for c in row.findall('m:c', NS):
            v = c.find('m:v', NS)
            if c.get('t') == 's' and v is not None:
                val = shared[int(v.text)]
            elif c.get('t') == 'inlineStr':
                val = ''.join(t.text or '' for t in c.iter('{%s}t' % NS['m']))
            else:
                val = v.text if v is not None else None
            if val is not None and str(val).strip() != '':
                cells[re.match(r'[A-Z]+', c.get('r')).group()] = str(val).strip()
        if cells:
            rows[int(row.get('r'))] = cells
    return rows


def num(text):
    try:
        return float(str(text).replace(',', '.'))
    except ValueError:
        return None


def to_quarter(value, where):
    """An Excel date (serial number or d/m/yyyy text) as a quarter index, or None."""
    if value is None:
        return None
    n = num(value)
    if n is not None and n > 30000:
        d = date(1899, 12, 30) + timedelta(days=int(n))
        return d.year * 4 + (d.month - 1) // 3
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})$', value)
    if m:
        return int(m.group(3)) * 4 + (int(m.group(2)) - 1) // 3
    notes.append(f'{where}: date "{value}" not understood, derived from the allocations instead')
    return None


def slug(text):
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')


def main(src, out):
    rows = read_sheet(src)
    last = max(rows)

    # ---- team: the names listed under "SIL people" ----
    people, by_initials = [], {}
    start = next((r for r, c in rows.items() if c.get('A', '').lower().startswith('sil people')), None)
    if start is None:
        sys.exit('Could not find the "SIL people" block with the team names.')
    for r in range(start + 1, last + 1):
        name = rows.get(r, {}).get('A', '')
        if not name or name.lower().startswith('general'):
            if name:
                break
            continue
        if name.lower() == 'tekort' or len(name.split()) < 2:
            continue
        initials = (name.split()[0][0] + name.split()[-1][0]).upper()
        person = {'id': 'per_' + initials.lower(), 'name': name, 'capacity': 3, 'base': 0,
                  'teaching': [0, 0, 0, 0], 'start': None, 'end': None}
        people.append(person)
        by_initials[initials] = person

    # ---- projects ----
    projects, assignments = [], {}
    current = None
    for r in range(2, start):
        c = rows.get(r, {})
        if not c:
            continue
        if 'A' in c:
            grant = c.get('B', '')
            org = 'imec' if '(imec)' in grant.lower() else 'UGent'
            funder = re.sub(r'\s*\((imec|ugent)\)\s*', '', grant, flags=re.I).strip()
            current = {'id': 'prj_' + slug(c['A']), 'name': c['A'], 'org': org, 'funder': funder,
                       'color': len(projects) % 10, 'milestones': [], 'promised': {},
                       '_start': to_quarter(c.get('F'), c['A'] + ' start'),
                       '_end': to_quarter(c.get('G'), c['A'] + ' end') if c.get('G') not in (None, '…', '...') else None,
                       '_years': {}, '_quarters': set()}
            projects.append(current)
        if current is None:
            continue
        year = num(c.get('C', ''))
        if year:
            mm = c.get('E', '')
            total = sum(float(x.replace(',', '.')) for x in re.findall(r'\d+(?:[.,]\d+)?', mm)) if mm not in ('', '-') else 0
            if mm and num(mm) is None and mm != '-':
                notes.append(f'{current["name"]} {int(year)}: promised effort "{mm}" read as {total:g} PM')
            current['_years'][int(year)] = total
        for col, q in QUARTER_COLS.items():
            text = c.get(col)
            if not text or text == '-':
                continue
            if '?' in text:
                notes.append(f'{current["name"]} {q // 4} Q{q % 4 + 1}: "?" in the sheet, left empty')
                current['_quarters'].add(q)
                continue
            found = re.findall(r'([A-Z]{2})\s*\(\s*([\d.,]+)\s*\)', text)
            if not found:
                notes.append(f'{current["name"]} {q // 4} Q{q % 4 + 1}: "{text}" not understood, skipped')
            for initials, amount in found:
                pm = float(amount.replace(',', '.'))
                if initials not in by_initials:
                    notes.append(f'{current["name"]}: initials "{initials}" match nobody in the team list, skipped')
                    continue
                if pm > 4:
                    notes.append(f'{current["name"]} {q // 4} Q{q % 4 + 1}: {initials}({amount}) is more than a quarter holds; read as a yearly amount, so {pm / 4:g} PM')
                    pm = pm / 4
                key = (current['id'], by_initials[initials]['id'])
                a = assignments.setdefault(key, {'id': f'a_{len(assignments)}', 'projectId': key[0], 'personId': key[1], 'pm': {}})
                a['pm'][str(q)] = round(a['pm'].get(str(q), 0) + pm, 2)
                current['_quarters'].add(q)

    for p in projects:
        used = sorted(p['_quarters'])
        years = sorted(p['_years'])
        first_guess = used[0] if used else (years[0] * 4 if years else None)
        last_guess = max(used[-1] if used else 0, years[-1] * 4 + 3 if years else 0) or None
        p['start'] = p['_start'] if p['_start'] is not None else first_guess
        p['end'] = p['_end'] if p['_end'] is not None else last_guess
        if p['start'] is None or p['end'] is None:
            notes.append(f'{p["name"]}: no dates and no allocations; placed in 2026')
            p['start'], p['end'] = p['start'] or 2026 * 4, p['end'] or 2026 * 4 + 3
        if p['_start'] is None or p['_end'] is None:
            notes.append(f'{p["name"]}: start/end not both in the sheet; using Q{p["start"] % 4 + 1} {p["start"] // 4} to Q{p["end"] % 4 + 1} {p["end"] // 4}')
        if used and (used[0] < p['start'] or used[-1] > p['end']):
            notes.append(f'{p["name"]}: people are allocated outside the project dates; the project was widened to include them')
            p['start'], p['end'] = min(p['start'], used[0]), max(p['end'], used[-1])
        # Promised effort: the year's MM spread over the quarters of that year the project runs in.
        for year, mm in p['_years'].items():
            qs = [q for q in range(year * 4, year * 4 + 4) if p['start'] <= q <= p['end']]
            for q in qs:
                if mm:
                    p['promised'][str(q)] = round(mm / len(qs), 2)
        for k in [k for k in p if k.startswith('_')]:
            del p[k]

    # ---- PhD trackers for the projects called "PhD <first name>" ----
    phds = []
    for p in projects:
        m = re.match(r'phd\s+(\w+)', p['name'], re.I)
        owner = m and next((x for x in people if x['name'].split()[0].lower() == m.group(1).lower()), None)
        if owner:
            phds.append({'id': 'phd_' + owner['id'][4:], 'personId': owner['id'], 'title': '', 'start': p['start'],
                         'end': p['end'], 'milestones': [], 'chapters': []})

    data = {'people': people, 'projects': projects, 'assignments': list(assignments.values()), 'phds': phds}
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    print(f'{len(people)} people, {len(projects)} projects, {len(assignments)} allocations, {len(phds)} PhDs -> {out}')
    seen = set()
    for n in notes:
        if n not in seen:
            seen.add(n)
            print('  note:', n)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
