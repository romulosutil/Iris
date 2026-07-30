/**
 * Resolve TODO specifier importado pelos scripts copiados para dentro de uma
 * imagem de infra — inclusive os `await import()` DINÂMICOS (#157).
 *
 * Por que isto existe além do teste de carga: carregar o script prova que os
 * imports de TOPO resolvem, e só. `scripts/lib/resend-rt.mjs` importa `resend`
 * por `await import("resend")` DENTRO de um try/catch, no caminho de envio de
 * e-mail. Numa imagem sem essa dependência o dry-run passa verde, o motor sobe,
 * escalona normalmente — e o e-mail ao RT falha em silêncio, gravando na
 * trilha "email nao enviado: Cannot find package 'resend'". É o modo de falha
 * PIOR que o da #126: lá o processo morria alto; aqui ele continua de pé
 * parecendo saudável enquanto o canal não existe.
 *
 * Este arquivo NÃO é copiado para a imagem de propósito — ele entra por stdin
 * (`docker run -i ... node --input-type=module < este-arquivo`), então não
 * adiciona peso nem superfície a uma imagem de produção.
 *
 * Env:
 *   ALVO  diretório a varrer dentro do container (default /app/scripts).
 *
 * Exit 0 = todo specifier resolveu. Exit 1 = pelo menos um não resolveu, com a
 * lista do que falta e de qual arquivo o importa.
 */

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ALVO = process.env.ALVO || "/app/scripts";

/** Todos os arquivos .mjs/.js abaixo de `dir`, recursivo. */
async function listar(dir) {
  const entradas = await readdir(dir, { withFileTypes: true });
  const arquivos = [];
  for (const e of entradas) {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) arquivos.push(...(await listar(completo)));
    else if (/\.(mjs|js)$/.test(e.name)) arquivos.push(completo);
  }
  return arquivos;
}

// Estático (`import x from "y"`, `import "y"`, `export * from "y"`) e dinâmico
// (`import("y")`). Só pega literal de string: um specifier montado em runtime
// não é verificável estaticamente e não é usado neste repo.
const RE_ESTATICO = /(?:^|\s)(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g;
const RE_IMPORT_BARE = /(?:^|\s)import\s*["']([^"']+)["']/g;
const RE_DINAMICO = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

const pendencias = [];
const vistos = new Set();

for (const arquivo of await listar(ALVO)) {
  const fonte = await readFile(arquivo, "utf8");
  for (const re of [RE_ESTATICO, RE_IMPORT_BARE, RE_DINAMICO]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(fonte)) !== null) {
      const spec = m[1];
      if (spec.startsWith("node:")) continue; // builtin, sempre presente
      const chave = `${arquivo} -> ${spec}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      pendencias.push({ arquivo, spec });
    }
  }
}

if (pendencias.length === 0) {
  console.error(
    `[deps-imagem] ERRO: nenhum import encontrado em ${ALVO} — a varredura não achou arquivo nenhum. ` +
      `Verde aqui seria falso: conferir se o COPY do Dockerfile mudou de caminho.`,
  );
  process.exit(1);
}

let falhas = 0;
for (const { arquivo, spec } of pendencias) {
  const relativo = spec.startsWith(".") || spec.startsWith("/");
  try {
    if (relativo) {
      // Relativo: basta existir no disco da imagem. Não importamos para não
      // executar o módulo duas vezes — o teste de carga já faz isso.
      const alvo = path.resolve(path.dirname(arquivo), spec);
      await access(alvo);
    } else {
      // Bare: importa DE VERDADE, não só resolve o caminho. Um pacote presente
      // mas quebrado (build parcial, engine incompatível) falha aqui, que é o
      // que o processo real veria. O container roda com `-w /app`, então a
      // cadeia de node_modules é a mesma que o script usa.
      await import(spec);
    }
    console.log(`[deps-imagem] OK: ${spec}  (de ${arquivo})`);
  } catch (err) {
    falhas += 1;
    console.error(
      `[deps-imagem] FALTA: "${spec}" importado por ${arquivo} não resolve dentro da imagem.`,
    );
    console.error(err);
  }
}

if (falhas > 0) {
  console.error(
    `[deps-imagem] ${falhas} specifier(s) não resolvem. Se for dependência npm, ela precisa entrar ` +
      `na linha de instalação do Dockerfile do serviço — adicionar no package.json da raiz NÃO alcança ` +
      `estas imagens (elas não enxergam o node_modules do app). Se for arquivo, precisa entrar no COPY.`,
  );
  process.exit(1);
}

console.log(
  `[deps-imagem] ${pendencias.length} specifier(s) resolvidos em ${ALVO}.`,
);
