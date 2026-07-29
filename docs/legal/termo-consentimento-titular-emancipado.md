# Termo de Consentimento para Tratamento de Dados — Titular Emancipado — Iris

**Versão `emancipado-v1`.** Redigido em 29/07/2026 para a issue #134.

> **Por que arquivo próprio, e não um parágrafo dentro do termo adulto.**
> `versao_termo` é gravado no banco e nunca sobrescrito. Se o emancipado
> assinasse `adulto-v1`, a trilha não registraria que houve comprovação de
> emancipação, e não haveria como auditar depois se ela foi conferida. O
> enum de banco já separa os dois casos
> (`autoconsentimento_titular_adulto` × `autoconsentimento_titular_emancipado`),
> e o identificador de versão acompanha essa separação.

---

## 1. A quem este termo se aplica

Aplica-se ao **adolescente emancipado**, nos termos do **Art. 5º,
parágrafo único, do Código Civil**. A emancipação faz cessar a incapacidade
civil: o emancipado consente **por si próprio**, e **não** cabe
consentimento do responsável legal (Art. 14, § 1º, da LGPD deixa de
incidir).

No sistema, corresponde ao registro `Consent` com
`tipo = 'autoconsentimento_titular_emancipado'`,
`responsavel_signatario` **nulo** e `instrumento_representacao` preenchido
com a identificação da comprovação da emancipação. As três condições são
exigidas juntas por constraint de banco.

## 2. O que muda em relação ao termo de adulto capaz

**Só o registro da comprovação.** O conteúdo material é o mesmo de
`termo-consentimento-titular-adulto.md` (`adulto-v1`), seções 5 a 15 —
dados tratados, finalidades e bases legais, IA, transferência
internacional, exportação, retenção, segurança, direitos e revogação,
limites do sigilo, declaração e assinatura. **Este termo incorpora aquelas
seções por inteiro**, com duas alterações e nenhuma outra:

1. **Identificação (seção 5 do termo adulto):** acrescentar o campo
   **"Comprovação da emancipação"**, com a hipótese do Art. 5º, parágrafo
   único, e a identificação do documento:
   - I — concessão dos pais por escritura pública, ou sentença do juiz:
     identificar o cartório/livro/folha ou o processo e a vara;
   - II — casamento; III — exercício de emprego público efetivo;
   - IV — colação de grau em curso de ensino superior;
   - V — estabelecimento civil/comercial ou relação de emprego com economia
     própria.
   O documento é conferido pela clínica e **arquivado**; o sistema registra
   a identificação da comprovação, não o documento.
2. **Versão (seção 15 do termo adulto):** onde se lê `adulto-v1`, lê-se
   **`emancipado-v1`**.

⚠️ **Atenção operacional:** a emancipação por escritura pública dos pais
exige que o menor tenha **completado 16 anos**. Sem comprovação válida, o
paciente continua no regime de menor (Art. 14, § 1º) — não usar este termo
"por analogia".

## 3. Revogação

Idêntica à do adulto capaz. Revogado o autoconsentimento, **cessam** o uso
de IA, a transferência internacional e a exportação de relatórios; o
**registro clínico do atendimento continua**, porque se apoia na **tutela
da saúde (LGPD Art. 11, II, "f")**, que não depende de consentimento. O
prontuário **não** vai a somente-leitura. Procedimento em
`procedimento-revogacao-consentimento.md`.

## 4. Relação com a transição menor → maioridade

São coisas distintas. O paciente que **completa 18 anos** passa a assinar
`adulto-v1`. O paciente **emancipado antes dos 18** assina `emancipado-v1`.
Ao completar 18 anos, o emancipado não precisa reassinar: a emancipação já
o havia tornado capaz, e a capacidade não muda de natureza no aniversário.

## 5. Gates de impressão

Os mesmos de `termo-consentimento-titular-adulto.md` ("Gates de impressão"),
acrescidos da conferência e do arquivamento da comprovação de emancipação
antes de colher a assinatura.

---

## Método de validação deste documento

Redigido para ser lido pelo advogado do projeto. Pelo protocolo acordado
com o responsável pelo produto, **texto lido sem apontamentos até o fim da
sessão é dado por alinhado**. Por isso toda questão jurídica aparece como
**resposta afirmativa única**, com fundamento e efeito no sistema — nunca
como pergunta aberta, que silêncio não ratifica.

Data desta versão: **29/07/2026**. Se vierem apontamentos, o texto passa a
`emancipado-v2` e exige nova coleta de assinatura.
