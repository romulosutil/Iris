"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Checkbox } from "@/components/ui/checkbox";
import {
  cadastrarPacienteAdministrativo,
  type CadastroAdminState,
} from "./actions";

type TipoConsentimento = "responsavel_legal" | "titular_adulto";

/**
 * Idade em anos completos na data de hoje. Só serve para o AVISO
 * não-bloqueante — nunca para decidir o tipo de consentimento (ver D1 em
 * .specs/features/consentimento-titular-adulto/spec.md).
 */
function idadeEmAnos(nascimento: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return null;
  const nasc = new Date(`${nascimento}T00:00:00`);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const mes = hoje.getMonth() - nasc.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) anos--;
  // Data no futuro (erro de digitação) não vira aviso de "idade -4 ano(s)".
  // Validar `nascimento <= hoje` na action é mudança de comportamento de um
  // campo que já existia — fica fora do escopo desta mudança.
  if (anos < 0) return null;
  return anos;
}

export function NovoPacienteForm() {
  const [state, formAction] = useActionState<CadastroAdminState, FormData>(
    cadastrarPacienteAdministrativo,
    {},
  );
  // Sem default: o operador precisa escolher. A action rejeita valor ausente,
  // então "" aqui vira erro claro em vez de consentimento errado gravado.
  const [tipoConsentimento, setTipoConsentimento] = useState<
    TipoConsentimento | ""
  >("");
  const [nascimento, setNascimento] = useState("");
  const [consentimentoIa, setConsentimentoIa] = useState(false);
  const [consentimentoExportacao, setConsentimentoExportacao] = useState(false);

  const idade = idadeEmAnos(nascimento);
  // Aviso NÃO-BLOQUEANTE: emancipação e curatela existem, e `nascimento` é
  // opcional. A idade nunca impede o cadastro nem muda a escolha.
  const avisoDivergencia =
    idade === null || tipoConsentimento === ""
      ? null
      : tipoConsentimento === "titular_adulto" && idade < 18
        ? `A data de nascimento indica ${idade} ano(s), mas o consentimento está marcado como assinado pelo próprio paciente. Confirme se é o caso (ex.: adolescente emancipado). O cadastro segue normalmente.`
        : tipoConsentimento === "responsavel_legal" && idade >= 18
          ? `A data de nascimento indica ${idade} ano(s), mas o consentimento está marcado como assinado por responsável legal. Confirme se é o caso (ex.: pessoa sob curatela). O cadastro segue normalmente.`
          : null;

  // O SegmentedControl é a única entrada OBRIGATÓRIA que o browser não valida
  // (hidden input não aceita `required`). Sem isto, quem usa leitor de tela
  // submete sem escolher, ouve a mensagem no topo do form e não tem vínculo
  // nenhum com o grupo que a causou. a11y é compromisso de 1ª classe aqui.
  const erroEhDoTipo =
    !!state.error && /quem assina o consentimento/i.test(state.error);
  const grupoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!erroEhDoTipo) return;
    // Leva o foco para o primeiro botão do grupo: a mensagem sozinha, no topo
    // do form, não diz ONDE corrigir.
    grupoRef.current?.querySelector("button")?.focus();
  }, [erroEhDoTipo, state]);

  // Bloqueio de cobrança (#36) não é erro de preenchimento: nada no formulário
  // conserta. Some com o Alert genérico do <Form> para não repetir a mesma
  // frase duas vezes na tela — a mensagem sai no aviso destacado abaixo.
  const bloqueio = state.bloqueioBilling;

  return (
    <Form action={formAction} error={bloqueio ? undefined : state.error}>
      {bloqueio ? (
        <Alert
          severidade="erro"
          destacado
          titulo="Cadastro bloqueado pela assinatura"
        >
          <p>{bloqueio.mensagem}</p>
          {/* Link SÓ na ativação pendente. Em `pagamento_pendente` já existe
              cobrança em voo: devolver a pessoa ao checkout gera uma segunda
              cobrança para o mesmo mês. Nos demais motivos a saída também não
              é um novo checkout, então nenhum deles ganha o link. */}
          {bloqueio.motivo === "ativacao_requerida" ? (
            <p className="mt-2">
              <Link
                href="/assinatura"
                className="font-semibold underline underline-offset-4"
              >
                Ativar a assinatura
              </Link>
            </p>
          ) : null}
        </Alert>
      ) : null}
      <Field label="Nome do paciente" htmlFor="nome">
        <Input id="nome" name="nome" required />
      </Field>
      <Field label="Data de nascimento" htmlFor="nascimento">
        <Input
          id="nascimento"
          name="nascimento"
          type="date"
          value={nascimento}
          onChange={(e) => setNascimento(e.target.value)}
        />
      </Field>
      <Field label="Contato do responsável" htmlFor="responsavelContato">
        <Input id="responsavelContato" name="responsavelContato" />
      </Field>
      <Field label="Escola" htmlFor="escola">
        <Input id="escola" name="escola" />
      </Field>
      <Field label="Convênio" htmlFor="convenio">
        <Input id="convenio" name="convenio" />
      </Field>
      {/* Alvo de carga por disciplina (Agenda 2.0) — opcional na v1: uma linha.
          Campos vazios são ignorados pela action; repetição dinâmica de linhas
          fica para a UI da Etapa B. */}
      <Field label="Disciplina do alvo de carga (opcional)" htmlFor="alvoDisciplina">
        <Input
          id="alvoDisciplina"
          name="alvoDisciplina"
          placeholder="ex.: aba, fono, to"
        />
      </Field>
      <Field label="Horas-alvo por semana" htmlFor="alvoHorasSemana">
        <Input
          id="alvoHorasSemana"
          name="alvoHorasSemana"
          type="number"
          min="0"
          step="0.5"
          inputMode="decimal"
        />
      </Field>

      {/* Consentimento LGPD. A escolha de quem assina é explícita — nunca
          derivada da data de nascimento (#100, D1). */}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="text-[var(--text-primary)] font-display mb-1.5 text-sm font-semibold">
          Quem assina o consentimento?
        </legend>
        {/* Sem `aria-label` aqui: o <legend> do fieldset já nomeia o grupo, e
            repetir o mesmo texto num role="group" aninhado faz o leitor de
            tela anunciar duas vezes. */}
        <SegmentedControl
          ref={grupoRef}
          value={tipoConsentimento}
          onValueChange={(v) => setTipoConsentimento(v as TipoConsentimento)}
          aria-required="true"
          aria-invalid={erroEhDoTipo || undefined}
          aria-describedby={
            erroEhDoTipo ? "tipoConsentimento-error" : undefined
          }
          opcoes={[
            {
              value: "titular_adulto",
              label: "O próprio paciente (titular adulto)",
            },
            {
              value: "responsavel_legal",
              label: "Responsável legal (paciente menor de 18 anos)",
            },
          ]}
        />
        {erroEhDoTipo ? (
          <p
            id="tipoConsentimento-error"
            className="text-[var(--status-error-fg)] text-sm font-semibold"
          >
            {state.error}
          </p>
        ) : null}
        {/* Valor lido pela action. Vazio até o operador escolher — a action
            devolve erro em pt-BR nesse caso, sem default silencioso. */}
        <input
          type="hidden"
          name="tipoConsentimento"
          value={tipoConsentimento}
        />
      </fieldset>

      {avisoDivergencia ? (
        <Alert severidade="warning" titulo="Confira antes de salvar">
          {avisoDivergencia}
        </Alert>
      ) : null}

      {/* Só renderizado no ramo do responsável legal: `required` num campo
          escondido bloquearia o submit sem foco visível (a11y). Nunca usar
          `hidden` + `required` aqui. */}
      {tipoConsentimento === "responsavel_legal" ? (
        <Field
          label="Responsável que assina o Consentimento LGPD"
          htmlFor="responsavelSignatario"
        >
          <Input
            id="responsavelSignatario"
            name="responsavelSignatario"
            required
          />
        </Field>
      ) : null}

      {/* Consentimentos por finalidade LGPD (#140) — destacados e facultativos. */}
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="text-[var(--text-primary)] font-display mb-1 text-sm font-semibold">
          Consentimentos Adicionais por Finalidade (LGPD)
        </legend>
        <div className="flex flex-col gap-3">
          <div>
            <Checkbox
              id="consentimentoIa"
              checked={consentimentoIa}
              onCheckedChange={(c) => setConsentimentoIa(!!c)}
              label="Autorizar processamento por Inteligência Artificial (IA)"
            />
            <p className="text-[var(--text-secondary)] text-xs ml-9 mt-0.5">
              Conforme §8 dos Termos LGPD. Facultativo — autoriza transcrição, resumos e auxílio clínico por IA.
            </p>
          </div>
          <div>
            <Checkbox
              id="consentimentoExportacao"
              checked={consentimentoExportacao}
              onCheckedChange={(c) => setConsentimentoExportacao(!!c)}
              label="Autorizar exportação e download de relatórios"
            />
            <p className="text-[var(--text-secondary)] text-xs ml-9 mt-0.5">
              Conforme §10 dos Termos LGPD. Facultativo — autoriza a geração e download de relatórios em PDF/CSV.
            </p>
          </div>
        </div>
        <input
          type="hidden"
          name="consentimentoIa"
          value={consentimentoIa ? "on" : ""}
        />
        <input
          type="hidden"
          name="consentimentoExportacao"
          value={consentimentoExportacao ? "on" : ""}
        />
      </fieldset>

      <Button type="submit">Salvar e continuar para o cadastro clínico</Button>
    </Form>
  );
}
