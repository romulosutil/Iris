#!/usr/bin/env python3
"""
Bake-off do agente de extração — Iris
=======================================

Roda o golden example + os 17 casos de teste (`docs/agente/casos-de-teste.md`)
contra os modelos candidatos (Claude Sonnet 5, Gemini 3.1 Pro, Gemini 3.5
Flash) e monta um relatório lado a lado (esperado vs. real) para revisão
humana — a métrica real do negócio (`modelo-de-negocio.md` §7: ≥70% de
extrações aprovadas SEM EDIÇÃO) é julgamento clínico, não string-diff. Este
script automatiza a chamada aos modelos e a montagem do material de revisão;
QUEM decide "aprovado sem edição" é o terapeuta/coordenador lendo o relatório
(ver `report.md` gerado + `scoring_template.csv`).

Pré-requisitos
--------------
1. `pip install anthropic google-genai jsonschema`
2. Variáveis de ambiente: `ANTHROPIC_API_KEY` e `GOOGLE_API_KEY`.
3. Rodar `parse_cases.py` antes (gera/atualiza `eval_set.json` a partir das
   fontes reais em `docs/`):
       python3 parse_cases.py --repo /caminho/para/iris
4. Conferir os `model=` em MODELOS abaixo contra os IDs atuais na doc oficial
   de cada provedor ANTES de rodar — não travamos um ID aqui de propósito,
   porque nomes de modelo mudam com frequência e um ID errado silenciosamente
   cai em erro 404, não em resultado ruim.

Uso
---
    python3 run_bakeoff.py --repo /caminho/para/iris --out results/

Saída
-----
    results/<provider>__<model>/<case_id>.json   — resposta bruta do modelo
    results/report.md                             — comparação lado a lado
    results/scoring_template.csv                   — planilha p/ revisão humana
"""
import argparse
import copy
import csv
import json
import os
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# CONFIGURAÇÃO — confirme estes IDs de modelo antes de rodar (ver docstring).
# ---------------------------------------------------------------------------
MODELOS = [
    {"provider": "anthropic", "model": "CONFIRME-O-ID-ATUAL-DO-CLAUDE-SONNET-5", "label": "claude-sonnet-5"},
    {"provider": "google", "model": "CONFIRME-O-ID-ATUAL-DO-GEMINI-3.1-PRO", "label": "gemini-3.1-pro"},
    {"provider": "google", "model": "CONFIRME-O-ID-ATUAL-DO-GEMINI-3.5-FLASH", "label": "gemini-3.5-flash"},
]

MAX_TOKENS = 4096


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path):
    return json.loads(load_text(path))


def to_gemini_schema(node):
    """Converte um subconjunto de JSON Schema (usado em output-schema.json,
    com `"type": ["string", "null"]`) para o formato aceito pelo
    response_schema do Gemini (que não aceita union types — usa
    `nullable: true` em vez disso)."""
    if isinstance(node, dict):
        out = {}
        node_type = node.get("type")
        if isinstance(node_type, list):
            non_null = [t for t in node_type if t != "null"]
            out["type"] = non_null[0] if non_null else "string"
            if "null" in node_type:
                out["nullable"] = True
        for k, v in node.items():
            if k == "type":
                continue
            out[k] = to_gemini_schema(v)
        return out
    if isinstance(node, list):
        return [to_gemini_schema(v) for v in node]
    return node


def build_user_message(case: dict) -> str:
    return (
        "CONTEXTO (JSON):\n"
        f"{json.dumps(case['contexto'], ensure_ascii=False, indent=2)}\n\n"
        "DIÁRIO DE ENTRADA DO TERAPEUTA:\n"
        f'"{case["diario"]}"\n\n'
        "Extraia conforme as regras do system prompt e devolva SOMENTE o JSON "
        "no formato definido, sem nenhum texto fora do JSON."
    )


def call_anthropic(system_prompt: str, schema: dict, case: dict, model: str):
    import anthropic

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        tools=[{
            "name": "registrar_extracao",
            "description": "Registra a extração estruturada da sessão conforme output-schema.json",
            "input_schema": schema,
        }],
        tool_choice={"type": "tool", "name": "registrar_extracao"},
        messages=[{"role": "user", "content": build_user_message(case)}],
    )
    for block in resp.content:
        if block.type == "tool_use":
            return block.input
    raise RuntimeError(f"Anthropic não retornou tool_use — resposta bruta: {resp.content}")


def call_gemini(system_prompt: str, schema: dict, case: dict, model: str):
    from google import genai
    from google.genai import types

    client = genai.Client()
    gemini_schema = to_gemini_schema(schema)
    resp = client.models.generate_content(
        model=model,
        contents=build_user_message(case),
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=gemini_schema,
            max_output_tokens=MAX_TOKENS,
        ),
    )
    return json.loads(resp.text)


def run_one(provider: str, model: str, system_prompt: str, schema: dict, case: dict):
    if provider == "anthropic":
        return call_anthropic(system_prompt, schema, case, model)
    if provider == "google":
        return call_gemini(system_prompt, schema, case, model)
    raise ValueError(f"provider desconhecido: {provider}")


def validate_schema(instance: dict, schema: dict):
    try:
        import jsonschema
        jsonschema.validate(instance=instance, schema=schema)
        return True, None
    except Exception as e:  # noqa: BLE001 — queremos capturar qualquer erro de validação/import
        return False, str(e)


def apply_manual_context_patches(eval_set: list):
    """Alguns casos descrevem `historico_relevante` só em prosa no markdown
    (não em JSON estruturado), porque o parser (`parse_cases.py`) só extrai
    blocos ```json``` explícitos. Caso 7 é o único que depende disso para
    exercitar R14 (regressão) de verdade — sem o histórico no contexto, o
    modelo não tem como saber que houve piora. Patch aplicado aqui em vez de
    no parser, pra não obrigar o parser a interpretar prosa livre."""
    for case in eval_set:
        if case["id"] == "caso_7":
            case = copy.deepcopy(case)
            case["contexto"]["historico_relevante"] = [
                {"dominio_id": "lavagem_maos", "resumo": "cadeia de lavagem das mãos independente (sem ajuda) há 3 meses"},
                {"dominio_id": "tato", "protocol_id": "vbmapp", "resumo": "tato de 'bola' independente há 2 meses"},
            ]
            yield case
        else:
            yield case


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="raiz do repo iris")
    ap.add_argument("--out", default="results", help="pasta de saída")
    ap.add_argument("--eval-set", default=None, help="default: eval_set.json ao lado deste script")
    ap.add_argument("--dry-run", action="store_true",
                     help="não chama nenhuma API — só valida eval_set.json/schema e gera report/CSV vazios, para testar o harness sem gastar crédito")
    args = ap.parse_args()

    repo = Path(args.repo)
    script_dir = Path(__file__).parent
    eval_set_path = Path(args.eval_set) if args.eval_set else script_dir / "eval_set.json"
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not eval_set_path.exists():
        sys.exit(f"eval_set.json não encontrado em {eval_set_path} — rode parse_cases.py primeiro.")

    system_prompt = load_text(repo / "docs/agente/system-instructions.md")
    schema = load_json(repo / "docs/agente/output-schema.json")
    eval_set = list(apply_manual_context_patches(json.loads(eval_set_path.read_text(encoding="utf-8"))))

    for m in MODELOS:
        if m["model"].startswith("CONFIRME-") and not args.dry_run:
            print(
                f"[AVISO] Pulando {m['label']}: ID de modelo ainda é placeholder "
                f"({m['model']}). Edite MODELOS em run_bakeoff.py com o ID real "
                f"antes de rodar este provedor.",
                file=sys.stderr,
            )

    report_rows = []
    scoring_rows = []

    for m in MODELOS:
        if m["model"].startswith("CONFIRME-") and not args.dry_run:
            continue
        model_dir = out_dir / f"{m['provider']}__{m['label']}"
        model_dir.mkdir(parents=True, exist_ok=True)
        for case in eval_set:
            print(f"-> {m['label']} / {case['id']} ...", end=" ", flush=True)
            try:
                if args.dry_run:
                    actual = case["saida_esperada"]  # eco do esperado, só p/ testar o pipeline de report/CSV
                else:
                    actual = run_one(m["provider"], m["model"], system_prompt, schema, case)
                ok, err = validate_schema(actual, schema)
                (model_dir / f"{case['id']}.json").write_text(
                    json.dumps(actual, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                status = "OK (schema válido)" if ok else f"SCHEMA INVÁLIDO: {err[:120]}"
                print(status)
            except Exception as e:  # noqa: BLE001
                actual = None
                ok, err = False, str(e)
                print(f"ERRO: {err[:200]}")
            report_rows.append({
                "model": m["label"], "case": case, "actual": actual,
                "schema_ok": ok, "schema_err": err,
            })
            scoring_rows.append({
                "case_id": case["id"], "modelo": m["label"],
                "aprovado_sem_edicao": "", "notas": "",
            })
            time.sleep(1)  # respeitar rate limit básico

    write_report(out_dir / "report.md", report_rows)
    write_scoring_template(out_dir / "scoring_template.csv", scoring_rows)
    print(f"\nRelatório: {out_dir / 'report.md'}")
    print(f"Planilha de revisão (preencher 'aprovado_sem_edicao' com TRUE/FALSE): {out_dir / 'scoring_template.csv'}")
    print("Depois de preencher, rode: python3 tally.py --scoring <pasta>/scoring_template.csv")


def write_report(path: Path, rows: list):
    lines = ["# Bake-off do agente de extração — relatório\n"]
    lines.append(
        "Cada bloco compara a saída ESPERADA (`casos-de-teste.md`) com a saída "
        "REAL do modelo. Leitura humana decide 'aprovado sem edição' — "
        "preencher em `scoring_template.csv`.\n"
    )
    for r in rows:
        case = r["case"]
        lines.append(f"\n## {r['model']} — {case['id']}: {case['titulo']}\n")
        lines.append(f"**Diário:** {case['diario']}\n")
        lines.append("**Esperado:**\n```json\n" + json.dumps(case["saida_esperada"], ensure_ascii=False, indent=2) + "\n```\n")
        if r["actual"] is not None:
            lines.append("**Real:**\n```json\n" + json.dumps(r["actual"], ensure_ascii=False, indent=2) + "\n```\n")
        else:
            lines.append(f"**Real:** FALHOU — {r['schema_err']}\n")
        if not r["schema_ok"] and r["actual"] is not None:
            lines.append(f"⚠️ **Schema inválido:** {r['schema_err']}\n")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_scoring_template(path: Path, rows: list):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["case_id", "modelo", "aprovado_sem_edicao", "notas"])
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
