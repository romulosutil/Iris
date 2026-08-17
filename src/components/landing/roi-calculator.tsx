"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Slider } from "@/components/ui/slider";
import {
  FAIXAS_PRECIFICACAO,
  calculateMonthlyFee,
} from "@/lib/billing/calculator";

/**
 * Rótulos das faixas derivados de `FAIXAS_PRECIFICACAO`, nunca digitados à mão.
 * Antes este componente reimplementava as três faixas em JSX e num `if/else`
 * próprio — preço duplicado em componente é exatamente como o valor exibido ao
 * cliente descola do valor cobrado quando a tabela muda num lugar só.
 */
const DEGRAUS = FAIXAS_PRECIFICACAO.map((faixa, indice, todas) => {
  const de = (todas[indice - 1]?.ateQuantidade ?? 0) + 1;
  const ate = faixa.ateQuantidade;
  return {
    chave: `${de}-${ate ?? "mais"}`,
    rotulo:
      ate === null
        ? `${de}+ fichas: R$ ${faixa.valorCentavos / 100}/mês`
        : `${de} a ${ate} fichas: R$ ${faixa.valorCentavos / 100}/mês`,
    de,
    ate,
  };
});

export function LandingRoiCalculator() {
  const [patients, setPatients] = useState<number>(25);

  // A conta é a MESMA função que emite a fatura (`src/lib/billing/calculator`),
  // com as faixas marginais oficiais — o simulador não tem aritmética própria.
  const monthlyPrice = calculateMonthlyFee(patients);
  const avgPricePerPatient = (monthlyPrice / patients).toFixed(2);
  const hoursSaved = (patients * 2.5).toFixed(1);
  const moneySaved = Math.round(patients * 2.5 * 60);

  return (
    <section
      id="calculadora"
      aria-labelledby="calculadora-title"
      className="mx-auto w-full max-w-[1800px] space-y-12 px-4 py-16 sm:px-8 sm:py-24 md:space-y-16 lg:px-12 2xl:px-20"
    >
      <div className="mx-auto max-w-3xl space-y-3 text-center lg:max-w-4xl">
        <div className="inline-block rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--status-success-bg,#C8E6C9)] px-3.5 py-1 font-mono text-xs font-bold uppercase shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)]">
          Preço
        </div>
        <h2
          id="calculadora-title"
          className="font-display text-3xl font-extrabold text-[var(--text-primary,#1A1A1A)] sm:text-4xl md:text-5xl"
        >
          Você paga por ficha ativa. Nunca por quem trabalha nela.
        </h2>
        <p className="text-base font-medium text-[var(--text-secondary,#71717A)] sm:text-lg">
          A conta da clínica, a equipe inteira e o histórico não custam nada.
          Ficha ativa é a que foi cadastrada no mês ou teve movimento nele —
          sessão, check-in, evolução ou evidência aprovada. Puxe a barra e veja
          a sua conta.
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-10 2xl:max-w-[1720px] 2xl:gap-14">
        {/* Slider & Regras de Degrau */}
        <div className="flex flex-col justify-between rounded-[var(--radius-md,6px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-white p-6 shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] sm:p-8 lg:col-span-7 lg:p-10">
          <div className="space-y-6 sm:space-y-8">
            {/* Slider de Pacientes */}
            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <label
                  htmlFor="patient-slider"
                  className="font-display text-lg font-bold text-[var(--text-primary,#1A1A1A)]"
                >
                  Fichas ativas no mês (cadastradas ou com movimento):
                </label>
                <span className="self-start rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--action-primary,#F2B705)] px-4 py-1 font-mono text-2xl font-black shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)] sm:self-auto">
                  {patients} Fichas
                </span>
              </div>

              <Slider
                id="patient-slider"
                min={5}
                max={100}
                step={1}
                value={[patients]}
                onValueChange={(val) => setPatients(val[0] ?? 25)}
                aria-label="Selecione a quantidade de fichas ativas no mês"
              />
              <div className="flex justify-between font-mono text-xs font-bold text-gray-600">
                <span>5 fichas</span>
                <span>50 fichas</span>
                <span>100 fichas</span>
              </div>
            </div>

            {/* Degraus de Desconto por Volume */}
            <div className="space-y-2 rounded-[var(--radius-control,5px)] border border-gray-300 bg-gray-50 p-4 font-mono text-xs">
              <span className="block font-bold text-[var(--text-primary,#1A1A1A)] uppercase">
                💡 Uma ficha ativa a mais nunca reprecifica as anteriores:
              </span>
              <div className="grid grid-cols-1 gap-2 text-gray-700 sm:grid-cols-3">
                {DEGRAUS.map((degrau) => {
                  const ativo =
                    patients >= degrau.de &&
                    (degrau.ate === null || patients <= degrau.ate);
                  return (
                    <div
                      key={degrau.chave}
                      className={`rounded border p-2 ${ativo ? "bg-[var(--action-primary,#F2B705)] font-bold text-[#1A1A1A]" : "bg-white"}`}
                    >
                      {degrau.rotulo}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumo da Fatura Transparente */}
            <div className="font-body space-y-3 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--bg-app,#FBF9F5)] p-5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-700">
                  Fatura mensal estimada (Pix ou cartão):
                </span>
                <span className="font-mono text-base font-bold text-[var(--text-primary,#1A1A1A)] sm:text-lg">
                  R$ {monthlyPrice.toLocaleString("pt-BR")} / mês
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gray-300 pt-2">
                <span className="font-medium text-gray-700">
                  Custo médio por ficha ativa:
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  R$ {avgPricePerPatient.replace(".", ",")} /ficha/mês
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gray-300 pt-2">
                <span className="font-medium text-gray-700">
                  Terapeutas, fono, T.O. e coordenação:
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  Ilimitados · R$ 0 por assento
                </span>
              </div>
            </div>
          </div>

          {/* Card de Custódia Legal */}
          <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--status-info-bg,#B2DFDB)] p-4">
            <span className="shrink-0 text-2xl" aria-hidden="true">
              📜
            </span>
            <div className="text-xs leading-relaxed font-medium text-[var(--text-primary,#1A1A1A)]">
              <strong className="mb-0.5 block text-xs font-bold sm:text-sm">
                Garantia de Custódia Legal dos Dados:
              </strong>
              Ficha sem movimento no mês não entra na fatura — um mês inteiro de
              recesso fecha em R$ 0,00, com a base intacta. Os prontuários
              continuam acessíveis em modo{" "}
              <strong>somente-leitura gratuito e perpétuo</strong> com
              exportação em PDF/JSON a qualquer momento.
            </div>
          </div>
        </div>

        {/* Resultados do ROI Operacional */}
        <div className="flex flex-col justify-between rounded-[var(--radius-md,6px)] border-2 border-[var(--border-brutal,#1A1A1A)] bg-[var(--border-brutal,#1A1A1A)] p-6 text-white shadow-[0px_6px_0px_#F2B705] sm:p-8 lg:col-span-5 lg:p-10">
          <div className="space-y-6 sm:space-y-8">
            <span className="inline-block rounded border border-white bg-[var(--action-primary,#F2B705)] px-3.5 py-1.5 font-mono text-xs font-extrabold text-[var(--text-primary,#1A1A1A)]">
              📈 CONTA DE PADARIA — TROQUE PELOS SEUS NÚMEROS
            </span>

            <div className="space-y-6">
              <div>
                <span className="block font-mono text-xs font-bold text-gray-400 uppercase sm:text-sm">
                  O que hoje some montando relatório:
                </span>
                <span className="font-display text-4xl font-black text-[var(--action-primary,#F2B705)] sm:text-5xl lg:text-6xl">
                  {hoursSaved} Horas
                </span>
                <p className="mt-1 text-xs text-gray-300 sm:text-sm">
                  Chutamos 2,5 h por paciente a cada ciclo, entre garimpar
                  histórico, redigir e revisar. Se na sua clínica é menos,
                  ajuste para baixo — o número é seu, não nosso.
                </p>
              </div>

              <div className="border-t border-gray-800 pt-6">
                <span className="block font-mono text-xs font-bold text-gray-400 uppercase sm:text-sm">
                  As mesmas horas, em dinheiro:
                </span>
                <span className="font-display text-3xl font-black text-[var(--status-info-bg,#B2DFDB)] sm:text-4xl">
                  R$ {moneySaved.toLocaleString("pt-BR")} / mês
                </span>
                <p className="mt-1 text-xs text-gray-300 sm:text-sm">
                  A R$ 60 a hora de coordenação. É esta conta que justifica o
                  investimento — ou não justifica. Refaça com o custo-hora real
                  da sua equipe.
                </p>
              </div>

              <div className="border-t border-gray-800 pt-6">
                <p className="text-xs text-gray-300 sm:text-sm">
                  <strong className="text-white">
                    Sobre a tabela ao lado:
                  </strong>{" "}
                  ela ainda está sendo fechada com as primeiras clínicas. Quem
                  entra agora fecha{" "}
                  <strong className="text-white">preço de fundador</strong>,
                  combinado direto e abaixo dela.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-gray-800 pt-8">
            <Link
              href="/cadastro"
              className="focus-visible:outline-focus block flex min-h-[52px] w-full items-center justify-center rounded-[var(--radius-control,5px)] border-2 border-white bg-[var(--action-primary,#F2B705)] px-6 py-4 text-center text-base font-extrabold text-[var(--text-primary,#1A1A1A)] shadow-[var(--ds-shadow,3px_3px_0px_#FFF)] transition-all outline-none hover:bg-[#e0a800] sm:text-lg"
            >
              ✨ Criar Minha Conta Gratuita Agora
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
