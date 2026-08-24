import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { DataRow } from "@/components/ui/data-row";
import { Pill } from "@/components/ui/primitives/pill";
import { Stack } from "@/components/ui/layout";
import {
  rotularPapeis,
  type MembroClassificado,
  type PosturaSeguranca,
} from "./logic";

interface GrupoProps {
  titulo: string;
  descricao: string;
  membros: MembroClassificado[];
  tom: "atencao" | "informativo";
}

function Grupo({ titulo, descricao, membros, tom }: GrupoProps) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div>
        <h2 className="font-display text-lg font-bold">{titulo}</h2>
        <p className="mt-1 text-sm text-[var(--texto-suave)]">{descricao}</p>
      </div>

      <ul className="divide-y divide-[var(--linha-suave)]">
        {membros.map((m) => (
          <DataRow
            key={m.id}
            como="li"
            title={m.nome}
            subtitle={`${m.email} · ${rotularPapeis(m.papeis)}`}
            trailing={
              <Pill
                variant="solid"
                colorScheme={tom === "atencao" ? "ouro" : "azul"}
                size="sm"
              >
                {tom === "atencao" ? "Sem 2º fator" : "Ativação pendente"}
              </Pill>
            }
          />
        ))}
      </ul>
    </Card>
  );
}

export interface PosturaEquipeProps {
  postura: PosturaSeguranca;
}

/**
 * Apresentação pura: não busca dado próprio. `page.tsx` é o único leitor.
 */
export function PosturaEquipe({ postura }: PosturaEquipeProps) {
  const { semSegundoFator, ativacaoPendente, protegidos, total } = postura;
  const tudoEmDia =
    semSegundoFator.length === 0 && ativacaoPendente.length === 0;

  return (
    <Stack gap="lg">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <p className="font-display text-2xl font-bold">
            {protegidos} de {total}
          </p>
          <p className="text-sm text-[var(--texto-suave)]">
            membros com segundo fator ativo nesta clínica
          </p>
        </div>
      </Card>

      {tudoEmDia ? (
        // Estado permanente da tela, não toast: quando não há pendência, esta é
        // a resposta que o coordenador precisa ver ao abrir.
        <Alert
          severidade="sucesso"
          titulo="Toda a equipe está com segundo fator ativo"
        >
          Nenhum membro desta clínica opera sem segundo fator, e não há convite
          aguardando primeiro acesso.
        </Alert>
      ) : null}

      {semSegundoFator.length > 0 ? (
        <Grupo
          titulo="Sem segundo fator"
          // O gate de `src/auth/tenant.ts` cobre só papel clínico. Para recepção,
          // a flag em `false` significa mesmo ausência de segundo fator.
          descricao="Opera o sistema sem segundo fator. O MFA não é obrigatório para recepção."
          membros={semSegundoFator}
          tom="atencao"
        />
      ) : null}

      {ativacaoPendente.length > 0 ? (
        <Grupo
          titulo="Ativação pendente"
          // Não escrever "não ativou o 2FA": papel clínico sem segundo fator é
          // desviado para /mfa/setup e não entra no app. O que a flag marca aqui
          // é convite provisionado sem primeiro acesso.
          descricao="Convidado, mas ainda não fez o primeiro acesso. A senha temporária continua válida."
          membros={ativacaoPendente}
          tom="informativo"
        />
      ) : null}
    </Stack>
  );
}
