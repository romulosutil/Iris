"use client";

import { useActionState } from "react";
import { Stack } from "@/components/ui/layout";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { salvarEmergenciaAction, type EmergenciaState } from "./actions";
import type { ConfigEmergencia, UsuarioDaClinica } from "./logic";

const PAPEL_LEGIVEL: Record<string, string> = {
  coordenador: "coordenação",
  terapeuta: "terapeuta",
  admin_recepcao: "recepção",
};

function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function EmergenciaForm({
  config,
  usuarios,
}: {
  config: ConfigEmergencia;
  usuarios: UsuarioDaClinica[];
}) {
  const [state, formAction] = useActionState<EmergenciaState, FormData>(
    salvarEmergenciaAction,
    {},
  );

  const jaDeclarado = Boolean(config.declaradoEm);

  return (
    <Stack gap="lg">
      {/* Cláusula 10 dos termos de uso — resumo fiel, sem inventar obrigação
          que o contrato não cria nem suavizar a que ele cria. */}
      <Alert severidade="info" titulo="O que o Iris faz — e o que continua sendo da clínica">
        <Stack gap="sm">
          <p>
            O Iris identifica e sinaliza termos sugestivos de risco a partir do
            texto que o profissional digita depois da sessão. É análise posterior
            ao relato, de caráter informativo, e depende sempre da avaliação e do
            julgamento clínico humano.
          </p>
          <p>
            O Iris <strong>não</strong> faz monitoramento em tempo real (24 horas
            por dia, 7 dias por semana) de pacientes, <strong>não</strong>{" "}
            substitui plantão clínico e <strong>não</strong> funciona como serviço
            de triagem de emergência ou prevenção de crises. As notificações
            dependem de fatores técnicos externos — conectividade, permissões do
            aparelho, modo “Não Perturbe” — e o Iris não garante resposta humana
            em prazo determinado.
          </p>
          <p>
            A adoção de conduta clínica, as intervenções de emergência, a quebra
            de sigilo ético e as notificações compulsórias às autoridades públicas
            (Conselho Tutelar, Vigilância Sanitária, autoridades policiais) são
            responsabilidade <strong>exclusiva</strong> da clínica e dos seus
            profissionais de saúde. O Iris nunca notifica ninguém fora da clínica.
          </p>
          <p>
            Como condição de uso do módulo de alerta de risco, a clínica se obriga
            a manter protocolo próprio de gestão de crises e emergências fora do
            ambiente do Iris (cláusula 10 dos termos de uso).
          </p>
        </Stack>
      </Alert>

      {jaDeclarado ? (
        <Alert severidade="sucesso" titulo="Declaração registrada">
          Declarado por {config.declaradoPorNome ?? "usuário removido"} em{" "}
          {formatarData(config.declaradoEm!)}.
        </Alert>
      ) : null}

      <Form action={formAction} error={state.error}>
        {state.ok ? (
          <Alert severidade="sucesso">Configuração salva.</Alert>
        ) : null}

        <Field label="Responsável técnico" htmlFor="responsavelTecnicoId">
          <Select
            name="responsavelTecnicoId"
            defaultValue={config.responsavelTecnicoId ?? undefined}
            required
          >
            <SelectTrigger id="responsavelTecnicoId">
              <SelectValue placeholder="Selecione um usuário da clínica" />
            </SelectTrigger>
            <SelectContent>
              {usuarios.map((u) => (
                <SelectItem key={`${u.id}-${u.papel}`} value={u.id}>
                  {u.nome} — {PAPEL_LEGIVEL[u.papel] ?? u.papel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-sm text-[var(--text-secondary)]">
          É quem o Iris notifica quando um alerta de risco passa do segundo prazo
          sem reconhecimento. Só usuários desta clínica — o Iris nunca endereça
          contato externo.
        </p>

        <Field label="Protocolo de Emergência Interno" htmlFor="protocoloInterno">
          <Input
            id="protocoloInterno"
            name="protocoloInterno"
            multiline
            rows={10}
            required
            minLength={10}
            defaultValue={config.protocoloInterno ?? ""}
            placeholder="Quem acionar, em que ordem, com quais telefones e em quais horários…"
          />
        </Field>
        <p className="text-sm text-[var(--text-secondary)]">
          Este é o texto que o Iris <strong>exibe</strong> para a equipe quando um
          alerta chega ao segundo estágio. O Iris mostra o protocolo da clínica e
          nunca propõe conduta própria — escreva aqui exatamente o que a equipe
          precisa ler naquele momento.
        </p>

        <Checkbox
          id="declarado"
          name="declarado"
          required
          defaultChecked={jaDeclarado}
          label="Declaro que a clínica possui protocolo próprio de atendimento de emergências."
        />

        <Button type="submit" variante="primaria">
          Salvar configuração
        </Button>
      </Form>
    </Stack>
  );
}
