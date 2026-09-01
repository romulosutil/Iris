"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_FILTRO_TERAPEUTA } from "./queries";

/**
 * Grava o filtro por terapeuta (R-16) num cookie — persiste entre visitas e
 * fica disponível para outras superfícies que decidirem lê-lo (a grade
 * semanal, C3, não é T03; só o mecanismo de persistência nasce aqui).
 * `terapeutaId` vazio limpa o filtro (volta a "Todos").
 */
export async function definirFiltroTerapeuta(formData: FormData) {
  const terapeutaId = formData.get("terapeutaId");
  const ck = await cookies();

  if (typeof terapeutaId === "string" && terapeutaId.length > 0) {
    ck.set(COOKIE_FILTRO_TERAPEUTA, terapeutaId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  } else {
    ck.delete(COOKIE_FILTRO_TERAPEUTA);
  }

  redirect("/sessoes");
}
