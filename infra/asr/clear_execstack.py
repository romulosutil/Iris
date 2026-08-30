"""Zera o bit executável (PF_X) do segmento PT_GNU_STACK de binários ELF64.

POR QUE ISTO EXISTE: os wheels de ctranslate2 embarcam .so com o segmento
PT_GNU_STACK marcado executável. Kernels com exec-shield/PaX recusam mapear
isso ("cannot enable executable stack"). O utilitário de sistema `execstack`
faz exatamente esta correção, mas saiu dos repositórios do Debian trixie, e
`objcopy` (binutils 2.44) não tem flag equivalente — daí este script, puro
stdlib, sem dependência nova na imagem.

Só cobre ELF64 little-endian (x86_64) — único alvo desta imagem.
"""

from __future__ import annotations

import struct
import sys

PT_GNU_STACK = 0x6474E551
PF_X = 0x1


def limpar(caminho: str) -> bool:
    with open(caminho, "rb") as f:
        dados = bytearray(f.read())

    if dados[:4] != b"\x7fELF" or dados[4] != 2:  # não-ELF ou não-64-bit
        return False

    endian = "<" if dados[5] == 1 else ">"
    (e_phoff,) = struct.unpack_from(endian + "Q", dados, 0x20)
    (e_phentsize,) = struct.unpack_from(endian + "H", dados, 0x36)
    (e_phnum,) = struct.unpack_from(endian + "H", dados, 0x38)

    mudou = False
    for i in range(e_phnum):
        offset = e_phoff + i * e_phentsize
        p_type, p_flags = struct.unpack_from(endian + "II", dados, offset)
        if p_type == PT_GNU_STACK and (p_flags & PF_X):
            struct.pack_into(endian + "I", dados, offset + 4, p_flags & ~PF_X)
            mudou = True

    if mudou:
        with open(caminho, "r+b") as f:
            f.write(dados)
    return mudou


if __name__ == "__main__":
    for caminho in sys.argv[1:]:
        if limpar(caminho):
            print(f"execstack limpo: {caminho}")
