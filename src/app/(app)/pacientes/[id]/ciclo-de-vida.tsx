"use client";

import { useState } from "react";
import { Cluster } from "@/components/ui/layout";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
import {
  MenuAcoes,
  type MenuAcaoItem,
} from "@/components/ui/primitives/menu-acoes";
import { AltaDialog } from "./alta-dialog";
import { ArquivamentoDialog } from "./arquivamento-dialog";
import type { UserRole } from "@/db/rls";

/**
 * D65 — barra de ciclo de vida do prontuário.
 *
 * As ações de ciclo de vida (alta clínica e arquivamento) estavam montadas nos
 * `PageHeader` de `pacientes/[id]/page.tsx`. Essa página existe para **duas** das
 * três modalidades: `protocol_driven` e `tcc`. A terceira, `conventional`,
 * redireciona para `/temas` antes de renderizar qualquer header (ver `page.tsx`,
 * `capacidades.temEvolucao === false`), e `/temas` nunca teve um.
 *
 * O efeito não era cosmético. Sem botão não há `alta_em`; sem `alta_em`,
 * `app_paciente_expurgavel` (`0128`) devolve `false` **por construção** e o
 * prontuário de terapia convencional nunca entra na fila de retenção legal — a
 * clínica guarda dado de saúde indefinidamente e nada no produto sinaliza. O
 * arquivamento manual já tinha o mesmo alcance parcial; #352 só tornou o buraco
 * visível ao pendurar mais uma ação no mesmo ponto de montagem.
 *
 * Por isso a correção NÃO é replicar o cluster em `/temas`: seriam três cópias
 * do mesmo gate de papel, e a quarta modalidade nasceria sem nenhuma. O lugar
 * canônico é o `layout.tsx` do segmento `[id]/`, a única casca por onde passam
 * todas as telas de um paciente em todas as modalidades — o mesmo raciocínio
 * que já tinha trazido a faixa de abas e o aviso de conta para lá.
 *
 * Consequência deliberada: as ações e os selos ficam visíveis em TODAS as abas
 * do prontuário (Briefing, Horas, Equipe…), não só na aba clínica central.
 * Estado do paciente é do paciente, não da aba.
 *
 * **Onde e como.** A barra mora no slot `acoes` da faixa de abas (`TabsNav`),
 * à direita, junto do selo de RLS — a linha que descreve o prontuário inteiro.
 * Antes ela era uma faixa solta entre as abas e o título da aba, e dois
 * botões de borda cheia ali liam como ação primária da tela quando são o
 * oposto: alta e arquivamento acontecem uma vez na vida do prontuário. Por
 * isso viraram itens de um menu `⋯` ("Ações do prontuário"): ação rara e de
 * alto atrito fica a um clique, sem disputar atenção com o conteúdo clínico.
 * Os selos continuam à vista — estado é leitura de todo dia.
 *
 * **Os gates de papel espelham os cores, não a UI.** `registrarAlta`/`desfazerAlta`
 * exigem `coordenador` (`logic.ts`), e arquivar/desarquivar aceitam também
 * `admin_recepcao`. Mostrar um botão a quem `requireRole` recusa produz erro no
 * submit em vez de recusa legível; e para o arquivamento seria pior — a RLS
 * filtra em silêncio e a tela diria "arquivado" sobre 0 linhas afetadas.
 */
export function CicloDeVidaPaciente({
  patientId,
  arquivadoEm,
  altaEm,
  papel,
}: {
  patientId: string;
  arquivadoEm: Date | null;
  altaEm: string | Date | null;
  papel: UserRole;
}) {
  const comAlta = altaEm !== null;
  const arquivado = arquivadoEm !== null;

  const podeRegistrarAlta = papel === "coordenador";
  const podeArquivar = papel === "coordenador" || papel === "admin_recepcao";

  // Um único diálogo aberto por vez: os dois são modais e o menu fecha antes
  // de abrir qualquer um (ver `flushSync` em `MenuAcoes`).
  const [dialogo, setDialogo] = useState<"alta" | "arquivamento" | null>(null);

  // Nem selo nem ação: não renderiza nada. Um `terapeuta` num paciente sem
  // alta nem arquivamento não veria nem um `⋯` vazio.
  if (!comAlta && !arquivado && !podeRegistrarAlta && !podeArquivar) {
    return null;
  }

  const itens: MenuAcaoItem[] = [
    ...(podeRegistrarAlta
      ? [
          {
            id: "alta",
            rotulo: comAlta
              ? "Desfazer alta clínica"
              : "Registrar alta clínica",
            aoSelecionar: () => setDialogo("alta"),
          },
        ]
      : []),
    ...(podeArquivar
      ? [
          {
            id: "arquivamento",
            rotulo: arquivado ? "Desarquivar paciente" : "Arquivar paciente",
            aoSelecionar: () => setDialogo("arquivamento"),
          },
        ]
      : []),
  ];

  return (
    // `role="group"` não é decoração: sem role, o `<div>` do `Cluster` resolve
    // para `generic`, e ARIA PROÍBE nomear elemento sem role — o axe acusa
    // `aria-prohibited-attr` e o nome some para o leitor de tela (mesma pegadinha
    // documentada no selo de RLS, em `layout.tsx`).
    <Cluster gap="sm" role="group" aria-label="Ciclo de vida do prontuário">
      {/* Os dois selos convivem: alta arquiva (trigger `patient_alta_arquiva_trg`,
          `0065`), mas arquivar NÃO dá alta — então "Arquivado" sozinho é um
          estado real e distinto, e colapsar os dois num selo só apagaria a
          diferença entre "saiu da contagem da fatura" e "o prazo de guarda
          começou a correr". */}
      {comAlta ? (
        <StatusBadge variante="success">Alta Concluída</StatusBadge>
      ) : null}
      {arquivado ? (
        <StatusBadge variante="neutral">Arquivado</StatusBadge>
      ) : null}
      {/* `MenuAcoes` devolve `null` sem itens: terapeuta vê só os selos. */}
      <MenuAcoes itens={itens} rotulo="Ações do prontuário" />
      {podeRegistrarAlta ? (
        <AltaDialog
          patientId={patientId}
          comAlta={comAlta}
          aberto={dialogo === "alta"}
          aoMudarAberto={(aberto) => setDialogo(aberto ? "alta" : null)}
        />
      ) : null}
      {podeArquivar ? (
        <ArquivamentoDialog
          patientId={patientId}
          arquivado={arquivado}
          aberto={dialogo === "arquivamento"}
          aoMudarAberto={(aberto) => setDialogo(aberto ? "arquivamento" : null)}
        />
      ) : null}
    </Cluster>
  );
}
