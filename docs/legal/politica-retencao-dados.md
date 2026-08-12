# Política de Retenção e Eliminação de Dados — Iris

**Status: RASCUNHO de produto, pendente de revisão por advogado antes de valer
como documento contratual/publicado.** Redigido em 09/07/2026 com base na
pesquisa jurídica documentada em `validacao-legal-prontuario.md` (que também
não substitui parecer jurídico — ver aviso naquele documento). Este rascunho
fecha a REDAÇÃO da política; falta a validação formal antes do piloto com
dado real de paciente (`BACKLOG.md` seção B).

Consolidado em 28/07/2026 com as decisões de #122 (alerta de risco clínico),
#116 (logs de acesso) e #89 (backups), que passaram a ter prazo próprio. A
consolidação **não** promove o documento a final: continua rascunho até o
parecer.

---

## 1. Objetivo e escopo

Esta política define por quanto tempo o Iris mantém os dados pessoais e
sensíveis (dado de saúde) tratados na plataforma, e o processo de eliminação
ao fim do prazo. Aplica-se a todo dado de: `Patient`, `PatientClinicalProfile`,
`SessionNote`, `AudioCapture`, `Extraction`, `Evidence`, `MilestoneCandidacy`,
`Report`, `Consent`, `AlertaRiscoClinico` e `AuditLog` (modelo completo em
`docs/dados/modelo-de-dados.md`).

## 2. Quem é o controlador dos dados

**A clínica-cliente é a controladora dos dados** (LGPD, Art. 5º, VI) —
detentora da relação com o paciente/família e responsável pelo prontuário
perante seu conselho profissional (CFP/COFFITO/CFFa). **O Iris é operador**
(processa os dados por conta e ordem da clínica, LGPD Art. 5º, VII). Isso é
consequência direta de o Iris ser classificado como produto de tecnologia,
não estabelecimento de saúde (`validacao-legal-prontuario.md`, seção 6) — o
Iris não tem, sozinho, a obrigação legal de guarda que os conselhos impõem;
essa obrigação é da clínica. Por isso a retenção é **configurável por
clínica**, não uma regra única do produto.

## 3. Prazo de retenção do prontuário — default e configuração

Cada conselho profissional define um prazo mínimo diferente para o registro
do SEU profissional (detalhe e fontes em `validacao-legal-prontuario.md`,
seção 2):

| Conselho                      | Prazo mínimo                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| CFP (Psicologia)              | 5 anos do último registro; recomendação do próprio Manual Orientativo: manter até a criança/adolescente completar 18 anos |
| COFFITO (Terapia Ocupacional) | 5 anos do último registro                                                                                                 |
| CFFa (Fonoaudiologia)         | 10 anos a partir da alta/suspensão/abandono                                                                               |

Como o Iris é um prontuário UNIFICADO multidisciplinar, não existe uma norma
única que resolva o conflito entre os três prazos. **Default do produto,
aplicado quando a clínica não configura nada:**

```
MAX(paciente completa 18 anos, data da alta + 10 anos)
```

Este default é um piso de segurança acima dos três prazos simultaneamente
(cobre CFP + CFFa + COFFITO), abaixo do teto de 20 anos da Lei 13.787/2018 —
**é uma síntese de risco do produto, não uma regra escrita em nenhuma norma
específica.** Para o titular que já era **adulto na admissão**, o primeiro
termo da fórmula (paciente completar 18 anos) não se aplica — o prazo
efetivo é **alta + 10 anos**, contado do último atendimento. A clínica pode ajustar esse prazo em configuração
(`clinic.politica_retencao_meses` / `clinic.politica_retencao_config`, ver
`modelo-de-dados.md` seção 5) para refletir a composição real de disciplinas
da sua equipe — e o gate `app_paciente_expurgavel` (migração `0045`) usa a
configuração apenas para **estender**, nunca para encurtar o default. Ao
ajustar, a clínica assume, no seu termo de responsabilidade com o Iris, que a
configuração escolhida atende ao conselho do seu(s) profissional(is) — o Iris
fornece o default conservador e a ferramenta de configuração, não decide
sozinho pela clínica.

## 4. Base legal para retenção além do necessário

LGPD Art. 15/16 determina eliminação do dado ao fim do tratamento, **exceto**
para "cumprimento de obrigação legal ou regulatória pelo controlador" — os
prazos de guarda dos conselhos profissionais (seção 3 acima) são exatamente
essa exceção. O termo de consentimento cita essa base legal explicitamente —
seja no regime de paciente menor (`Consent`, tipo `tratamento_dados_menor`),
seja no regime de titular adulto (`Consent`, tipo
`autoconsentimento_titular_adulto`).

## 5. Matriz consolidada por categoria de dado

O prontuário (seções 3 e 4) não é a única categoria com prazo próprio. As
issues #122, #116 e #89 acrescentaram três, com fundamentos legais distintos.
A coluna "estado" descreve o que o software faz **hoje**; a distinção entre
A coluna "estado" descreve o que o software faz **hoje**; a distinção entre regra escrita e regra implementada está na seção 9.

| Categoria de dado                                                              | Prazo                                                                       | Fundamento                                                                      | Comportamento no fim do prazo                                                                                                                                                 | Estado                                                              |
| :----------------------------------------------------------------------------- | :-------------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| **Prontuário multidisciplinar** (`Patient`, `Session`, `Extraction`, `Report`) | Default `MAX(18 anos do menor, alta + 10 anos)`, configurável para estender | CFP (Res. 01/2009 e 04/2020), COFFITO, CFFa. LGPD Art. 16, I                    | Eliminação ou anonimização, sempre por decisão da clínica (seção 6), via `app_purgar_paciente` com o gate `app_paciente_expurgavel`                                           | Funções no banco (`0045`); **sem caminho de aplicação**             |
| **Alertas de risco clínico** (`AlertaRiscoClinico` — #122)                     | Acompanha o prontuário                                                      | Defesa de responsabilidade técnica da clínica e prova de diligência do software | **Pseudonimização, não eliminação**: `pseudonimizado_em` é carimbado e `patient_id`/`session_id` viram `NULL`; categoria, severidade e carimbos de prazo sobrevivem (seção 7) | Implementado (`0049`), dentro do `app_purgar_paciente`              |
| **Logs de acesso à aplicação** (`AuditLog` — #116)                             | **Mínimo** de 6 meses (180 dias) — não é teto                               | Marco Civil da Internet (Lei 12.965/2014, Art. 15)                              | Expurgo dos registros brutos de IP/sessão depois do mínimo legal                                                                                                              | Implementado (`0070` / `expurgo-audit-log.mjs`)                    |
| **Cópias de segurança** (MinIO local + OCI S3 off-site — #89)                  | 30 dias                                                                     | LGPD Art. 46 (segurança e recuperação)                                          | Local/MinIO: prune do `infra/backup/backup.sh` (`RETENTION_DAYS`, default 30). Off-site: **não podado pelo script, de propósito** — depende de Lifecycle Rule no bucket       | Prune local implementado; lifecycle do bucket a confirmar (seção 9) |

## 6. O que acontece ao fim do prazo do prontuário

Ao atingir o prazo de retenção configurado (calculado por job assíncrono,
mesmo padrão dos demais campos materializados do modelo — ver
`modelo-de-dados.md` seção 2.5), o Iris oferece à clínica duas opções antes
de qualquer eliminação automática:

1. **Eliminação** — remoção completa e irreversível do dado do paciente
   (registro em `AuditLog`, `acao='dado_eliminado'`, ANTES da eliminação
   efetiva, já que o próprio log não pode referenciar um `patient_id` que não
   existe mais — o log de auditoria retém só o metadado da ação, nunca o
   conteúdo clínico eliminado).
2. **Anonimização para fins de melhoria de produto/dataset de reclassificação**
   (mencionado em `modelo-de-negocio.md` como ativo futuro, V5) — só com
   consentimento específico e separado do consentimento de tratamento clínico
   original (LGPD Art. 11, veda uso de dado sensível de saúde para vantagem
   econômica entre controladores sem base legal própria; anonimização
   verdadeira, sem possibilidade de reidentificação, tira o dado do escopo da
   LGPD, mas a coleta do consentimento para esse uso específico é praticada
   por cautela, não por exigência estrita).

**Nenhuma eliminação automática silenciosa**: a clínica recebe aviso com
antecedência (sugestão: 90 dias) antes do prazo vencer, podendo estender a
retenção daquele paciente específico (ex.: processo judicial em curso,
solicitação da família).

## 7. Alerta de risco clínico: por que pseudonimiza em vez de eliminar (#122)

Conforme `docs/agente/regra-alerta-risco.md` e a migração
`0049_alerta_risco_clinico.sql`:

- O expurgo LGPD de um paciente **não deleta a linha** de
  `alerta_risco_clinico`. Marca `pseudonimizado_em = now()` e zera
  `patient_id` e `session_id`; os textos livres (`trecho_fonte`, `detalhe`,
  `conduta_registrada`, `motivo_descarte`) — onde a PII pode residir — são
  sobrescritos por `[expurgado]`.
- A invariante `alerta_risco_vinculo` (CHECK) garante os dois lados: alerta
  vivo exige paciente e sessão; alerta pseudonimizado proíbe os dois. Não há
  caminho para linha órfã silenciosa.
- O que sobrevive é registro anônimo: categoria, severidade, certeza, status e
  os carimbos de prazo, reconhecimento e escalonamento. Isso preserva a prova
  de que os prazos internos de notificação do software foram cumpridos —
  defesa profissional do terapeuta e da clínica — sem manter dado pessoal
  identificável.
- Mesma lógica na trilha: `app_purgar_paciente` **pseudonimiza** o `audit_log`
  do sujeito (zera `patient_id`, substitui `detalhe`) em vez de apagá-lo,
  porque a trilha é imutável por desenho.

## 8. Tensão: Expurgo de Dados (Fase 6) vs. Retenção de Backup (30 dias) — #89

A Fase 6 do Iris implementou a funcionalidade de eliminação física e expurgo de dados de pacientes (erasure LGPD) em atendimento ao direito de eliminação (Art. 18, VI, da LGPD) e ao fim do prazo de retenção legal do prontuário. No entanto, o serviço de backup (`iris-backup`) mantém cópias de segurança (dumps cifrados) por até 30 dias (`RETENTION_DAYS=30`).

Essa coexistência temporária gera uma tensão: um dado expurgado do banco de dados ativo continua existindo nos backups históricos por até 30 dias.

### Justificativa Legal e Técnica
Esta política de retenção de 30 dias para cópias de segurança é legítima, defensável e em conformidade com a LGPD pelas seguintes razões:
1. **Segurança e Resiliência (LGPD Art. 46):** A manutenção de backups diários cifrados é uma medida técnica indispensável para garantir a resiliência e a recuperação de desastres (Disaster Recovery Plan - DRP). Trata-se de uma obrigação de segurança da informação para garantir a continuidade dos serviços e a integridade dos dados clínicos de todos os demais pacientes em caso de falha de hardware, corrupção do banco ou incidentes de segurança.
2. **Impossibilidade Técnica de Mutação Seletiva:** Os dumps gerados são cópias completas do estado do cluster (`pg_dump` + `pg_dumpall`). Não é tecnicamente viável nem seguro descriptografar, alterar seletivamente para expurgar um único paciente e recriptografar os backups históricos diários sem comprometer a integridade e a auditabilidade de toda a cadeia de segurança do backup.
3. **Isolamento e Cifra (Age):** Os backups são cifrados no cliente com chaves `age` e transmitidos de forma segura. O acesso lógico ao conteúdo dos dumps é estritamente restrito e só ocorre em cenários de desastre real.
4. **Ciclo de Rotação e Destruição Automática (30 dias):** Os backups locais e no MinIO possuem prune automático configurado para exatamente 30 dias (`RETENTION_DAYS=30`). O bucket off-site na OCI possui regras de ciclo de vida (Lifecycle Rules) para expurgar fisicamente os arquivos antigos em até 30 dias. Nenhum dado de paciente expurgado do banco ativo será processado ou restaurado para fins operacionais rotineiros.

### Protocolo de Resposta ao Titular (Art. 18)
Para garantir a transparência exigida pela LGPD, toda resposta ao titular que solicite a eliminação de seus dados (ou ao seu responsável legal) deve conter, de forma clara e explícita, a informação sobre a janela de backup:
> *"Seus dados pessoais foram eliminados do banco de dados ativo da plataforma Iris em [Data/Hora]. Para fins de resiliência e recuperação de desastres, cópias de segurança cifradas são expurgadas automaticamente no ciclo de rotação em até 30 dias."*

## 9. Lacunas de implementação — o que aqui ainda é intenção

Esta seção existe para que a política não seja lida como descrição do que o
software já faz. Numa política de retenção a diferença não é detalhe de
redação: este é o documento que a clínica-controladora usaria para responder a
um titular ou à ANPD, e afirmar controle que não roda é declarar controle
inexistente. Cada item foi conferido no código em 28/07/2026:

| Lacuna                                                | Estado verificado                                                                                                                                                                                                                                           | Onde fecha            |
| :---------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------- |
| Expurgo do prontuário ao vencer o prazo               | `app_purgar_paciente` e `app_paciente_expurgavel` existem na `0045`, mas **nenhum código da aplicação as chama** — nenhuma ação, tela ou job. O expurgo hoje só sai por SQL manual, e o aviso prévio de 90 dias da seção 6 não existe.                      | Fase 6 / `BACKLOG.md` |
| Expurgo do `audit_log` após 6 meses (#116)            | Implementado via `0070_expurgo_audit_log_marco_civil.sql` e script `scripts/expurgo-audit-log.mjs` (agendado via Easypanel). Pseudonimiza logs órfãos e expurga registros com 180+ dias. | Fechado (#116) |
| Lifecycle Rule de 30 dias no bucket off-site (OCI S3) | Configuração do provedor, fora do repositório. **Confirmar no console do bucket** — não presumir pelo texto desta política.                                                                                                                                 | #89                   |

## 10. Direitos do titular (LGPD Art. 18)

O titular dos dados pode solicitar, a qualquer momento e através da clínica
(controladora): confirmação de tratamento, acesso aos dados, correção,
anonimização/eliminação (respeitada a base legal de retenção da seção 4),
portabilidade, e revogação do consentimento (sem efeito retroativo sobre o
tratamento já realizado). Quando o paciente é menor de 18 anos, esses
direitos são exercidos pelo responsável legal; quando é titular adulto e
civilmente capaz, são exercidos pelo próprio titular
(`termo-consentimento-titular-adulto.md`, seção 13). O Iris, como operador,
executa essas solicitações mediante instrução da clínica.

## 11. Encarregado (DPO)

**Pendência real, não resolvida neste rascunho:** a clínica-cliente, como
controladora, deveria indicar um encarregado (DPO) próprio (LGPD Art. 41) —
não é papel do Iris substituir isso. Se o Iris crescer a ponto de precisar
de um encarregado próprio (para o tratamento que ele mesmo realiza como
operador/subcontratante), essa nomeação é decisão de governança pendente,
fora do escopo deste documento de política de dado de paciente. O contato
institucional de privacidade do produto é `privacidade@irisclinica.ia.br`.

## 12. Pendências antes deste documento valer como final

- Confirmação por advogado de que o default `MAX(18 anos, alta+10 anos)` é
  razoável e que a divisão controlador (clínica) / operador (Iris) está
  correta para o modelo de negócio do Iris.
- Definição de quem é o encarregado (DPO) do próprio Iris enquanto operador.
- Revisão de que o processo de aviso prévio (90 dias, seção 6) é
  operacionalmente viável antes de virar compromisso público.
- Fechamento das lacunas da seção 9 — enquanto elas existirem, o documento
  descreve mais controle do que o software executa.
