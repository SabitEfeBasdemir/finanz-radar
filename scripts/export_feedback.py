#!/usr/bin/env python3
"""GitHub'daki "geri-bildirim" notlarını data/feedback.json'a yazar (Claude haftalık analizde okur).
Girdi: `gh issue list ... --author <repo sahibi> --json ...` çıktısı (dosya yolu argüman olarak).
Yalnızca repo sahibinin notları gelir (workflow --author ile filtreler); site herkese açık olduğu için
başkalarının yazdıkları Claude'a ulaşmaz."""
import json, pathlib, re, sys, datetime

root = pathlib.Path(__file__).resolve().parent.parent
try:
    raw = json.loads(pathlib.Path(sys.argv[1]).read_text() or "[]")
except Exception:
    raw = []
items = []
for i in sorted(raw, key=lambda x: x.get("createdAt", ""), reverse=True)[:100]:
    body = i.get("body") or ""
    m = re.search(r"<!-- item: (.*?) -->", body)
    items.append({
        "date": (i.get("createdAt") or "")[:10],
        "rating": "up" if i.get("title", "").startswith("👍") else "down" if i.get("title", "").startswith("👎") else "",
        "title": i.get("title", "")[:200],
        "note": re.sub(r"<!--.*?-->", "", body).strip()[:2000],
        "item": m.group(1) if m else None,
        "issue": i.get("number"),
    })
(root / "data/feedback.json").write_text(json.dumps(
    {"updated": datetime.date.today().isoformat(), "count": len(items), "items": items}, ensure_ascii=False, indent=1))
print(f"{len(items)} geri bildirim")
