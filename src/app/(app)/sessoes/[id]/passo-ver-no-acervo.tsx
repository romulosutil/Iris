import Link from "next/link";
import { Cluster } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ROTULO_GESTO } from "./timeline";

/**
 * Passo em foco para `ver_no_acervo` (estados `revisada` e `no_acervo`).
 *
 * #533 (`PR-01`) — em `revisada` o texto dizia "falta só a coordenação
 * encerrar o item na fila" e não dava o gesto: a fila por evidência
 * (`/validacao`) tinha virado redirect na #512. Para o coordenador, o card
 * agora leva direto ao item (`?sessao=<id>` recorta a fila naquela sessão).
 * O terapeuta continua só informado — encerrar é gesto de governança, não
 * dele (jornada-sessao-unificada.md §3.5).
 */
export function PassoVerNoAcervo({
  revisada,
  patientId,
  sessionId,
  ehCoordenador,
}: {
  revisada: boolean;
  patientId: string;
  sessionId: string;
  ehCoordenador: boolean;
}) {
  const podeEncerrar = revisada && ehCoordenador;
  const texto = !revisada
    ? "Toda a documentação desta sessão já está no acervo do paciente."
    : podeEncerrar
      ? "Revisada — falta só encerrar o item na fila de validação."
      : "Revisada — falta só a coordenação encerrar o item na fila.";

  return (
    <Alert severidade="sucesso" titulo={ROTULO_GESTO.ver_no_acervo}>
      <p>{texto}</p>
      <Cluster gap="sm" className="mt-3">
        {podeEncerrar ? (
          <Button asChild variante="primaria">
            <Link href={`/validacao?sessao=${sessionId}`}>
              Abrir na fila de validação
            </Link>
          </Button>
        ) : null}
        <Button asChild variante="neutra">
          <Link href={`/pacientes/${patientId}`}>Ver no acervo</Link>
        </Button>
      </Cluster>
    </Alert>
  );
}
