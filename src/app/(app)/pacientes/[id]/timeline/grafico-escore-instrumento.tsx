import * as React from "react";
import {
  derivarFaixaDeCorte,
  type InstrumentoAplicacaoLinha,
} from "../tcc/instrumento-lista";

/**
 * Série temporal de escore de instrumento padronizado (PHQ-9 / GAD-7) — a
 * medida de desfecho que a prática de TCC usa, e que a aba Evolução do
 * paciente TCC não tinha.
 *
 * O gráfico NÃO interpreta: plota o escore que o instrumento produziu e nomeia
 * a faixa de corte pública correspondente. Nenhuma linha de tendência, nenhuma
 * projeção, nenhum "melhorou X%" — a leitura clínica é do terapeuta.
 *
 * Não é um componente de cliente: nada aqui tem estado ou handler, e marcá-lo
 * como cliente arrastaria `../tcc/instrumento-lista` (e com ele `Table` e
 * `EmptyState`) para o bundle só para reusar `derivarFaixaDeCorte`.
 */

/** Tetos oficiais. PHQ-9 tem 9 itens 0-3; GAD-7 tem 7 itens 0-3. */
export const ESCALA_MAXIMA = { phq9: 27, gad7: 21 } as const;

const ROTULO_TIPO = { phq9: "PHQ-9", gad7: "GAD-7" } as const;

const LARGURA = 640;
const ALTURA = 220;
const MARGEM = { topo: 16, direita: 16, base: 32, esquerda: 40 };

function formatarData(valor: Date | string): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime())
    ? String(valor)
    : d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export function GraficoEscoreInstrumento({
  tipoInstrumento,
  aplicacoes,
}: {
  tipoInstrumento: InstrumentoAplicacaoLinha["tipoInstrumento"];
  aplicacoes: InstrumentoAplicacaoLinha[];
}) {
  const rotulo = ROTULO_TIPO[tipoInstrumento];
  const maximo = ESCALA_MAXIMA[tipoInstrumento];
  const tituloId = `escore-${tipoInstrumento}-titulo`;

  // Filtra ANTES de tudo: PHQ-9 (0-27) e GAD-7 (0-21) têm tetos diferentes, e
  // um escore da outra escala plotado aqui viraria uma altura que não
  // significa nada.
  const daSerie = aplicacoes
    .filter((a) => a.tipoInstrumento === tipoInstrumento)
    .sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
    );

  // Escore ausente é ausência de medida, nunca zero: plotado como 0 o gráfico
  // desenharia uma queda que representa melhora clínica que não aconteceu.
  const pontos = daSerie.filter(
    (a): a is InstrumentoAplicacaoLinha & { escoreTotal: number } =>
      a.escoreTotal !== null,
  );
  const semEscore = daSerie.length - pontos.length;

  const moldura = (conteudo: React.ReactNode) => (
    <section
      aria-labelledby={tituloId}
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border-2 border-[var(--border-brutal)] bg-[var(--surface-card)] p-6 shadow-[var(--ds-shadow)]"
    >
      <h3
        id={tituloId}
        className="font-display text-lg font-bold text-[var(--text-primary)]"
      >
        {rotulo} ao longo do tempo
      </h3>
      {conteudo}
      {semEscore > 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {semEscore}{" "}
          {semEscore === 1
            ? "aplicação sem escore registrado — fora do gráfico"
            : "aplicações sem escore registrado — fora do gráfico"}
          .
        </p>
      ) : null}
    </section>
  );

  if (pontos.length === 0) {
    return moldura(
      <p className="text-sm text-[var(--text-secondary)]">
        Nenhuma aplicação de {rotulo} registrada com escore para este paciente.
      </p>,
    );
  }

  if (pontos.length === 1) {
    const unico = pontos[0]!;
    return moldura(
      <div className="flex flex-col gap-1">
        <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
          {unico.escoreTotal}
          <span className="text-base font-medium text-[var(--text-secondary)]">
            {" "}
            / {maximo}
          </span>
        </p>
        <p className="text-sm text-[var(--text-primary)]">
          {derivarFaixaDeCorte(tipoInstrumento, unico.escoreTotal)} ·{" "}
          {formatarData(unico.criadoEm)}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Uma única aplicação — ainda não há série para comparar.
        </p>
      </div>,
    );
  }

  const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;

  const coords = pontos.map((a, i) => ({
    ...a,
    x: MARGEM.esquerda + (larguraUtil * i) / (pontos.length - 1),
    y: MARGEM.topo + alturaUtil * (1 - a.escoreTotal / maximo),
  }));

  return moldura(
    <div className="flex flex-col gap-4">
      {/*
        `aria-hidden` porque o SVG não é a leitura canônica: a tabela abaixo
        carrega o mesmo dado em texto. Duplicar no leitor de tela só faria a
        pessoa ouvir a série duas vezes.

        A linha e os pontos são tinta (`currentColor` = `--text-primary`), não
        ouro: o ouro é a cor de ação primária do DS, e usá-lo como marca de
        dado repetiria a confusão de papel que a auditoria apontou no banner do
        scrubber. Severidade nunca é codificada em cor aqui — quem a nomeia é a
        coluna "Faixa" da tabela.
      */}
      <div className="overflow-x-auto" aria-hidden="true">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          className="h-auto w-full min-w-[320px] text-[var(--text-primary)]"
        >
          <line
            x1={MARGEM.esquerda}
            y1={MARGEM.topo}
            x2={MARGEM.esquerda}
            y2={ALTURA - MARGEM.base}
            stroke="var(--border-brutal)"
            strokeWidth="2"
          />
          <line
            x1={MARGEM.esquerda}
            y1={ALTURA - MARGEM.base}
            x2={LARGURA - MARGEM.direita}
            y2={ALTURA - MARGEM.base}
            stroke="var(--border-brutal)"
            strokeWidth="2"
          />
          {/* Teto e piso da escala: sem eles a altura de um ponto não tem
              referência, e a mesma subida "parece" igual em PHQ-9 e GAD-7. */}
          <text
            x={MARGEM.esquerda - 8}
            y={MARGEM.topo + 4}
            textAnchor="end"
            className="fill-[var(--text-secondary)] font-mono text-[12px]"
          >
            {maximo}
          </text>
          <text
            x={MARGEM.esquerda - 8}
            y={ALTURA - MARGEM.base}
            textAnchor="end"
            className="fill-[var(--text-secondary)] font-mono text-[12px]"
          >
            0
          </text>
          <polyline
            points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          {coords.map((c) => (
            <circle
              key={c.id}
              cx={c.x}
              cy={c.y}
              r="5"
              fill="var(--surface-card)"
              stroke="currentColor"
              strokeWidth="3"
            />
          ))}
        </svg>
      </div>

      {/*
        A tabela é a leitura canônica: visível, não `sr-only`. Ela carrega o
        que o SVG não consegue dizer sem rótulo minúsculo — data, escore e
        faixa de corte de cada aplicação.
      */}
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">
          Aplicações de {rotulo} com escore e faixa de corte
        </caption>
        <thead>
          <tr>
            <th scope="col" className="pb-1 font-bold">
              Data
            </th>
            <th scope="col" className="pb-1 font-bold">
              Escore
            </th>
            <th scope="col" className="pb-1 font-bold">
              Faixa
            </th>
          </tr>
        </thead>
        <tbody>
          {coords.map((c) => (
            <tr key={c.id} className="border-t border-[var(--border-muted)]">
              <td className="py-1.5">{formatarData(c.criadoEm)}</td>
              <td className="py-1.5 font-mono font-bold">
                {c.escoreTotal} / {maximo}
              </td>
              <td className="py-1.5">
                {derivarFaixaDeCorte(tipoInstrumento, c.escoreTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
}
