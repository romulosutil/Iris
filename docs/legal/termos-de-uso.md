# Termos de Uso — Iris

**Status: RASCUNHO de produto, pendente de revisão por advogado antes de
publicação/assinatura.** Redigido em 09/07/2026 com base na especificação do
produto e na pesquisa jurídica de `validacao-legal-prontuario.md`. Cobre a
relação Iris ↔ clínica-contratante (B2B) — não é um termo direcionado à
família/paciente (esse é o consentimento LGPD, modelado como `Consent` e
apresentado no ato de admissão, ver `docs/ux/fluxos-e-wireframes.md`).

---

## 1. O que é o Iris

O Iris é um software (SaaS) de apoio ao registro, organização e acompanhamento
de evidências clínicas em terapias multidisciplinares (ABA, Fonoaudiologia,
Terapia Ocupacional) para o público infantil, com um componente de
inteligência artificial que SUGERE estruturação de evidências a partir do
relato do profissional — nunca pontua, avalia ou diagnostica automaticamente
(princípio R3 do agente, `docs/agente/protocolos-e-agente.md`, Parte 3). Toda
sugestão da IA (`Extraction`) exige aprovação humana explícita antes de virar
registro permanente (`Evidence`).

**O Iris não é um dispositivo médico, não substitui julgamento clínico
profissional, e não é um estabelecimento de saúde** — é fornecedor de
tecnologia para a clínica, que é quem presta o atendimento e responde
tecnicamente por ele perante seu conselho profissional
(`validacao-legal-prontuario.md`, seção 6).

## 2. Partes e papéis

- **Iris** — fornecedor do software, operador de dados pessoais (LGPD Art.
  5º, VII) por conta e ordem da clínica-contratante.
- **Clínica-contratante** — controladora dos dados (LGPD Art. 5º, VI),
  responsável pelo cadastro de protocolos licenciados, pela composição de
  disciplinas/profissionais, pela relação com pacientes/famílias e pela
  adequação do uso do Iris às normas do(s) seu(s) conselho(s) profissional(is).
- **Responsável pela conta** (`Clinic.responsavel_conta_id`) — pessoa física
  com quem o Iris trata assuntos contratuais/financeiros, mesmo em clínicas
  onde essa pessoa acumula papel clínico (freelancer/terapeuta único).

## 3. Licenciamento de protocolos/instrumentos — responsabilidade da clínica

O Iris modela a ESTRUTURA de protocolos clínicos (domínios, escalas, marcos)
mas, para os instrumentos protegidos por direito autoral (VB-MAPP, ABLLS-R,
AFLS, Denver/ESDM Curriculum Checklist, Perfil Sensorial 2, e os brasileiros
PROC/ABFW fora dos 2 abertos — ver `docs/agente/protocolos-e-agente.md`, aviso
do topo), **é a clínica quem deve possuir a licença/manual oficial e cadastrar
o conteúdo textual protegido**. O Iris não fornece, vende, nem sublicencia o
texto desses instrumentos.

## 4. Uso aceitável

A clínica-contratante concorda em:

- Obter o consentimento LGPD apropriado do responsável legal do paciente antes
  de inserir qualquer dado no sistema (Art. 14, ver `Consent`).
- Não usar o Iris para automatizar decisão clínica sem revisão humana — a
  sugestão da IA (`Extraction`) é sempre revisável/editável/rejeitável antes
  de virar registro (`Evidence`); a clínica é responsável pela revisão
  efetiva, não só pela aprovação mecânica ("rubber-stamping" — o próprio
  desenho do produto já tem fricção deliberada contra isso, ver
  `docs/ux/fluxos-e-wireframes.md`).
- Configurar corretamente a supervisão técnica (`responsavel_tecnico_id`)
  quando aplicável — profissionais de disciplina ABA sem CRP próprio devem
  estar sob supervisão de um psicólogo (achado de `validacao-legal-prontuario.md`,
  seção 1).
- Não usar o produto para fins fora do escopo de acompanhamento terapêutico
  descrito acima (ex.: não é ferramenta de diagnóstico, prescrição, ou decisão
  de cobertura de convênio automatizada).

## 5. Limitação de responsabilidade

O Iris não garante resultado terapêutico específico. As sugestões da IA
podem conter erros de classificação — por isso a revisão humana é obrigatória
em todo o fluxo (nenhuma `Evidence` existe sem aprovação humana prévia). A
responsabilidade técnica/clínica pelo atendimento, pelo prontuário e pelo
cumprimento das normas do conselho profissional é da clínica-contratante e
de seus profissionais, não do Iris.

## 6. Propriedade de dados e portabilidade

Os dados inseridos pela clínica (prontuário, evidências, relatórios) pertencem
à clínica/paciente. Em caso de encerramento de contrato, a clínica pode
exportar seus dados (formato a definir — provavelmente JSON estruturado +
PDFs de relatórios já gerados) dentro de um prazo razoável, antes de qualquer
eliminação conforme `politica-retencao-dados.md`.

## 7. Preço e cobrança

Cobrança por paciente ativo/mês, conforme tier contratado
(`docs/produto/modelo-de-negocio.md`, seção 4). Números finais de preço e
definição operacional de "paciente ativo" ainda em validação (Roteiro C da
pesquisa real) — o contrato do piloto usa os valores acordados individualmente
com cada clínica fundadora.

## 8. Vigência, rescisão e alterações

[Pendente de definição jurídica — cláusulas padrão de prazo, rescisão por
inadimplência, aviso prévio, e processo de alteração destes termos precisam
de revisão de advogado antes de virarem compromisso contratual.]

## 9. Foro e legislação aplicável

Legislação brasileira, incluindo LGPD (Lei 13.709/2018). [Foro específico —
pendente de definição jurídica, tipicamente o foro da sede do contratante ou
do Iris, a decidir.]

---

## Pendências antes deste documento valer como final

- Revisão completa por advogado (cláusulas 8 e 9 estão deliberadamente
  incompletas).
- Confirmação de que a divisão de responsabilidade Iris (operador) / clínica
  (controladora) está corretamente refletida em linguagem contratual, não só
  descritiva.
- Alinhamento com `politica-privacidade.md` e `politica-retencao-dados.md`
  (devem ser referenciados formalmente um no outro).
