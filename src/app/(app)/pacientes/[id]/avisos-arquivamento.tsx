import { Alert } from "@/components/ui/alert";
import { Stack } from "@/components/ui/layout";
import { REGUA_ARQUIVAMENTO } from "@/lib/jobs/auto-arquivamento";
import type { AvisosArquivamento } from "./arquivamento-queries";

const DIAS_DE_FOLGA =
  REGUA_ARQUIVAMENTO.diasArquivamento - REGUA_ARQUIVAMENTO.diasAvisoPrevio;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function data(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * #174 — os dois avisos in-app do arquivamento comercial.
 *
 * Componente puro (recebe o que `carregarAvisosArquivamento` derivou da
 * trilha) para poder ser varrido pelo axe e testado sem banco.
 *
 * Regra de copy: **fato + consequência na contagem, sem alarmismo e sem
 * jargão de cobrança.** A unidade é o CICLO de cobrança (30 dias ancorados na
 * assinatura da clínica), nunca o mês civil, e nunca "a partir do próximo":
 * `billing_apurar_ciclo` (0071) avalia o ciclo inteiro de uma vez, então tanto
 * o desarquivamento automático quanto o arquivamento por inatividade valem já
 * para o ciclo em andamento. Arquivar é ato administrativo, não evento clínico —
 * nada aqui pode soar como alta, abandono ou risco ao paciente. E as duas
 * mensagens dizem, em voz alta, que o prontuário continua acessível: sem isso
 * a leitura natural de "arquivado" é "vou perder o registro", que é exatamente
 * o incentivo perverso (apagar prontuário para não pagar) que a régua existe
 * para não criar.
 */
export function AvisosArquivamento({
  desarquivadoAutomaticamenteEm,
  avisoPrevioEm,
}: AvisosArquivamento) {
  if (!desarquivadoAutomaticamenteEm && !avisoPrevioEm) return null;

  return (
    <Stack gap="sm">
      {desarquivadoAutomaticamenteEm ? (
        <Alert
          severidade="info"
          titulo="Este paciente voltou a contar como ativo"
        >
          Um atendimento foi registrado em {data(desarquivadoAutomaticamenteEm)}{" "}
          e o arquivamento foi desfeito automaticamente. Ele entra de novo na
          contagem de pacientes ativos já no ciclo de cobrança em andamento. Se
          não era o esperado, arquive novamente nesta página.
        </Alert>
      ) : null}

      {avisoPrevioEm ? (
        <Alert
          severidade="warning"
          titulo="Este paciente será arquivado automaticamente"
        >
          Não há registro clínico deste paciente há{" "}
          {REGUA_ARQUIVAMENTO.diasAvisoPrevio} dias. Se nenhum for feito até{" "}
          {data(new Date(avisoPrevioEm.getTime() + DIAS_DE_FOLGA * MS_POR_DIA))}
          , ele sai da contagem de pacientes ativos já no ciclo de cobrança em
          andamento. O prontuário continua acessível e exportável do mesmo
          jeito, e registrar um atendimento traz o paciente de volta.
        </Alert>
      ) : null}
    </Stack>
  );
}
