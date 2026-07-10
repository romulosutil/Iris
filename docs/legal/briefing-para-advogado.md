# Iris — Briefing jurídico para revisão informal

**Para quem vai ler:** este documento foi escrito para um advogado(a) amigo(a)
do Rômulo dar um "OK, faz sentido" (ou apontar o que está errado) rapidamente —
**não é um pedido de parecer formal pago**, é uma checagem informal antes de
assinar os primeiros contratos-piloto. Cada ponto abaixo tem: a pergunta
objetiva, o contexto mínimo para responder, o que o produto JÁ decidiu fazer
(e por quê), e um espaço para a resposta. Se algum ponto exigir mais tempo/
profundidade do que cabe num favor informal, é só marcar como "precisa de
parecer formal" — não tem problema deixar pendente.

**O que é o Iris, em 3 frases:** SaaS B2B para clínicas de terapia
infantil (ABA, Fonoaudiologia, Terapia Ocupacional) em TEA/autismo. Terapeutas
escrevem um diário em texto livre depois da sessão; uma IA sugere estruturação
clínica (nunca pontua ou decide sozinha — toda sugestão exige aprovação humana
antes de virar registro permanente). Ainda não lançado; piloto pago com 1-2
clínicas fundadoras é o próximo passo.

**Documentos completos por trás deste resumo** (só consultar se quiser o
detalhe/fontes primárias de cada ponto): `docs/legal/validacao-legal-prontuario.md`
(pesquisa jurídica de base), `docs/legal/politica-retencao-dados.md`,
`docs/legal/termos-de-uso.md`, `docs/legal/politica-privacidade.md`.

---

## 1. Prazo de guarda do prontuário (multidisciplinar, sem norma única)

**Contexto:** CFP (Psicologia) recomenda guardar até o paciente completar 18
anos; COFFITO (TO) pede 5 anos do último registro; CFFa (Fono) pede 10 anos
da alta. Não existe norma que resolva isso para um prontuário UNIFICADO com as
três disciplinas juntas.

**O que o produto decidiu fazer:** não travar um prazo único no código.
Retenção é **configurável por clínica**, com um default sugerido de
`MAX(paciente completa 18 anos, alta + 10 anos)` — cobre os três prazos ao
mesmo tempo, abaixo do teto de 20 anos da Lei 13.787/2018. A clínica pode
ajustar; o termo de responsabilidade dela assume a adequação ao conselho do
profissional dela.

**Pergunta objetiva:** esse default é razoável como ponto de partida, ou
existe um jeito mais simples/seguro de enquadrar isso (ex.: um prazo único
mais conservador, ou deixar 100% a critério da clínica sem default nenhum)?

**Resposta do advogado:** ☐ OK, razoável &nbsp;&nbsp; ☐ Ajustar: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

---

## 2. Controlador (clínica) vs. operador (Iris) — a divisão está certa?

**Contexto:** o modelo assume que a clínica-cliente é a **controladora** dos
dados (LGPD Art. 5º, VI — é dela a relação com o paciente, é ela quem responde
perante o conselho profissional) e o Iris é **operador** (processa por conta
e ordem da clínica, Art. 5º, VII). Essa divisão é a base de todo o resto:
termos de uso, política de privacidade, retenção, e até a decisão de que o
Iris não precisa de CNES/alvará sanitário (não é estabelecimento de saúde).

**O que o produto decidiu fazer:** tratar a clínica como controladora em
todos os documentos e contratos.

**Pergunta objetiva:** essa divisão controlador/operador está correta para
este modelo de negócio (SaaS vertical de prontuário), ou existe algum
cenário (ex.: uso da IA, retenção do Iris de dado para melhorar o produto)
que faria o Iris ser controlador em algum recorte específico?

**Resposta do advogado:** ☐ Divisão correta &nbsp;&nbsp; ☐ Ajustar: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

---

## 3. Responsabilidade técnica sobre terapia ABA (profissão não regulamentada)

**Contexto:** ABA não é profissão autônoma regulamentada no Brasil (dois
projetos de lei em tramitação, nenhum aprovado). Hoje, quem responde
legalmente por um registro de terapia ABA feito por um técnico/AT sem
registro em conselho é o **psicólogo supervisor**.

**O que o produto decidiu fazer:** modelar um campo `responsavel_tecnico_id`
no vínculo de equipe (`care_team_membership`), granularidade **por vínculo**
(não por clínica inteira nem por sessão individual) — cada AT sem CRP fica
associado a um psicólogo supervisor específico, com um impedimento técnico
contra a pessoa se auto-supervisionar.

**Pergunta objetiva:** a granularidade "por vínculo" é suficiente para
representar a responsabilidade técnica de forma juridicamente defensável, ou
isso precisa ser mais fino (ex.: por sessão) ou mais amplo (ex.: um só
responsável técnico por clínica)?

**Resposta do advogado:** ☐ Granularidade OK &nbsp;&nbsp; ☐ Ajustar: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

---

## 4. Transferência internacional de dado (API de IA fora do Brasil)

**Contexto:** o texto do diário de sessão (dado sensível de saúde de menor) é
enviado a um provedor de LLM (Anthropic Claude, possivelmente Google Gemini)
para gerar a sugestão de estruturação. Nenhum desses provedores confirma
processamento dentro do Brasil hoje. A LGPD permite transferência
internacional (Art. 33) com salvaguardas: Cláusulas-Padrão Contratuais
(Resolução CD/ANPD nº 19/2024, já em vigor) ou consentimento específico do
titular para aquela transferência.

**O que o produto decidiu fazer:** hospedar banco de dados e aplicação em
região Brasil (originalmente Supabase `sa-east-1` + Vercel `gru1`; **decisão
09/07/2026** de pivô para **VPS Hostinger região São Paulo (confirmada) +
Easypanel + Postgres puro self-hosted** — o requisito "dados em território
brasileiro" NÃO muda, só o provedor; ver
`docs/arquitetura/plano-bootstrap-e-stack-vps.md`. Efeito jurídico relevante:
some a Supabase como sub-processadora — banco e armazenamento (MinIO) passam a
ser operados pela própria clínica/Iris na VPS, e o backup/retenção passa a ser
responsabilidade da própria operação, não de um provedor gerenciado) para
reduzir a superfície
de transferência internacional ao mínimo possível (só a chamada de IA em si),
e citar essa transferência explicitamente no termo de consentimento. Falta
confirmar/assinar o DPA (Data Processing Agreement) formal com o provedor de
IA escolhido antes do piloto com dado real.

**Pergunta objetiva:** citar a transferência internacional no consentimento
LGPD + confiar nas Cláusulas-Padrão do provedor é suficiente, ou o Iris
precisa de um DPA próprio negociado (não só aceitar os termos padrão do
provedor) antes de processar dado real de paciente?

**Resposta do advogado:** ☐ Suficiente como está &nbsp;&nbsp; ☐ Ajustar: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

---

## 5. A IA é "Software como Dispositivo Médico" (SaMD)?

**Contexto:** RDC ANVISA nº 657/2022 regula SaMD. Pela leitura do P&R oficial
da ANVISA, softwares que (a) não finalizam decisão clínica automaticamente,
(b) exigem validação humana antes de qualquer resultado oficial, e (c) atuam
como apoio informativo/organizacional (não diagnóstico), tendem a ficar FORA
do enquadramento. O desenho do Iris (toda sugestão de IA é `sugerida`, nunca
vira dado permanente sem aprovação humana explícita) parece se encaixar nessa
exclusão — mas isso não é determinação oficial da ANVISA, é leitura própria.

**O que o produto decidiu fazer:** seguir com o desenho atual (aprovação
humana sempre obrigatória) e tratar isso como não bloqueador do piloto, mas
como pendência a confirmar **antes do lançamento comercial** (não antes do
piloto com 1-2 clínicas).

**Pergunta objetiva:** essa leitura está certa, e é seguro operar o piloto sem
confirmação formal da ANVISA, desde que se confirme antes de vender
amplamente?

**Resposta do advogado:** ☐ Leitura correta, pode pilotar assim &nbsp;&nbsp; ☐ Ajustar: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

---

## 6. Iris não é "estabelecimento de saúde" (sem CNES/alvará)

**Contexto:** o CNES (Cadastro Nacional de Estabelecimentos de Saúde) exige,
entre outros critérios, prestação efetiva de atendimento num espaço físico —
critério que exclui explicitamente quem só vende/licencia software. O Iris
vende tecnologia para a clínica (que é o estabelecimento de saúde, se for o
caso dela); o Iris não atende paciente diretamente.

**O que o produto decidiu fazer:** operar sem CNES/alvará sanitário próprio,
deixando essa obrigação (quando aplicável) com a clínica-cliente.

**Pergunta objetiva:** essa leitura está certa para o modelo SaaS puro (sem
qualquer prestação de serviço clínico direto pelo Iris)?

**Resposta do advogado:** ☐ Correto &nbsp;&nbsp; ☐ Ajustar: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

---

## 7. Assinatura eletrônica no registro (sem certificado ICP-Brasil)

**Contexto:** nenhum dos três conselhos pesquisados (CFP, COFFITO, CFFa)
exige certificado ICP-Brasil para validar um registro clínico eletrônico —
todos aceitam "assinatura eletrônica" com segurança/rastreabilidade
adequadas.

**O que o produto decidiu fazer:** login com senha (idealmente MFA) + trilha
de auditoria imutável por ação (quem fez o quê, quando) como piso de
autenticação/assinatura, sem exigir certificado ICP-Brasil.

**Pergunta objetiva:** esse piso (login+senha/MFA+auditoria imutável) é
suficiente como "assinatura eletrônica" juridicamente defensável para
prontuário clínico, ou vale a pena já prever certificado ICP-Brasil como
opção (não obrigatória) desde o MVP?

**Resposta do advogado:** ☐ Piso suficiente &nbsp;&nbsp; ☐ Ajustar: ___________ &nbsp;&nbsp; ☐ Precisa de parecer formal

---

## 8. Cláusulas em aberto nos Termos de Uso (vigência, rescisão, foro)

**Contexto:** `docs/legal/termos-de-uso.md` está com as seções 8 (Vigência/
rescisão/alterações) e 9 (Foro) deliberadamente em branco — é o tipo de
cláusula padrão que um advogado preenche rápido, mas que o produto não
deveria tentar redigir sozinho.

**Pergunta objetiva:** consegue sugerir uma redação padrão para: (a) prazo de
vigência e rescisão (incluindo rescisão por inadimplência e aviso prévio), e
(b) foro competente, para os contratos-piloto?

**Resposta do advogado (redação sugerida ou "precisa de reunião"):**

```



```

---

## 9. Encarregado (DPO)

**Contexto:** LGPD Art. 41 pede indicação de um encarregado. Hoje isso está
em aberto tanto para a clínica (controladora) quanto para o Iris (operador).

**Pergunta objetiva:** para o estágio de piloto (1-2 clínicas, sem equipe de
compliance dedicada), é aceitável que o próprio Rômulo (como responsável pelo
Iris) figure como contato/encarregado informal até o negócio crescer, ou
isso precisa ser formalizado com um nome específico e canal de contato
público antes do piloto?

**Resposta do advogado:** ☐ Aceitável informal por ora &nbsp;&nbsp; ☐ Precisa formalizar já: ___________

---

## Resumo para quem só quer ler uma vez

Dos 9 pontos acima, os que mais importam ANTES do piloto (dado real de
paciente entrando no sistema) são **1, 2, 3 e 4** (prazo de guarda,
controlador/operador, responsabilidade técnica ABA, transferência
internacional) — são os que tocam diretamente a relação com o paciente e o
dado sensível de saúde de menor. Os pontos **5 e 6** (SaMD/ANVISA,
estabelecimento de saúde) importam mais **antes do lançamento comercial** do
que antes do piloto restrito. Os pontos **7, 8 e 9** são de redação
contratual e podem ser resolvidos numa conversa rápida.
