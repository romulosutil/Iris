# Trilha de auditoria do coordenador — spec de execução (#453)

> **Status: proposta de execução, não spec ratificada.** Este arquivo transcreve
> a issue #453 e registra as decisões que a implementação teve de fechar. Onde
> uma decisão é nova, está marcada como **pendente de validação com o Rômulo** —
> nenhum item aqui se declara aprovado por si.
>
> Precedente que motiva o aviso: no #277, um executor autônomo escreveu um
> `.specs/` próprio carimbado "aprovada" que contradizia a spec real, ratificada
> num comentário da issue.

## Requisitos (da issue #453)

| ID  | Requisito                                                            |
| --- | -------------------------------------------------------------------- |
| R1  | Paginação real, não limite fixo                                      |
| R2  | `admin_recepcao` lê pela view `audit_log_mascarado`, não pela tabela |
| R3  | `acao` e `entidade` traduzidos para pt-BR legível                    |
| R4  | Política de retenção decidida e registrada                           |
| R5  | Nenhum campo não-renderizado atravessa para Client Component         |
| R6  | Cobertura em `pnpm test:rls` (tenant e papel)                        |

## Decisões

### D1 — Paginação por `LIMIT/OFFSET` com total, 50 por página (R1)

A trilha **não** cresce sem teto: a `0070` (Marco Civil, Art. 15) apaga
fisicamente registros com mais de 180 dias. Com a janela limitada, offset com
`count(*)` é honesto e permite o componente `Pagination` do design system, que
mostra "página N de M" — informação que paginação por cursor não dá.

Ordem `criado_em DESC, id DESC`. O desempate por `id` não é enfeite: o job de
arquivamento grava um lote inteiro com um `p_agora` só, e sem desempate o mesmo
registro pode aparecer em duas páginas enquanto outro some.

Índice novo `idx_audit_log_clinic_criado (clinic_id, criado_em DESC, id DESC)`
— o único índice existente era por `patient_id`, que esta consulta não usa; sem
ele cada página é seq scan + sort da tabela inteira.

### D2 — A leitura é pela view para os dois papéis (R2)

`audit_log_mascarado` (`0046`, atualizada na `0087`) não projeta `patient_id`
nem `detalhe`, impõe o tenant no próprio predicado (`app_clinic_id_exigido()`) e
filtra papel (`coordenador`, `admin_recepcao`).

Ler pela view **também** para o coordenador não afrouxa nada — a v1 não renderiza
nenhuma coluna clínica, então a tabela base não daria nada a mais — e converte
"não vazar PII" de disciplina de quem escreve o `select` em impossibilidade
estrutural.

A separação da `0046` continua sendo fronteira do banco, e o teste de integração
a mede nas duas direções: recepção lê pela view e recebe **zero** linhas da
tabela base; coordenador lê as duas.

**Rota:** `/clinica/auditoria`. O layout de `/clinica` é coordenador-only, então
a recepção não alcança a tela hoje. Abrir a superfície para ela no futuro passa a
ser uma mudança de roteamento, não de acesso a dado.

### D3 — Dicionário com varredura dos pontos de escrita (R3)

`ROTULOS_ACAO` / `ROTULOS_ENTIDADE` em `logic.ts`, puro e testável sem banco.

O que impede a tradução de apodrecer é o teste, não o dicionário:
`logic.test.ts` varre `INSERT INTO audit_log` nas migrações e `insert(auditLog)`
em `src/` (resolvendo constantes `ACAO_*`) e falha nomeando qualquer slug sem
rótulo. Um `acao` novo fica vermelho no PR que o introduz.

Slug desconhecido cai num fallback que humaniza (`foo_bar` → `Foo bar`), nunca no
slug cru nem em "ação desconhecida".

### D4 — Retenção: a existente, não uma nova (R4)

**Não há decisão de produto nova aqui** — e essa é a resposta.

`docs/legal/politica-retencao-dados.md` já fixa o mínimo de 6 meses (180 dias,
Marco Civil Art. 15), e a `0070` implementa: `app_pseudonimizar_audit_log_orfao()`
pseudonimiza logs de ator excluído, `DELETE ... WHERE criado_em < now() -
INTERVAL '180 days'` expurga o resto.

A janela exibível é, portanto, **exatamente o que sobrevive ao expurgo**. A tela
não impõe janela própria: uma janela de UI menor que a retenção esconderia
registro que existe; maior mostraria página vazia. A copy diz "últimos 180 dias"
para que a ausência de um registro antigo não se leia como ausência do evento.

Consequência tratada em código: o total encolhe entre renderizar um link e
clicá-lo, então `grampearPagina` prende na última página válida em vez de
devolver lista vazia — lista vazia numa página alta se lê como "não há
registros", afirmação falsa.

**Pendente de validação com o Rômulo:** se a coordenação precisar auditar além de
180 dias, isso é mudança na política de retenção (e no expurgo), não na tela.

### D5 — Um único Client Component, e ele só vê números (R5)

`page.tsx` e `trilha-tabela.tsx` são server components. O único `"use client"` é
`paginacao-trilha.tsx`, que recebe `paginaAtual`, `totalPaginas` e `total`.

Nenhuma linha da trilha atravessa a fronteira. O tipo `LinhaTrilha` só tem campos
que a tela desenha, e `trilha-tabela.test.tsx` afirma que o HTML não contém
`detalhe`, `patient_id`, `entidade_id` nem UUID algum.

Datas são formatadas **no servidor**, no fuso da clínica. `toLocaleString` no
corpo do render formata no fuso do servidor durante o SSR e no do cliente na
hidratação — hydration mismatch.

### D6 — Falha de leitura não vira empty state

Não há `try/catch` em volta da query na página. Capturar e renderizar lista vazia
transformaria uma falha de banco em "nenhuma atividade registrada" — afirmação
falsa sobre a clínica, numa tela cujo propósito é ser evidência.

## Régua de mutação

Cada comportamento abaixo tem teste que **morre** ao remover o código:

| Comportamento                          | Mutação verificada                                                       |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Dicionário cobre todo slug gravado     | ✅ removida uma entrada → o teste falha nomeando `alerta_risco_escalado` |
| Leitura é pela view, não pela base     | ✅ trocada a fonte para `audit_log` → `admin_recepcao` passa a ler 0     |
| Paginação é real                       | 51+ registros, página 2 traz o resto sem repetir a 1                     |
| Nenhum campo não-renderizado atravessa | chaves do objeto e HTML afirmados explicitamente                         |
| Isolamento de tenant                   | clínica B enxerga só o próprio registro                                  |
| Terapeuta não lê a trilha              | total 0 pela view                                                        |
