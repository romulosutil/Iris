"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { redefinirSenha } from "./actions";
import type { EstadoRedefinirSenha } from "./logic";

const SENHA_MIN = 12;
const SENHA_MAX = 128;

const ESTADO_INICIAL: EstadoRedefinirSenha | null = null;

/**
 * Formulário de `/redefinir-senha`.
 *
 * Fix round 1, Task 9 (finding C1 do review): antes este componente recebia
 * `token` via prop (lido de `searchParams` pela página) e chamava
 * `authClient.resetPassword` DIRETO do navegador — o token, portanto,
 * precisava existir em algum lugar visível ao JS do cliente (prop React,
 * estado, ou a própria URL de origem). Agora o token nunca sai do servidor:
 * fica só no cookie httpOnly gravado por `src/middleware.ts`, e este
 * componente não recebe mais `token` nenhum — só dispara a Server Action
 * `redefinirSenha` (`./actions.ts`), que lê o cookie no servidor
 * (`./logic.ts`). Por isso a troca de `authClient.resetPassword` (client)
 * para `useActionState` (server action) não é só estilo — é o mecanismo que
 * fecha C1.
 *
 * Fix round 1 (finding M7, indireto): o throttle por IP agora vive em
 * `./logic.ts` — não precisa de nada extra aqui, a Server Action já herda a
 * proteção.
 */
export function RedefinirSenhaForm() {
  const router = useRouter();
  const [estado, formAction, emAndamento] = useActionState(
    redefinirSenha,
    ESTADO_INICIAL,
  );
  const [senha, setSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [erroFormato, setErroFormato] = React.useState<string | undefined>(
    undefined,
  );
  const alertaRef = React.useRef<HTMLDivElement>(null);

  const erroServidor =
    estado && !estado.ok ? estado.error : undefined;
  const erro = erroFormato ?? erroServidor;

  // Fix round 1 (finding M2 do review): antes o efeito só reagia a MUDANÇA
  // de referência de `erro` — dois envios seguidos que resultassem no
  // MESMO texto de erro (ex.: "As senhas não conferem." duas vezes
  // seguidas) não refocavam o alerta na 2ª vez, porque a string era
  // idêntica e o efeito não disparava de novo. Uma revisão incrementada a
  // cada tentativa (sucesso ou falha) força o efeito a rodar mesmo quando o
  // texto do erro se repete.
  const [revisao, setRevisao] = React.useState(0);
  React.useEffect(() => {
    if (!erro) return;
    alertaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisao]);

  React.useEffect(() => {
    if (estado?.ok) router.push("/login?senhaAlterada=1");
  }, [estado, router]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    setRevisao((r) => r + 1);

    // Validação de FORMATO — mesma regra de `./logic.ts` (`validarNovaSenha`):
    // não depende de cookie/token, só do que foi digitado, então pode
    // interromper o envio e ter mensagem própria sem tocar a Server Action.
    if (senha.length < SENHA_MIN) {
      event.preventDefault();
      setErroFormato(`A senha precisa ter ao menos ${SENHA_MIN} caracteres.`);
      return;
    }
    if (senha.length > SENHA_MAX) {
      event.preventDefault();
      setErroFormato(`A senha pode ter no máximo ${SENHA_MAX} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      event.preventDefault();
      setErroFormato("As senhas não conferem.");
      return;
    }
    setErroFormato(undefined);
  }

  return (
    <div>
      {/* Fix round 1 (finding M6 do review): antes o foco era localizado via
          `containerRef.current?.querySelector('[role="alert"]')` —
          funcionava só porque o `Alert` interno do `Form` acontecia de
          renderizar esse role; qualquer refatoração do design system que
          trocasse a estrutura interna quebraria o foco em silêncio (sem erro
          de tipo, sem teste pegando). Por isso o `Alert` é renderizado AQUI,
          diretamente, com `ref` próprio — não delegado ao `error` prop do
          `Form` (que não expõe ref para o alerta que ele mesmo desenha). */}
      {erro ? (
        <Alert
          ref={alertaRef}
          severidade="erro"
          titulo="Não foi possível continuar"
          tabIndex={-1}
          className="mb-4"
        >
          {erro}
        </Alert>
      ) : null}

      <Form action={formAction} onSubmit={handleSubmit}>
        <Field
          label="Nova senha"
          htmlFor="senha"
          hint={`Mínimo ${SENHA_MIN} caracteres.`}
        >
          <Input
            id="senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            minLength={SENHA_MIN}
            maxLength={SENHA_MAX}
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-describedby="senha-hint"
            // Fix round 1 (finding M1 do review): antes `aria-invalid` era
            // setado em AMBOS os campos sempre que `erro` existia, mesmo
            // quando o erro era só da confirmação (ex.: "As senhas não
            // conferem." marcava a senha original como inválida também,
            // apesar de ela sozinha satisfazer todas as regras de formato).
            // Agora cada campo só é marcado inválido pela classe de erro que
            // é REALMENTE sobre ele.
            aria-invalid={
              erro === `A senha precisa ter ao menos ${SENHA_MIN} caracteres.` ||
              erro === `A senha pode ter no máximo ${SENHA_MAX} caracteres.` ||
              erro === "As senhas não conferem."
                ? true
                : undefined
            }
          />
        </Field>

        <Field label="Confirme a nova senha" htmlFor="confirmacao">
          <Input
            id="confirmacao"
            name="confirmacao"
            type="password"
            autoComplete="new-password"
            minLength={SENHA_MIN}
            maxLength={SENHA_MAX}
            required
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            aria-invalid={erro === "As senhas não conferem." ? true : undefined}
          />
        </Field>

        <Button type="submit" isLoading={emAndamento} disabled={emAndamento}>
          {emAndamento ? "Redefinindo…" : "Redefinir senha"}
        </Button>
      </Form>

      <p className="text-[var(--text-secondary)] mt-4 text-center text-sm">
        <Link
          href="/login"
          className="text-[var(--text-primary)] font-semibold underline underline-offset-2"
        >
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
