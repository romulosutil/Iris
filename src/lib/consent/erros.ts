/**
 * Tradução de negação de escrita (RLS/constraint/trigger) do gate de
 * consentimento (#133/#134/#135, migração 0053) para mensagem em pt-BR.
 *
 * O BANCO decide — esta função só traduz a recusa dele. Nunca reimplementa a
 * autorização em TypeScript: reconhece a negação pelo código do Postgres
 * (SQLSTATE) e, quando o código não distingue (RLS e RAISE EXCEPTION default
 * chegam ambos como erro genérico do driver), pelo texto ESTÁVEL que as
 * próprias funções/policies do banco produzem — nunca por heurística de
 * substring do texto livre do usuário.
 *
 * Devolve `null` quando o erro não é reconhecido como negação deste gate —
 * o chamador deve reerguer o erro original, nunca engolir um erro
 * desconhecido como se fosse este.
 */
export function traduzirErroDeConsentimento(erro: unknown): string | null {
  if (erro == null) return null;
  const bruto = erro instanceof Error ? erro.message : String(erro);
  const codigo =
    erro instanceof Error && "code" in erro
      ? (erro as { code?: string }).code
      : undefined;

  // ── RAISE EXCEPTION das funções SECURITY DEFINER (0053 §6) ────────────────
  // Mensagem fixa em pt-BR, produzida pelo próprio banco — reconhecida por
  // texto porque É a interface estável dessas funções (documentada na
  // migração), não uma heurística sobre erro alheio.
  if (/Prontuário em somente-leitura: consentimento revogado/.test(bruto)) {
    return "Este prontuário está em somente-leitura: o consentimento (menor/curatelado) foi revogado e não há regime vigente. Para voltar a escrever, registre um novo consentimento (reconsentimento ou renovação por maioridade).";
  }

  // ── CHECK constraints de `consent` (0053 §2, mesmos nomes de 0051) ────────
  if (/consent_responsavel_por_tipo/.test(bruto)) {
    return "Combinação inválida de dados do consentimento (signatário/instrumento) para o tipo escolhido. Revise os campos e tente novamente.";
  }
  if (/consent_versao_termo_por_tipo/.test(bruto)) {
    return "Versão de termo incompatível com o tipo de registro de consentimento.";
  }
  if (/consent_revogado_mesmo_paciente/.test(bruto)) {
    return "O consentimento indicado não pertence a este paciente.";
  }

  // ── Trigger `app_consent_valida_revogacao` (0053 §3), já em pt-BR ─────────
  if (
    /não é possível revogar uma revogação|revogação não pode apontar para si mesma/i.test(
      bruto,
    )
  ) {
    return bruto;
  }

  if (codigo === "23514" || codigo === "23503") {
    // CHECK/FK de `consent` não coberta pelos nomes acima, mas ainda assim uma
    // negação de constraint desta tabela — evita vazar nome/coluna crus.
    if (/\bconsent\b/i.test(bruto)) {
      return "Não foi possível registrar o consentimento: dados incompatíveis com o tipo escolhido.";
    }
    return null;
  }

  // ── RLS genérica (`42501` / "new row violates row-level security policy") ──
  // NÃO é traduzida aqui, de propósito. Esse SQLSTATE é o MESMO para QUALQUER
  // negação de policy: gate de consentimento, isolamento multi-tenant,
  // "terapeuta não é dono da sessão"... O código de erro não distingue o
  // motivo, e adivinhar produziria mensagem falsa ("consentimento revogado"
  // para quem só não é dono da sessão).
  //
  // Quem responde essa pergunta é o banco, depois da recusa:
  // `diagnosticarBloqueioDeConsentimento` (./diagnostico.ts) consulta os mesmos
  // predicados da policy. Esta função continua pura e síncrona.
  return null;
}
