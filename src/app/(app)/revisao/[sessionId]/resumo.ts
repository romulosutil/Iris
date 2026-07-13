// Resumo legível do payload de uma extração, por subtipo. Puro (sem server-only
// nem @/db) — roda no servidor (queries) e é testável isolado. O payload é o
// objeto específico do subtipo gravado pelo provider (payloadDoSubtipo):
// evidencia → e.evidencia, cadeia → e.cadeia, etc. Toda leitura é defensiva:
// campos podem faltar (o schema do agente marca só tipo/trecho/confianca como
// obrigatórios), então nunca assumimos presença.

import type { ExtractionSubtipo } from "@/lib/extraction/provider";

type Payload = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Uma linha de resumo: rótulo curto + valor. Vira `<dt>/<dd>` na UI. */
export type LinhaResumo = { rotulo: string; valor: string };

function push(linhas: LinhaResumo[], rotulo: string, valor: string | null) {
  if (valor) linhas.push({ rotulo, valor });
}

/**
 * Chave de domínio da extração — usada para casar com o histórico do paciente
 * (comparar "mesmo alvo antes vs. agora"). Para evidência, o domínio é o eixo
 * funcional (dominio_id do alvo, ou a função). Para os demais subtipos, o
 * próprio subtipo já é a chave (não há alvo mapeado).
 */
export function chaveDominio(subtipo: ExtractionSubtipo, payload: unknown): string | null {
  const p = (payload ?? {}) as Payload;
  if (subtipo === "evidencia") {
    const alvos = Array.isArray(p.alvos) ? (p.alvos as Payload[]) : [];
    const dominio = str(alvos[0]?.dominio_id);
    return dominio ?? str(p.funcao) ?? "evidencia";
  }
  return subtipo;
}

/** Rótulo humano do subtipo (cabeçalho do cartão). */
export function rotuloSubtipo(subtipo: ExtractionSubtipo): string {
  switch (subtipo) {
    case "evidencia":
      return "Evidência";
    case "registro_abc":
      return "Registro ABC";
    case "ausencia_comportamento":
      return "Ausência de comportamento";
    case "cadeia":
      return "Cadeia comportamental";
    case "preferencia_reforcador":
      return "Preferência / reforçador";
    case "pendente":
      return "Extração pendente";
    default:
      return subtipo;
  }
}

/**
 * Resumo estruturado do conteúdo da extração para o terapeuta conferir antes de
 * aprovar. Retorna a lista de linhas na ordem de leitura clínica. Nunca inclui
 * nota/pontuação (Camada 1: a IA não pontua) — só descreve o que observou.
 */
export function resumirPayload(subtipo: ExtractionSubtipo, payload: unknown): LinhaResumo[] {
  const p = (payload ?? {}) as Payload;
  const linhas: LinhaResumo[] = [];

  switch (subtipo) {
    case "evidencia": {
      push(linhas, "Descrição", str(p.descricao));
      if (p.funcao_indefinida === true) {
        push(linhas, "Função", "indefinida (a confirmar pelo terapeuta)");
      } else {
        push(linhas, "Função", str(p.funcao));
      }
      push(linhas, "Polaridade", str(p.polaridade));
      push(linhas, "Nível de ajuda", str(p.nivel_ajuda));
      push(linhas, "Resultado", str(p.resultado));
      push(linhas, "Topografia", str(p.topografia));
      push(linhas, "Produção literal", str(p.producao_literal));
      push(linhas, "Alvo da produção", str(p.alvo_producao));
      push(linhas, "Ambiente", str(p.ambiente));
      push(linhas, "Eixo do protocolo", str(p.eixo_protocolo));
      break;
    }
    case "registro_abc": {
      push(linhas, "Antecedente", str(p.antecedente));
      push(linhas, "Comportamento", str(p.comportamento));
      push(linhas, "Consequência / regulação", str(p.consequencia_regulacao));
      push(linhas, "Categoria", str(p.categoria));
      push(linhas, "Subcategoria sensorial", str(p.subcategoria_sensorial));
      push(linhas, "Severidade", str(p.severidade));
      break;
    }
    case "ausencia_comportamento": {
      push(linhas, "Comportamento", str(p.comportamento));
      push(linhas, "Contexto", str(p.contexto));
      break;
    }
    case "cadeia": {
      push(linhas, "Cadeia", str(p.nome));
      const etapas = Array.isArray(p.etapas) ? (p.etapas as Payload[]) : [];
      etapas.forEach((et, i) => {
        const desc = str(et.descricao);
        const ajuda = str(et.nivel_ajuda);
        if (desc) {
          push(linhas, `Etapa ${i + 1}`, ajuda ? `${desc} (${ajuda})` : desc);
        }
      });
      break;
    }
    case "preferencia_reforcador": {
      push(linhas, "Item / atividade", str(p.item_atividade));
      push(linhas, "Valência", str(p.valencia));
      break;
    }
    case "pendente":
      break;
  }

  return linhas;
}
