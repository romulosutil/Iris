import { Cluster } from "@/components/ui/layout";
import { StatusBadge } from "@/components/ui/patterns/status-badge";
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

  // Nem selo nem botão: não renderiza a barra. Um `terapeuta` num paciente sem
  // alta nem arquivamento veria uma linha vazia ocupando altura acima do
  // conteúdo da aba.
  if (!comAlta && !arquivado && !podeRegistrarAlta && !podeArquivar) {
    return null;
  }

  return (
    // `role="group"` não é decoração: sem role, o `<div>` do `Cluster` resolve
    // para `generic`, e ARIA PROÍBE nomear elemento sem role — o axe acusa
    // `aria-prohibited-attr` e o nome some para o leitor de tela (mesma pegadinha
    // documentada no selo de RLS logo abaixo, em `layout.tsx`).
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
      {podeRegistrarAlta ? (
        <AltaDialog patientId={patientId} comAlta={comAlta} />
      ) : null}
      {podeArquivar ? (
        <ArquivamentoDialog patientId={patientId} arquivado={arquivado} />
      ) : null}
    </Cluster>
  );
}
