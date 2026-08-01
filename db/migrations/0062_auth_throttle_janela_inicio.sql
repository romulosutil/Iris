-- Fatia A (#163), Task 7, fix round 1 (finding 5 do review): o backoff da
-- 0061 era ancorado em `now()`, então CADA tentativa excedente empurrava o fim
-- da janela para frente a partir daquele instante. Consequência: ~6 POSTs
-- travavam um e-mail conhecido, e depois disso bastava 1 requisição a cada
-- (teto) para manter a vítima travada para sempre — arma de negação barata e
-- indefinida contra uma pessoa específica.
--
-- Correção: ancorar o backoff no INÍCIO da janela. A duração total do bloqueio
-- passa a ser `min(janela * 2^excesso, teto)` contada do começo, então
-- tentativas adicionais aumentam o expoente (que satura no teto) mas NÃO
-- deslocam o fim indefinidamente. Depois do teto, o bloqueio acaba na hora
-- marcada, aconteça o que acontecer — e re-travar custa `limite + 1`
-- requisições novas, não uma.
--
-- Tabela criada na 0061, nesta mesma branch, nunca implantada — mas a coluna é
-- adicionada por migração nova em vez de reescrever a 0061 (migração já
-- commitada não se reescreve).
ALTER TABLE auth_throttle
  ADD COLUMN janela_inicio_em timestamptz NOT NULL DEFAULT now();
