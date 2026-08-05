// Barril do design system Iris — entrada única para o build do /design-sync.
// Gerado/mantido pelo fluxo de sync; exclui componentes acoplados a rotas do app.
export * from "./components/ui/accordion";
export * from "./components/ui/alert";
export * from "./components/ui/appointment-card";
export * from "./components/ui/availability-grid";
export * from "./components/ui/calendar";
export * from "./components/ui/avatar";
export * from "./components/ui/banner";
export * from "./components/ui/breadcrumb";
export * from "./components/ui/button";
export * from "./components/ui/card";
export * from "./components/ui/checkbox";
export * from "./components/ui/chip";
export * from "./components/ui/collapsible-cluster";
export * from "./components/ui/data-row";
export * from "./components/ui/dialog";
export * from "./components/ui/drawer";
export * from "./components/ui/evidence-timeline";
export * from "./components/ui/field";
export * from "./components/ui/form";
export * from "./components/ui/header";
export * from "./components/ui/icon";
export * from "./components/ui/indicator";
export * from "./components/ui/input";
export * from "./components/ui/interactive-card";
export * from "./components/ui/layout";
export * from "./components/ui/logo";
export * from "./components/ui/metric-card";
export * from "./components/ui/page-header";
export * from "./components/ui/pagination";
export * from "./components/ui/progress";
export * from "./components/ui/qr-code";
export * from "./components/ui/schedule-grid";
export * from "./components/ui/search-input";
export * from "./components/ui/segmented-control";
export * from "./components/ui/select";
export * from "./components/ui/slider";
export * from "./components/ui/stat";
export * from "./components/ui/status-badge";
export * from "./components/ui/table";
export * from "./components/ui/tabs";
export * from "./components/ui/toast";
export * from "./components/ui/tooltip";
export * from "./components/ui/primitives/surface";

// Desambigua tipo duplicado entre card.tsx e interactive-card.tsx (mesma união literal).
export type { EpistemicState } from "./components/ui/card";
