# Termo de Consentimento para Tratamento de Dados — Titular Adulto — Iris

**Status: RATIFICADO em 29/07/2026 — apto a ser colhido.** Redigido em
28/07/2026 para fechar a issue #129, revisado no mesmo dia contra parecer
adversarial interno (achados aplicados: base legal por finalidade,
dispositivo da tutela da saúde, notificações compulsórias do regime adulto)
e submetido em 29/07/2026 à revisão jurídica em leitura ao vivo.

> **Como esta ratificação se deu, registrado de propósito:** o texto foi
> lido pelo advogado durante a sessão e **não recebeu apontamentos**. Pelo
> protocolo acordado com o responsável pelo produto, texto sem comentários
> até o fim da sessão é dado por alinhado. A validade deste termo se apoia
> nesse protocolo — **não** em parecer escrito autônomo, que não foi
> emitido. Se apontamentos vierem depois, o texto passa a `adulto-v2` e
> exige nova coleta de assinatura (seção 3).

Preenche um buraco real: todo o texto legal existente do
projeto pressupõe responsável legal assinando por paciente menor de idade
(LGPD Art. 14, §1º), e não existia termo para o titular adulto capaz.
Complementa `politica-privacidade.md`, `politica-retencao-dados.md` e
`termos-de-uso.md` — os quatro documentos devem ser lidos e revisados
juntos. Base técnica em `.specs/features/consentimento-titular-adulto/spec.md`
(issue #100) e demanda de produto em #98 (Terapia Convencional) e #99 (TCC).

> **Escopo:** este documento tem duas partes. As seções 1 a 4 são
> **instruções para a clínica e para o produto** — não vão para o papel que
> o paciente assina. A partir da seção 5 está a **minuta do termo em si**,
> escrita em primeira pessoa, para ser impressa/exibida e assinada pelo
> titular.

---

## 1. A quem este termo se aplica

Aplica-se ao **titular maior de 18 anos, civilmente capaz**, que consente
por si próprio o tratamento dos seus dados pessoais e dados sensíveis de
saúde na clínica.

No sistema, corresponde ao registro `Consent` com
`tipo = 'autoconsentimento_titular_adulto'` e `responsavel_signatario`
nulo — o par mutuamente exclusivo do `tipo = 'tratamento_dados_menor'`, que
continua sendo o caminho de paciente menor com responsável legal.

> ✅ **Isso já existe no banco.** O valor de enum
> `autoconsentimento_titular_adulto` e a nulidade de
> `consent.responsavel_signatario` foram entregues pela **issue #100**
> (migrações `0050` e `0051`, aplicadas). O CHECK
> `consent_responsavel_por_tipo` garante o par mutuamente exclusivo: menor
> exige responsável não vazio, titular adulto exige responsável nulo
> (`src/db/schema.ts`). Há onde gravar o consentimento que este termo
> documenta.

## 2. A quem este termo NÃO se aplica

Três casos ficam **explicitamente fora** deste termo. Nenhum deles deve ser
cadastrado usando esta minuta:

1. **Paciente menor de 18 anos.** Continua sob o regime do Art. 14, §1º, da
   LGPD — consentimento específico e destacado de pelo menos um dos pais ou
   responsável legal. Ver `politica-privacidade.md`, seção 2.
2. **Adulto sob curatela ou com capacidade civil reduzida.** Precisa de
   representação/assistência do curador. Idade maior que 18 **não** é prova
   de capacidade civil. Curatela tem **termo próprio** — ver seção 4,
   resposta (c). ✅ **Atualizado pela emenda de 29/07/2026 (seção 16):** o
   termo existe e o caminho está implementado —
   `termo-consentimento-curatela.md` (`curatela-v1`).
3. **Adolescente emancipado** (Art. 5º, parágrafo único, do Código Civil).
   Juridicamente é capaz, e a emancipação precisa ser comprovada
   documentalmente pela clínica. ✅ **Atualizado pela emenda de 29/07/2026
   (seção 16):** existe campo para registrar a comprovação e termo próprio
   — `termo-consentimento-titular-emancipado.md` (`emancipado-v1`).

> **Por isso o tipo de consentimento é escolha explícita do operador, nunca
> derivada da data de nascimento.** Derivar por idade erraria nos dois
> sentidos: classificaria o adulto sob curatela como capaz e o adolescente
> emancipado como incapaz. Além disso `patient.nascimento` é campo opcional
> no cadastro — ausência de data não significa "adulto". Decisão D1 da
> issue #100.

## 3. Identificação de versão

Este termo é a versão **`adulto-v1`**. O identificador é gravado em
`Consent.versao_termo` no ato da assinatura e **nunca é sobrescrito**: a
tabela `consent` é append-only por privilégio de banco
(`REVOKE UPDATE, DELETE ON consent FROM app_role`,
`db/migrations/0001_rls.sql`). Qualquer alteração de mérito neste texto
exige um identificador novo (`adulto-v2`, …) e uma nova coleta de
assinatura — nunca a edição silenciosa do termo já assinado.

O termo de paciente menor permanece na versão `v1`, inalterado.

## 4. Transição menor → maioridade

Paciente que entra na clínica menor de idade e completa 18 anos durante o
acompanhamento **passa a ser titular capaz dos próprios dados**. O
consentimento anteriormente dado pelo responsável legal permanece válido e
registrado quanto ao tratamento já realizado no período em que o paciente
era menor — não é apagado, não é invalidado retroativamente, e continua na
trilha. Para o tratamento a partir da maioridade, a orientação de produto é
**colher um consentimento novo, assinado pelo próprio titular**, gravado
como uma linha nova de `Consent` (renovação nunca é edição — decisões D2 e
D3 da issue #100).

> **Respostas ratificadas em 29/07/2026** (pelo protocolo descrito no topo
> deste documento):
>
> **(a) Não há janela de descoberto.** O consentimento dado pelo
> responsável legal continua sustentando o tratamento dos dados entre a
> data em que o paciente completa 18 anos e a data da nova assinatura. O
> aniversário não interrompe o tratamento nem exige suspensão do
> atendimento: a renovação **regulariza para a frente** quem é o titular
> que consente, e não sana nulidade nenhuma no período anterior. O
> sustentáculo do registro clínico em si continua sendo a tutela da saúde
> (Art. 11, II, "f"), que independe de consentimento — ver seção 7.
>
> **(b) O prazo é a primeira sessão após a maioridade e, no limite, 90
> dias corridos contados do aniversário de 18 anos.** Passado esse prazo
> sem renovação, o caso é **pendência administrativa da clínica** — não é
> impedimento de atendimento, e não autoriza apagar nada.
>
> **(c) Curatela terá termo próprio**, não adaptação do termo de menor.
> Registrar um adulto sob curatela como "menor" numa trilha append-only
> afirmaria um fato falso sobre a pessoa, num registro que existe
> justamente para ser preciso. ✅ **Atualizado pela emenda de 29/07/2026
> (seção 16): implementado.** O termo próprio é
> `termo-consentimento-curatela.md` (`curatela-v1`) e o valor de enum é
> `representacao_curador`. Deixou de ser "fora do MVP".
>
> **Consequência de implementação, atualizada pela emenda de 29/07/2026
> (seção 16):** o sistema **não** bloqueia nem altera comportamento nenhum
> em função da maioridade; passou a existir apenas um **indicador passivo**
> para a clínica. Com (a) respondido, não há descoberto jurídico, e a
> responsabilidade de colher a renovação continua sendo da clínica.

---

## 5. Minuta do termo — identificação

**TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS E DADOS
SENSÍVEIS DE SAÚDE**

Versão `adulto-v1`.

- **Controladora dos dados:** [Razão social da clínica, CNPJ, endereço — a
  clínica-contratante é a controladora.]
- **Operador:** Iris — **R Sutil Correa Ltda**, inscrita no CNPJ sob o
  nº **29.811.201/0001-50**, plataforma de prontuário e gestão clínica, que
  trata os dados por conta e ordem da clínica, exclusivamente para prestar o
  serviço contratado.
- **Titular:** [Nome completo], [CPF], [data de nascimento].
- **Provedor de inteligência artificial contratado:** [Nome do provedor e
  país onde o processamento ocorre — a preencher. Ver seções 8 e 9: sem
  esse dado, o consentimento da seção 9 não é específico.]
- **Canal para exercício de direitos:** [Confirmar
  `privacidade@irisclinica.ia.br`, já indicado em
  `politica-retencao-dados.md`, ou substituir pelo canal próprio da
  clínica.]
- **Encarregado (DPO):** [Pendente — LGPD Art. 41; ver
  `politica-privacidade.md` seção 10.]

## 6. Que dados serão tratados

Declaro estar ciente de que serão tratados os seguintes dados a meu
respeito:

- **Dados de identificação e contato:** nome, data de nascimento, contato,
  convênio, quando aplicável.
- **Dados sensíveis de saúde** (LGPD Art. 5º, II): hipótese diagnóstica e
  informações clínicas, registros das sessões em texto, evidências clínicas
  estruturadas a partir do relato do profissional, avaliações formais e
  relatórios gerados.
- **Registros de uso do sistema:** trilha de auditoria de quem acessou,
  alterou ou exportou informações do meu prontuário.

## 7. Para que os dados serão tratados, e com que base legal

Cada finalidade abaixo tem **uma** base legal própria. Isso importa para
mim: só as finalidades das seções 8, 9 e 10 dependem do meu consentimento,
e só elas podem ser revogadas por mim.

| Finalidade                                                                                                     | Base legal                                                                                                         | Depende do meu consentimento?                                                                                                     |
| :------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| Registro e condução do meu acompanhamento terapêutico — prontuário, evolução das sessões, planejamento clínico | **Tutela da saúde**, em procedimento realizado por profissionais e serviços de saúde (LGPD Art. 11, II, "f")       | **Não.** É o tratamento que permite que eu seja atendido, e o registro em prontuário é exigido do profissional pelo seu conselho. |
| Organização do atendimento — agenda, frequência, comunicação com a clínica                                     | Execução de contrato do qual sou parte (LGPD Art. 7º, V) e tutela da saúde (Art. 11, II, "f")                      | Não.                                                                                                                              |
| Guarda do prontuário depois do fim do acompanhamento                                                           | Cumprimento de obrigação legal e regulatória (LGPD Art. 16, I, e normas do conselho profissional)                  | Não.                                                                                                                              |
| Estruturação assistida por inteligência artificial (seção 8)                                                   | **Consentimento** (LGPD Art. 7º, I, e Art. 11, I)                                                                  | **Sim.**                                                                                                                          |
| Transferência internacional para o provedor de IA (seção 9)                                                    | **Consentimento específico e destacado** (LGPD Art. 33, VIII), somado às garantias contratuais do Art. 33, II, "b" | **Sim.**                                                                                                                          |
| Exportação de relatórios para convênio ou terceiro por mim indicado (seção 10)                                 | **Consentimento** (LGPD Art. 7º, I, e Art. 11, I)                                                                  | **Sim.**                                                                                                                          |

> **Nota de produto (não vai para o papel assinado):** a separação acima é
> o ponto mais importante deste termo. Empilhar bases legais — dizer que o
> mesmo tratamento se apoia em consentimento **e** em tutela da saúde **e**
> em obrigação legal — tornaria o consentimento não-livre e a revogação
> ilusória: o titular revogaria e nada aconteceria, porque a clínica
> declararia já se apoiar em outra hipótese. No sistema, cada finalidade
> consentida corresponde a um registro próprio de `Consent`
> (`uso_ia_processamento`, `exportacao_relatorios`), nunca a um bloco único
> de "aceito tudo".

## 8. Uso de inteligência artificial no processamento

Estou ciente de que a clínica utiliza, dentro do Iris, um modelo de
linguagem de terceiro para **sugerir** a estruturação das informações
registradas pelo profissional a partir do texto das sessões.

Declaro estar informado de que:

- A inteligência artificial **não diagnostica, não pontua e não decide
  nada** a meu respeito. Toda sugestão precisa ser revisada e aprovada por
  um profissional humano antes de virar registro permanente.
- O conteúdo do registro da sessão é enviado ao provedor de IA identificado
  na seção 5 para esse processamento.
- Nenhuma decisão sobre o meu tratamento é tomada **unicamente** com base
  em tratamento automatizado. Caso, no futuro, alguma decisão que afete
  meus interesses passe a ser tomada dessa forma, tenho direito a solicitar
  sua revisão (LGPD Art. 20).

☐ **Consinto** com o uso de inteligência artificial no processamento dos
meus registros, nos termos acima.
☐ **Não consinto.** (Estou ciente de que o acompanhamento continua
normalmente; apenas a estruturação assistida por IA não será usada nos meus
registros.)

## 9. Transferência internacional de dados

Estou ciente de que, quando o provedor de inteligência artificial
identificado na seção 5 não mantém infraestrutura no Brasil, o envio do
conteúdo dos meus registros a esse provedor configura **transferência
internacional de dado sensível de saúde**, com destino ao país ali
indicado. A operação se apoia nas garantias contratuais do **LGPD Art. 33,
II, "b"** (cláusulas-padrão contratuais) e, quanto a mim, no meu
**consentimento específico e destacado** (LGPD Art. 33, VIII) — que é dado
aqui, de forma distinta das demais finalidades deste termo. O provedor não
retém o conteúdo além do necessário para gerar a resposta.

☐ **Consinto** com a transferência internacional descrita acima.
☐ **Não consinto.** (Estou ciente de que, se o provedor de IA contratado
pela clínica não mantiver infraestrutura no Brasil, esta recusa tem o mesmo
efeito prático da recusa da seção 8: a estruturação assistida por IA não
será usada nos meus registros. O acompanhamento continua normalmente.)

> **Pendências reais:** (a) confirmar os termos exatos do acordo de
> processamento de dados com o provedor de IA efetivamente escolhido antes
> do piloto; (b) confirmar, em fonte primária (DOU / site da ANPD), a
> numeração e a vigência da resolução da ANPD que aprova o modelo de
> cláusulas-padrão contratuais — `politica-privacidade.md` seção 4 cita
> "Resolução CD/ANPD nº 19/2024", e esse número não pode ir para um
> documento assinado por titular sem conferência; (c) esclarecer **quem
> figura como parte** nas cláusulas-padrão — a clínica, que é a
> controladora, ou o Iris, que é operador.

## 10. Exportação e compartilhamento de relatórios

Estou ciente de que a clínica pode gerar e **exportar** relatórios sobre o
meu acompanhamento, e de que:

- Toda exportação é registrada na trilha de auditoria antes de ser
  liberada.
- O Iris fornece a ferramenta de exportação; não envia dado diretamente a
  convênio ou a qualquer terceiro por conta própria.
- Fora das hipóteses previstas em lei, nenhum dado meu é compartilhado com
  terceiros, e **nunca** para publicidade ou venda.

Autorizo, separadamente:

☐ **Exportação de relatório para a minha operadora de plano de saúde**, no
contexto do meu atendimento.
☐ **Não autorizo.** (Estou ciente de que, sem esta autorização, a clínica
não poderá encaminhar relatórios ao meu convênio, o que pode inviabilizar
reembolso ou autorização de sessões.)

☐ **Exportação para terceiro por mim indicado**, por escrito e caso a caso.
☐ **Não autorizo.**

## 11. Por quanto tempo os dados serão mantidos

Meus dados serão mantidos pelo prazo de **10 (dez) anos contados do meu
último atendimento**, observados os prazos mínimos de guarda de prontuário
exigidos pelo conselho profissional. Estou ciente de que **a revogação dos
consentimentos das seções 8, 9 e 10 não apaga o prontuário** enquanto durar
esse prazo legal de guarda — ver seção 13.

> **Nota de produto (não vai para o papel assinado):**
> `politica-retencao-dados.md` expressa o prazo default como
> `MAX(paciente completa 18 anos, alta + 10 anos)`, fórmula desenhada para
> paciente menor. Para titular que já é adulto na admissão o primeiro termo
> da fórmula é inócuo, e o prazo efetivo é `alta + 10 anos` — que é o que
> está escrito por extenso acima, como exige o dever de informar o prazo ao
> titular (LGPD Art. 9º, II). Remissão a uma política que o titular não
> recebe não satisfaria esse dever. O número foi ratificado em 29/07/2026
> junto com o restante deste documento.

## 12. Segurança

Estou ciente de que o acesso aos meus dados é controlado por papel
profissional, com isolamento entre clínicas no banco de dados, autenticação
com segundo fator e trilha de auditoria imutável de acessos, alterações e
exportações.

## 13. Meus direitos, e como revogar os consentimentos deste termo

Posso, a qualquer momento, **por procedimento gratuito e facilitado**,
através do canal indicado na seção 5: confirmar a existência de tratamento,
acessar meus dados, corrigi-los, solicitar anonimização ou eliminação,
solicitar portabilidade, obter informação sobre compartilhamentos, e
**revogar os consentimentos das seções 8, 9 e 10**. Posso também peticionar
à Autoridade Nacional de Proteção de Dados (ANPD) em relação aos meus dados
(LGPD Art. 18, § 1º).

A revogação vale **para o futuro**: ficam ratificados os tratamentos já
realizados enquanto o consentimento vigorava, ressalvado o meu direito de
requerer a eliminação nos termos do Art. 18, VI, respeitado o prazo legal
de guarda da seção 11 (LGPD Art. 8º, § 5º).

Revogado o consentimento, **cessam as finalidades das seções 8, 9 e 10** —
estruturação assistida por IA, transferência internacional e exportação de
relatórios. O **registro clínico do meu atendimento em curso continua**,
porque não depende do meu consentimento e é exigido do profissional pelo
seu conselho (seção 7); encerrado o acompanhamento, o prontuário passa a
ser mantido apenas para cumprimento do prazo legal de guarda.

> **Pendências reais de implementação, todas anteriores à primeira coleta
> com titular real:**
> (a) ✅ **RESOLVIDO pela emenda de 29/07/2026 (seção 16). A revogação é
> registrável.** Existe o valor de enum `revogacao_consentimento` e a coluna
> `consent_revogado_id`: a revogação é uma **linha nova** apontando o
> consentimento revogado, e o original nunca é editado nem apagado. O escopo
> da revogação é o consentimento apontado. Procedimento completo em
> `procedimento-revogacao-consentimento.md` (`revogacao-v1`).
> (b) ✅ **RESOLVIDO pela emenda de 29/07/2026 (seção 16), com a distinção
> que esta pendência pedia.** O estado de somente-leitura foi implementado
> **apenas para os regimes de representação** (menor e curatela), em que o
> consentimento é a base do tratamento. **Para o titular adulto ele não se
> aplica:** revogado o autoconsentimento, cessam as finalidades das seções
> 8, 9 e 10, e o registro clínico do atendimento **continua**, apoiado na
> tutela da saúde (Art. 11, II, "f"). Em nenhum dos regimes a **leitura** é
> bloqueada. Ver `docs/arquitetura/ciclo-de-vida-do-prontuario.md`.
> (c) **Portabilidade** (Art. 18, V): o aditivo especifica exportação
> integral do prontuário em PDF/A, e não foi localizado módulo
> correspondente no código — existe exportação de relatório, não do
> prontuário completo. Confirmar antes de prometer no termo.

## 14. Limites do sigilo

Estou ciente de que o sigilo profissional é a regra, e de que ele comporta
duas ordens distintas de exceção:

1. **Hipóteses de quebra por ponderação do profissional**, previstas na
   legislação e nos códigos de ética profissionais, restritas ao mínimo
   necessário e ao menor prejuízo — por exemplo, risco iminente à vida.
2. **Hipóteses de comunicação obrigatória do serviço de saúde a autoridade
   pública**, que independem da minha concordância e não comportam
   ponderação — notadamente o registro de tentativa de suicídio ou de
   autolesão, de notificação compulsória à vigilância epidemiológica
   (Lei 13.819/2019), e o registro de violência contra a mulher, de
   comunicação compulsória à autoridade competente (Lei 10.778/2003 e
   Lei 13.931/2019). Nessas hipóteses comunica-se o **fato** à autoridade
   competente, preservando-se o conteúdo do prontuário que não seja
   estritamente necessário.

> **Nota de produto (não vai para o papel assinado):** o Iris **nunca**
> notifica família, SAMU, Conselho Tutelar ou qualquer terceiro externo por
> conta própria — o alerta de risco é interno à equipe clínica, e as
> notificações compulsórias do item 2 são dever do profissional e do
> estabelecimento, executadas fora do sistema. Este termo não pode conter
> nenhuma frase que sugira notificação automática pelo software. Base:
> `parecer-juridico-duty-to-warn.md` e a cláusula 10 de `termos-de-uso.md`
> — que é contrato B2B entre Iris e clínica e **não** pode ser citada como
> remissão no texto assinado pelo titular, que não é parte dele e não tem
> acesso a ele.

## 15. Declaração e assinatura

Declaro que li e compreendi este termo, que tive oportunidade de esclarecer
dúvidas, que recebi uma via, e que meu consentimento é dado de forma livre
e informada.

Declaro estar ciente de que **as autorizações das seções 8, 9 e 10 são
facultativas**, podem ser dadas ou recusadas separadamente, podem ser
revogadas a qualquer tempo, e que **a recusa de qualquer delas não afeta
meu acesso ao atendimento nem a qualidade do cuidado prestado** — ressalvado
o efeito prático informado em cada seção.

- **Nome do titular:** ______________________________________________
- **CPF:** ____________________
- **Data:** ____ / ____ / ________
- **Assinatura:** ___________________________________________________

- **Profissional/recepção que colheu o consentimento:** _______________
- **Versão do termo:** `adulto-v1`

---

## 16. Emenda de 29/07/2026 — revogação, curatela, emancipação e indicador de maioridade

> **Natureza desta emenda:** é **aditiva e datada**. Não altera a minuta
> assinada (seções 5 a 15), não altera nenhuma cláusula de mérito e **não é
> parte do papel que o titular assina**. A versão do termo permanece
> **`adulto-v1`** e a ratificação de 29/07/2026 registrada no topo deste
> documento permanece válida — nada aqui exige nova coleta de assinatura.
> A emenda existe porque partes das seções 2, 4 e 13 descreviam o sistema
> como ele era antes das migrações `0052`/`0053`, e passaram a ser
> **factualmente falsas**. Documento legal que descreve errado o sistema é
> pior que documento omisso. Os trechos afetados foram marcados no corpo
> acima com remissão a esta seção; nenhum texto histórico foi apagado.

### 16.1 A revogação passou a ser registrável (corrige §13, pendência (a))

A revogação é gravada como **linha nova** em `consent`, com
`tipo = 'revogacao_consentimento'` e um ponteiro
(`consent_revogado_id`) para **o consentimento revogado**. O consentimento
original **nunca é editado nem apagado** — a tabela continua append-only
por privilégio de banco. O **escopo da revogação é o consentimento
apontado**: por isso revogar a finalidade de IA (§8) não derruba o
prontuário, e revogar a exportação (§10) não afeta a IA.

Garantias de banco para que o registro não afirme fato falso: a revogação
tem que apontar alguma coisa; a concessão não pode apontar nada; o alvo tem
que ser do **mesmo paciente**; não se revoga uma revogação; nenhuma linha
aponta para si mesma.

Procedimento completo, incluindo quem pode pedir, gratuidade (Art. 8º,
§ 5º) e a distinção entre revogar e eliminar (Art. 18, VI × Art. 16, I):
`procedimento-revogacao-consentimento.md`, versão **`revogacao-v1`** — este
identificador é o que fica gravado em `versao_termo` nas linhas de
revogação.

### 16.2 Somente-leitura: implementado, e **diferente** para menor e para adulto (corrige §13, pendência (b))

A pendência (b) pedia que se confirmasse antes de aplicar o mesmo
comportamento aos dois regimes. **Resposta proposta, e é o que está
implementado: os dois comportamentos são distintos, e a distinção é a base
legal.**

- **Menor e curatelado.** Revogado o consentimento de regime e não havendo
  outro consentimento de regime vigente, o prontuário vai a
  **somente-leitura**: sem novas sessões, diário, extração por IA ou
  exportação. Fundamento: aqui o consentimento do representante **é** a
  base do tratamento; cessando ele, cessa a autorização para novo
  processamento (`aditivo-especificacoes-legais.md` §1.2; LGPD Arts. 15 e
  16, I).
- **Adulto capaz e emancipado.** Revogado o autoconsentimento, **cessam**
  as finalidades das seções 8, 9 e 10 — IA, transferência internacional e
  exportação. O **registro clínico do atendimento continua**, porque se
  apoia na **tutela da saúde (Art. 11, II, "f")**, hipótese que independe
  de consentimento e que o titular não revoga (§7). Bloquear o registro
  clínico do adulto seria negar-lhe atendimento com base numa hipótese
  legal que nunca foi a dele.
- **Nos quatro regimes, a leitura permanece.** É requisito jurídico, não
  escolha técnica: fiscalização dos conselhos de classe e transferência de
  prontuário. `SELECT` não é bloqueado em nenhuma tabela.
- **O estado é reversível.** Novo consentimento de regime destrava o
  prontuário — família que reassina, curatela reconstituída, ou o paciente
  que completou 18 anos e passa a autoconsentir por si (§4).

Detalhe de arquitetura, incluindo a matriz completa e por que o estado é
derivado dos eventos e nunca armazenado em coluna:
`docs/arquitetura/ciclo-de-vida-do-prontuario.md`.

### 16.3 Curatela e emancipação passaram a ter caminho próprio (corrige §2, itens 2 e 3, e §4(c))

A resposta (c), ratificada em 29/07/2026, dizia que curatela teria termo
próprio, fora do MVP. **A decisão de mérito não mudou; só deixou de estar
fora do MVP.** Está implementada:

- **Curatela** — `termo-consentimento-curatela.md`, versão `curatela-v1`,
  tipo `representacao_curador`. Assina o curador; é obrigatório registrar o
  **instrumento de curatela**; o termo declara que o titular participa da
  decisão na medida do seu discernimento (Lei 13.146/2015, Art. 85; Código
  Civil, Arts. 1.767 e seguintes).
- **Emancipado** — `termo-consentimento-titular-emancipado.md`, versão
  `emancipado-v1`, tipo `autoconsentimento_titular_emancipado`. O conteúdo
  material é o desta minuta; o que muda é o registro da **comprovação da
  emancipação** (Código Civil, Art. 5º, parágrafo único). **Arquivo próprio
  e não um parágrafo aqui**, porque `versao_termo` é gravado no banco e
  nunca sobrescrito: se o emancipado assinasse `adulto-v1`, a trilha não
  registraria que houve comprovação, e não haveria como auditá-la depois.

O princípio de §2 continua intacto: **o tipo de consentimento é escolha
explícita do operador, nunca derivada da data de nascimento.**

### 16.4 Indicador de maioridade — e por que não conflita com a resposta (a) (corrige a "consequência de implementação" de §4)

Passou a existir um **indicador passivo** para a clínica: a lista de
pacientes com consentimento de regime de menor ainda vigente que já
completaram 18 anos, classificados dentro ou fora dos 90 dias corridos de
§4(b). Data de nascimento ausente é terceiro estado, "desconhecido" —
nunca "ainda é menor".

**Resposta proposta — por que isso não conflita com a resposta (a)
ratificada:** a resposta (a) afirma que **não há janela de descoberto** —
o consentimento do responsável continua sustentando o tratamento entre o
aniversário de 18 anos e a nova assinatura, e a renovação regulariza para a
frente sem sanar nulidade nenhuma. Um indicador que **bloqueasse** o
atendimento no aniversário contradiria isso frontalmente: afirmaria, pela
conduta do sistema, que existe descoberto. Por isso o indicador **não
bloqueia atendimento, não trava escrita, não muda base legal e não altera
comportamento nenhum** — ele apenas torna visível a pendência
administrativa que a própria resposta (b) já atribuía à clínica. É
ferramenta para cumprir (b), não exceção a (a).

### 16.5 O que esta emenda **não** resolveu

- **Portabilidade** (§13, pendência (c)) — exportação integral do
  prontuário em PDF/A continua não implementada.
- **Gates de impressão** — todos permanecem: dados da clínica-controladora,
  canal de direitos, DPO, provedor de IA e país, DPA assinado, e a
  conferência da resolução da ANPD sobre cláusulas-padrão em fonte
  primária. Nenhum deles foi tocado aqui.

---

## Estado das pendências

> Atualizado pela emenda de 29/07/2026 (seção 16).

### ✅ Fechadas em 29/07/2026

- **Revisão jurídica do texto** (seções 7, 13 e 14) — lida ao vivo, sem
  apontamentos. Protocolo de ratificação descrito no topo do documento.
- **Seção 4, (a) e (b)** — transição menor→maioridade respondida: não há
  janela de descoberto, e a renovação é colhida na primeira sessão após a
  maioridade, no limite 90 dias corridos.
- **Seção 4, (c) / seção 2, item 2 (curatela)** — decidido: **termo
  próprio**, fora do MVP, rastreado na issue #134.
- **Seção 5, operador** — R Sutil Correa Ltda, CNPJ 29.811.201/0001-50.
- **Seção 11** — prazo escrito por extenso: 10 (dez) anos contados do
  último atendimento.
- **Correções nos documentos vizinhos** — `politica-privacidade.md`
  (seções 1, 2 e 4) e `politica-retencao-dados.md` (seções 3, 4 e 9) já
  descrevem os dois regimes de consentimento. Aplicadas nesta mesma
  entrega.

### ⛔ Gates de impressão — por clínica, antes de colher a primeira assinatura

Estes **não** bloqueiam o código nem o lançamento dos nichos #98/#99, mas
bloqueiam a **coleta** do termo em papel:

- **Seção 5** — razão social, CNPJ e endereço da clínica-contratante
  (controladora); canal para exercício de direitos; encarregado (DPO).
- **Seção 5 + seção 9** — nome do provedor de IA efetivamente contratado e
  país onde o processamento ocorre. Sem esse dado o consentimento da
  seção 9 **não é específico** e portanto não é válido: não colher a
  seção 9 em branco. Hoje o ambiente admite dois provedores
  (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) — a escolha precisa estar feita
  e escrita.
- **Seção 9** — DPA com esse provedor assinado; numeração e vigência da
  resolução da ANPD sobre cláusulas-padrão conferidas em fonte primária
  (DOU / site da ANPD); definição de quem figura como parte nas
  cláusulas — a clínica (controladora) ou o Iris (operador).

### 🔜 De implementação, pós-MVP

- **Portabilidade** — exportação integral do prontuário em PDF/A
  (seção 13, pendência (c)). **Única pendência de implementação restante
  deste documento.**

### Entregue

- **Issue #100** — migrações `0050`/`0051` aplicadas. O tipo de
  consentimento deste termo já pode ser gravado (seção 1).
- **Issue #133 — evento de revogação** — registrável, com escopo dado pelo
  ponteiro ao consentimento revogado. Migrações `0052`/`0053`.
  Procedimento: `procedimento-revogacao-consentimento.md` (`revogacao-v1`).
  Fecha a pendência (a) da seção 13. Ver emenda §16.1.
- **Issue #117 — somente-leitura por revogação** — implementado **apenas**
  para os regimes de representação (menor e curatela); para o adulto e o
  emancipado, o registro clínico continua. Leitura nunca é bloqueada.
  Estado reversível por novo consentimento de regime. Fecha a pendência (b)
  da seção 13, com a distinção que ela pedia. Ver emenda §16.2 e
  `docs/arquitetura/ciclo-de-vida-do-prontuario.md`.
- **Issue #134 — curatela e emancipação** — termos próprios
  (`termo-consentimento-curatela.md`, `curatela-v1`;
  `termo-consentimento-titular-emancipado.md`, `emancipado-v1`), valores de
  enum próprios e coluna `instrumento_representacao` para registrar o
  instrumento de curatela e a comprovação da emancipação. Fecha os itens 2
  e 3 da seção 2 e a resposta (c) da seção 4. Ver emenda §16.3.
- **Issue #135 — maioridade** — indicador **passivo** de pacientes com
  regime de menor vigente e idade ≥ 18, dentro ou fora dos 90 dias de
  §4(b). Não bloqueia atendimento nem altera comportamento. Colher a
  renovação continua sendo responsabilidade **da clínica**. Ver emenda
  §16.4.
