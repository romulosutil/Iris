# Ciclo de vida do prontuário — estados e onde eles são aplicados

Documento novo, 29/07/2026 (issues #133/#117/#134/#135). Até aqui o
prontuário não tinha estado documentado — nem coluna de estado. Passa a
ter estado; continua sem coluna. Este documento explica os dois fatos.

Contrapartes jurídicas: `docs/legal/procedimento-revogacao-consentimento.md`,
`docs/legal/termo-consentimento-titular-adulto.md` §13,
`docs/legal/termo-consentimento-curatela.md` §14,
`docs/legal/aditivo-especificacoes-legais.md` §1.2.

## 1. Os estados

| Estado                            | Significado                                                                                                          |
| :-------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **Ativo**                         | Registro clínico permitido: sessão, diário, extração por IA (se a finalidade estiver consentida), exportação (idem). |
| **Somente-leitura por revogação** | Escrita clínica bloqueada. Leitura integral preservada. Reversível.                                                  |

Não há estado "arquivado", "encerrado" ou "excluído". Alta e fim de
acompanhamento não mudam o estado do prontuário — mudam a contagem do prazo
de guarda, que é assunto de `politica-retencao-dados.md`. Expurgo é
operação separada (`app_purgar_paciente`), não um estado.

## 2. O estado é derivado, nunca armazenado

Não existe coluna `patient.estado_prontuario`. O estado é **computado a
partir dos eventos de consentimento**, toda vez que é consultado.

Definição vigente: o prontuário está em somente-leitura quando **já houve
consentimento de regime de representação** para o paciente
(`tratamento_dados_menor` ou `representacao_curador`) **e não há nenhuma
concessão de regime vigente** — vigente = concessão de regime sem linha de
revogação apontando para ela. Regimes de concessão contados:
`tratamento_dados_menor`, `representacao_curador`,
`autoconsentimento_titular_adulto`, `autoconsentimento_titular_emancipado`.

### Por que derivado

1. **`consent` é append-only por privilégio de banco.**
   `REVOKE UPDATE, DELETE ON consent FROM app_role` é o que sustenta a
   afirmação jurídica de que o histórico de consentimento é íntegro. Uma
   coluna de estado exigiria `UPDATE` a cada revogação — em `patient`, se
   não em `consent` — e criaria um segundo lugar onde a verdade sobre o
   consentimento poderia divergir do histórico.
2. **Divergência é o risco real.** Estado materializado e histórico de
   eventos podem discordar (falha no meio da transação, correção manual,
   importação). Discordando, qual dos dois o auditor acredita? Derivar
   elimina a pergunta: existe **uma** fonte de verdade, a sequência de
   eventos.
3. **Reversibilidade sai de graça.** Uma concessão nova de regime é uma
   linha nova; o predicado passa a ser falso na consulta seguinte. Não há
   "destravar" como operação — há apenas consentir de novo.

**Custo aceito:** o predicado é avaliado a cada escrita, com duas subconsultas
em `consent` filtradas por `patient_id`. É consulta pequena e indexada. Se
virar gargalo, a resposta é índice, não coluna.

## 3. Onde o estado é aplicado

**No banco.** Duas camadas, ambas necessárias:

1. **RLS** — políticas de `INSERT`, `UPDATE` **e `DELETE`** nas tabelas
   clínicas chamam `app_prontuario_somente_leitura(...)`. `DELETE` entra
   porque apagar histórico é pior que escrevê-lo.
2. **Funções `SECURITY DEFINER`** — `app_aplicar_snapshot`,
   `app_aplicar_candidatura` e `app_criar_alerta_risco` rodam como dona da
   base e **não passam por RLS**. Para elas o gate de policy é código
   morto; cada uma carrega o guard internamente e levanta exceção.

**Não na camada TypeScript.** `src/lib/consent/vigencia.ts` espelha a regra
para produzir mensagem de erro compreensível antes de o banco recusar. É
**espelho**, não fronteira de autorização. Autorização que mora só no
TypeScript pode ser contornada por qualquer caminho que fale com o banco
por outra rota.

**`SELECT` nunca é bloqueado, em nenhuma tabela.** É requisito jurídico,
não escolha de implementação: a leitura precisa permanecer para fiscalização
dos conselhos de classe e para transferência de prontuário
(`aditivo-especificacoes-legais.md` §1.2). Policy de `SELECT` alterada por
causa deste mecanismo é bug.

### Fora do gate, deliberadamente

- `audit_log` — trilha imutável; parar de auditar um prontuário travado é o
  oposto do objetivo.
- `consent` — precisa aceitar a própria revogação e o reconsentimento que
  destrava.
- `care_team_membership` — administrativo; é o que permite gerir acesso
  durante o bloqueio.
- Agenda (`agendamento_recorrente`, `bloqueio`) — base legal é execução de
  contrato e tutela da saúde, não consentimento.
- `alerta`, `alerta_risco_clinico` — segurança do paciente.
- Catálogo de protocolo (`milestone`, `goal_milestone_mapping`) — sem
  vínculo a paciente.

## 4. Matriz de efeito após a revogação do consentimento de regime

| Regime           | Sessão / diário | Extração por IA | Exportação de relatório | Leitura       |
| :--------------- | :-------------- | :-------------- | :---------------------- | :------------ |
| **Menor**        | bloqueado       | bloqueado       | bloqueado               | **permitida** |
| **Curatelado**   | bloqueado       | bloqueado       | bloqueado               | **permitida** |
| **Adulto capaz** | permitido       | bloqueado       | bloqueado               | **permitida** |
| **Emancipado**   | permitido       | bloqueado       | bloqueado               | **permitida** |

Menor e curatelado bloqueiam porque o consentimento do representante **é** a
base do tratamento. Adulto e emancipado não bloqueiam porque o registro
clínico se apoia em **tutela da saúde (LGPD Art. 11, II, "f")**, hipótese
que não depende de consentimento e que o titular não revoga. Nos quatro
casos, IA e exportação cessam, porque essas finalidades sempre dependeram
de consentimento.

Revogação de **finalidade** (IA, exportação) nunca altera o estado do
prontuário — só desliga aquela finalidade, para qualquer regime.

## 5. Indicador de maioridade — não é estado

Paciente com regime de menor vigente que já completou 18 anos aparece num
**indicador passivo** para a clínica, classificado dentro ou fora dos 90
dias corridos de `termo-consentimento-titular-adulto.md` §4(b).

O indicador **não bloqueia nada, não altera nenhum comportamento e não é um
estado do prontuário**. É lista. `nascimento` nulo é terceiro estado,
"desconhecido" — nunca "ainda é menor".

---

## Método de validação deste documento

Redigido para ser lido pelo advogado do projeto junto com os documentos
legais que ele acompanha. Pelo protocolo acordado com o responsável pelo
produto, **texto lido sem apontamentos até o fim da sessão é dado por
alinhado**. As afirmações jurídicas aqui aparecem como respostas
afirmativas únicas, com fundamento — não como perguntas.

Data desta versão: **29/07/2026**.
