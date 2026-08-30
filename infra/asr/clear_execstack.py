"""Zera o bit executável (PF_X) do segmento PT_GNU_STACK de binários ELF64.

POR QUE ISTO EXISTE: os wheels de ctranslate2 embarcam .so com o segmento
PT_GNU_STACK marcado executável. Kernels com exec-shield/PaX recusam mapear
isso ("cannot enable executable stack"). O utilitário de sistema `execstack`
faz exatamente esta correção, mas saiu dos repositórios do Debian trixie, e
`objcopy` (binutils 2.44) não tem flag equivalente — daí este script, puro
stdlib, sem dependência nova na imagem.

Só cobre ELF64 little-endian (x86_64) — único alvo desta imagem.

Escreve **só os 4 bytes de `p_flags`**, no lugar. Ler 37 MB de
`libctranslate2.so` para reescrever o arquivo inteiro por causa de um bit não
é só desperdício: uma reescrita completa interrompida no meio deixa o .so
corrompido, enquanto um `seek` + 4 bytes não tem esse estado intermediário.
"""

from __future__ import annotations

import struct
import sys

PT_GNU_STACK = 0x6474E551
PF_X = 0x1

TAM_CABECALHO_ELF64 = 64


def limpar(caminho: str) -> bool:
    with open(caminho, "r+b") as f:
        cabecalho = f.read(TAM_CABECALHO_ELF64)
        if len(cabecalho) < TAM_CABECALHO_ELF64:
            return False
        if cabecalho[:4] != b"\x7fELF" or cabecalho[4] != 2:  # não-ELF ou não-64-bit
            return False

        endian = "<" if cabecalho[5] == 1 else ">"
        (e_phoff,) = struct.unpack_from(endian + "Q", cabecalho, 0x20)
        (e_phentsize,) = struct.unpack_from(endian + "H", cabecalho, 0x36)
        (e_phnum,) = struct.unpack_from(endian + "H", cabecalho, 0x38)
        if e_phoff == 0 or e_phentsize < 8 or e_phnum == 0:
            return False

        f.seek(e_phoff)
        tabela = f.read(e_phentsize * e_phnum)
        if len(tabela) < e_phentsize * e_phnum:
            return False

        mudou = False
        for i in range(e_phnum):
            base = i * e_phentsize
            # ELF64: p_type (4 bytes) e p_flags (4 bytes) são os dois primeiros
            # campos do program header, nesta ordem.
            p_type, p_flags = struct.unpack_from(endian + "II", tabela, base)
            if p_type == PT_GNU_STACK and (p_flags & PF_X):
                f.seek(e_phoff + base + 4)
                f.write(struct.pack(endian + "I", p_flags & ~PF_X))
                mudou = True

        return mudou


if __name__ == "__main__":
    for caminho in sys.argv[1:]:
        if limpar(caminho):
            print(f"execstack limpo: {caminho}")
