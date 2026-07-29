# Integração de e-mail transacional (Resend) — canal do responsável técnico no estágio 2 (#122)

**Classificação: PÓS-MVP.** Rascunho de execução; nada aqui está implementado.
A migração e a dependência `resend` foram deliberadamente retiradas da árvore
(ver "Por que nada disso foi mergeado ainda").

---

## 1. Contexto

A #122 entregou o motor de escalonamento em dois estágios. No **estágio 2** —
alerta grave que passou 2× o prazo de reconhecimento sem resposta da equipe — a
§4.2.1 prevê quatro ações: banner clínica-wide, acionamento do **responsável
técnico (RT)** da clínica, exibição do Protocolo de Emergência Interno e log
imutável. Três das quatro já rodam. Falta o e-mail ao RT.

A mesma infraestrutura serviria depois para convites de equipe
(`/equipe/convidar`) e para os fluxos do Better-Auth.

## 2. Guardrails inegociáveis

1. **Zero dado clínico no corpo do e-mail** (LGPD; cláusula 10.3 dos Termos).
   O e-mail **nunca** carrega nome do paciente, trecho literal da sessão ou
   categoria do risco. Ele diz apenas que *um alerta de risco clínico teve o
   prazo de reconhecimento expirado* e manda o RT abrir o painel autenticado.
   É o mesmo princípio já aplicado ao push (H3): urgência viaja pelo canal,
   conteúdo clínico só atrás de autenticação.
2. **Destinatário estritamente do tenant** (Regra de Ouro §4.2.1). O endereço
   sai de `clinic.responsavel_tecnico_id` → `app_user.email`, e só se esse
   usuário tiver papel vigente na clínica do alerta. Não existe — e não pode
   passar a existir — caminho para endereço arbitrário ou para contato externo
   à clínica (família, polícia, SAMU, Conselho Tutelar). O Iris não avisa
   ninguém de fora, em nenhum estágio; isso é o parecer da #110, não uma
   preferência de implementação.

## 3. Por que isso é pós-MVP e não bloqueia o go-live

O produto já é coerente sem o canal: `canaisIndisponiveis()`
(`src/lib/risco/notificacao.ts`) registra
`email_responsavel_tecnico_indisponivel` no estágio 2 quando não há chave de
e-mail configurada. Ou seja, a ausência do canal é **explícita na trilha**, não
silenciosa — que é exatamente o modo de falha que a #108 nos ensinou a evitar.
O acionamento do RT no estágio 2 continua acontecendo pelo banner clínica-wide
e pela fila. O e-mail melhora o alcance; não é o que sustenta o escalonamento.

Some daí a dependência real que trava a execução: criar conta no Resend,
verificar domínio e gerar chave são passos humanos, de via única, do Rômulo.

## 4. Decisão pendente: `EMAIL_PROVIDER_API_KEY` vs `RESEND_API_KEY`

O código hoje lê `EMAIL_PROVIDER_API_KEY` — nome **neutro de provedor**, de
propósito. O rascunho original trocava por `RESEND_API_KEY`, o que amarra o
guard de disponibilidade a um fornecedor específico.

Recomendação: **manter `EMAIL_PROVIDER_API_KEY`** como a variável que decide se
o canal existe, e deixar `RESEND_API_KEY` só dentro do adapter
(`src/lib/email/resend.ts`). Assim trocar de provedor é trocar um arquivo, não
caçar a variável em guard, teste e script de escalonamento. Decisão do Rômulo.

## 5. Checklist de execução

### Fase 1 — conta e domínio (ação humana, via única)

- [ ] Criar conta no [Resend](https://resend.com).
- [ ] Verificar o domínio de envio (`irisclinica.ia.br` ou subdomínio dedicado,
      ex.: `notificacoes.irisclinica.ia.br`) — SPF/DKIM.
- [ ] Gerar a API key.
- [ ] Cadastrar no Easypanel, **nos dois serviços** (App e Escalonamento):
      `EMAIL_PROVIDER_API_KEY`, `RESEND_API_KEY`,
      `RESEND_FROM_EMAIL=Iris <notificacoes@irisclinica.ia.br>`.
      ⚠️ Lembrar que o log de build do Easypanel expõe env var em texto plano
      (`infra/README.md`) — chave de e-mail entra na tabela de rotação.

### Fase 2 — banco (migração nova, numerada no momento da execução)

Duas funções `SECURITY DEFINER`, porque a role `iris_escalonamento` não tem
SELECT em tabela nenhuma — desenho da `0049`, para que uma credencial de job
vazada não leia diário, paciente nem trecho de risco. O job precisa descobrir
o e-mail do RT sem ganhar acesso de leitura à base; as duas funções são a
abertura mínima para isso. Rascunho no apêndice A.

- [ ] `app_rt_do_alerta(p_alerta)` — devolve só nome e e-mail do RT, e só se o
      alerta estiver em `escalado_estagio_2`.
- [ ] `app_registrar_email_rt(p_alerta, p_sucesso, p_detalhe)` — grava
      `email_responsavel_tecnico_enviado` ou `..._falhou` em
      `canais_notificados` e a trilha no `audit_log`.

### Fase 3 — código

- [ ] `src/lib/email/resend.ts`: adapter com verificação defensiva (sem chave,
      loga e devolve canal indisponível em vez de lançar).
- [ ] `scripts/escalonamento-risco.mjs`: ao transicionar para
      `escalado_estagio_2`, chamar `app_rt_do_alerta`, enviar e registrar o
      resultado via `app_registrar_email_rt`.
- [ ] Reaproveitar no convite de equipe (`/equipe/convidar`).

### Fase 4 — testes

- [ ] Unitário: sem chave, o canal cai em
      `email_responsavel_tecnico_indisponivel` e o escalonamento **não** falha.
- [ ] Unitário: o corpo do e-mail não contém nome de paciente, trecho nem
      categoria — teste de conteúdo, não só de envio. É o guardrail 1 virando
      asserção.
- [ ] Smoke em ambiente com Resend configurado.

## 6. Por que nada disso foi mergeado ainda

- A dependência `resend` foi retirada do `package.json`: pacote sem código que
  o use é superfície de ataque sem contrapartida.
- O SQL **não** entra em `db/migrations/` enquanto o resto não existir. O
  deploy tem gate de schema (`infra/README.md`): migração na pasta é migração
  aplicada em produção no próximo push. Subir função de e-mail meses antes do
  código que a chama é criar drift entre banco e aplicação sem ganho nenhum.
  O rascunho vive aqui e é renumerado quando a execução começar.

---

## Apêndice A — rascunho do SQL (não aplicar)

```sql
-- #122 — canal de e-mail ao responsável técnico no estágio 2 (§4.2.1, ação 2).
--
-- REGRA DE OURO (§4.2.1): o destinatário sai de `clinic.responsavel_tecnico_id`
-- → `app_user.email`, e a função confere que esse usuário tem papel vigente na
-- clínica do alerta. Não existe caminho aqui para um endereço arbitrário, nem
-- para contato externo à clínica.

-- Destinatário do estágio 2. Devolve SÓ nome e e-mail de um profissional da
-- própria clínica — nada clínico, nenhum dado de paciente. Retorna zero linhas
-- se a clínica não cadastrou responsável técnico (e o job registra isso como
-- canal indisponível; não há fallback para ninguém de fora).
CREATE OR REPLACE FUNCTION app_rt_do_alerta(p_alerta uuid)
RETURNS TABLE (rt_email text, rt_nome text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT u.email, u.name
    FROM alerta_risco_clinico a
    JOIN clinic c   ON c.id = a.clinic_id
    JOIN app_user u ON u.id = c.responsavel_tecnico_id
   WHERE a.id = p_alerta
     AND a.status = 'escalado_estagio_2'
     AND a.deletado_em IS NULL
     -- o RT tem que ser membro VIGENTE da clínica do alerta. Sem este predicado,
     -- um `responsavel_tecnico_id` obsoleto (usuário que saiu da clínica)
     -- continuaria recebendo alerta de risco — vazamento para ex-membro.
     AND EXISTS (
       SELECT 1 FROM user_role ur
        WHERE ur.user_id = u.id AND ur.clinic_id = a.clinic_id
     );
$$;

REVOKE ALL ON FUNCTION app_rt_do_alerta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_rt_do_alerta(uuid) TO iris_escalonamento;

-- Registro do RESULTADO do envio. Sucesso e falha são ambos gravados: canal que
-- some do registro é canal que falhou em silêncio, que é o modo de falha da
-- #108. `p_detalhe` recebe o id da mensagem no provedor (sucesso) ou a mensagem
-- de erro (falha) — nunca conteúdo clínico.
CREATE OR REPLACE FUNCTION app_registrar_email_rt(
  p_alerta  uuid,
  p_sucesso boolean,
  p_detalhe text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid;
  v_canal  text := CASE WHEN p_sucesso
                        THEN 'email_responsavel_tecnico_enviado'
                        ELSE 'email_responsavel_tecnico_falhou' END;
BEGIN
  UPDATE alerta_risco_clinico
     SET canais_notificados = canais_notificados || jsonb_build_array(v_canal),
         atualizado_em = now()
   WHERE id = p_alerta
  RETURNING clinic_id INTO v_clinic;

  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'app_registrar_email_rt: alerta inexistente';
  END IF;

  -- ator NULL = ação automática do sistema (semântica fixada na 0049).
  INSERT INTO audit_log (clinic_id, ator_id, acao, entidade, entidade_id, patient_id, detalhe)
  VALUES (v_clinic, NULL, 'alerta_risco_email_rt', 'alerta_risco_clinico', p_alerta, NULL,
          jsonb_build_object('sucesso', p_sucesso, 'detalhe', p_detalhe));
END;
$$;

REVOKE ALL ON FUNCTION app_registrar_email_rt(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_registrar_email_rt(uuid, boolean, text) TO iris_escalonamento;
```

**Revisão feita neste rascunho (28/07/2026):** os nomes de coluna batem com o
schema (`app_user.name`/`email`, `user_role(user_id, clinic_id)` sem soft-delete,
`audit_log.ator_id` já nullable desde a `0049`). O que **não** foi verificado:
nada disso rodou contra um Postgres — o rascunho é revisão estática.
