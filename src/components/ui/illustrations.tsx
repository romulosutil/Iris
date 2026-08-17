import * as React from "react";
import { cn } from "@/lib/cn";

export interface IllustrationProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

/**
 * CareTeamIllustration — Ilustração Line-Art de equipe de cuidado e terapeutas.
 * Estilo Soft Neubrutalism com traço escuro e acentos de cor acolhedores.
 */
export function CareTeamIllustration({
  size = 120,
  className,
  ...props
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("select-none", className)}
      {...props}
    >
      {/* Halo de fundo suave */}
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="var(--color-raw-mint-100, #e6f4f1)"
      />

      {/* Figura Terapeuta Esquerda (Amarelo Ouro) */}
      <circle
        cx="38"
        cy="44"
        r="12"
        fill="var(--color-raw-gold-300, #f8d46e)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />
      <path
        d="M20 78C20 66 28 60 38 60C48 60 56 66 56 78"
        fill="var(--surface-card, #FFFFFF)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Figura Terapeuta Direita (Violeta) */}
      <circle
        cx="82"
        cy="44"
        r="12"
        fill="var(--color-raw-violet-100, #f1e9f6)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />
      <path
        d="M64 78C64 66 72 60 82 60C92 60 100 66 100 78"
        fill="var(--surface-card, #FFFFFF)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Criança ao Centro (Menta) */}
      <circle
        cx="60"
        cy="54"
        r="10"
        fill="var(--color-raw-mint-300, #80cbc4)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />
      <path
        d="M45 84C45 74 52 70 60 70C68 70 75 74 75 84"
        fill="var(--color-raw-mint-500, #14857a)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Coração de Conexão Superior */}
      <path
        d="M60 25C60 25 55 18 49 20C44 22 44 28 47 32L60 42L73 32C76 28 76 22 71 20C65 18 60 25 60 25Z"
        fill="var(--color-raw-coral-500, #f25c54)"
        stroke="#1A1A1A"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Base sólida de apoio */}
      <line
        x1="16"
        y1="88"
        x2="104"
        y2="88"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * CareCalendarIllustration — Ilustração de rotina cumprida, agenda e tranquilidade.
 */
export function CareCalendarIllustration({
  size = 120,
  className,
  ...props
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("select-none", className)}
      {...props}
    >
      {/* Sombra de fundo do bloco */}
      <rect x="28" y="28" width="70" height="66" rx="8" fill="#1A1A1A" />

      {/* Bloco do Calendário Principal */}
      <rect
        x="24"
        y="24"
        width="70"
        height="66"
        rx="8"
        fill="var(--surface-card, #FFFFFF)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />

      {/* Topo do Calendário */}
      <path
        d="M24 32C24 27.5817 27.5817 24 32 24H86C90.4183 24 94 27.5817 94 32V40H24V32Z"
        fill="var(--color-raw-gold-500, #f2b705)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />

      {/* Argolas do fichário */}
      <rect x="38" y="16" width="6" height="14" rx="3" fill="#1A1A1A" />
      <rect x="74" y="16" width="6" height="14" rx="3" fill="#1A1A1A" />

      {/* Ícone de Check de Rotina Concluída */}
      <circle
        cx="59"
        cy="62"
        r="16"
        fill="var(--color-raw-mint-300, #b2dfdb)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />
      <path
        d="M51 62L56 67L67 56"
        stroke="#1A1A1A"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Estrelas de Celebração */}
      <path
        d="M18 36L20 42L26 44L20 46L18 52L16 46L10 44L16 42L18 36Z"
        fill="var(--color-raw-gold-500, #f2b705)"
        stroke="#1A1A1A"
        strokeWidth="1.5"
      />
      <path
        d="M102 68L103.5 72.5L108 74L103.5 75.5L102 80L100.5 75.5L96 74L100.5 72.5L102 68Z"
        fill="var(--color-raw-mint-500, #14857a)"
        stroke="#1A1A1A"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * ReviewClinicalIllustration — Prancheta com IA e olhar clínico cuidadoso do terapeuta.
 */
export function ReviewClinicalIllustration({
  size = 120,
  className,
  ...props
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("select-none", className)}
      {...props}
    >
      {/* Sombra da Prancheta */}
      <rect x="32" y="24" width="60" height="74" rx="6" fill="#1A1A1A" />

      {/* Prancheta */}
      <rect
        x="28"
        y="20"
        width="60"
        height="74"
        rx="6"
        fill="var(--surface-card, #FFFFFF)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />

      {/* Clip superior da prancheta */}
      <rect
        x="44"
        y="14"
        width="28"
        height="12"
        rx="3"
        fill="var(--color-raw-gold-500, #f2b705)"
        stroke="#1A1A1A"
        strokeWidth="2"
      />
      <circle cx="58" cy="20" r="2.5" fill="#1A1A1A" />

      {/* Linhas de anotações da sessão */}
      <line
        x1="38"
        y1="40"
        x2="66"
        y2="40"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="38"
        y1="50"
        x2="78"
        y2="50"
        stroke="#1A1A1A"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <line
        x1="38"
        y1="60"
        x2="72"
        y2="60"
        stroke="#1A1A1A"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* Selo de IA / Brilho com Olhar Clínico */}
      <circle
        cx="72"
        cy="72"
        r="14"
        fill="var(--color-raw-violet-100, #f1e9f6)"
        stroke="var(--color-raw-violet-500, #6a4c93)"
        strokeWidth="2.5"
        strokeDasharray="3 3"
      />
      {/* Faísca de IA */}
      <path
        d="M72 64L73.5 69.5L79 71L73.5 72.5L72 78L70.5 72.5L65 71L70.5 69.5L72 64Z"
        fill="var(--color-raw-violet-500, #6a4c93)"
      />
    </svg>
  );
}

/**
 * PatientProgressIllustration — Planta/Conquistas crescendo com carinho e acompanhamento.
 */
export function PatientProgressIllustration({
  size = 120,
  className,
  ...props
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("select-none", className)}
      {...props}
    >
      {/* Vaso de Planta / Base Sólida */}
      <path
        d="M44 76L48 94H72L76 76H44Z"
        fill="var(--color-raw-gold-300, #f8d46e)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <line
        x1="42"
        y1="76"
        x2="78"
        y2="76"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Caule Principal */}
      <path
        d="M60 76V34"
        stroke="#1A1A1A"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Folha Esquerda (Menta) */}
      <path
        d="M60 62C46 62 42 50 42 50C42 50 54 48 60 56"
        fill="var(--color-raw-mint-300, #b2dfdb)"
        stroke="#1A1A1A"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Folha Direita (Menta) */}
      <path
        d="M60 48C74 48 78 36 78 36C78 36 66 34 60 42"
        fill="var(--color-raw-mint-500, #14857a)"
        stroke="#1A1A1A"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Estrela / Conquista no Topo */}
      <circle
        cx="60"
        cy="24"
        r="9"
        fill="var(--color-raw-gold-500, #f2b705)"
        stroke="#1A1A1A"
        strokeWidth="2"
      />
      <path
        d="M60 18L61.5 22.5L66 24L61.5 25.5L60 30L58.5 25.5L54 24L58.5 22.5L60 18Z"
        fill="#1A1A1A"
      />
    </svg>
  );
}

/**
 * AudioMicIllustration — Gravador de áudio empático com ondas sonoras suaves.
 */
export function AudioMicIllustration({
  size = 120,
  className,
  ...props
}: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("select-none", className)}
      {...props}
    >
      {/* Microfone Principal */}
      <rect
        x="50"
        y="26"
        width="20"
        height="36"
        rx="10"
        fill="var(--color-raw-mint-300, #b2dfdb)"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />
      {/* Suporte em U */}
      <path
        d="M40 48C40 60 48 68 60 68C72 68 80 60 80 48"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Haste e Base */}
      <line
        x1="60"
        y1="68"
        x2="60"
        y2="84"
        stroke="#1A1A1A"
        strokeWidth="2.5"
      />
      <line
        x1="44"
        y1="84"
        x2="76"
        y2="84"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Ondas Sonoras Esquerda / Direita */}
      <path
        d="M30 40C26 46 26 54 30 60"
        stroke="var(--color-raw-violet-500, #6a4c93)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M90 40C94 46 94 54 90 60"
        stroke="var(--color-raw-violet-500, #6a4c93)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
