# Design Spec — Issue #120: Exportação Auditável de Prontuário em PDF/A (Marca d'Água + Hash SHA-256)

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#120](https://github.com/romulosutil/Iris/issues/120)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

A LGPD (Art. 18, II e V) garante ao titular de dados ou a seu representante legal o direito de portabilidade e acesso à cópia integral e inteligível do seu prontuário clínico. Além disso, o §6 dos `termos-de-uso.md` do Iris previa a entrega de exportação em formato a definir.

### 1.2 A Solução

Implementar a funcionalidade de exportação em lote do prontuário em **PDF/A** (padrão ISO de preservação digital de longo prazo), incorporando marca d'água de rastreabilidade e um hash SHA-256 no rodapé do documento para atestar sua não-adulteração após a emissão.

---

## 2. Visão dos Perfis Especialistas (Painel de Validação)

### 2.1 Visão Jurídica & Compliance LGPD

- **Irrevogabilidade e Integridade:** O hash SHA-256 gravado no documento e registrado no `audit_log` impede que qualquer parte aleague falsificação do prontuário entregue.
- **Prevenção de Vazamentos:** A marca d'água nominal com CPF/data/hora inibe o compartilhamento indevido da cópia por terceiros.

### 2.2 Visão do Product Designer (UX)

- **Fluxo de Solicitação:** Na tela de configurações do paciente, botão "Solicitar Exportação de Prontuário LGPD".
- **Geração Assíncrona:** Arquivos grandes geram um job em segundo plano e disponibilizam um link temporário de download seguro (expira em 24h).

---

## 3. Especificação Técnica & Arquitetura

### 3.1 Pipeline de Geração em PDF/A (`src/lib/export/pdf-generator.ts`)

1. Compilação dos dados do paciente (ficha clínica, diários, evidências, relatórios e gráfico de linha do tempo).
2. Renderização usando `react-pdf` ou `pdfkit` configurado em conformidade com **PDF/A-2b**.
3. **Marca d'água:** Impressão em camada semitransparente ($15\%$ opacidade, rotação $-45^\circ$) em todas as páginas:
   `"EMITIDO PARA: [NOME SOLICITANTE] - CPF: [XXX.XXX.XXX-XX] EM [DATA/HORA UTC]"`
4. **Cálculo de Hash SHA-256:**
   $$\text{Hash} = \text{crypto.createHash('sha256').update(pdfBuffer).digest('hex')}$$
5. Impressão do Hash SHA-256 no rodapé de cada página: `SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

### 3.2 Atualização nos Termos de Uso (`docs/legal/termos-de-uso.md` §6)

Atualizar o §6 dos Termos de Uso para formalizar: _"A exportação de dados clínicos será fornecida em formato PDF/A auditável contendo marca d'água de emissão e assinatura de integridade via hash SHA-256."_

---

## 4. Análise Adversarial (Tech Lead Review)

| Ataque / Hipótese de Falha                                                                         | Mitigação no Design                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ataque 1:** Prontuários com anos de histórico podem estourar a memória durante a geração do PDF. | A geração é realizada via stream/job assíncrono em worker, limitando o consumo de RAM e salvando o artefato temporário no MinIO/S3 sob RLS. |
| **Ataque 2:** E se o PDF for alterado após o download?                                             | Qualquer edição (como remoção da marca d'água) invalida o hash SHA-256 gravado no rodapé e registrado na trilha de auditoria do sistema.    |

---

## 5. Plano de Verificação e Testes

1. **Teste de Geração de Hash (`src/lib/export/pdf-hash.test.ts`):**
   - Validar que o hash retornado na API é idêntico ao hash impresso no rodapé do documento.
2. **Validação de Formato PDF/A:**
   - Passar a suíte de validação PDF/A (pdfaPilot / verapdf) nos testes E2E.
