# Design Spec — Issue #98: Nicho Terapia Convencional (Psicologia Generalista / Sem Protocolo)

> **Status:** 🟢 Especificação Aprovada & Validada (Em Implementação — Fatia Frontend Concluída em 04/08/2026)  
> **Data de Atualização:** 04/08/2026  
> **Autor:** Tech Lead & Product Designer (/impeccable)  
> **Issue GitHub:** [#98](https://github.com/romulosutil/Iris/issues/98)

---

### Log de Progresso (04/08/2026)

- ✅ **Formulário de Consentimento LGPD (Titular Adulto)**: Concluída a implementação do componente `RadioCards` em `novo-paciente-form.tsx`, garantindo seleção explícita entre _O próprio paciente (titular adulto)_ e _Responsável legal_.
- 🎨 **Redesenho do Seletor de Abordagem**: Definido o modelo de _Seletor de Modo de Atendimento_ (Terapia Convencional vs Protocolos de Marcos) para a ficha clínica do paciente, eliminando o acúmulo de cards inativos.
- 🚧 **Próximo Passo (Backend)**: Execução da Task 1 do plano (`processarSessaoGeneralista` e migração RLS para `patient_protocol.protocol_id` opcional).

## 1. Contexto de Negócio & Objetivos

### 1.1 O Problema

Atualmente, o fluxo de criação de plano terapêutico e sessão do Iris exige a seleção de um protocolo de neurodesenvolvimento (VB-MAPP, PEDI, ABLLS-R, etc.). No entanto, psicólogos que realizam atendimento clínico convencional de adultos e adolescentes em escuta livre e psicanálise/humanista necessitam utilizar a plataforma sem a rigidez de tabelas de marcos por domínio.

### 1.2 A Solução

Permitir a seleção de `protocolo_id = null` ("Sem Protocolo / Psicologia Generalista"). Nesse modo, o agente de IA deixa de tentar extrair pontuações por domínio e assume a função de **assistente leitor e sintetizador**, gerando resumos clínicos estruturados, identificando temas emergentes e monitorando alertas de risco/crise.

---

## 2. Visão dos Perfis Especialistas (Painel de Validação)

### 2.1 Visão do Psicólogo Clínico

- **Respeito à Abordagem Terapêutica:** Na terapia livre (psicanálise, abordagem centrada na pessoa, gestalt), não existem tabelas de marcos comportamentais. Forçar pontuações mutilaria a conduta profissional.
- **Foco no Prontuário Qualitativo:** O valor do Iris nesse nicho reside em transformar anotações soltas de sessão em um prontuário coeso, identificando a evolução do paciente ao longo das semanas.
- **Segurança & Alerta de Crise:** Manter ativa a regra de detecção de ideação suicida, violência ou risco iminente, notificando o profissional com prioridade máxima.

### 2.2 Visão do Product Designer (UX)

- **Seleção Opcional:** Na tela de cadastro de metas/plano do paciente, adicionar a opção bem destacada: _"Psicologia Generalista / Atendimento Sem Protocolo Rígido"_.
- **Visualização da Sessão:** A aba de evidências quantitativas é substituída pela aba _"Linha do Tempo & Resumos da Sessão"_.

### 2.3 Visão do Product Manager (PM)

- **Expansão de TAM (Total Addressable Market):** Libera a adoção do Iris por psicólogos autônomos que atendem adultos, ampliando a base de clientes do plano Diário sem comprometer a proposta de valor do nicho TEA.

---

## 3. Especificação Técnica & Modo do Agente de IA

### 3.1 Schema & Permissões

1. `patient_protocol.protocol_id` passa a aceitar `NULL`.
2. Criado o tipo de consentimento para titular adulto: `consent.tipo = 'tratamento_dados_titular_adulto'` (permitindo que o próprio paciente assine o termo de consentimento LGPD).

### 3.2 Novo Modo do Agente de IA (`src/lib/agent/generalist-mode.ts`)

Quando o atendimento possui `protocolo_id = null`, o prompt e o schema de saída acionam o modo generalista:

```json
{
  "modo": "psicologia_generalista",
  "resumo_clinico": "Síntese em linguagem profissional dos pontos abordados na sessão...",
  "temas_emergentes": [
    "Conflitos nas relações de trabalho",
    "Sintomas de ansiedade social relacionados a apresentações"
  ],
  "insights_evolutivos": "Paciente demonstrou maior autorreflexão sobre o gatilho X em comparação à sessão anterior...",
  "alertas_risco": [
    {
      "nivel": "CRITICO",
      "tipo": "IDEACAO_SUICIDA",
      "trecho_literal": "...frase que acionou o alerta...",
      "justificativa": "Relato explícito de desesperança com ideação"
    }
  ]
}
```

### 3.3 Diretrizes Inegociáveis do Agente no Modo Generalista

1. **NUNCA** atribuir notas, pontos ou porcentagens de domínio.
2. **NUNCA** sugerir diagnósticos CID/DSM ou prescrever medicações.
3. **SEMPRE** preservar a proveniência frase-a-frase dos insights até o texto do diário.

---

## 4. Análise Adversarial (Tech Lead Review)

| Ataque / Hipótese de Falha                                                                                                    | Mitigação no Design                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ataque 1:** E se uma query de relatório de convênio buscar evidências quantitativas de um paciente de Terapia Convencional? | Queries de relatórios tratam `protocolo_id IS NULL` exibindo o dossiê qualitativo/narrativo contínuo, sem quebrar gráficos ou lançar divisão por zero. |
| **Ataque 2:** O consentimento anterior exigia dados do responsável legal (menor).                                             | O schema de cadastro aceita `responsavel_nome` como nulo quando `tipo = 'tratamento_dados_titular_adulto'`.                                            |

---

## 5. Plano de Verificação e Testes

1. **Teste do Agente de IA (`src/lib/agent/generalist.test.ts`):**
   - Validar que diários sem protocolo geram apenas resumo, temas e alertas de risco, com nota/pontuação zerada/nula.
2. **Teste de Consentimento Adulto (`src/auth/consent.test.ts`):**
   - Confirmar a persistência e validação RLS do consentimento de paciente adulto sob a LGPD.
