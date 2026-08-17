# Ativação de assinatura via Asaas — especificação

> Escopo desta spec dentro da issue #36 (Fase 7 — Self-Service & Growth):
> o componente **"Integração de pagamento"**. Não cobre e-mail transacional,
> signup público nem wizard de onboarding.

## Problem Statement

A ativação de assinatura **nunca funcionou uma vez sequer em produção**. A
medição de 10/08/2026 em `subscription` devolve duas linhas, ambas
`provider = mercado_pago`, nenhuma `active` nem `past_due` — ou seja, nenhuma
clínica foi cobrada por gateway nenhum, e o trilho Asaas jamais completou.

A causa raiz não está no adapter: o Asaas exige `cpfCnpj` para criar o cliente
(`asaas.ts:482-490`), `PedidoAtivacao.cpfCnpj` é **opcional**
(`subscription.ts:166`), e `iniciarAtivacaoAssinatura` (`assinatura/logic.ts:70-81`)
**nunca preenche o campo** — ele lê só `clinic.nome` e `appUser.email`. A tabela
`clinic` não tem coluna de documento. O campo opcional na porta escondeu um
buraco no modelo de dados atrás de um `?`.

## Goals

- [ ] Uma clínica real conclui a ativação e a linha em `subscription` chega a
      `status = 'active'` pelo webhook — hoje: zero.
- [ ] `asaas_webhook_event.aplicado_em` deixa de ser sempre nulo (o webhook está
      configurado desde 10/08 e nunca foi exercido de verdade).
- [ ] Nenhuma linha de `subscription` nasce declarando um provedor que não existe.

## Out of Scope

| Item                                     | Motivo                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Exigir assinatura antes do 1º paciente   | Decidido 10/08/2026: trial irrestrito (#163/#175) **mantido**. Foi esse desenho que causou o deadlock antigo. |
| Página "Dados da clínica"                | O documento entra na própria tela de ativação. Página dedicada vira item de backlog separado.                 |
| Cartão como trilho de cobrança de ciclo  | `emitirCobrancaDeCiclo` só emite `billingType: "PIX"`. Continua assim.                                        |
| Portal de assinatura (upgrade/downgrade) | Componente distinto da Fase 7. Não é pré-requisito de cobrar.                                                 |

---

## User Stories

### P1: Coordenação informa o documento e conclui a ativação ⭐ MVP

**User Story**: Como coordenador, quero informar o CPF ou CNPJ da clínica na tela
de assinatura para que a autorização de Pix Automático seja criada de fato.

**Why P1**: É o único bloqueio entre o produto e a primeira receita. Sem isto
nada mais nesta spec importa.

**Acceptance Criteria**:

1. WHEN o coordenador abre `/assinatura` sem documento gravado THEN o formulário
   SHALL exibir um campo obrigatório de CPF/CNPJ, com rótulo dizendo que é o
   documento do titular da conta.
2. WHEN o coordenador abre `/assinatura` com documento já gravado THEN o campo
   SHALL vir preenchido e permanecer editável.
3. WHEN o documento é submetido THEN o sistema SHALL validá-lo (CPF **ou** CNPJ,
   com ou sem máscara) e persistir só dígitos em `clinic.cpf_cnpj` **antes** de
   chamar o gateway.
4. WHEN o documento é inválido THEN o sistema SHALL recusar em pt-BR nomeando
   qual das duas formas falhou, e NÃO SHALL chamar o gateway.
5. WHEN o documento é válido THEN `iniciarAtivacaoAssinatura` SHALL repassá-lo em
   `PedidoAtivacao.cpfCnpj` e o Asaas SHALL devolver BR Code + valor de ativação.

**Independent Test**: ativar numa clínica de teste e ver a linha em `subscription`
sair de inexistente para `setup_pending` com `pix_copia_e_cola` e
`valor_ativacao_centavos` preenchidos.

---

### P1: Linha de assinatura nunca nasce com provedor fantasma ⭐ MVP

**User Story**: Como operador do sistema, quero que nenhuma linha de
`subscription` declare um provedor que o código não conhece, para que o
fechamento de ciclo não estoure em produção.

**Why P1**: `schema.ts:1743` — `provider: text("provider").notNull().default("mercado_pago")`.
O D26 removeu o default do **código** (`BILLING_PROVIDER` sem fallback) mas o
default do **banco** sobreviveu. É exatamente de onde vem a linha
`free_tier` + `mercado_pago` medida em produção. É também um pré-requisito
inegociável da remoção do MP: dropar o adapter sem dropar este default faz toda
linha nova nascer apontando para um provedor inexistente, e
`getProviderPorId` passa a estourar "Provedor de pagamento desconhecido:
mercado_pago" dentro de `fecharCiclosVencendo`.

**Acceptance Criteria**:

1. WHEN uma linha de `subscription` é criada sem provedor explícito THEN o banco
   SHALL recusar, em vez de preencher um default.
2. WHEN a migração roda THEN as linhas existentes com `provider = 'mercado_pago'`
   e status ∈ {`free_tier`} SHALL ser corrigidas ou justificadas — nunca deixadas
   apontando para provedor removido.
3. WHEN o CI roda THEN um teste SHALL falhar se o default voltar ao schema.

**Independent Test**: `INSERT` em `subscription` sem `provider` levanta erro;
`SELECT provider, count(*) FROM subscription GROUP BY 1` não mostra provedor sem
adapter correspondente.

---

### P2: Mercado Pago sai do código

**User Story**: Como mantenedor, quero remover o adapter do Mercado Pago para que
não exista um segundo trilho de cobrança que ninguém exercita e todo mundo
precisa ler.

**Why P2**: Medido, não presumido — `SELECT provider, status, count(*) FROM subscription
GROUP BY 1,2` devolveu `mercado_pago/free_tier: 1` e `mercado_pago/setup_pending: 1`.
Nenhuma linha `active` ou `past_due`: **o MP nunca faturou ninguém**, então
remover não derruba faturamento de cliente algum. É P2 e não P1 porque não
desbloqueia receita — só reduz superfície.

**Acceptance Criteria**:

1. WHEN a remoção acontece THEN adapter, rota `/api/hooks/mercadopago`, tabela de
   evento de webhook do MP e as 3 envs (`MERCADOPAGO_ACCESS_TOKEN`,
   `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`) SHALL sair juntos.
2. WHEN o default do banco ainda existir THEN a remoção SHALL ser bloqueada —
   depende da história anterior.
3. WHEN `ProviderId` deixa de aceitar `mercado_pago` THEN o typecheck SHALL
   apontar todo call site remanescente.

**Independent Test**: `pnpm typecheck && pnpm test` verdes com zero ocorrência de
`mercado_pago` fora de migração histórica e comentário de registro.

---

### P2: A jornada não termina num beco

**User Story**: Como coordenador que acabou de pagar o Pix no app do banco, quero
saber o que fazer em seguida sem adivinhar.

**Why P2**: Hoje o `urlRetorno` (`logic.ts:103`) aponta para `/assinatura/retorno`,
que só é alcançável pelo ramo `forma: "redirect"` — exclusivo do Mercado Pago.
Com o Asaas devolvendo sempre `pix_copia_e_cola` (`asaas.ts:562`), a página de
retorno inteira e o `useEffect` de navegação
(`formulario-ativacao.tsx:55-66`) são **inalcançáveis**. Quem paga fica parado na
`/assinatura` sem CTA.

**Acceptance Criteria**:

1. WHEN a autorização é `pix_copia_e_cola` THEN a tela SHALL oferecer um caminho
   explícito de volta ao cadastro de paciente, deixando claro que a confirmação
   chega sozinha.
2. WHEN a conta está bloqueada e o operador abre `/pacientes/novo` THEN a página
   SHALL avisar **antes** do formulário — hoje só há banner para
   `trial_aguardando` (`pacientes/novo/page.tsx:35-41`), e conta bloqueada só
   descobre no submit, com dez campos preenchidos.
3. WHEN `urlRetorno` / `/assinatura/retorno` ficarem sem produtor THEN SHALL ser
   removidos ou reconectados — não deixados como código morto sem nota.

**Independent Test**: conta com trial expirado abre `/pacientes/novo` e vê o aviso
com link antes de digitar qualquer coisa.

---

## Edge Cases

- WHEN o documento é CPF (profissional autônomo) THEN o `name` enviado ao Asaas
  (`asaas.ts:495`, hoje `nomeClinica`) SHALL ser verificado contra a exigência
  real do gateway para pessoa física — **não presumir que passa**.
- WHEN a clínica troca o documento depois de já ter vínculo autorizado THEN o
  sistema SHALL definir se reemite cliente no gateway ou recusa a troca.
- WHEN `clinic.responsavelContaId` é nulo THEN a ativação já falha com mensagem
  acionável (`logic.ts:87-93`) — comportamento preservado.
- WHEN o erro nasce **antes** da chamada HTTP (validação local do adapter) THEN
  `corpoGateway` vazio é **correto**, não regressão: foi o caso do log de
  10/08 (`status: undefined, corpo: undefined`). O log do PR #242 funciona.

---

## Requirement Traceability

| ID      | História                         | Fase   | Status  |
| ------- | -------------------------------- | ------ | ------- |
| ATIV-01 | P1: documento — coluna + GRANT   | Design | Pending |
| ATIV-02 | P1: documento — validador CNPJ   | Design | Pending |
| ATIV-03 | P1: documento — campo na tela    | Design | Pending |
| ATIV-04 | P1: documento — wiring do logic  | Design | Pending |
| ATIV-05 | P1: provedor fantasma — default  | Design | Pending |
| ATIV-06 | P1: provedor fantasma — guard    | Design | Pending |
| ATIV-07 | P2: remoção do Mercado Pago      | -      | Pending |
| ATIV-08 | P2: retorno pós-Pix              | -      | Pending |
| ATIV-09 | P2: aviso antecipado no cadastro | -      | Pending |

**Cobertura:** 9 total, 0 mapeados para tarefas ainda.

---

## Riscos herdados do repo (CLAUDE.md) que esta spec precisa honrar

1. **Coluna nova quase sempre precisa de `GRANT` explícito** — `clinic` teve o
   `UPDATE` de tabela revogado na `0057` e recebe privilégio coluna a coluna.
   `cpf_cnpj` sem `GRANT` vira `permission denied for table clinic`, que não diz
   qual coluna.
2. **Escrita fora do que a RLS permite vai de `SECURITY DEFINER`** — se o
   coordenador não puder gravar `clinic.cpf_cnpj` pela policy vigente, a saída é
   função DEFINER copiando o predicado **exato** da policy de leitura, não
   afrouxar a policy. Lembrar: `UPDATE` barrado por RLS afeta 0 linhas **em
   silêncio**.
3. **`db:generate` para o que está no `schema.ts`**, DDL à mão só para
   policy/grant/função. Migração à mão exige entrada manual no `_journal.json`
   com `when` = anterior + 1000.
4. **Verificar medindo, não lendo** — depois do `db:migrate`, confirmar em
   `information_schema` (coluna e grant) e com `BEGIN … ROLLBACK` exercitando a
   regra. "Está no git log" não é prova.

---

## Success Criteria

- [ ] Uma clínica real conclui a ativação: `subscription.status = 'active'`.
- [ ] `asaas_webhook_event.aplicado_em` preenchido ao menos uma vez.
- [ ] `SELECT provider, count(*) FROM subscription GROUP BY 1` sem provedor órfão.
- [ ] `pnpm test && pnpm typecheck && pnpm test:rls` verdes.
