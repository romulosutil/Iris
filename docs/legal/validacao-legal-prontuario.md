# Validação Legal — Prontuário Eletrônico e LGPD

Pesquisa do item de BACKLOG "Verificar requisitos legais de prontuário
eletrônico no Brasil (CFP/CFM/COFFITO) e hospedagem de dados de saúde".
Pesquisado em 09/07/2026, com fontes primárias (leis, resoluções) sempre que
acessíveis; texto de algumas resoluções foi obtido via resumo de ferramenta de
IA sobre o documento fonte, não leitura literal — marcado explicitamente onde
isso se aplica.

**Leitura importante antes de qualquer coisa:** eu não sou advogado, e este
documento não substitui um parecer jurídico. Meu critério para marcar `[x]`
no BACKLOG foi: só marco o que está diretamente respaldado por texto de lei/
resolução oficial que eu li e cito abaixo. Qualquer coisa que dependa de
INTERPRETAÇÃO ou SÍNTESE entre normas de conselhos diferentes (que é
literalmente o caso do Iris — nenhuma norma existente foi escrita pensando
num prontuário unificado multidisciplinar com um componente de IA e um dado
de "evidência" que não é nem prontuário médico tradicional nem só psicológico)
eu deixo como **pendente de parecer jurídico especializado** — não é
"resolvido", é "pesquisado e mapeado, com uma recomendação de produto, sem
certeza legal absoluta".

---

## 1. Quem pode legalmente assinar/ser responsável pelo registro — achado mais importante

**Análise do Comportamento Aplicada (ABA) NÃO é uma profissão autônoma
regulamentada no Brasil.** Hoje, o profissional legalmente habilitado a
aplicar e supervisionar intervenção ABA é o **psicólogo** (registro no CRP).
O CFP se posiciona ativamente CONTRA a criação de "analista do comportamento"
como profissão autônoma — há dois projetos de lei em tramitação (PL 1.321/2022
e PL 1.434/2025), nenhum aprovado até a data desta pesquisa; o PL 1.434/2025
está "aguardando designação de relator" na Comissão de Trabalho da Câmara
desde jun/2025.

**Implicação direta para o modelo de dados (`modelo-de-dados.md`):** o
`CareTeamMembership` de um AT/técnico ABA sem CRP precisa, na prática clínica
real, estar sob supervisão técnica formal de um psicólogo responsável — é
esse psicólogo quem responde legalmente pelo prontuário na disciplina ABA,
mesmo que o AT seja quem escreve o diário e aprova a Extraction no dia a dia.
O modelo atual não distingue "quem registrou" de "quem é o responsável
técnico legal" — ver ação recomendada na seção 5.

**Certeza:** alta quanto ao status atual (ABA não é profissão regulamentada;
psicólogo é o responsável técnico hoje). Baixa quanto a quando isso muda —
tramitação legislativa pode avançar a qualquer momento; reconfirmar antes do
piloto.

Fontes: [CFP — Em audiência na Câmara, CFP marca posicionamento contrário à regulamentação da ABA como profissão autônoma](https://site.cfp.org.br/em-audiencia-na-camara-dos-deputados-cfp-marca-posicionamento-contrario-a-regulamentacao-da-aba-como-profissao-autonoma/) · [PL 1.434/2025 — ficha de tramitação, Câmara dos Deputados](https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2494112) · [PL 1.321/2022 — texto integral](https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=2177655)

---

## 2. Prazo de guarda — três normas, três prazos diferentes

O Iris é multidisciplinar (Psicologia/ABA + Fono + TO no mesmo prontuário
unificado), e cada conselho profissional define um prazo mínimo próprio para
os registros de SEU profissional:

| Conselho                      | Norma                                                | Prazo mínimo                                                                                                                               | Fonte                                                                                                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CFP (Psicologia)              | Resolução CFP nº 01/2009 + Manual Orientativo (2025) | 5 anos do último registro; **recomendação do próprio manual: manter até a criança/adolescente completar 18 anos**, por entendimento do ECA | [Manual Orientativo de Registro e Elaboração de Documentos Psicológicos](https://site.cfp.org.br/wp-content/uploads/2025/11/Manual_Orientativo.pdf) · [Transparência CFP — Registro Documental](https://transparencia.cfp.org.br/crp12/pergunta-frequente/registro-documental/) |
| COFFITO (Terapia Ocupacional) | Resolução COFFITO nº 415/2012                        | 5 anos do último registro                                                                                                                  | [Resolução 415/2012 (texto)](https://www.normasbrasil.com.br/norma/?id=240931)                                                                                                                                                                                                  |
| CFFa (Fonoaudiologia)         | Resolução CFFa nº 415/2012                           | **10 anos a partir da alta, suspensão ou abandono do tratamento**                                                                          | [Resolução CFFa nº 415/2012](https://www.fonoaudiologia.org.br/resolucoes/resolucoes_html/CFFa_N_415_12.htm)                                                                                                                                                                    |
| Federal, setor saúde em geral | Lei nº 13.787/2018 (digitalização de prontuários)    | Elimina-se só após 20 anos do último registro                                                                                              | [Lei 13.787/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13787.htm)                                                                                                                                                                                      |

**Não há uma norma única que resolva isso para um prontuário unificado.** A
Lei 13.787/2018 fala de "prontuário de paciente" em sentido amplo (20 anos) mas
não está claro se um serviço de terapia multidisciplinar fora do ambiente
hospitalar/SUS se enquadra como "estabelecimento de saúde" no sentido da lei —
isso é interpretação, não fato verificável em texto de lei.

**Recomendação de produto (não é certeza jurídica) — REVISADA após a seção 6
abaixo:** em vez de embutir UM prazo universal "correto" no produto, a
retenção deve ser **configurável por clínica** (campo em `Clinic` ou por
disciplina em `care_team_membership`), porque quem tem a obrigação legal de
guarda é o profissional/clínica (o controlador dos dados), não o Iris — cada
clínica tem uma composição diferente de disciplinas (só ABA? ABA+Fono+TO?) e
portanto um prazo mínimo diferente. O Iris entra com um **default sugerido
conservador** = `MAX(paciente completa 18 anos, alta + 10 anos)` (cobre CFP

- CFFa + COFFITO simultaneamente, abaixo do teto de 20 anos da Lei
  13.787/2018), mas permite a clínica ajustar via configuração, com o próprio
  termo de responsabilidade da clínica assumindo a adequação ao conselho do seu
  profissional — o Iris não decide isso sozinho pelo cliente. **Isso é uma
  síntese minha para cobrir o pior caso entre as normas encontradas — não é uma
  regra escrita em lugar nenhum. Precisa de confirmação jurídica antes do
  piloto**, especialmente porque não achei nenhuma norma tratando
  explicitamente de prontuário UNIFICADO multidisciplinar (o CFP reconhece a
  categoria "prontuário único" mas não resolve o conflito de prazos entre
  conselhos).

---

## 3. Assinatura no registro — nenhum conselho exige certificação ICP-Brasil

| Conselho     | O que exige                                                                                                                                                                                                                    | Prontuário eletrônico permitido?                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CFP          | Nome, CRP e assinatura da psicóloga; para eletrônico, "assinatura eletrônica ou outros tipos de permissões que validem" o registro. Assinatura ICP-Brasil é citada como válida e suficiente, mas não como a ÚNICA forma aceita | Sim, com controle de acesso, senha e segurança de dados                                                                                                                          |
| COFFITO (TO) | Assinatura + carimbo com nome completo e nº de registro no CREFITO                                                                                                                                                             | Sim, "a critério da instituição"                                                                                                                                                 |
| CFFa (Fono)  | Carimbo/nome legível + nº de registro ao fim de cada atendimento                                                                                                                                                               | Sim, desde que segurança/confidencialidade sejam garantidas; profissional (consultório privado) ou instituição (ambiente institucional) responde pela certificação digital usada |

**Certeza alta:** nenhuma das três normas pesquisadas EXIGE especificamente
certificado ICP-Brasil (MP 2.200-2/2001) para validar o registro eletrônico —
todas aceitam "assinatura eletrônica" com segurança/rastreabilidade adequadas.
A Lei 14.063/2020 (que define os 3 níveis simples/avançada/qualificada) rege
formalmente só interações com **entes públicos** — não se aplica diretamente
ao prontuário privado, embora seja usada como referência doutrinária.

**Recomendação de produto:** login com senha (idealmente MFA) + trilha de
auditoria imutável por ação (já modelada em `AuditLog` e na imutabilidade de
`Evidence`) é um piso juridicamente defensável — o que cada `EvidenceRevision`
e `MilestoneAssessment` já registra (autor, timestamp, ação) cumpre a função
de "identificar quem assinou". Certificado ICP-Brasil fica como _upgrade_ de
robustez jurídica (maior presunção de autenticidade em disputa), não como
bloqueador do MVP.

**Nota de rigor:** o conteúdo desta seção sobre COFFITO e CFFa veio de resumo
de IA sobre o texto das resoluções (WebFetch), não da leitura literal artigo
por artigo por mim — a chance de erro de citação de artigo específico existe.
Confiança alta na CONCLUSÃO (nenhuma exige ICP-Brasil), confiança média na
citação exata de cada artigo.

---

## 4. LGPD — dados de menores e dados sensíveis de saúde

Texto lido diretamente do Planalto (fonte primária, alta confiança):

- **Art. 11** — dado de saúde é sensível; tratamento requer consentimento
  específico e destacado do titular/responsável, OU (sem consentimento) quando
  for "tutela da saúde, exclusivamente, em procedimento realizado por
  profissionais de saúde, serviços de saúde ou autoridade sanitária". É
  **vedado** compartilhar/usar dado sensível de saúde entre controladores
  "com objetivo de obter vantagem econômica" — relevante se o Iris algum dia
  cogitar vender dado agregado/benchmark; não é o caso do MVP, mas fica
  registrado para o modelo de negócio.
- **Art. 14** — dado de criança/adolescente deve ser tratado no MELHOR
  INTERESSE do titular; exige **consentimento específico e em destaque de
  pelo menos um dos pais ou responsável legal**. Isso já é exatamente o que o
  princípio #8 do README e a entidade `Consent` do modelo de dados preveem —
  **confirma a decisão já tomada, não muda nada**.
- **Art. 15/16** — dado deve ser eliminado ao fim do tratamento, EXCETO para
  "cumprimento de obrigação legal ou regulatória pelo controlador" — ou seja,
  os prazos de guarda dos conselhos profissionais (seção 2) são justamente a
  exceção que autoriza reter o dado além do "necessário para a finalidade
  original". A política de retenção do Iris deve citar essa base legal
  explicitamente no termo de consentimento.
- **Art. 33** — transferência internacional de dados é permitida com
  salvaguardas (ver seção 5).

Fontes: [LGPD — texto integral, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) · [ANPD — Enunciado sobre tratamento de dados de crianças e adolescentes](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes)

**Certeza absoluta** de que o texto dos artigos é este (fonte primária lida
diretamente) e de que os princípios #8 e a entidade `Consent` já implementam
o que a lei pede.

---

## 5. Hospedagem — não há exigência de residência de dados no Brasil

**Não existe obrigação legal de hospedar dados de saúde fisicamente no
Brasil.** A LGPD permite transferência internacional de dados (Art. 33) desde
que uma das salvaguardas seja atendida: (a) o país de destino tiver decisão de
adequação da ANPD, (b) o controlador usar as **Cláusulas-Padrão Contratuais**
aprovadas pela **Resolução CD/ANPD nº 19/2024** (já em vigor — o período de
graça para adoção terminou em 2025), ou (c) consentimento específico do
titular para aquela transferência.

**Recomendação de produto (não é exigência legal, é simplicidade/risco):**
hospedar na região Brasil de um provedor cloud grande (AWS `sa-east-1` São
Paulo, GCP `southamerica-east1`, Azure `Brazil South`) elimina a necessidade
de lidar com cláusulas-padrão e transferência internacional inteiramente —
mais simples de defender numa auditoria de convênio ou do próprio CRP/CFFa/
COFFITO do que explicar salvaguardas de transferência internacional. Se o
Prompt 4 (stack) escolher um provedor de IA fora do Brasil para a extração
(ex.: API da Anthropic/OpenAI processando o texto do diário), ESSA chamada
específica também é uma transferência internacional de dado sensível de saúde
de menor — precisa entrar no termo de consentimento e no DPA (Data Processing
Agreement) com o provedor de IA, tema que cai no Prompt 4, não neste.

Fontes: [ANPD — Resolução normatiza transferência internacional de dados](https://www.gov.br/anpd/pt-br/assuntos/noticias/resolucao-normatiza-transferencia-internacional-de-dados) · [Mayer Brown — Fim do período de graça da Resolução CD/ANPD nº 19/2024](https://www.mayerbrown.com/pt/insights/publications/2025/08/end-of-grace-period-implementation-of-brazils-standard-contractual-clauses-in-international-transfers-of-personal-data) · [LGPD Art. 33, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

**Certeza alta** de que a transferência internacional é permitida com
salvaguardas e de que a Resolução 19/2024 está em vigor. Certeza baixa sobre
detalhes de implementação do DPA com o provedor de IA — isso é uma tarefa do
Prompt 4, não resolvida aqui.

---

## 6. Classificação do Iris: produto de tecnologia, não estabelecimento de saúde

Pergunta levantada pelo Rômulo em 09/07/2026: o Iris deveria ser enquadrado
como "estabelecimento de saúde" ou como "produto de tecnologia que serve à
saúde"? A segunda opção está correta e isso **resolve, não so mitiga**, boa
parte da ambiguidade da seção 2.

**Iris (a empresa/SaaS) não é estabelecimento de saúde e não precisa de CNES
nem de alvará de vigilância sanitária.** O CNES (Cadastro Nacional de
Estabelecimentos de Saúde, Portaria GM/MS nº 1.646/2015) exige, entre outros
critérios, "ações e serviços de saúde humana" prestados num espaço físico
delimitado com funcionamento efetivo — a documentação oficial exclui
explicitamente arranjos focados "exclusivamente na compra e contratação de
serviços de saúde". O Iris vende software para a clínica (que É o
estabelecimento de saúde, se for o caso dela); o Iris mesmo é prestador de
serviço de tecnologia, não presta atendimento a paciente. **Consequência
direta na dúvida da seção 2:** a Lei 13.787/2018 (prazo de 20 anos, regras de
digitalização) e as normas dirigidas a "estabelecimentos de saúde" vinculam a
CLÍNICA (se ela própria se enquadrar como estabelecimento de saúde — o que
depende do registro DELA, não do Iris), nunca o Iris diretamente. Isso é o
argumento mais forte para tornar a retenção CONFIGURÁVEL por clínica (seção 2,
recomendação revisada) em vez de embutir uma resposta única.

**Sobre a IA de extração especificamente: provavelmente não se enquadra como
"Software como Dispositivo Médico" (SaMD) sob a RDC ANVISA nº 657/2022.** O
documento oficial de Perguntas & Respostas da ANVISA sobre a RDC 657/2022
exclui do enquadramento como SaMD softwares que (a) não finalizam decisão
clínica automaticamente, (b) exigem validação humana antes de qualquer
resultado oficial, e (c) funcionam como apoio informativo/organizacional, não
diagnóstico. O desenho do agente (R3 — "evidência, nunca pontuação"; toda
extração é `sugerida` e precisa de aprovação humana antes de virar `Evidence`)
foi feito por razão clínica (governança), mas por coincidência feliz também é
exatamente o padrão que tende a manter o produto FORA da regulação de
dispositivo médico — decisão de design e estratégia regulatória convergem
aqui. **Sem certeza absoluta**: isso não é uma determinação oficial da ANVISA,
é minha leitura do P&R aplicada ao caso do Iris. Recomendo, antes do lançamento
comercial (não bloqueia o piloto), uma consulta formal à ANVISA ou parecer de
advogado especializado em regulação de dispositivos médicos/SaMD para
confirmar — principalmente se o produto evoluir para sugerir "candidato a
avaliação" de forma mais proeminente (ficar de olho em não deslizar a
comunicação de marketing para linguagem de "diagnóstico" ou "avaliação
automatizada").

Fontes: [Wiki CNES — Cadastro Nacional de Estabelecimentos de Saúde](<https://wiki.saude.gov.br/cnes/index.php/Cadastro_Nacional_de_Estabelecimentos_de_Sa%C3%BAde_(CNES)>) · [Portaria GM/MS nº 1.646/2015](https://bvsms.saude.gov.br/bvs/saudelegis/gm/2015/prt1646_02_10_2015.html) · [ANVISA — Perguntas & Respostas RDC nº 657/2022 (Software como Dispositivo Médico)](https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2022/software-como-dispositivo-medico-perguntas-e-respostas/perguntas-respostas-rdc-657-de-2022-v1-01-09-2022.pdf)

---

## 7. O que fica de fora desta pesquisa

- **CFM (Conselho Federal de Medicina):** só se aplica se um médico
  (psiquiatra, neuropediatra) entrar na equipe de cuidado como usuário do
  sistema — não modelado no MVP atual. Não pesquisado a fundo; se um médico
  vier a assinar avaliação dentro do Iris, revisitar Resolução CFM 2.299/2021
  antes.
- **Regulamentação estadual/municipal de estabelecimento de saúde DA CLÍNICA**
  (vigilância sanitária, alvará) — é responsabilidade da clínica-cliente, não
  do Iris (seção 6); não pesquisado a fundo por não ser obrigação do Iris.

---

## 8. Resumo — o que marco com certeza absoluta no BACKLOG

✅ **Pode marcar como pesquisado/documentado com certeza:**

- LGPD Art. 11/14/15/16/33 lidos na fonte primária — o modelo de `Consent` já
  atende ao Art. 14.
- ABA não é profissão regulamentada hoje; psicólogo é o responsável técnico —
  gap real identificado no modelo de dados (seção 5 abaixo).
- Nenhum conselho pesquisado exige ICP-Brasil — login+senha+auditoria é piso
  juridicamente razoável.
- Hospedagem fora do Brasil é permitida com salvaguardas; não há exigência de
  residência de dados.
- **Iris não é estabelecimento de saúde (não precisa de CNES/alvará); a Lei
  13.787/2018 e normas de "estabelecimento de saúde" vinculam a clínica-cliente,
  não o Iris** — isso resolve a principal incerteza da seção 2, e por isso a
  retenção vira configuração por clínica, não uma regra hardcoded.

🔶 **Fica pendente de parecer jurídico especializado antes do piloto com dados
reais** (não é possível ter certeza absoluta só com pesquisa documental):

- Prazo de guarda DEFAULT sugerido pelo produto (MAX(18 anos, alta+10 anos) é
  síntese de risco minha, não regra escrita) — mas agora é config, não
  bloqueador, então o risco de errar caiu bastante.
- Confirmação formal de que a IA de extração não é SaMD sob RDC 657/2022
  (leitura própria do P&R da ANVISA, não determinação oficial) — fazer antes
  do lançamento comercial, não bloqueia o piloto.
- Desenho exato da responsabilidade técnica do psicólogo supervisor sobre
  registros de AT/técnico ABA sem CRP — decisão de produto E jurídica.
