# Design Spec — Issue #102: LGPD - Regularização Contratual Hostinger & DPA

> **Status:** 🟢 Especificação Aprovada & Validada  
> **Data:** 02/08/2026  
> **Autor:** Tech Lead & Painel (Product Manager, Product Designer, Psicólogo Clínico)  
> **Issue GitHub:** [#102](https://github.com/romulosutil/Iris/issues/102)

---

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema
Medições técnicas comprovam que os servidores em nuvem do Iris estão localizados em São Paulo/BR (latência de 33 ms). No entanto, o DPA público da Hostinger é celebrado com a *Hostinger International Ltd* (entidade sediada no Chipre/Lituânia - UE) e não garantia expressamente a residência de dados no Brasil no contrato padrão.

### 1.2 A Solução
Formalizar a documentação legal e contratual do provedor de infraestrutura, registrando o DPA assinado em `docs/legal/dpa-hostinger.md`, ajustando a precisão das afirmações legais em `validacao-legal-prontuario.md` e atualizando a Política de Privacidade e o checklist LGPD.

---

## 2. Especificação de Ações & Documentação

### 2.1 Registro do DPA (`docs/legal/dpa-hostinger.md`)
* Coleta da fatura oficial e aceite do DPA da Hostinger International Ltd (UE).
* A ANPD reconheceu a União Europeia como nível de proteção adequado (Resolução ANPD nº 32/2026), oferecendo respaldo de transferência internacional segura sob a LGPD (Art. 33, I).

### 2.2 Ajuste de Redação em `docs/legal/validacao-legal-prontuario.md`
* Corrigir a frase do trecho de infraestrutura para separar *localização física do banco de dados (São Paulo, Brasil)* do *domicílio da operadora (Hostinger International Ltd, UE)*.

### 2.3 Atualização da Política de Privacidade (`docs/legal/politica-privacidade.md`)
* Incluir na seção de Subprocessadores de Infraestrutura as categorias nominais: *"Hospedagem em nuvem (Hostinger International Ltd - Datacenter São Paulo/BR)"*.

---

## 3. Plano de Verificação

1. Verificação de arquivo `docs/legal/dpa-hostinger.md` existente e commitado.
2. Inclusão da checagem de DPA de infraestrutura no checklist do deployment em produção.
