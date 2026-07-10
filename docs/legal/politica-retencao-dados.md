# Política de Retenção e Eliminação de Dados — Iris

**Status: RASCUNHO de produto, pendente de revisão por advogado antes de valer
como documento contratual/publicado.** Redigido em 09/07/2026 com base na
pesquisa jurídica documentada em `validacao-legal-prontuario.md` (que também
não substitui parecer jurídico — ver aviso naquele documento). Este rascunho
fecha a REDAÇÃO da política; falta a validação formal antes do piloto com
dado real de paciente (`BACKLOG.md` seção B).

---

## 1. Objetivo e escopo

Esta política define por quanto tempo o Iris mantém os dados pessoais e
sensíveis (dado de saúde) tratados na plataforma, e o processo de eliminação
ao fim do prazo. Aplica-se a todo dado de: `Patient`, `PatientClinicalProfile`,
`SessionNote`, `AudioCapture`, `Extraction`, `Evidence`, `MilestoneAssessment`,
`Report`, `Consent` e `AuditLog` (modelo completo em `docs/dados/modelo-de-dados.md`).

## 2. Quem é o controlador dos dados

**A clínica-cliente é a controladora dos dados** (LGPD, Art. 5º, VI) —
detentora da relação com o paciente/família e responsável pelo prontuário
perante seu conselho profissional (CRP/COFFITO/CFFa). **O Iris é operador**
(processa os dados por conta e ordem da clínica, LGPD Art. 5º, VII). Isso é
consequência direta de o Iris ser classificado como produto de tecnologia,
não estabelecimento de saúde (`validacao-legal-prontuario.md`, seção 6) — o
Iris não tem, sozinho, a obrigação legal de guarda que os conselhos impõem;
essa obrigação é da clínica. Por isso a retenção é **configurável por
clínica**, não uma regra única do produto.

## 3. Prazo de retenção — default e configuração

Cada conselho profissional define um prazo mínimo diferente para o registro
do SEU profissional (detalhe e fontes em `validacao-legal-prontuario.md`,
seção 2):

| Conselho | Prazo mínimo |
|---|---|
| CFP (Psicologia) | 5 anos do último registro; recomendação do próprio Manual Orientativo: manter até a criança/adolescente completar 18 anos |
| COFFITO (Terapia Ocupacional) | 5 anos do último registro |
| CFFa (Fonoaudiologia) | 10 anos a partir da alta/suspensão/abandono |

Como o Iris é um prontuário UNIFICADO multidisciplinar, não existe uma norma
única que resolva o conflito entre os três prazos. **Default do produto,
aplicado quando a clínica não configura nada:**

```
MAX(paciente completa 18 anos, data da alta + 10 anos)
```

Este default é um piso de segurança acima dos três prazos simultaneamente
(cobre CFP + CFFa + COFFITO), abaixo do teto de 20 anos da Lei 13.787/2018 —
**é uma síntese de risco do produto, não uma regra escrita em nenhuma norma
específica.** A clínica pode ajustar esse prazo em configuração
(`clinic.politica_retencao_meses` / `clinic.politica_retencao_config`, ver
`modelo-de-dados.md` seção 5) para refletir a composição real de disciplinas
da sua equipe. Ao ajustar, a clínica assume, no seu termo de responsabilidade
com o Iris, que a configuração escolhida atende ao conselho do seu(s)
profissional(is) — o Iris fornece o default conservador e a ferramenta de
configuração, não decide sozinho pela clínica.

## 4. Base legal para retenção além do necessário

LGPD Art. 15/16 determina eliminação do dado ao fim do tratamento, **exceto**
para "cumprimento de obrigação legal ou regulatória pelo controlador" — os
prazos de guarda dos conselhos profissionais (seção 3 acima) são exatamente
essa exceção. O termo de consentimento (`Consent`, tipo
`tratamento_dados_menor`) cita essa base legal explicitamente.

## 5. O que acontece ao fim do prazo

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

## 6. Direitos do titular (LGPD Art. 18)

O responsável legal do paciente pode solicitar, a qualquer momento e através
da clínica (controladora): confirmação de tratamento, acesso aos dados,
correção, anonimização/eliminação (respeitada a base legal de retenção da
seção 4), portabilidade, e revogação do consentimento (sem efeito retroativo
sobre o tratamento já realizado). O Iris, como operador, executa essas
solicitações mediante instrução da clínica.

## 7. Encarregado (DPO)

**Pendência real, não resolvida neste rascunho:** a clínica-cliente, como
controladora, deveria indicar um encarregado (DPO) próprio (LGPD Art. 41) —
não é papel do Iris substituir isso. Se o Iris crescer a ponto de precisar
de um encarregado próprio (para o tratamento que ele mesmo realiza como
operador/subcontratante), essa nomeação é decisão de governança pendente,
fora do escopo deste documento de política de dado de paciente.

## 8. Pendências antes deste documento valer como final

- Confirmação por advogado de que o default `MAX(18 anos, alta+10 anos)` é
  razoável e que a divisão controlador (clínica) / operador (Iris) está
  correta para o modelo de negócio do Iris.
- Definição de quem é o encarregado (DPO) do próprio Iris enquanto operador.
- Revisão de que o processo de aviso prévio (90 dias, seção 5) é
  operacionalmente viável antes de virar compromisso público.
