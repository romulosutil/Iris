"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { rotuloAte, rotuloDesde, rotuloPonto } from "./rotulos";
import {
  ORDEM_EIXOS,
  type DadosEixoRadar,
  type ResultadoEspectro,
} from "@/lib/evidence/espectro";

/**
 * Hexágono do Espectro — a assinatura visual do prontuário.
 *
 * Lê de dentro para fora: um vértice perto do centro diz que, naquele eixo, os
 * alvos do PEI ainda saem com apoio; perto da borda, que saem independentes.
 * O que move o vértice é registro validado — evidência aprovada pelo terapeuta
 * e confirmada na revisão do coordenador —, nunca inferência do agente.
 *
 * Três coisas que este gráfico se recusa a fazer:
 *
 * 1. **Desenhar vértice em eixo sem dado.** Eixo sem alvo e eixo sem registro
 *    saem do polígono e ganham marcador vazado no aro, com o motivo escrito ao
 *    lado. Colar o vértice no centro afirmaria "apoio máximo" onde ninguém
 *    mediu nada.
 * 2. **Inventar variação.** A diferença para a sessão anterior só aparece
 *    quando os dois lados foram medidos.
 * 3. **Esconder alvo que não cai em eixo nenhum.** Ele é contado no rodapé.
 */

export const CENTRO = 150;
export const RAIO_MAX = 110;
const ANEIS = [0.2, 0.4, 0.6, 0.8];

export interface PosicaoEixo {
  x: number;
  y: number;
}

/** Primeiro eixo no topo, os demais de 60 em 60 graus no sentido horário. */
export function posicaoNoEixo(
  indice: number,
  raioRelativo: number,
): PosicaoEixo {
  const angulo = ((indice * 60 - 90) * Math.PI) / 180;
  return {
    x: CENTRO + RAIO_MAX * raioRelativo * Math.cos(angulo),
    y: CENTRO + RAIO_MAX * raioRelativo * Math.sin(angulo),
  };
}

export interface VerticeEspectro extends PosicaoEixo {
  eixo: DadosEixoRadar["eixo"];
  rotulo: string;
  valor: number;
  indice: number;
}

/**
 * Vértices do polígono. Só entram os eixos com `valor` numérico: `null` é
 * ausência de medida, e ausência de medida não tem posição no gráfico.
 */
export function verticesMedidos(eixos: DadosEixoRadar[]): VerticeEspectro[] {
  return eixos.flatMap((e, indice) => {
    if (e.valor === null) return [];
    const p = posicaoNoEixo(indice, e.valor / 100);
    return [{ ...p, eixo: e.eixo, rotulo: e.rotulo, valor: e.valor, indice }];
  });
}

/** Diferença em pontos, ou `null` se qualquer um dos dois lados não foi medido. */
export function variacao(
  atual: number | null,
  anterior: number | null | undefined,
): number | null {
  if (atual === null || anterior === null || anterior === undefined)
    return null;
  return atual - anterior;
}

function formatarVariacao(delta: number): string {
  // "±0" e não "0": ao lado de "+20" um zero solto se lê como valor do eixo,
  // não como variação.
  if (delta === 0) return "±0";
  // Sinal de menos tipográfico (U+2212): o hífen fica curto demais ao lado do
  // "+" e some na varredura rápida.
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/** Por que o eixo não tem número — motivos diferentes pedem ações diferentes. */
function rotuloSemDado(e: DadosEixoRadar): "Sem alvo" | "Sem registro" {
  return e.alvos === 0 ? "Sem alvo" : "Sem registro";
}

function poligono(vertices: VerticeEspectro[]): string {
  return vertices.map((v) => `${v.x},${v.y}`).join(" ");
}

function anel(raioRelativo: number): string {
  return ORDEM_EIXOS.map((_, i) => {
    const p = posicaoNoEixo(i, raioRelativo);
    return `${p.x},${p.y}`;
  }).join(" ");
}

interface GraficoEspectroProps {
  espectro: ResultadoEspectro;
  espectroAnterior?: ResultadoEspectro | null;
  sessaoAtiva: number;
  sessaoAnterior?: number | null;
}

export function GraficoEspectro({
  espectro,
  espectroAnterior,
  sessaoAtiva,
  sessaoAnterior,
}: GraficoEspectroProps) {
  const { eixos, naoClassificados, niveisNaoClassificados } = espectro;

  const anteriorPorEixo = React.useMemo(() => {
    const mapa = new Map<DadosEixoRadar["eixo"], number | null>();
    for (const e of espectroAnterior?.eixos ?? []) mapa.set(e.eixo, e.valor);
    return mapa;
  }, [espectroAnterior]);

  const comparando = espectroAnterior != null && sessaoAnterior != null;

  const linhas = eixos.map((e) => ({
    ...e,
    delta: comparando ? variacao(e.valor, anteriorPorEixo.get(e.eixo)) : null,
  }));

  const vertices = verticesMedidos(eixos);
  const verticesAnteriores = espectroAnterior
    ? verticesMedidos(espectroAnterior.eixos)
    : [];

  const cabecalho = (
    <header className="flex flex-col gap-1">
      <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
        Espectro do paciente
      </h3>
      <p className="max-w-prose text-sm text-[var(--text-secondary)]">
        Quanto dos alvos do PEI já aparecem com independência nos registros
        validados {rotuloAte(sessaoAtiva)}. Não é diagnóstico nem prognóstico.
      </p>
    </header>
  );

  // Sem nenhum eixo medido o polígono viraria um ponto no centro — uma figura
  // que parece dado ("está tudo no mínimo") sendo, na verdade, ausência dele.
  if (vertices.length === 0) {
    return (
      <section className="flex flex-col gap-4 rounded-[var(--radius-md)] border-[length:var(--border-brutal-width)] border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--elevation-2)]">
        {cabecalho}
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Nenhum alvo com nível de ajuda registrado até esta sessão. O hexágono
          aparece quando a primeira evidência com nível de ajuda for aprovada na
          revisão.
        </p>
        <ListaEixos linhas={linhas} comparando={false} />
        <RodapeNaoClassificados quantidade={naoClassificados} />
        <RodapeNiveisNaoClassificados quantidade={niveisNaoClassificados} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-[var(--radius-md)] border-[length:var(--border-brutal-width)] border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--elevation-2)]">
      {cabecalho}

      {/*
        A geometria é decorativa: quem lê com leitor de tela recebe a tabela
        `sr-only` abaixo, com os mesmos números. `viewBox` + `max-w` fazem o
        desenho encolher junto com a tela — a versão anterior era 300px fixos
        com rótulos projetados para fora e estourava a lateral no celular.
      */}
      <div className="mx-auto w-full max-w-[320px]" aria-hidden="true">
        <svg viewBox="0 0 300 300" className="h-auto w-full">
          {ANEIS.map((r) => (
            <polygon
              key={r}
              points={anel(r)}
              fill="none"
              stroke="var(--border-muted)"
              strokeWidth="1"
            />
          ))}

          <polygon
            points={anel(1)}
            fill="none"
            stroke="var(--border-brutal)"
            strokeWidth="2"
          />

          {ORDEM_EIXOS.map((eixo, i) => {
            const extremo = posicaoNoEixo(i, 1);
            const semDado = eixos[i]?.valor === null;
            return (
              <line
                key={eixo}
                x1={CENTRO}
                y1={CENTRO}
                x2={extremo.x}
                y2={extremo.y}
                stroke="var(--border-muted)"
                strokeWidth="1"
                strokeDasharray={semDado ? "3,3" : undefined}
              />
            );
          })}

          {/* Sessão anterior: contorno tracejado, sem preenchimento. O ganho
              da sessão é a distância entre as duas linhas. */}
          {verticesAnteriores.length >= 3 ? (
            <polygon
              points={poligono(verticesAnteriores)}
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth="1.5"
              strokeDasharray="5,4"
            />
          ) : null}

          <polygon
            points={poligono(vertices)}
            fill="var(--color-raw-gold-500)"
            fillOpacity="0.4"
            stroke="var(--border-brutal)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {vertices.map((v) => (
            <circle
              key={v.eixo}
              cx={v.x}
              cy={v.y}
              r="4.5"
              fill="var(--color-raw-gold-700)"
              stroke="var(--border-brutal)"
              strokeWidth="1.5"
            />
          ))}

          {/* Eixo sem medida: marcador vazado no aro, longe do polígono. Nunca
              um ponto no centro, que se leria como desempenho mínimo. */}
          {ORDEM_EIXOS.map((eixo, i) => {
            if (eixos[i]?.valor !== null) return null;
            const p = posicaoNoEixo(i, 1);
            return (
              <rect
                key={`sem-dado-${eixo}`}
                x={p.x - 4}
                y={p.y - 4}
                width="8"
                height="8"
                fill="var(--surface-card)"
                stroke="var(--border-brutal)"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
      </div>

      <p className="text-center text-xs text-[var(--text-secondary)]">
        Borda: o alvo sai independente. Centro: o alvo precisa do apoio máximo
        do protocolo.
        {comparando && sessaoAnterior !== undefined
          ? ` Linha tracejada: ${rotuloPonto(sessaoAnterior)}.`
          : ""}
      </p>

      <ListaEixos linhas={linhas} comparando={comparando} />

      {comparando && sessaoAnterior !== undefined ? (
        <p className="text-xs text-[var(--text-secondary)]">
          Variação {rotuloDesde(sessaoAnterior)}, em pontos. Eixo sem medida nas
          duas sessões não tem variação.
        </p>
      ) : null}

      <RodapeNaoClassificados quantidade={naoClassificados} />
      <RodapeNiveisNaoClassificados quantidade={niveisNaoClassificados} />

      <div className="flex flex-wrap gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variante="secundaria">Ver em tabela</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogTitle>Espectro em tabela</DialogTitle>
            <DialogDescription>
              {rotuloPonto(sessaoAtiva)}: independência documentada, alvos e
              evidências por eixo.
            </DialogDescription>
            <div className="mt-4 max-h-[60vh] overflow-auto">
              <TabelaEspectro eixos={eixos} />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variante="terciaria">Como este número é calculado</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogTitle>Como este número é calculado</DialogTitle>
            <DialogDescription>
              A conta inteira, para que ninguém precise confiar no gráfico sem
              conferir.
            </DialogDescription>
            <div className="mt-4 flex max-h-[60vh] flex-col gap-3 overflow-auto text-sm text-[var(--text-primary)]">
              <p>
                Cada alvo do PEI recebe uma nota de independência entre 0 e 100,
                a partir do nível de ajuda registrado na última vez em que o
                alvo apareceu numa evidência aprovada. Sem ajuda nenhuma vale
                100; o apoio máximo previsto pelo protocolo vale 0.
              </p>
              <p>
                O valor do eixo é a média simples desses alvos. Alvo sem
                registro de nível de ajuda fica fora da média — não entra como
                zero.
              </p>
              <p>
                Só entra evidência aprovada pelo terapeuta e confirmada na
                revisão. Sugestão do agente que ainda não foi validada não move
                o gráfico, e meta candidata a dominada não conta como dominada
                até o coordenador concluir.
              </p>
              <p>
                O gráfico não pontua protocolo, não projeta tendência e não
                substitui a leitura do instrumento formal.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/*
        `sr-only` vai no wrapper, não na `<table>`: as regras da classe são
        `width:1px` + `overflow:hidden`, e uma tabela com layout automático
        ignora a largura e cresce até caber o conteúdo. Medido no Storybook em
        375px — a tabela invisível empurrava a página para 782px de rolagem
        horizontal.
      */}
      <div className="sr-only">
        <table>
          <caption>
            Espectro por eixo, acumulado {rotuloAte(sessaoAtiva)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Eixo</th>
              <th scope="col">Independência documentada</th>
              {comparando ? <th scope="col">Variação</th> : null}
              <th scope="col">Alvos</th>
              <th scope="col">Dominados</th>
              <th scope="col">Candidatos</th>
              <th scope="col">Evidências</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((e) => (
              <tr key={e.eixo}>
                <td>{e.rotulo}</td>
                <td>{e.valor === null ? rotuloSemDado(e) : `${e.valor}%`}</td>
                {comparando ? (
                  <td>
                    {e.delta === null
                      ? "Sem comparação"
                      : e.delta === 0
                        ? "Estável"
                        : e.delta > 0
                          ? `${e.delta} pontos acima`
                          : `${Math.abs(e.delta)} pontos abaixo`}
                  </td>
                ) : null}
                <td>{e.alvos}</td>
                <td>{e.dominados}</td>
                <td>{e.candidatos}</td>
                <td>{e.contagemEvidencias}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ListaEixos({
  linhas,
  comparando,
}: {
  linhas: Array<DadosEixoRadar & { delta: number | null }>;
  comparando: boolean;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {linhas.map((e) => (
        <li
          key={e.eixo}
          className="flex flex-col gap-0.5 border-t border-l-0 border-[var(--border-muted)] pt-2 first:border-t-0 first:pt-0 sm:border-t sm:pt-2 sm:first:border-t sm:first:pt-2"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-[var(--text-primary)]">
              {e.rotulo}
            </span>
            <span className="flex items-baseline gap-2">
              {e.valor === null ? (
                <span className="font-mono text-sm text-[var(--text-secondary)]">
                  {rotuloSemDado(e)}
                </span>
              ) : (
                <span className="font-mono text-base font-bold text-[var(--text-primary)]">
                  {e.valor}%
                </span>
              )}
              {comparando && e.delta !== null ? (
                <span
                  className={
                    e.delta > 0
                      ? "font-mono text-xs font-bold text-[var(--status-success-fg)]"
                      : e.delta < 0
                        ? "font-mono text-xs font-bold text-[var(--status-error-fg)]"
                        : "font-mono text-xs text-[var(--text-secondary)]"
                  }
                >
                  {formatarVariacao(e.delta)}
                </span>
              ) : null}
            </span>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">
            {e.alvos === 0
              ? "Nenhum alvo do PEI neste eixo"
              : `${e.alvos} ${e.alvos === 1 ? "alvo" : "alvos"} · ${e.medidos} com registro · ${e.dominados} ${e.dominados === 1 ? "dominado" : "dominados"}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TabelaEspectro({ eixos }: { eixos: DadosEixoRadar[] }) {
  return (
    <table className="w-full border-collapse border border-[var(--border-brutal)] text-left text-sm">
      <thead>
        <tr className="bg-[var(--surface-elevated)]">
          {[
            "Eixo",
            "Independência",
            "Alvos",
            "Com registro",
            "Dominados",
            "Candidatos",
            "Evidências",
          ].map((h) => (
            <th
              key={h}
              scope="col"
              className="border border-[var(--border-brutal)] p-2 font-bold"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {eixos.map((e) => (
          <tr key={e.eixo}>
            <td className="border border-[var(--border-brutal)] p-2">
              {e.rotulo}
            </td>
            <td className="border border-[var(--border-brutal)] p-2 font-mono">
              {e.valor === null ? rotuloSemDado(e) : `${e.valor}%`}
            </td>
            <td className="border border-[var(--border-brutal)] p-2 font-mono">
              {e.alvos}
            </td>
            <td className="border border-[var(--border-brutal)] p-2 font-mono">
              {e.medidos}
            </td>
            <td className="border border-[var(--border-brutal)] p-2 font-mono">
              {e.dominados}
            </td>
            <td className="border border-[var(--border-brutal)] p-2 font-mono">
              {e.candidatos}
            </td>
            <td className="border border-[var(--border-brutal)] p-2 font-mono">
              {e.contagemEvidencias}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * #558 G-6 (a) — registro cujo nível de ajuda não pertence à taxonomia do
 * protocolo. NÃO entra na média do eixo (viraria progresso inventado) e NÃO
 * vira 0 (que significa "independente"): sai daqui como número explícito, com
 * o que fazer a respeito. Decidir contar sem mostrar seria devolver o silêncio
 * por outra porta — que é exatamente o defeito que a #558 fecha.
 */
function RodapeNiveisNaoClassificados({ quantidade }: { quantidade: number }) {
  if (quantidade <= 0) return null;
  return (
    <p className="text-xs text-[var(--text-secondary)]">
      {quantidade === 1
        ? "1 registro com nível de ajuda fora da taxonomia do protocolo não entra"
        : `${quantidade} registros com nível de ajuda fora da taxonomia do protocolo não entram`}{" "}
      no cálculo — o nível informado não existe na escala declarada, e um valor
      não medido nunca é contado como independência. Ajuste a taxonomia do
      protocolo ou corrija o nível na revisão da sessão.
    </p>
  );
}

function RodapeNaoClassificados({ quantidade }: { quantidade: number }) {
  if (quantidade <= 0) return null;
  return (
    <p className="text-xs text-[var(--text-secondary)]">
      {quantidade} {quantidade === 1 ? "alvo sem eixo" : "alvos sem eixo"}{" "}
      {quantidade === 1 ? "definido não entra" : "definidos não entram"} no
      gráfico. Vincule um marco de protocolo à meta no PEI para que{" "}
      {quantidade === 1 ? "ela apareça" : "elas apareçam"} aqui.
    </p>
  );
}
