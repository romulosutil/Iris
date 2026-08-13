"use client";

import * as React from "react";

export interface EnderecoViaCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/**
 * Busca de endereço por CEP no ViaCEP (https://viacep.com.br). Melhor esforço,
 * nunca bloqueante: falha de rede, timeout (~5s) ou CEP inexistente degradam em
 * silêncio para preenchimento manual — o formulário continua 100% utilizável
 * offline. Um aviso discreto é exposto para a tela decidir exibir.
 */
export function useCep(onEndereco: (endereco: EnderecoViaCep) => void) {
  const [buscando, setBuscando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  // Evita repetir a busca (e o aviso) para o mesmo CEP em blurs sucessivos.
  const ultimoCepRef = React.useRef<string | null>(null);

  // Cancela requisição pendente ao desmontar.
  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const buscarCep = React.useCallback(
    async (cepBruto: string) => {
      const cep = cepBruto.replace(/\D/g, "");
      if (cep.length !== 8 || cep === ultimoCepRef.current) return;
      ultimoCepRef.current = cep;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), 5000);

      setBuscando(true);
      setAviso(null);
      try {
        const resposta = await fetch(
          `https://viacep.com.br/ws/${cep}/json/`,
          { signal: controller.signal },
        );
        if (!resposta.ok) throw new Error(`ViaCEP HTTP ${resposta.status}`);
        const dados = (await resposta.json()) as {
          erro?: boolean;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
        };
        if (dados.erro) throw new Error("CEP não encontrado");
        onEndereco({
          logradouro: dados.logradouro ?? "",
          bairro: dados.bairro ?? "",
          cidade: dados.localidade ?? "",
          uf: (dados.uf ?? "").toUpperCase(),
        });
      } catch {
        // Aborto, offline ou CEP inexistente: seguir manual, sem bloquear.
        setAviso("Não foi possível buscar o CEP — preencha manualmente.");
      } finally {
        clearTimeout(timeout);
        if (abortRef.current === controller) abortRef.current = null;
        setBuscando(false);
      }
    },
    [onEndereco],
  );

  return { buscarCep, buscando, aviso };
}
