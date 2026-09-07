"""Resolve TODO módulo importado pelos arquivos Python copiados para dentro de
uma imagem de infra — inclusive os imports DENTRO de função (#157, D65).

Por que isto existe além do `from faster_whisper import WhisperModel` do teste
de carga: aquele prova o grafo do `pip` (foi o que quebrou em 31/08/2026,
quando `huggingface_hub` parou de puxar `requests` e o build morreu com
`ModuleNotFoundError: No module named 'requests'`). Este prova a outra
direção: um `import` NOVO acrescentado a `infra/asr/servidor.py` que ninguém
lembrou de colocar em `infra/asr/requirements.txt`. `pnpm test`/`lint` não
olham Python nenhum, e o `ruff`/`mypy` do repo — se houvesse — rodaria contra
a árvore do repo, não contra a imagem. Só carregar dentro do container prova.

Não é `importlib.util.find_spec`, é `import_module` de verdade: `find_spec`
LOCALIZA o pacote sem executar o `__init__.py`, e é justamente na execução do
`__init__.py` que uma dependência transitiva ausente aparece.

Este arquivo NÃO é copiado para a imagem de propósito — ele entra por stdin
(`docker run -i ... python - < este-arquivo`), então não adiciona peso nem
superfície a uma imagem de produção.

Env:
  ALVO  arquivo .py ou diretório a varrer DENTRO do container.

Exit 0 = todo módulo importou. Exit 1 = pelo menos um não importou, com a
lista do que falta e de qual arquivo o importa.
"""

from __future__ import annotations

import ast
import importlib
import os
import sys
from pathlib import Path

ALVO = Path(os.environ.get("ALVO", "/app/servidor.py"))

# `__future__` é diretiva do compilador, não módulo instalável.
IGNORAR = {"__future__"}


def arquivos(alvo: Path) -> list[Path]:
    if alvo.is_file():
        return [alvo]
    return sorted(
        p
        for p in alvo.rglob("*.py")
        if not p.name.startswith("test_") and not p.name.endswith("_test.py")
    )


def raizes_importadas(arquivo: Path) -> set[str]:
    """Nome de topo de todo módulo importado — `ast.walk`, não só o nível do
    módulo: um `import x` dentro de função falha igual, só que mais tarde e no
    meio de um atendimento."""
    arvore = ast.parse(arquivo.read_text(encoding="utf-8"), filename=str(arquivo))
    nomes: set[str] = set()
    for no in ast.walk(arvore):
        if isinstance(no, ast.Import):
            for alias in no.names:
                nomes.add(alias.name.split(".")[0])
        elif isinstance(no, ast.ImportFrom):
            # `from . import x` é relativo ao próprio pacote: não há módulo
            # instalável para resolver, e o COPY do arquivo já é coberto pelas
            # outras asserções da carga.
            if no.level == 0 and no.module:
                nomes.add(no.module.split(".")[0])
    return nomes - IGNORAR


def main() -> int:
    if not ALVO.exists():
        print(f"[verificar-imports] ALVO não existe na imagem: {ALVO}", file=sys.stderr)
        return 1

    alvos = arquivos(ALVO)
    if not alvos:
        # Zero arquivos é VERMELHO, não verde: significa que o COPY não chegou
        # (ou o caminho mudou) e um exit 0 aqui não provaria nada.
        print(f"[verificar-imports] nenhum .py sob {ALVO}", file=sys.stderr)
        return 1

    falhas: list[str] = []
    total = 0
    for arquivo in alvos:
        for raiz in sorted(raizes_importadas(arquivo)):
            total += 1
            try:
                importlib.import_module(raiz)
            except Exception as err:  # noqa: BLE001 - qualquer falha é falha
                falhas.append(f"{arquivo}: import {raiz!r} -> {type(err).__name__}: {err}")

    if falhas:
        print(
            "[verificar-imports] módulo(s) que NÃO carregam dentro da imagem:",
            file=sys.stderr,
        )
        for linha in falhas:
            print(f"  - {linha}", file=sys.stderr)
        return 1

    print(
        f"[verificar-imports] {total} import(s) de {len(alvos)} arquivo(s) "
        f"resolveram em {ALVO}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
