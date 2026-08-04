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
      className="w-full py-16 sm:py-24 px-4 sm:px-8 lg:px-12 2xl:px-20 max-w-[1800px] mx-auto space-y-12 md:space-y-16"
    >
      <div className="text-center max-w-3xl lg:max-w-4xl mx-auto space-y-3">
        <div className="inline-block font-mono text-xs font-bold uppercase bg-[var(--status-success-bg,#C8E6C9)] px-3.5 py-1 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)]">
          Preço
        </div>
        <h2
          id="calculadora-title"
          className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-[var(--text-primary,#1A1A1A)]"
        >
          Você paga por ficha ativa. Nunca por quem trabalha nela.
        </h2>
        <p className="text-[var(--text-secondary,#71717A)] font-medium text-base sm:text-lg">
          A conta da clínica, a equipe inteira e o histórico não custam nada. Ficha ativa é a que foi cadastrada no mês ou teve movimento nele — sessão, check-in, evolução ou evidência aprovada. Puxe a barra e veja a sua conta.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 2xl:gap-14 items-stretch w-full max-w-[1600px] 2xl:max-w-[1720px] mx-auto">
        {/* Slider & Regras de Degrau */}
        <div className="lg:col-span-7 border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-md,6px)] bg-white p-6 sm:p-8 lg:p-10 shadow-[var(--ds-shadow-hover,6px_6px_0px_#1A1A1A)] flex flex-col justify-between">
          <div className="space-y-6 sm:space-y-8">
            {/* Slider de Pacientes */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label
                  htmlFor="patient-slider"
                  className="font-display font-bold text-lg text-[var(--text-primary,#1A1A1A)]"
                >
                  Fichas ativas no mês (cadastradas ou com movimento):
                </label>
                <span className="font-mono text-2xl font-black bg-[var(--action-primary,#F2B705)] px-4 py-1 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)] self-start sm:self-auto">
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
              <div className="flex justify-between font-mono text-xs text-gray-600 font-bold">
                <span>5 fichas</span>
                <span>50 fichas</span>
                <span>100 fichas</span>
              </div>
            </div>

            {/* Degraus de Desconto por Volume */}
            <div className="p-4 bg-gray-50 border border-gray-300 rounded-[var(--radius-control,5px)] space-y-2 font-mono text-xs">
              <span className="font-bold text-[var(--text-primary,#1A1A1A)] block uppercase">
                💡 Uma ficha ativa a mais nunca reprecifica as anteriores:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-gray-700">
                {DEGRAUS.map((degrau) => {
                  const ativo =
                    patients >= degrau.de &&
                    (degrau.ate === null || patients <= degrau.ate);
                  return (
                    <div
                      key={degrau.chave}
                      className={`p-2 rounded border ${ativo ? "bg-[var(--action-primary,#F2B705)] font-bold text-[#1A1A1A]" : "bg-white"}`}
                    >
                      {degrau.rotulo}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumo da Fatura Transparente */}
            <div className="p-5 bg-[var(--bg-app,#FBF9F5)] border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] space-y-3 font-body text-sm">
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-700 font-medium">Fatura mensal estimada (Pix ou cartão):</span>
                <span className="font-mono font-bold text-[var(--text-primary,#1A1A1A)] text-base sm:text-lg">
                  R$ {monthlyPrice.toLocaleString("pt-BR")} / mês
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-300">
                <span className="text-gray-700 font-medium">Custo médio por ficha ativa:</span>
                <span className="font-mono font-bold text-emerald-700">
                  R$ {avgPricePerPatient.replace(".", ",")} /ficha/mês
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-300">
                <span className="text-gray-700 font-medium">Terapeutas, fono, T.O. e coordenação:</span>
                <span className="font-mono font-bold text-emerald-700">Ilimitados · R$ 0 por assento</span>
              </div>
            </div>
          </div>

          {/* Card de Custódia Legal */}
          <div className="mt-6 p-4 bg-[var(--status-info-bg,#B2DFDB)] border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-control,5px)] flex items-start gap-3">
            <span className="text-2xl shrink-0" aria-hidden="true">
              📜
            </span>
            <div className="text-xs text-[var(--text-primary,#1A1A1A)] font-medium leading-relaxed">
              <strong className="font-bold block mb-0.5 text-xs sm:text-sm">Garantia de Custódia Legal dos Dados:</strong>
              Ficha sem movimento no mês não entra na fatura — um mês inteiro de recesso fecha em R$ 0,00, com a base intacta. Os prontuários continuam acessíveis em modo <strong>somente-leitura gratuito e perpétuo</strong> com exportação em PDF/JSON a qualquer momento.
            </div>
          </div>
        </div>

        {/* Resultados do ROI Operacional */}
        <div className="lg:col-span-5 border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-md,6px)] bg-[var(--border-brutal,#1A1A1A)] text-white p-6 sm:p-8 lg:p-10 shadow-[0px_6px_0px_#F2B705] flex flex-col justify-between">
          <div className="space-y-6 sm:space-y-8">
            <span className="font-mono text-xs font-extrabold bg-[var(--action-primary,#F2B705)] text-[var(--text-primary,#1A1A1A)] px-3.5 py-1.5 rounded border border-white inline-block">
              📈 CONTA DE PADARIA — TROQUE PELOS SEUS NÚMEROS
            </span>

            <div className="space-y-6">
              <div>
                <span className="text-xs sm:text-sm text-gray-400 font-mono uppercase font-bold block">
                  O que hoje some montando relatório:
                </span>
                <span className="font-display font-black text-4xl sm:text-5xl lg:text-6xl text-[var(--action-primary,#F2B705)]">
                  {hoursSaved} Horas
                </span>
                <p className="text-xs sm:text-sm text-gray-300 mt-1">
                  Chutamos 2,5 h por paciente a cada ciclo, entre garimpar histórico, redigir e revisar. Se na sua clínica é menos, ajuste para baixo — o número é seu, não nosso.
                </p>
              </div>

              <div className="pt-6 border-t border-gray-800">
                <span className="text-xs sm:text-sm text-gray-400 font-mono uppercase font-bold block">
                  As mesmas horas, em dinheiro:
                </span>
                <span className="font-display font-black text-3xl sm:text-4xl text-[var(--status-info-bg,#B2DFDB)]">
                  R$ {moneySaved.toLocaleString("pt-BR")} / mês
                </span>
                <p className="text-xs sm:text-sm text-gray-300 mt-1">
                  A R$ 60 a hora de coordenação. É esta conta que justifica o investimento — ou não justifica. Refaça com o custo-hora real da sua equipe.
                </p>
              </div>

              <div className="pt-6 border-t border-gray-800">
                <p className="text-xs sm:text-sm text-gray-300">
                  <strong className="text-white">Sobre a tabela ao lado:</strong> ela ainda está sendo fechada com as primeiras clínicas. Quem entra agora fecha <strong className="text-white">preço de fundador</strong>, combinado direto e abaixo dela.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8 mt-8 border-t border-gray-800">
            <Link
              href="/cadastro"
              className="w-full block text-center bg-[var(--action-primary,#F2B705)] hover:bg-[#e0a800] text-[var(--text-primary,#1A1A1A)] font-extrabold text-base sm:text-lg py-4 px-6 rounded-[var(--radius-control,5px)] border-2 border-white shadow-[var(--ds-shadow,3px_3px_0px_#FFF)] transition-all min-h-[52px] flex items-center justify-center focus-visible:outline-focus outline-none"
            >
              ✨ Criar Minha Conta Gratuita Agora
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
