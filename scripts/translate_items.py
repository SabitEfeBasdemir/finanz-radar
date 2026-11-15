#!/usr/bin/env python3
"""Otomatik haberlerin başlık ve özetini Türkçeye çevirir (Claude kullanmaz, ücretsiz).
- data/insights.json içinde başlığı/özeti hâlâ düz metin olan otomatik kayıtları bulur (en yeniler önce).
- Google Translate'in herkese açık uç noktasıyla (translate.googleapis.com, client=gtx) toplu çevirir.
- Metni {"en": orijinal, "tr": çeviri} biçimine çevirir; uygulama seçili dili gösterir.
- Servisi yormamak için çalıştırma başına en fazla MAX_REQ istek atar ve ilk engelde durur.
  Çevrilemeyen kayıtlar orijinal dilinde görünür ve bir sonraki çalıştırmada (günde 6 kez) tekrar denenir.
Not: Bu uç nokta resmi bir API değildir; ileride çalışmazsa haberler İngilizce görünmeye devam eder.
Sadece standart kütüphane."""
import json, pathlib, sys, time, urllib.parse, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
TL = "tr"
SEP = "\n⁂\n"          # metinleri ayırmak için çeviride bozulmayan işaret
MAX_CHARS = 3500       # istek başına karakter
MAX_REQ = 20           # çalıştırma başına istek
PAUSE = 1.5            # istekler arası bekleme (sn)
SUMMARY_LEN = 320      # özetin çevrilen kısmı
FIELDS = ("headline", "summary")


class Blocked(Exception):
    pass


def gtx(text):
    data = urllib.parse.urlencode({"client": "gtx", "sl": "auto", "tl": TL, "dt": "t", "q": text}).encode()
    req = urllib.request.Request("https://translate.googleapis.com/translate_a/single", data=data,
                                 headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            if "translate.googleapis.com" not in r.geturl():   # captcha sayfasına yönlendirme = engel
                raise Blocked("yönlendirildi")
            body = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise Blocked(f"HTTP {e.code}")
    except json.JSONDecodeError:
        raise Blocked("beklenmeyen yanıt")
    return "".join(seg[0] for seg in body[0] if seg and seg[0])


def clip(s, n):
    s = " ".join(s.split())
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"


def main():
    path = root / "data/insights.json"
    d = json.loads(path.read_text())
    todo = [i for i in d["items"] if i.get("auto") and any(isinstance(i.get(f), str) and i[f].strip() for f in FIELDS)]
    todo.sort(key=lambda i: i.get("date", ""), reverse=True)
    if not todo:
        print("çevrilecek kayıt yok")
        return

    def src(i, f):
        v = " ".join(i[f].split())
        return clip(v, SUMMARY_LEN) if f == "summary" else v

    # İstek paketlerini en yeni kayıtlardan doldur
    queue = []
    for i in todo:
        for f in FIELDS:
            if isinstance(i.get(f), str) and i[f].strip() and src(i, f) not in queue:
                queue.append(src(i, f))
    done, reqs, pos = {}, 0, 0
    try:
        while pos < len(queue) and reqs < MAX_REQ:
            part, size = [], 0
            while pos < len(queue) and (not part or size + len(queue[pos]) + len(SEP) <= MAX_CHARS):
                part.append(queue[pos]); size += len(queue[pos]) + len(SEP); pos += 1
            res = [s.strip() for s in gtx(SEP.join(part)).split("⁂")]
            reqs += 1
            if len(res) == len(part):
                done.update(zip(part, res))
            else:
                print("ayırıcı bozuldu, paket atlandı", file=sys.stderr)
            time.sleep(PAUSE)
    except Blocked as e:
        print("çeviri servisi engelledi, bu çalıştırmada durduruldu:", e, file=sys.stderr)
    except Exception as e:
        print("çeviri hatası:", e, file=sys.stderr)

    n = 0
    for i in todo:
        changed = False
        for f in FIELDS:
            v = i.get(f)
            if isinstance(v, str) and v.strip() and src(i, f) in done:
                i[f] = {"en": " ".join(v.split()), TL: done[src(i, f)]}
                changed = True
        n += changed
    path.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    print(f"{n}/{len(todo)} kayıt çevrildi, {reqs} istek, kalan metin {len(queue) - len(done)}")


if __name__ == "__main__":
    main()
