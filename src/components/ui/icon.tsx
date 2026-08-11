import * as React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

export const SparkleIcon = ({ size = "1em", className, ...props }: IconProps) => (
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

export const LayersIcon = ({ size = "1em", className, ...props }: IconProps) => (
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

export const PencilIcon = ({ size = "1em", className, ...props }: IconProps) => (
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

export const DiscardIcon = ({ size = "1em", className, ...props }: IconProps) => (
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

export const ChevronDownIcon = ({ size = "1em", className, ...props }: IconProps) => (
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

export const AlertTriangleIcon = ({ size = "1em", className, ...props }: IconProps) => (
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
    <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    <path d="M8 11.2v.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
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
    <path d="M2.5 4h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    <path
      d="M5.5 4V2.5h5V4M12.5 4v9.5h-9V4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
      strokeLinejoin="round"
    />
    <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
  </svg>
);

