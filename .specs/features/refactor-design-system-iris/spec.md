# Especificação Técnica: Refatoração do Design System "Iris" (Espectro Brutal)

> **Issue:** #236  
> **Status:** 🟢 Especificação Consolidada  
> **Data:** 11/08/2026  
> **Documentos de Referência:**
> - [`docs/ux/refactor-design-system.md`](docs/ux/refactor-design-system.md)
> - [`docs/ux/inventario-componentes.md`](docs/ux/inventario-componentes.md)
> - [`docs/ux/design-system-espectro-brutal.md`](docs/ux/design-system-espectro-brutal.md)
> - [`CLAUDE.md`](CLAUDE.md)
>
> **Princípios Pétreos:**
> 1. **Eixo Estrutural de Profundidade:** Fato clínico aprovado **LEVANTA** (`--ds-shadow`); estado tentativo / sugerido por IA **AFUNDA** com sombra inset (`--elevation-inset` / `--ds-shadow-inset`).
> 2. **Espectro Brutal §4C:** Toda indicação de estado exige o par redundante **Ícone + Rótulo Textual** (nunca depender apenas da cor).
> 3. **Área de Toque Mínima (a11y):** Todo elemento interativo deve ter dimensão mínima de toque de 44×44px (`min-h-11 min-w-11`).
> 4. **Zero Regressão & Não Omissão:** 100% de integridade visual e funcional para telas existentes (Agenda, Diário, Metas, Login, Cadastro, Governança), sem código incompleto ou placeholders.

---

## 1. Diagnóstico & Visão dos Subagents

### 1.1 Perspectiva do Design Lead (Arquitetura e Governança do DS)
O catálogo atual de UI (`src/components/ui/`) possui excelente acessibilidade e fidelidade visual, mas sofre com duplicação de regras estruturais e espalhamento de estilos:
1. **Superfície brutalista duplicada:** A base `border-ink-anchor border-2 shadow-[var(--ds-shadow)]` e suas variantes repetem-se manualmente em `Button`, `Card`, `Input`, `Dialog` e `StatusBadge`.
2. **Tokens sem enforcement:** Tokens como `--border-brutal` e `--control-md/lg` viraram apenas comentários CSS porque o Tailwind v4 `@theme` não emite utilitários automáticos para certas variáveis.
3. **Pasta flat:** Ausência de separação clara entre primitivos agnósticos de domínio (`primitives/`), componentes de forma (`ui/`) e organismos orientados ao domínio clínico (`patterns/`).

**Decisão Arquitetural (D1 & D2):**
- Adotar a estrutura atômica pragmática em 3 camadas:
  - `src/components/ui/primitives/`: Átomos sem domínio (`Surface`, `Pill`, `Text`, `VisuallyHidden`).
  - `src/components/ui/`: Átomos e moléculas de interação e formulário (`Button`, `Input`, `Dialog`, `Chip`, `Select`, `Checkbox`, etc.).
  - `src/components/ui/patterns/`: Organismos e componentes de domínio clínico (`StatusBadge`, `ConfidenceCard`, `CompareRow`, `BatchBar`).
- Centralizar regras em utilitários TypeScript `surface()` e `control()`, tornando-os o mecanismo estrito de composição.

### 1.2 Perspectiva do Especialista em Design Lead (Fidelidade Visual & Acessibilidade Fina)
1. **Unificação da Linguagem de "Ainda-Não-Fato" (D3 & D3b):**
   - Eliminar a fragmentação visual (violeta tracejado vs. grafite hachurado vs. azul pontilhado).
   - O aprendizado primário, daltônico-seguro e universal é a **profundidade**:
     - *Fato*: Borda contínua + sombra projetada (`--ds-shadow`).
     - *Ainda-Não-Fato*: Borda tracejada/pontilhada + sombra interna que afunda (`--elevation-inset`).
   - A leitura secundária é o tipo:
     - **Sugerido por IA:** Violeta (`#6A4C93`) + ícone `SparkleIcon`.
     - **Marco Candidato:** Azul (`#2274A5`) + ícone `LayersIcon`.
2. **Correções Cirúrgicas de Acessibilidade (Bugs Auditados):**
   - `Chip` (`chip.tsx`): possui `min-h-11`, mas faltava `min-w-11` para garantir alvo de 44px em toggles curtos.
   - `Dialog` (`dialog.tsx`): botão fechar com área inferior a 44px e posição hostil para uma mão.
   - Agrupamento semântico acessível para chips com ação dupla (selecionar + remover).
3. **Hachura Densa CSS Nativa para Gráficos:**
   - Evitar dependências externas pesadas (Recharts/Chart.js) nos gráficos de protocolo.
   - Implementar padrão CSS nativo com `repeating-linear-gradient` de alta densidade (passo `3px/6px`), garantindo legibilidade em segmentos finos (2% a 5%).

### 1.3 Perspectiva do Product Designer (Experiência do Usuário & Domínio Clínico)
1. **Vocabulário Clínico de Estado Único (D4):**
   - Unificar o `StatusBadge` e o `Card` no enum real de extração (`extraction_estado`): `sugerida`, `aprovada`, `editada`, `descartada`, `pendente`, `reclassificada`, `devolvida`.
   - Remoção de selos inline manuais customizados no `Card`, padronizando o uso de `Pill` ou `StatusBadge`.
2. **Novos Componentes para Agilidade nas Fases 1, 3, 4 e 5 (D5):**
   - **`AgendaCalendarGrid` (Fase 1/3):** Visualização diária (mobile) e semanal multi-disciplinar (desktop), tratamento de nomes longos com truncamento + tooltip nativo, slots curtos (<30min) com layout compacto `flex-row`, colisão visual paralela e distinção clara de atendimentos (Concluído [Menta], Em Andamento [Ouro], Sugerido IA [Violeta Tracejado]).
   - **`ProtocolDashboardCharts` (Fase 4/5):**
     - `ProtocolProgressBarChart`: Barra proporcional com segmentos sólidos (metas dominadas) e hachurados densos (candidatas a domínio por IA), contadores exatos e tendências.
     - `ProtocolTrendChart`: Linha de trajetória temporal de sessões em SVG nativo, nós destacados de conquista e tooltips de evidências.
   - **Padrões de Revisão (Fase 3):**
     - `ConfidenceCard`: Apresentação estruturada de sugestões por nível de confiança/fricção clínica.
     - `CompareRow`: Comparação lado a lado de dados inconsistentes / histórico anterior.
     - `BatchBar`: Barra de ações em lote flutuante/ancorada para aprovação massiva de itens elegíveis.

---

## 2. Matriz de Requisitos Técnicos

| # | Categoria | Requisito | Verificação / Gate |
|---|-----------|-----------|-------------------|
| **REQ-1** | Governança | Atualizar `docs/ux/inventario-componentes.md` com `AgendaCalendarGrid` e `ProtocolDashboardCharts`. | Inspeção do Markdown |
| **REQ-2** | Storybook | Padronizar títulos em `src/stories/` sob `FOUNDATIONS`, `ATOMS`, `MOLECULES`, `ORGANISMS`, `LAYOUT`, `PAGES/TEMPLATES`. | Inspeção / Storybook |
| **REQ-3** | Primitives | Criar utilitários `surface()` e `control()` em `src/lib/design-system.ts` e `src/components/ui/primitives/surface.ts`. | Typecheck + Testes |
| **REQ-4** | Primitives | Criar o componente primitivo agnóstico `Pill` em `src/components/ui/primitives/pill.tsx`. | A11y axe + Storybook |
| **REQ-5** | Base UI | Migrar `Button`, `Card`, `Input`, `Dialog` para compor `surface()` e `control()`. | Zero regressão visual |
| **REQ-6** | Profundidade | Implementar eixo de profundidade: `solida` levanta (`--ds-shadow`), `sugerida`/`candidata` afunda (`--elevation-inset`). | Storybook + A11y |
| **REQ-7** | Domínio | Refatorar `StatusBadge` com vocabulário `extraction_estado` e par obrigatório Ícone + Texto. | Typecheck + Testes |
| **REQ-8** | Acessibilidade | Garantir `min-w-11 min-h-11` (≥44px) em `Chip` e botão de fechar do `Dialog`; rotulagem acessível de grupos. | `a11y.test.tsx` (Gate axe) |
| **REQ-9** | Padrões Fase 3 | Criar `ConfidenceCard`, `CompareRow`, `BatchBar` em `src/components/ui/patterns/` com stories em `ORGANISMS`. | `a11y.test.tsx` + Typecheck |
| **REQ-10**| Agenda | Criar `AgendaCalendarGrid` com views day/week, truncamento, slots <30min, colisão, alvos ≥44px e foco visível. | Storybook + A11y axe |
| **REQ-11**| Gráficos | Criar `ProtocolDashboardCharts` (`ProtocolProgressBarChart` e `ProtocolTrendChart`) em CSS nativo / hachura densa. | Storybook + A11y axe |
| **REQ-12**| Estrutura | Organizar pastas em `primitives/`, `ui/`, `patterns/` mantendo compatibilidade de re-exports e imports limpos. | Typecheck + Lint + Testes |

---

## 3. Estratégia de Não Omissão e Execução Segura

1. **Execução Etapa por Etapa:** O plano é dividido em 6 etapas cronológicas sequenciais. Nenhuma etapa é concluída sem que `pnpm typecheck` e os testes pertinentes passem com sucesso.
2. **Re-export para Compatibilidade:** Componentes movidos para `primitives/` ou `patterns/` terão re-exports em `src/components/ui/index.ts` ou nos caminhos legados onde necessário para evitar qualquer quebra de import em páginas existentes da aplicação.
3. **Commit Atômico por Tarefa:** Cada tarefa possui mensagem de commit pré-definida e rastreável.
