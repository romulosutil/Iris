# Tasks — #388

- [ ] T1 (owner: orquestrador, sequencial primeiro) — migration 0107: enum ADD VALUE isolado, journal manual.
- [ ] T2 [P] (agente routing) — R2,R3,R4,R5 + `prompt.test.ts` + teste switch exhaustivo em `claude-provider.ts`.
- [ ] T3 [P] (UI routing) — R6,R7 + `layout.test.tsx` reescrito + rota/componente Temas.
- [ ] T4 (orquestrador) — `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls`, verificar `pg_enum` via psql, commit.

T2 e T3 rodam em paralelo (arquivos disjuntos: extraction/* vs app/(app)/pacientes/*).
