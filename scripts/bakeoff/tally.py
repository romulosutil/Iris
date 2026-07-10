#!/usr/bin/env python3
"""
Lê o scoring_template.csv já preenchido por um humano (coluna
`aprovado_sem_edicao` com TRUE/FALSE) e calcula a % de aprovação sem edição
por modelo — a métrica que autoriza escalar o GTM (`modelo-de-negocio.md`
§6-7: meta ≥70%).

Uso: python3 tally.py --scoring results/scoring_template.csv
"""
import argparse
import csv
from collections import defaultdict


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scoring", required=True)
    ap.add_argument("--meta", type=float, default=0.70, help="meta de aprovação sem edição (default 0.70)")
    args = ap.parse_args()

    counts = defaultdict(lambda: {"total": 0, "aprovado": 0, "pendente": 0})
    with open(args.scoring, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            modelo = row["modelo"]
            val = (row.get("aprovado_sem_edicao") or "").strip().upper()
            counts[modelo]["total"] += 1
            if val in ("TRUE", "1", "SIM", "YES"):
                counts[modelo]["aprovado"] += 1
            elif val in ("", None):
                counts[modelo]["pendente"] += 1
            # FALSE/0/NAO contam pro total mas não pro aprovado — ok por default

    print(f"{'Modelo':<20} {'Aprovados':>10} {'Total':>8} {'% sem edição':>14} {'Pendentes':>10}  Meta ({args.meta:.0%})")
    for modelo, c in counts.items():
        pct = c["aprovado"] / c["total"] if c["total"] else 0
        flag = "OK" if pct >= args.meta and c["pendente"] == 0 else ("incompleto" if c["pendente"] else "ABAIXO DA META")
        print(f"{modelo:<20} {c['aprovado']:>10} {c['total']:>8} {pct:>13.1%} {c['pendente']:>10}  {flag}")


if __name__ == "__main__":
    main()
