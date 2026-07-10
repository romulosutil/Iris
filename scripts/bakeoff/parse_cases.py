#!/usr/bin/env python3
"""
Gera eval_set.json a partir das FONTES REAIS do repositório:
  - docs/agente/casos-de-teste.md   (Casos 2-9: diário + saída esperada; Caso 9 também traz contexto próprio)
  - docs/prompts/serie-de-prompts.md (diário do golden example, "Leo")
  - docs/agente/golden-example-output.json (saída esperada do golden example)
  - docs/agente/contexto-exemplo.json (contexto VB-MAPP default, usado pelos Casos 1-8)

Objetivo: eval_set.json nunca diverge das fontes por transcrição manual — se um
caso mudar em casos-de-teste.md, rode este script de novo (`python3
parse_cases.py`) para regenerar eval_set.json antes de rodar o bake-off.

Uso: python3 parse_cases.py --repo /caminho/para/iris
"""
import argparse
import copy
import json
import re
import sys
from pathlib import Path


def extract_json_block(text: str) -> dict:
    m = re.search(r"```json\s*(.*?)```", text, re.DOTALL)
    if not m:
        raise ValueError("Nenhum bloco ```json``` encontrado")
    return json.loads(m.group(1))


def extract_blockquote(text: str) -> str:
    """Junta linhas consecutivas começadas por '> ' num parágrafo só, removendo
    as aspas retas do diário (a formatação do markdown usa aspas decorativas)."""
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(">"):
            lines.append(stripped.lstrip(">").strip())
        elif lines:
            break  # blockquote acabou
    joined = " ".join(lines)
    # remove aspas externas de abertura/fechamento se presentes
    joined = joined.strip()
    if joined.startswith('"') and joined.endswith('"'):
        joined = joined[1:-1]
    return joined


def parse_casos_de_teste(md_text: str):
    """Retorna lista de dicts {numero, titulo, contexto_json (ou None), diario, saida_esperada}."""
    # separa por cabeçalhos de nível 2 "## Caso N — ..."
    chunks = re.split(r"\n(?=## Caso \d)", md_text)
    casos = []
    for chunk in chunks:
        header_match = re.match(r"## Caso (\d+)\s*[—-]\s*(.+)", chunk)
        if not header_match:
            continue
        numero = int(header_match.group(1))
        titulo = header_match.group(2).splitlines()[0].strip()

        contexto_json = None
        ctx_match = re.search(r"### Contexto.*?```json\s*(.*?)```", chunk, re.DOTALL)
        if ctx_match:
            contexto_json = json.loads(ctx_match.group(1))

        diario_match = re.search(
            r"### Di[áa]rio de entrada.*?\n(.*?)(?=\n### |\Z)", chunk, re.DOTALL
        )
        if not diario_match:
            raise ValueError(f"Caso {numero}: seção 'Diário de entrada' não encontrada")
        diario = extract_blockquote(diario_match.group(1))

        saida_match = re.search(
            r"### Sa[íi]da esperada\s*\n(.*?)(?=\n### |\n\*\*Nota|\n---|\Z)", chunk, re.DOTALL
        )
        if not saida_match:
            raise ValueError(f"Caso {numero}: seção 'Saída esperada' não encontrada")
        saida_esperada = extract_json_block(saida_match.group(1))

        casos.append({
            "numero": numero,
            "titulo": titulo,
            "contexto_json": contexto_json,
            "diario": diario,
            "saida_esperada": saida_esperada,
        })
    return casos


# contexto-exemplo.json (docs/agente/) é deliberadamente um exemplo PARCIAL —
# só ilustra o formato com 2 domínios (mando, tato). Usá-lo como contexto real
# do bake-off faz o modelo (corretamente, por R19/AGNOSTICISMO) se recusar a
# mapear qualquer evento para domínios que os Casos 2-8 realmente referenciam
# (ouvinte, ecoico, intraverbal, imitação, social, percepção visual, brincar) —
# isso não é falha do modelo, é o modelo obedecendo à regra "só classifique
# contra o que veio no contexto". Descoberto em 09/07/2026 rodando o primeiro
# teste interno (ver BACKLOG.md, seção B) comparando saída real vs. esperada.
# Este dict cobre os domínios que casos-de-teste.md realmente usa, para que o
# default do harness seja representativo — sem isso, boa parte da comparação
# esperado-vs-real não é válida (não é sobre qualidade do modelo, é sobre o
# contexto de teste estar incompleto).
_DOMINIOS_ADICIONAIS_VBMAPP = [
    {"dominio_id": "ouvinte", "nome": "Ouvinte", "definicao_funcional": "segue instrução verbal do adulto (comportamento sob controle de estímulo verbal alheio)", "sinais_no_texto": ["pedi para ele", "segui a instrução", "pegou o item pedido"]},
    {"dominio_id": "ecoico", "nome": "Ecoico", "definicao_funcional": "repetição/aproximação vocal do modelo verbal do adulto", "sinais_no_texto": ["repetiu", "imitou o som", "dica verbal seguida de repetição"]},
    {"dominio_id": "intraverbal", "nome": "Intraverbal", "definicao_funcional": "resposta verbal a estímulo verbal do adulto sem o item presente (responder pergunta sobre evento ausente, completar frase/música)", "sinais_no_texto": ["respondeu a pergunta sobre algo ausente", "completou a frase/música"]},
    {"dominio_id": "imitacao", "nome": "Imitação motora", "definicao_funcional": "reproduz ação motora modelada pelo adulto ('faz igual')", "sinais_no_texto": ["imitou o gesto", "fez igual"]},
    {"dominio_id": "social", "nome": "Comunicação social/atenção compartilhada", "definicao_funcional": "contato visual dirigido, alternância de olhar item-adulto-item, esperar turno, comportamento social recíproco", "sinais_no_texto": ["contato visual", "olhou para mim e para o item", "esperou a vez"]},
    {"dominio_id": "percepcao_visual", "nome": "Percepção/pareamento visual", "definicao_funcional": "pareamento ou discriminação de estímulos visuais (cores, formas, figuras idênticas)", "sinais_no_texto": ["pareou", "combinou as cores/formas"]},
    {"dominio_id": "brincar", "nome": "Brincar", "definicao_funcional": "uso funcional ou simbólico de brinquedos, imitação de brincar", "sinais_no_texto": ["brincou de", "deu função ao brinquedo"]},
]


def expand_default_context(contexto_default: dict) -> dict:
    """Devolve uma cópia de contexto-exemplo.json com os domínios adicionais
    injetados no primeiro protocolo ativo (vbmapp), sem duplicar domínios já
    presentes. Ver nota acima — necessário para os Casos 1-8 (golden+2..8)
    serem testados de forma representativa; Caso 9 já traz seu próprio
    contexto completo (PEDI) e não passa por aqui."""
    ctx = copy.deepcopy(contexto_default)
    dominios = ctx["protocolos_ativos"][0]["dominios"]
    existentes = {d["dominio_id"] for d in dominios}
    for d in _DOMINIOS_ADICIONAIS_VBMAPP:
        if d["dominio_id"] not in existentes:
            dominios.append(d)
    return ctx


def extract_golden_diary(serie_prompts_text: str) -> str:
    m = re.search(
        r"GOLDEN EXAMPLE.*?Di[áa]rio de entrada:\s*\n\s*---\s*\n(.*?)\n\s*---",
        serie_prompts_text,
        re.DOTALL,
    )
    if not m:
        raise ValueError("Diário do golden example (Leo) não encontrado em serie-de-prompts.md")
    lines = [ln.strip() for ln in m.group(1).splitlines() if ln.strip()]
    joined = " ".join(lines)
    if joined.startswith('"') and joined.endswith('"'):
        joined = joined[1:-1]
    return joined


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="raiz do repo iris")
    ap.add_argument("--out", default=None, help="onde salvar eval_set.json (default: <script_dir>/eval_set.json)")
    args = ap.parse_args()

    repo = Path(args.repo)
    out_path = Path(args.out) if args.out else Path(__file__).parent / "eval_set.json"

    casos_md = (repo / "docs/agente/casos-de-teste.md").read_text(encoding="utf-8")
    serie_prompts_md = (repo / "docs/prompts/serie-de-prompts.md").read_text(encoding="utf-8")
    golden_output = json.loads((repo / "docs/agente/golden-example-output.json").read_text(encoding="utf-8"))
    contexto_default_raw = json.loads((repo / "docs/agente/contexto-exemplo.json").read_text(encoding="utf-8"))
    contexto_default = expand_default_context(contexto_default_raw)

    casos = parse_casos_de_teste(casos_md)
    golden_diario = extract_golden_diary(serie_prompts_md)

    eval_set = [{
        "id": "golden",
        "titulo": "Golden example — Leo (3 anos)",
        "fonte": "docs/prompts/serie-de-prompts.md (item 4) + docs/agente/golden-example-output.json",
        "contexto": contexto_default,
        "diario": golden_diario,
        "saida_esperada": golden_output,
    }]

    for c in casos:
        eval_set.append({
            "id": f"caso_{c['numero']}",
            "titulo": c["titulo"],
            "fonte": f"docs/agente/casos-de-teste.md, Caso {c['numero']}",
            "contexto": c["contexto_json"] or contexto_default,
            "diario": c["diario"],
            "saida_esperada": c["saida_esperada"],
        })

    out_path.write_text(json.dumps(eval_set, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(eval_set)} casos escritos em {out_path}")
    for e in eval_set:
        n_extr = len(e["saida_esperada"].get("extracoes", []))
        print(f"  - {e['id']:10s} | {e['titulo'][:60]:60s} | {n_extr} extrações esperadas | diário {len(e['diario'])} chars")


if __name__ == "__main__":
    main()
