// #512 · T09 (P1, issue #521, opção a) — gesto de CRIAR sessão em `/agenda`.
//
// `requireAgendar` (src/auth/require-role.ts) NÃO muda: continua concedendo
// criação a `coordenador` e `admin_recepcao` na camada de auth — é o fato A1
// da spec, e é código correto. O que muda é só a VISIBILIDADE do gesto na UI:
// `/agenda/semana` (onde a criação mora hoje) é `requireRole(ctx,
// "coordenador")` — recepção nunca conseguiu criar de fato, só via um botão
// que a levava a um 403. Esta função é a fonte única dessa visibilidade, para
// não copiar o `role === "coordenador"` em 3 lugares (page.tsx, appointment
// modal, e — quando T13 trouxer a semana para dentro de `/agenda` — o toggle).
export function podeCriarSessaoEmAgenda(role: string): boolean {
  return role === "coordenador";
}
