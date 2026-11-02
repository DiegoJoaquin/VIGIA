#!/usr/bin/env python3
"""
Extractor de compromisos de RCA para Vigía, usando IA local (Ollama) en tu propio servidor.
Costo: cero. Los documentos nunca salen de tu máquina.

Uso:
  python extract_rca.py --url https://firma.sea.gob.cl/publicaciones/eb/39/2145128410.pdf --out estampa.json
  python extract_rca.py --pdf mi_rca.pdf --email cliente@empresa.cl --api https://vigia.tu.workers.dev --token TU_TOKEN

Requisitos:
  pip install requests pypdf
  Ollama corriendo (https://ollama.com) con un modelo descargado, por ejemplo:  ollama pull qwen2.5:14b
  (Opcional) pdftotext de poppler para mejor lectura del PDF.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
PROMPT = (HERE / "prompt.txt").read_text(encoding="utf-8")
ALLOWED_HOSTS = {"firma.sea.gob.cl", "infofirma.sea.gob.cl", "seia.sea.gob.cl"}
COMPONENTS = ["Aire", "Agua", "Ruido", "Residuos", "Suelo y cauce", "Olores", "Biodiversidad", "Patrimonio", "Administrativo"]
RECIPIENTS = ["SMA", "DOH", "SEA", "SEREMI de Salud", "CMN", "Interno"]
KINDS = ["weekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual", "once", "event", "continuous"]


# ——— Lectura del PDF ———

def download(url: str) -> bytes:
    host = re.sub(r"^https?://([^/]+).*$", r"\1", url)
    if host not in ALLOWED_HOSTS:
        sys.exit(f"El enlace debe ser del SEA ({', '.join(sorted(ALLOWED_HOSTS))}).")
    r = requests.get(url, timeout=120, headers={"User-Agent": "Mozilla/5.0 Vigia-extractor"})
    r.raise_for_status()
    return r.content


def pdf_text(data: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(data)
        path = f.name
    if shutil.which("pdftotext"):
        out = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True)
        if out.returncode == 0 and len(out.stdout.strip()) > 500:
            return out.stdout
    from pypdf import PdfReader
    return "\n\n".join((p.extract_text() or "") for p in PdfReader(path).pages)


def chunk_text(text: str, max_len: int = 12_000) -> list[str]:
    clean = re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+\n", "\n", text.replace("\r", "")))
    out, cur = [], ""
    for p in clean.split("\n\n"):
        if cur and len(cur) + len(p) + 2 > max_len:
            out.append(cur)
            cur = ""
        if len(p) > max_len:
            out.extend(p[i:i + max_len] for i in range(0, len(p), max_len))
            continue
        cur = f"{cur}\n\n{p}" if cur else p
    if cur:
        out.append(cur)
    return out


# ——— IA local ———

def ask_ollama(host: str, model: str, chunk: str) -> str:
    r = requests.post(f"{host}/api/chat", timeout=600, json={
        "model": model, "stream": False, "format": "json",
        "options": {"temperature": 0.1, "num_ctx": 16384},
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": chunk}],
    })
    r.raise_for_status()
    return r.json()["message"]["content"]


def parse_json(raw: str) -> dict:
    a, b = raw.find("{"), raw.rfind("}")
    if a < 0 or b <= a:
        return {}
    try:
        return json.loads(raw[a:b + 1])
    except json.JSONDecodeError:
        return {}


# ——— Normalización (igual que shared/extraction.ts) ———

def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def normalize(items: list, project_id: str, source_text: str) -> list[dict]:
    hay = norm(source_text)
    seen, out = set(), []
    for r in items:
        if not isinstance(r, dict):
            continue
        title = str(r.get("title") or "").strip()[:80]
        key = norm(title)
        if not title or key in seen:
            continue
        seen.add(key)
        kind = r.get("frequency") if r.get("frequency") in KINDS else "continuous"
        freq: dict = {"kind": kind}

        def num(v, lo, hi):
            return round(v) if isinstance(v, (int, float)) and lo <= v <= hi else None

        if num(r.get("due_month"), 1, 12):
            freq["dueMonth"] = num(r.get("due_month"), 1, 12)
        if num(r.get("lag_months"), 1, 12):
            freq["lagMonths"] = num(r.get("lag_months"), 1, 12)
        if kind == "event":
            freq["hoursAfterEvent"] = num(r.get("hours_after_event"), 1, 720) or 24
        quote = str(r.get("quote") or "").strip()
        if quote and norm(quote) not in hay:
            quote = ""  # la IA parafraseó: no se muestra como cita textual
        slug = re.sub(r"[^a-z0-9]+", "-", key)[:24]
        ob = {
            "id": f"{project_id}-{len(out) + 1}-{slug}", "projectId": project_id, "title": title,
            "plain": str(r.get("plain") or title).strip(),
            "component": r.get("component") if r.get("component") in COMPONENTS else "Administrativo",
            "recipient": r.get("recipient") if r.get("recipient") in RECIPIENTS else "Interno",
            "frequency": freq, "evidence": str(r.get("evidence") or "Registro del cumplimiento").strip(),
            "confirmed": False, "source": "rca",
        }
        if quote:
            ob["quote"] = quote
        if r.get("section"):
            ob["section"] = str(r["section"]).strip()
        if isinstance(r.get("details"), list) and r["details"]:
            ob["details"] = [str(d) for d in r["details"]][:12]
        out.append(ob)
    return out


def guess_meta(text: str) -> dict:
    def pick(pattern, flags=0):
        m = re.search(pattern, text, flags)
        return re.sub(r"\s+", " ", m.group(1)).strip() if m else None
    return {
        "name": pick(r"proyecto\s+[“\"«]([^”\"»]{8,160})[”\"»]", re.I),
        "titular": pick(r"titular[^,\n]{0,40}?,?\s+([A-ZÁÉÍÓÚÑ][^,\n]{3,80}?(?:S\.A\.|SpA|Ltda\.|Limitada))"),
        "comuna": pick(r"comuna\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)"),
    }


def build_draft(text: str, source_url: str, llm) -> dict:
    project_id = "p-" + re.sub(r"[^a-z0-9]", "", norm(guess_meta(text).get("name") or "rca"))[:16] + dt.datetime.now().strftime("%m%d%H%M")
    items: list = []
    chunks = chunk_text(text)
    for i, chunk in enumerate(chunks, 1):
        print(f"  Leyendo parte {i} de {len(chunks)}…", file=sys.stderr)
        items += parse_json(llm(chunk)).get("obligations") or []
    meta = guess_meta(text)
    name = meta.get("name") or "Proyecto importado"
    project = {
        "id": project_id, "name": name, "shortName": name if len(name) <= 34 else name[:32] + "…",
        "titular": meta.get("titular") or "Titular por confirmar", "rubro": "Otro",
        "comuna": meta.get("comuna") or "Por confirmar", "region": "",
        "instrument": "EIA" if re.search(r"estudio de impacto", text, re.I) else "DIA",
        "rcaLabel": "RCA importada", "sourceUrl": source_url, "phase": "Operación",
        "trackingStart": dt.date.today().isoformat(),
    }
    return {"project": project, "obligations": normalize(items, project_id, text)}


def main() -> None:
    ap = argparse.ArgumentParser(description="Lee una RCA y extrae sus compromisos para Vigía.")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="Enlace al PDF de la RCA en firma.sea.gob.cl")
    src.add_argument("--pdf", help="Ruta a un PDF local")
    ap.add_argument("--model", default="qwen2.5:14b", help="Modelo de Ollama (por defecto qwen2.5:14b)")
    ap.add_argument("--ollama", default="http://localhost:11434", help="Dirección de Ollama")
    ap.add_argument("--out", help="Guardar el resultado en este archivo JSON")
    ap.add_argument("--api", help="URL de tu Vigía para subir el resultado (quedará 'por revisar')")
    ap.add_argument("--token", help="EXTRACTOR_TOKEN configurado en el Worker")
    ap.add_argument("--email", help="Correo de la cuenta de Vigía que recibe el proyecto")
    ap.add_argument("--fake-llm", help=argparse.SUPPRESS)  # pruebas: archivo JSON con una respuesta fija
    a = ap.parse_args()

    data = download(a.url) if a.url else Path(a.pdf).read_bytes()
    text = pdf_text(data)
    if len(re.sub(r"\s", "", text)) < 2000:
        sys.exit("El PDF casi no tiene texto (parece escaneado). Pásalo antes por OCR, por ejemplo: ocrmypdf entrada.pdf salida.pdf")

    if a.fake_llm:
        canned = Path(a.fake_llm).read_text(encoding="utf-8")
        llm = lambda _chunk: canned  # noqa: E731
    else:
        llm = lambda chunk: ask_ollama(a.ollama, a.model, chunk)  # noqa: E731
    draft = build_draft(text, a.url or f"file://{Path(a.pdf).name}", llm)
    obs = draft["obligations"]
    cited = sum(1 for o in obs if o.get("quote"))
    print(f"Listo: {len(obs)} compromisos, {cited} con cita textual verificada.", file=sys.stderr)

    if a.out:
        Path(a.out).write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Guardado en {a.out}", file=sys.stderr)
    if a.api:
        if not (a.token and a.email):
            sys.exit("Para subir a Vigía necesitas --token y --email.")
        r = requests.post(f"{a.api.rstrip('/')}/api/extractor/upload", timeout=60,
                          headers={"Authorization": f"Bearer {a.token}"}, json={"email": a.email, "draft": draft})
        print(f"Vigía respondió {r.status_code}: {r.text[:200]}", file=sys.stderr)
    if not a.out and not a.api:
        print(json.dumps(draft, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
