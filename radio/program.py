#!/usr/bin/env python3
"""Πρόγραμμα της Πειραϊκής Εκκλησίας από τη σελίδα https://www.peradio.com/evdomadiaio-programma/

    python3 radio/program.py <σελίδα.html> <ΕΕΕΕ-ΜΜ-ΗΗ>

Τυπώνει σε μία γραμμή JSON τις εκπομπές της ημέρας και της επόμενης (μια βραδιά περνά τα μεσάνυχτα):
    {"src": ..., "fetched": <epoch>, "days": {"2026-10-30": [["22:00", "Τίτλος", "Περιγραφή"], ...], "2026-10-31": [...]}}

Η σελίδα έχει καρτέλες ΔΕΥΤΕΡΑ…ΚΥΡΙΑΚΗ και έναν πίνακα ανά ημέρα (ώρα | τίτλος σε <strong> + περιγραφή).
Το πρόγραμμα αλλάζει, γι' αυτό διαβάζεται ξανά σε κάθε ηχογράφηση.
"""
import datetime, html, json, re, sys, time

SRC = 'https://www.peradio.com/evdomadiaio-programma/'
DAYS = ['ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ', 'ΚΥΡΙΑΚΗ']


def text(fragment):
    s = html.unescape(re.sub(r'<[^>]+>', ' ', fragment))
    s = re.sub(r'\s+', ' ', s.replace(' ', ' ')).strip()
    return re.sub(r'\s+([.,;·…])', r'\1', s)


def parse_table(table):
    rows = []
    for tr in re.findall(r'<tr\b.*?</tr>', table, re.S | re.I):
        cells = re.findall(r'<td\b[^>]*>(.*?)</td>', tr, re.S | re.I)
        if len(cells) < 2:
            continue
        m = re.search(r'(\d{1,2})[:.](\d{2})', text(cells[0]))
        body = cells[1]
        strong = re.search(r'<strong>(.*?)</strong>', body, re.S | re.I)
        title = text(strong.group(1)) if strong else ''
        desc = text(body[:strong.start()] + ' ' + body[strong.end():]) if strong else text(body)
        if not title:
            title, desc = desc, ''
        title = re.sub(r'’(?=[Α-ΩΆ-Ώ])', ' ', title).rstrip(' .')
        if re.search(r'Έναρξη\s+Νυχτερινού\s+Ραδιοφώνου', title):
            title = 'Νυχτερινό ραδιόφωνο'
        desc = desc.lstrip(' .,;·')
        if not m:                         # γραμμή χωρίς ώρα: συνέχεια της προηγούμενης
            if rows and (title or desc):
                rows[-1][2] = (rows[-1][2] + ' ' + ' '.join(x for x in (title, desc) if x)).strip()
            continue
        if title:
            rows.append(['%02d:%s' % (int(m.group(1)), m.group(2)), title, desc])
    return rows


def parse(page):
    tabs = re.search(r'uk-tab=.*?</ul>', page, re.S)
    labels = [text(x).upper() for x in re.findall(r'<a[^>]*>(.*?)</a>', tabs.group(0), re.S)] if tabs else []
    start = tabs.end() if tabs else 0
    tables = re.findall(r'<table\b.*?</table>', page[start:], re.S | re.I)
    if labels[:7] != DAYS or len(tables) < 7:
        raise SystemExit('Άγνωστη μορφή σελίδας: καρτέλες %r, πίνακες %d' % (labels, len(tables)))
    return {day: parse_table(t) for day, t in zip(DAYS, tables)}


def main():
    page = open(sys.argv[1], encoding='utf-8', errors='replace').read()
    d0 = datetime.date.fromisoformat(sys.argv[2])
    week = parse(page)
    out = {}
    for d in (d0, d0 + datetime.timedelta(days=1)):
        out[d.isoformat()] = week[DAYS[d.weekday()]]
    if not any(out.values()):
        raise SystemExit('Κενό πρόγραμμα')
    print(json.dumps({'src': SRC, 'fetched': int(time.time()), 'days': out}, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    main()
