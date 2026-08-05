"use client";

import * as React from "react";
import { FUSO_CLINICA } from "@/app/(app)/agenda/fuso";

export interface CalendarContextValue {
  fuso: string;
  podeGerir: boolean;
}

const CalendarContext = React.createContext<CalendarContextValue>({
  fuso: FUSO_CLINICA,
  podeGerir: true,
});

export function useCalendarContext() {
  return React.useContext(CalendarContext);
}

export interface CalendarRootProps {
  fuso?: string;
  podeGerir?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function CalendarRoot({
  fuso = FUSO_CLINICA,
  podeGerir = true,
  children,
  className,
}: CalendarRootProps) {
  const value = React.useMemo(() => ({ fuso, podeGerir }), [fuso, podeGerir]);

  return (
    <CalendarContext.Provider value={value}>
      <div className={className ?? "w-full space-y-6"}>{children}</div>
    </CalendarContext.Provider>
  );
}
