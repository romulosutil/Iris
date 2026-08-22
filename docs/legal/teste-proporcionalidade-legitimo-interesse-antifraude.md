# Teste de Proporcionalidade — Legítimo Interesse na Verificação Antifraude do Período de Teste (Art. 10 LGPD)

**Data:** 21/08/2026. **Autor:** revisão jurídica de `docs/legal/revisao-juridica-2026-08-21.md`, fechando a pendência registrada em `politica-privacidade.md` §2.1.
**Mecanismo avaliado:** verificação, no cadastro do primeiro paciente de uma clínica nova, de se o `cpf_hash` (HMAC-SHA256 do CPF do paciente ou do responsável, com chave secreta fora do código) já esteve associado a um período de teste gratuito iniciado em outra conta — descrito em `politica-privacidade.md` §2.1 e `termos-de-uso.md` §7.2.
**Status:** este documento fecha a pendência de registro do teste, mas segue o mesmo protocolo de validação já em uso no projeto (revisão pelo advogado de registro antes de ser tratado como definitivo) — ver `politica-privacidade.md`, seção "Itens em aberto".

---

## 1. Por que este teste existe

O Art. 10 da LGPD exige que o controlador que trata dado com base em legítimo interesse (Art. 7º, IX) demonstre, de forma registrada, que a finalidade é legítima, que o tratamento é necessário e proporcional a ela, e que as liberdades e direitos fundamentais do titular foram ponderados frente às salvaguardas adotadas. `politica-privacidade.md` §2.1 já declara a base legal e descreve o mecanismo, mas remetia a este teste como documento próprio ainda não produzido — é o único recorte do produto em que o Iris atua como controlador (não operador) sobre dado originado do paciente, o que justifica o rigor extra.

## 2. Teste de finalidade legítima

A finalidade é prevenir uso abusivo do período de teste gratuito — a mesma pessoa reabrindo contas de clínica sucessivas para renovar o teste indefinidamente, ou inflando a contagem de pacientes cobrados com cadastros repetidos do mesmo CPF. É finalidade do próprio Iris, concreta, e não dissimulada: o texto público já a declara nesses termos. Não há uso paralelo ou não declarado do mecanismo — a consulta não alimenta nenhuma outra finalidade (marketing, precificação individualizada, perfilamento).

**Conclusão:** finalidade legítima, real e específica. Satisfeito.

## 3. Teste de necessidade — o tratamento é adequado e o mínimo possível?

**Adequação.** O mecanismo resolve exatamente o problema descrito: sem ele, nada impede reaberturas sucessivas de teste pelo mesmo CPF sob clínicas diferentes.

**Minimização.** Três escolhas de desenho reduzem o tratamento ao mínimo necessário, e cada uma delas é o motivo pelo qual o teste de proporcionalidade fecha a favor do mecanismo:

1. **O CPF em texto legível nunca participa da consulta.** Apenas o `cpf_hash` — um HMAC-SHA256 irreversível, calculado com chave secreta fora do código-fonte — é comparado entre contas. Não é possível recuperar o CPF a partir do hash, nem correlacionar hashes de sistemas diferentes sem a mesma chave secreta do Iris.
2. **A resposta é estritamente binária.** A consulta devolve sim/não — nunca nome, clínica de origem, data ou quantidade de ocorrências. Nenhuma clínica passa a enxergar paciente de outra clínica por causa do mecanismo; o isolamento entre clínicas (RLS) não é atravessado.
3. **A consulta só ocorre uma vez por ciclo de vida da conta** — no cadastro do primeiro paciente que inicia o relógio do teste. Clínica que já contratou ou que já está em teste próprio não é consultada; paciente atendido anteriormente em outro serviço não é sinal de nada e não gera fricção.

Não identifico alternativa menos invasiva que ainda cumpra a finalidade: qualquer verificação antifraude de "mesma pessoa, conta nova" exige algum identificador estável da pessoa: e-mail e telefone são triviais de trocar a cada cadastro (não serviriam ao propósito), e um identificador verdadeiramente anônimo (sem qualquer derivação do CPF) não teria como detectar a reincidência. O CPF é o identificador estável de que o cadastro já dispõe para outra finalidade (identificação do titular/responsável), e o hash é a forma menos invasiva de reaproveitá-lo para este propósito secundário.

**Conclusão:** tratamento adequado e limitado ao necessário. Satisfeito.

## 4. Teste de balanceamento — direitos e liberdades do titular

O titular potencialmente afetado é o paciente adulto ou o responsável legal cujo CPF gera o hash — não o paciente cujos dados de saúde estão no prontuário de outra clínica, porque, como visto acima, o mecanismo nunca revela esse conteúdo.

**Risco ao titular:** o pior cenário técnico é a negativa do período de teste a uma clínica legítima, na hipótese de duas famílias distintas coincidirem no mesmo CPF de responsável (ex.: irmãos com pai em comum matriculados em clínicas diferentes) — um falso positivo comercial, não uma exposição de dado sensível. Não há cenário em que a verificação exponha diagnóstico, conteúdo de sessão ou qualquer dado de saúde: o alcance da exceção de controlador é, por desenho, restrito ao hash e à resposta binária (`politica-privacidade.md` §3), e não se estende ao prontuário.

**Expectativa razoável do titular:** um responsável que já usou o período de teste em outra clínica não teria expectativa razoável de conseguir um segundo período gratuito abrindo nova conta — o mecanismo frustra uma expectativa que não é legítima de origem (uso abusivo de benefício comercial), não uma expectativa de privacidade.

**Salvaguardas já adotadas** (Art. 10, §2º, LGPD): irreversibilidade do hash; chave secreta fora do código; resposta binária sem metadado; escopo de consulta limitado ao momento de ativação do teste; ausência de qualquer efeito sobre o tratamento do dado de saúde do paciente (o prontuário em si segue sob a regra normal de operador).

**Conclusão:** o risco residual ao titular é baixo, comercial (não relacionado a dado sensível), e as salvaguardas já mitigam o cenário de falso positivo ao ponto de a clínica poder contratar normalmente mesmo quando o teste é negado — não há perda de acesso ao serviço, só perda do benefício gratuito. O balanceamento favorece o controlador.

## 5. Recomendação sobre a pendência de retenção do `cpf_hash`

`politica-privacidade.md` §2.1 também deixava em aberto por quanto tempo o `cpf_hash` deve ser conservado após o encerramento da conta da clínica. Análise:

A finalidade (impedir reabertura de teste pelo mesmo CPF) é, por natureza, **indefinida no tempo** — um responsável pode tentar abrir uma clínica nova anos depois do encerramento da primeira, e o mecanismo só funciona se o hash daquele CPF continuar consultável. Isso distingue o `cpf_hash` do restante do prontuário, cujo prazo de retenção decorre de obrigação regulatória com termo final (guarda do registro clínico). Aqui não há uma obrigação de guarda com prazo — há uma finalidade de prevenção contínua enquanto o produto oferecer período de teste gratuito.

**Recomendação:** manter o `cpf_hash` por prazo indeterminado, vinculado à existência do mecanismo de teste gratuito no produto (se o Iris um dia deixar de oferecer teste gratuito, a finalidade desaparece e os hashes devem ser eliminados em bloco), e não à conta da clínica que o originou — a exclusão da clínica não deve arrastar o hash, porque a coluna já não está ligada, no momento da consulta, a nome, prontuário ou clínica de origem (é comparação isolada de hash contra hash). Isso é proporcional porque (a) o dado retido é irreversível e não identificável isoladamente, (b) a retenção não amplia o alcance da exceção de controlador para nenhum outro dado, e (c) o titular mantém, a qualquer tempo, o direito de solicitar confirmação de que um hash associado ao seu CPF existe e para que serve (LGPD Art. 9º), ainda que não possa "ver" o hash em si por ele não ser reversível.

**Isto fecha a pendência de `politica-privacidade.md` §2.1 quanto ao teste de proporcionalidade e à recomendação de prazo.** A redação final do texto público (se manter "por prazo indeterminado, vinculado à existência do mecanismo") deve ser revisada pelo advogado de registro do projeto antes de publicação, seguindo o mesmo protocolo já usado para os demais documentos ratificados.
