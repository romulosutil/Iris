import { describe, it, expect } from "vitest";
import { temIconeDeRota } from "@/components/ui/nav-icon";
import { montarNav } from "./nav";

/**
 * Oráculo de conjunto: TODO destino que `montarNav` produz, em TODO papel,
 * tem ícone no mapa de `nav-icon.tsx`.
 *
 * Um destino novo sem entrada no mapa cai no monograma de duas letras em
 * produção — degrada, não quebra. Mas o fallback é rede de segurança, não a
 * intenção: o rail, a barra inferior e o Drawer mobile passaram a ser lidos
 * pela forma antes do texto, e um item de texto puro no meio deles é o que o
 * olho pula. Este teste é quem cobra a intenção.
 *
 * Mora do lado da app (e não junto de `nav-icon.test.tsx`) porque a camada de
 * componentes não pode importar de `src/app` — regra `fronteira/sem-import-de-app`.
 */
describe("iconografia da navegação", () => {
  const PAPEIS = ["coordenador", "terapeuta", "admin_recepcao"];

  it("cobre todo destino de todo papel", () => {
    for (const role of PAPEIS) {
      const { itemsNav, itemsAdmin } = montarNav({
        role,
        totalTravadas: 0,
        totalValidacao: 0,
        totalAlertasAbertos: 0,
      });
      const destinos = [...itemsNav, ...itemsAdmin];
      expect(destinos.length, `${role} sem destinos`).toBeGreaterThan(0);
      for (const item of destinos) {
        expect(temIconeDeRota(item.href), `${role} → ${item.href}`).toBe(true);
      }
    }
  });
});
