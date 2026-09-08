import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

export const SparkleIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M8 1.5l1.4 3.7L13 6.6l-3.6 1.4L8 11.7 6.6 8 3 6.6l3.6-1.4L8 1.5z"
      fill="currentColor"
    />
  </svg>
);

export const CheckIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M3 8.5l3.2 3.2L13 4.5"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="square"
    />
  </svg>
);

export const LayersIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M8 2l6 3-6 3-6-3 6-3z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M2 9l6 3 6-3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

export const UndoIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M6 3L2.5 6.5 6 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="round"
    />
    <path
      d="M2.5 6.5H10a3.5 3.5 0 010 7H6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    />
  </svg>
);

export const PencilIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M10.5 2.5l3 3L6 13l-3.5.5L3 10l7.5-7.5z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

export const DiscardIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M4 4l8 8"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

export const ClockIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M8 5v3.2l2.2 1.3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ChevronDownIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="square"
    className={className}
    {...props}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const CloseIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="square"
    className={className}
    {...props}
  >
    <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
  </svg>
);

export const AlertTriangleIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M8 2l6 11H2L8 2z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M8 6.5v3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
    <path
      d="M8 11.2v.8"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

export const TrashIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M2.5 4h11"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
    <path
      d="M5.5 4V2.5h5V4M12.5 4v9.5h-9V4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
      strokeLinejoin="round"
    />
    <path
      d="M6.5 7v4M9.5 7v4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

export const ShieldIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M8 1.5l5.5 2v4.5c0 3.4-2.3 6.6-5.5 7.5-3.2-.9-5.5-4.1-5.5-7.5V3.5l5.5-2z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LockIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <rect
      x="3"
      y="7"
      width="10"
      height="7.5"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.5 7V4.5a3.5 3.5 0 017 0V7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const InfoIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="8" cy="5.2" r="0.9" fill="currentColor" />
    <path
      d="M8 7.5v4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

export const MoreHorizontalIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="3.2" cy="8" r="1.4" fill="currentColor" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    <circle cx="12.8" cy="8" r="1.4" fill="currentColor" />
  </svg>
);

/* ------------------------------------------------------------------------ *
 * Iconografia de navegação e de ação.
 *
 * Mesma grade dos ícones acima — `viewBox` 16×16, traço `1.8`, `currentColor`
 * — para que ícone de nav e ícone de estado tenham o MESMO peso ótico quando
 * aparecem lado a lado (rail e badge de status na mesma linha do card).
 *
 * R-26 continua valendo: nenhum destes ícones é portador único de
 * significado. Todo lugar que os usa mantém o rótulo textual visível ou, no
 * rail colapsado, o `aria-label`/`title` do link. Eles entram `aria-hidden`
 * nos call-sites — aqui não carregam `role`.
 * ------------------------------------------------------------------------ */

/** Agenda — dia com marcação. O ponto (e não um sinal de adição) distingue de
 * `CalendarPlusIcon`, que é a AÇÃO de agendar. */
export const CalendarIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <rect
      x="2.5"
      y="4"
      width="11"
      height="9.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M2.5 7h11" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M5.5 2.2v2.6M10.5 2.2v2.6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
    <circle cx="6" cy="10.3" r="1" fill="currentColor" />
  </svg>
);

/** Ação de agendar — calendário + sinal de adição (substitui o "+" literal
 * que o rótulo carregava como texto). */
export const CalendarPlusIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <rect
      x="2.5"
      y="4"
      width="11"
      height="9.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M2.5 7h11" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M5.5 2.2v2.6M10.5 2.2v2.6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
    <path
      d="M8 8.7v3.2M6.4 10.3h3.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Sessões — caderno de registro (lombada à esquerda). Deliberadamente
 * diferente de `FileTextIcon` (Relatórios): caderno é o que se ESCREVE, folha
 * é o que se ENTREGA. */
export const NotebookIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <rect
      x="3"
      y="2"
      width="10"
      height="12"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M5.9 2v12" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M8.2 5.4h2.6M8.2 8h2.6M8.2 10.6h2.6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Relatórios — folha com canto dobrado. */
export const FileTextIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M9.4 2H3.5v12h9V5.1L9.4 2z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M9.2 2.3v3h3.1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M5.8 8.4h4.4M5.8 11h4.4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Pacientes — grupo. */
export const UsersIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="6" cy="5.3" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M1.6 13.8c0-2.6 2-4.4 4.4-4.4s4.4 1.8 4.4 4.4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M10.8 3.2a2.6 2.6 0 010 4.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M11.6 9.7c1.7.5 2.8 1.9 2.8 4.1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

/** Meu Perfil — pessoa única. */
export const UserIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="8" cy="5.2" r="2.8" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M2.8 14c0-2.9 2.3-5 5.2-5s5.2 2.1 5.2 5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

/** Cadastrar/convidar pessoa — pessoa + sinal de adição. */
export const UserPlusIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="6.2" cy="5.2" r="2.7" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M1.4 13.8c0-2.8 2.1-4.8 4.8-4.8.6 0 1.2.1 1.7.3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M12 9.4v4.4M9.8 11.6h4.4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Equipe — crachá (pessoa + credencial). Separa "quem trabalha aqui" de
 * "quem é atendido aqui" (`UsersIcon`), que no menu do rail aparecem a um
 * clique um do outro. */
export const IdBadgeIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <rect
      x="2"
      y="3"
      width="12"
      height="10"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="6" cy="6.9" r="1.6" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M3.7 11.2c0-1.3 1-2.1 2.3-2.1s2.3.8 2.3 2.1"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M10.2 6.4h2.2M10.2 9.2h2.2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
    />
  </svg>
);

/** Validação — prancheta com visto. Reaproveita o gesto do `CheckIcon` (dado
 * validado) dentro do suporte da fila. */
export const ClipboardCheckIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M5.6 3H3.2v11h9.6V3h-2.4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <rect
      x="5.6"
      y="1.7"
      width="4.8"
      height="2.6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M5.8 9.6l1.6 1.6 3-3.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Supervisão — observação. */
export const EyeIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M1.4 8S4 3.8 8 3.8 14.6 8 14.6 8 12 12.2 8 12.2 1.4 8 1.4 8z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

/** Dados da Clínica — o prédio, não uma engrenagem: o item edita a
 * IDENTIDADE da clínica (nome, CNPJ, marca), não preferências do app. */
export const BuildingIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M3 14V2.5h6.5V14"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M9.5 6.5H13V14"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M5.2 5.2h2.2M5.2 8h2.2M5.2 10.8h2.2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
    />
    <path
      d="M1.5 14h13"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Exportar Acervo — saída de dados. */
export const DownloadIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M8 2v7.6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
    <path
      d="M4.7 6.4L8 9.8l3.3-3.4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M2.5 12.8h11"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Assinatura — o plano cobrado, não a rubrica de um documento. */
export const CreditCardIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <rect
      x="1.6"
      y="3.5"
      width="12.8"
      height="9"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M1.6 6.6h12.8" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M4.2 9.9h3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
    />
  </svg>
);

/** Dúvidas — ajuda. */
export const HelpCircleIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M6.2 6.2A1.9 1.9 0 019.3 7.8c-.7.5-1.3.9-1.3 1.8"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
  </svg>
);

/** Administração — controles. Dois cursores, não engrenagem: os dentes da
 * engrenagem somem no traço de 1.8 a 16px. */
export const SlidersIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M2 5h2.2M7.8 5h6.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
    <circle cx="6" cy="5" r="1.8" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M2 11h6.2M11.8 11h2.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
    <circle cx="10" cy="11" r="1.8" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

/** Sair — porta com seta para fora. */
export const LogOutIcon = ({
  size = "1em",
  className,
  ...props
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M6.2 2.5H2.5v11h3.7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M9.8 5.2L13 8l-3.2 2.8"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M12.6 8H5.8"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Menu (hambúrguer) — gatilho do Drawer/mais destinos. Traço `2.2` porque
 * este aparece em 22px na `BottomNav`, não em 18px. */
export const MenuIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <path
      d="M2.5 4h11M2.5 8h11M2.5 12h11"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
    />
  </svg>
);

/** Marca nos PDFs — o logotipo enviado (#258). Moldura de imagem, e não uma
 * paleta: o que a tela recebe é um ARQUIVO de marca (os bytes que o
 * renderizador embute como `data:` URI); a cor primária é acessório. Paleta a
 * 16px com traço 1.8 também vira borrão. */
export const ImageIcon = ({ size = "1em", className, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    {...props}
  >
    <rect
      x="2"
      y="3"
      width="12"
      height="10"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="5.7" cy="6.4" r="1.2" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M2.4 11.8l3.3-3.1 2.1 2 2.5-2.5 3.3 3.3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);
