# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dois públicos profissionais adultos, sob pressão, operam a interface — nenhum
deles é o paciente (o paciente — seja criança em intervenção para TEA/desenvolvimento infantil, seja adolescente/adulto em TCC e terapia convencional — é sobre quem
os dados falam, não quem usa o software).

O **terapeuta** (psicólogo, terapeuta ocupacional, fonoaudiólogo, aplicador ABA) trabalha mobile-first, uma mão, em corredor de clínica ou consultório, sob luz
ambiente incontrolável, com atenção interrompida a cada poucos minutos entre 7-8
sessões por dia. Seu trabalho no Iris: escrever o diário de sessão em linguagem
natural e revisar/aprovar as evidências que a IA extraiu dele.

O **coordenador / supervisor clínico** trabalha desktop, em sessão de revisão mais pausada, e valida
por exceção — reclassifica evidências (versionado, com justificativa). Tolera
mais densidade de informação, mas o volume da fila é o próprio risco (rubber
stamping por cansaço).

O **responsável pelo paciente** recebe relatórios clínicos e da família (Relatório da Família em PDF já entregue no MVP); a área logada interativa (Portal da Família) é uma evolução prevista no roadmap para leitura do progresso do dependente em contexto de transparência e acolhimento.

## Product Purpose

Iris é um SaaS para clínicas de terapia e saúde mental multidisciplinar (intervenção comportamental/TEA, TCC, Fonoaudiologia e Terapia Ocupacional) que substitui o preenchimento manual de planilhas e formulários rígidos por um diário de sessão em linguagem natural, do qual uma IA extrai
evidências estruturadas que o terapeuta revisa e aprova. A IA nunca pontua
protocolos nem toma decisões clínicas; ela acumula evidências rastreáveis (até a frase de origem) que
abastecem a decisão clínica humana. Sucesso é o terapeuta chegar na janela de
avaliação com o dossiê pronto, e a taxa de "aprovação sem edição" na tela de
revisão subir (meta de ativação ≥70%).

## Positioning

"Chegue na avaliação com o dossiê pronto" — o único produto do mercado que
oferece rastreabilidade frase-a-frase e separação estrita entre evidência e
pontuação: a IA sugere candidatos, o humano decide, e nada é maquiado como
certeza. Todo dado estruturado é derivado e auditável até o texto livre que o
originou.

## Brand Personality

Honesto, direto e clínico sem ser frio. A personalidade em três palavras:
honesto, preciso, sob-controle. A interface nunca mente visualmente sobre o que
é fato e o que é sugestão — honestidade visual é honestidade epistêmica do
produto. O tom de copy é literal e sem culpa ("o áudio não foi enviado — toque
para tentar de novo", nunca "algo deu errado!"), curto e sem metáfora, calibrado
para leitura sob pressão de tempo (terapeuta) ou carga emocional (família).
Emocionalmente, o produto deve evocar confiança e controle, não ansiedade.

## Anti-references

- **Prontuário / EMR genérico:** software médico corporativo cinza, denso,
  formulário sem hierarquia (do tipo sistema de convênio). Iris tem hierarquia
  visual forte, não uma parede uniforme de campos.
- **SaaS dashboard de IA:** gradiente roxo, glassmorphism, hero-metric, grades de
  cards idênticos — a estética "AI startup" que finge certeza. Iris se recusa a
  maquiar incerteza como certeza; essa família visual faz o oposto.
- **Planilha / Excel:** exatamente o que o produto substitui — grade de células
  sem estados, sem rastreabilidade visual.
- **Infantil / lúdico:** visual "terapia infantil" fofo e colorido. O usuário é um
  profissional adulto sob pressão; o paciente criança é sobre quem os dados
  falam, não quem opera a tela.

## Design Principles

- **Honestidade visual = honestidade epistêmica.** Todo estado "sugerido pela IA"
  tem tratamento estruturalmente diferente de "aprovado" (não só cor: borda,
  peso de sombra, selo de estado sempre visível). "Candidato" nunca se parece com
  "conquistado".
- **Fricção é ferramenta, não bug.** O peso do gesto e a confirmação escalam com o risco da decisão clínica, e a régua é uma só (`src/lib/extraction/review-policy.ts`), em três níveis: (1) **confiança alta e consistente com o histórico** → fricção baixa, pode ser aprovada em lote — com trilha própria em `audit_log` (`evidencia_aprovada_lote`), distinta da aprovação individual; (2) **confiança média ou baixa** → fricção deliberada de nível médio: sem lote, abrir e confirmar cada evidência antes de aprovar; (3) **inconsistência com o histórico** (regressão real ou erro de extração — o cenário de maior risco de erro silencioso) → fricção alta, vence a confiança e **nunca vai a lote**. O que o sistema proíbe é o "rubber-stamping" — aprovar sem olhar o que a régua mandou olhar.
- **Transparência sem vigilância.** O que o coordenador vê do terapeuta usa
  exatamente os mesmos componentes que o terapeuta vê de si — nunca uma variante
  "modo supervisor" com informação escondida.
- **A informação nunca se perde implicitamente.** Estados persistentes (ex.:
  "salvo localmente") são componentes fixos, nunca toasts que somem.
- **Hierarquia acima de uniformidade.** Contraste e peso reservados aos elementos
  âncora; o resto recua. Legibilidade funcional sob luz incontrolável vem antes
  de qualquer decoração.

## Accessibility & Inclusion

WCAG 2.1 AA. Contraste validado em todos os pares texto/fundo e ícone/fundo (4.5:1
texto, 3:1 UI/bordas). Simulação de daltonismo (protanopia/deuteranopia) sem
colisão entre os três acentos. Alvo de toque ≥44×44px em todo componente
interativo do Modo Clínico. Zoom de navegador até 200% sem quebra de layout (WCAG
1.4.4). `prefers-reduced-motion` respeitado explicitamente (deslocamento no clique
vira troca instantânea de sombra). Nenhum padrão repetitivo de alto contraste
(listras, xadrez) em nenhum componente — gatilho de estresse visual e risco
fotossensível.
