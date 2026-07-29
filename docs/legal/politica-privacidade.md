# Política de Privacidade — Iris

**Status: RASCUNHO de produto, pendente de revisão por advogado antes de
publicação.** Redigido em 09/07/2026 com base em `validacao-legal-prontuario.md`
e no modelo de dados (`docs/dados/modelo-de-dados.md`). Complementa
`termos-de-uso.md` e `politica-retencao-dados.md` — os três documentos devem
ser lidos e revisados juntos.

---

## 1. Que dados o Iris trata

Dados pessoais e dados sensíveis (dado de saúde, LGPD Art. 5º, II) de crianças
e adolescentes em acompanhamento terapêutico, incluindo: identificação e
contato do responsável (`Patient`), diagnóstico/hipótese e informações de
saúde (`PatientClinicalProfile`), notas de sessão em texto e áudio
(`SessionNote`, `AudioCapture`), evidências clínicas estruturadas derivadas do
relato do profissional (`Evidence`), avaliações formais (`MilestoneAssessment`)
e relatórios gerados (`Report`).

## 2. Base legal do tratamento

- **Consentimento específico e destacado** de pelo menos um dos pais/
  responsável legal (LGPD Art. 14) — coletado no ato de admissão do paciente
  na clínica, versionado e nunca sobrescrito (`Consent`).
- **Tutela da saúde**, quando o tratamento é realizado por profissionais/
  serviços de saúde (LGPD Art. 11, II, "f" — a alínea "a" é cumprimento de
  obrigação legal ou regulatória, citada abaixo, e estava trocada aqui até
  28/07/2026).
- **Cumprimento de obrigação legal/regulatória** para a retenção além do
  período de tratamento ativo (LGPD Art. 15/16 — ver seção 5 abaixo e
  `politica-retencao-dados.md`).

## 3. Quem trata os dados (controlador e operador)

A **clínica-contratante é a controladora** dos dados do paciente. O **Iris é
operador**, tratando os dados por conta e ordem da clínica, exclusivamente
para prestar o serviço contratado — o Iris não usa dado de paciente para
finalidade própria fora do contrato (ex.: não vende dado, não usa para
publicidade; ver seção 6 sobre uso agregado/anonimizado).

## 4. Papel da inteligência artificial

O Iris usa um modelo de linguagem (LLM) de terceiro para gerar SUGESTÕES de
estruturação de evidências a partir do texto do diário de sessão — nunca para
pontuar, diagnosticar ou decidir automaticamente (princípio R3,
`docs/agente/protocolos-e-agente.md`). Toda sugestão exige aprovação humana
antes de virar registro permanente. O texto da sessão é enviado ao provedor
de IA para processamento; **isso configura transferência internacional de
dado sensível de saúde de menor quando o provedor não tem infraestrutura no
Brasil** (LGPD Art. 33) — protegida por Cláusulas-Padrão Contratuais (Resolução
CD/ANPD nº 19/2024) e por acordo de processamento de dados (DPA) com o
provedor, que não retém o conteúdo além do necessário para gerar a resposta
(confirmar termos exatos do DPA com o provedor escolhido antes do piloto —
`docs/arquitetura/stack-e-plano-de-construcao.md`, seção sobre escolha de LLM).

## 5. Por quanto tempo os dados são mantidos

Ver `politica-retencao-dados.md` para o detalhamento completo. Resumo: prazo
configurável pela clínica, com default sugerido de `MAX(paciente completa 18
anos, alta + 10 anos)` — cobre os prazos mínimos dos conselhos profissionais
(CFP, COFFITO, CFFa) pesquisados.

## 6. Uso agregado/anonimizado para melhoria do produto

O Iris pode, no futuro, usar dados verdadeiramente anonimizados (sem
possibilidade de reidentificação) de reclassificações do coordenador
(divergência IA × revisão humana) para melhorar a precisão do agente de
extração (`modelo-de-negocio.md`, dataset de reclassificação, V5). Isso só
ocorre mediante consentimento específico e separado do consentimento de
tratamento clínico original, e nunca envolve dado identificável do paciente.
Este uso NÃO está ativo no MVP/piloto — registrado aqui para transparência
futura.

## 7. Compartilhamento com terceiros

- **Provedor de IA** (extração de evidências) — ver seção 4.
- **Provedor de hospedagem/infraestrutura** (banco de dados, armazenamento de
  áudio) — hospedado em região Brasil (ver `stack-e-plano-de-construcao.md`).
- **Operadoras de plano de saúde/convênio** — apenas quando a clínica
  EXPORTA um relatório (narrativo ou dossiê bruto de auditoria) por decisão
  própria da clínica; o Iris não compartilha dado diretamente com convênios,
  só fornece a ferramenta de exportação usada pela clínica. Toda exportação é
  registrada em `AuditLog` antes de ser liberada.
- Nenhum compartilhamento com terceiros para fins de publicidade ou venda de
  dado agregado de saúde (vedado pelo Art. 11 da LGPD "com objetivo de obter
  vantagem econômica" entre controladores).

## 8. Segurança

Controle de acesso por papel (`UserRole`: terapeuta/coordenador/admin_recepcao)
com isolamento entre clínicas via Row-Level Security no banco de dados
(impossível de esquecer um filtro de tenant numa query), trilha de auditoria
imutável de toda reclassificação/exportação/mudança de vínculo
(`AuditLog`), e imutabilidade de `Evidence` (sem UPDATE/DELETE em nível de
privilégio de banco, não só convenção). Nenhum conselho profissional
pesquisado exige certificação ICP-Brasil — login+senha (idealmente MFA) +
trilha de auditoria é o piso de segurança adotado
(`validacao-legal-prontuario.md`, seção 3).

## 9. Direitos do titular

Ver seção 6 de `politica-retencao-dados.md` — confirmação de tratamento,
acesso, correção, anonimização/eliminação (respeitada a retenção legal),
portabilidade e revogação de consentimento, exercidos através da
clínica-contratante (controladora).

## 10. Encarregado (DPO)

**Pendência real:** a indicação de um encarregado (LGPD Art. 41), tanto pela
clínica (controladora) quanto, potencialmente, pelo Iris (operador), ainda
não foi feita — decisão de governança fora do escopo deste rascunho.

## 11. Contato

[Pendente — e-mail/canal de contato para exercício de direitos e dúvidas sobre
esta política, a definir antes da publicação.]

---

## Pendências antes deste documento valer como final

- Revisão por advogado, especialmente das seções 4 (DPA com provedor de IA) e
  6 (uso agregado/anonimizado).
- Definição do encarregado (seção 10) e canal de contato (seção 11).
- Confirmar o provedor de IA final (Claude vs. alternativa — ver
  `BACKLOG.md` seção B) antes de nomear o provedor explicitamente no texto
  público desta política.
