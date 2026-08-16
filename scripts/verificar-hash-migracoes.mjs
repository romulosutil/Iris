/**
 * Guard de deriva de migração já aplicada (D17, #215).
 *
 * O Drizzle aplica por `tag` do journal e nunca reexecuta um tag já
 * registrado em `drizzle.__drizzle_migrations` — editar um `.sql` já
 * aplicado não dá erro, não dá aviso e não roda (precedente: a `0073`
 * editada pelo commit `b53b294` depois de já aplicada, corrigido só na
 * `0082` recriando o conteúdo como migração nova). Base criada do zero
 * (dev, CI) roda o `.sql` como está hoje; base que veio migrando (produção)
 * ficou com o que rodou no dia — e o `git diff` mostra o código certo nos
 * dois, porque o arquivo em disco é o mesmo.
 *
 * Este guard compara, para cada linha já aplicada, o hash gravado no banco
 * (sha256 do conteúdo tal como o Drizzle o leu no momento da aplicação) com
 * o sha256 do arquivo em disco agora — mesmo algoritmo do `readMigrationFiles`
 * de `drizzle-orm/migrator` (sha256 hex do `.sql` bruto, sem normalizar
 * quebra de linha nem remover `--> statement-breakpoint`).
 *
 * Roda dentro de `scripts/migrate.mjs`, ANTES de aplicar migração nova —
 * diverge → aborta o deploy (mesmo gate que já existe para falha de DDL).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export function calcularHashMigracao(conteudo) {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * Derivas históricas conhecidas — pinadas pelos DOIS hashes: só passa se o
 * banco tiver exatamente o hash aplicado à época E o disco tiver exatamente
 * o conteúdo atual conhecido. Editar o `.sql` de novo (ou um banco com outro
 * histórico) volta a acusar divergência.
 *
 * Inventário medido em produção em 12/08/2026 (`drizzle.__drizzle_migrations`
 * completo, 93 linhas — 85 batem, 8 divergem, todas explicadas):
 *
 * - 0003/0007/0009: conteúdo IDÊNTICO ao repo; aplicadas de um checkout
 *   Windows (CRLF) no início do projeto, então o hash gravado é o do mesmo
 *   arquivo com quebra de linha CRLF. Sem deriva de SQL.
 * - 0004/0005/0006/0072/0073: editadas in-place DEPOIS de aplicadas
 *   (precedente #215; a 0073 foi remediada pela 0082 recriando o conteúdo
 *   como migração nova). O SQL corrigido dessas edições precisa ter chegado
 *   em prod por migrações posteriores — o que os guards de RLS medem direto
 *   no pg_proc/pg_policies.
 *
 * Nota sobre falso-positivo em máquina Windows — medido em 15/08/2026 contra o
 * Postgres local (98 aplicadas, 37 divergentes), diagnóstico completo em
 * `docs/arquitetura/diagnostico-deriva-hash-migracoes.md`:
 *
 * - 35 das 37 são divergência SÓ de fim de linha, nas DUAS direções (banco
 *   CRLF/disco LF e banco LF/disco CRLF). Causa: `core.autocrlf=true` vem do
 *   gitconfig de sistema do Git for Windows e, com `* text=auto`, o EOL de
 *   cada arquivo no working tree depende de o Git tê-lo rematerializado num
 *   checkout ou não — enquanto o índice é 100% LF (`git ls-files --eol`).
 *   Não chega à imagem de deploy: lá o checkout é Linux e o `.sql` é o LF do
 *   índice, na aplicação e na conferência.
 * - As 2 restantes são `0072`/`0073`, já pinadas abaixo. As pinagens NÃO
 *   passam num checkout Windows, porque `hashDiscoAtual` guarda o sha256 LF e
 *   o disco local está em CRLF.
 *
 * O gate é para a imagem de deploy (checkout LF). O fluxo dev usa drizzle-kit
 * direto (`pnpm db:migrate`) e não passa por aqui — por isso o ruído local
 * nunca apareceu antes.
 */
export const DERIVAS_CONHECIDAS = new Map([
  [
    "0003_curvy_nick_fury",
    {
      hashAplicado:
        "b9d3f9719499b1c12b123be43ebb250b840187dfadeca4860a5ef0fa6ef8c51f",
      hashDiscoAtual:
        "3a06db1babf8f26cc57517c2827447f5995b228424a64d9800caaea334d5c201",
      motivo: "aplicada com CRLF (checkout Windows); SQL idêntico",
    },
  ],
  [
    "0004_session_rls",
    {
      hashAplicado:
        "11225eea3d4848e3fbd0885e1c4cdcbc9bc8662ed2b6b6d55f2fdea64215ec54",
      hashDiscoAtual:
        "619d168828bba004723b1ba417d19024e2a2b4350bc03c98681a61b373a940e6",
      motivo: "editada in-place pós-aplicação (fase 1)",
    },
  ],
  [
    "0005_square_ravenous",
    {
      hashAplicado:
        "c473668901a136991c15817d101a4469ca7e10473202b4cc735c89640a8c6beb",
      hashDiscoAtual:
        "10f7d55e08b32936b5cb17e2945cfe0df8ae558881fe8d3b9502120f38c32994",
      motivo: "editada in-place pós-aplicação (fase 1)",
    },
  ],
  [
    "0006_fase2_rls",
    {
      hashAplicado:
        "e6c8feb94415d88c8ed657d3d0a9e3cfc43d8a2463f243a4a8089063f4eda6b5",
      hashDiscoAtual:
        "00e8c652d1fa7cb762211d10603c4def1f62712471c506897045900217ce8e30",
      motivo: "editada in-place pós-aplicação (reviews de RLS da fase 2)",
    },
  ],
  [
    "0007_session_numero_seq",
    {
      hashAplicado:
        "52b05d657e8186aaaa675ad5124ca67f81c8d3ac3af1132c9655c36113fa3f2a",
      hashDiscoAtual:
        "49efb299139c0afe73a3305ef2d89686c97140fd31e708934ab761daa2acc645",
      motivo: "aplicada com CRLF (checkout Windows); SQL idêntico",
    },
  ],
  [
    "0009_nosy_lenny_balinger",
    {
      hashAplicado:
        "ac31931b59cecdd25c61546dcaddb6f4a479bf6a633dc1da9e4aea81e415d471",
      hashDiscoAtual:
        "6790b0bc384ff5a445099ab43d2960f558a400845a446b5c0e281210a5e97914",
      motivo: "aplicada com CRLF (checkout Windows); SQL idêntico",
    },
  ],
  [
    "0072_super_admin_role",
    {
      hashAplicado:
        "9b353c4445c4ed13b56d2261743db3e074a88ca2ab0f8c34ae8a1e6e519b8b8b",
      hashDiscoAtual:
        "ab71715ce601d6154707af80c6a7748c18392186195cd7e8ae62ca8d7dd1e80b",
      // O `hashAplicado` é o sha256 LF do blob de `a00008e7` — a versão
      // ANTERIOR ao fix `f6e0884`. Medido em 15/08/2026: o delta do fix é
      // só a policy `alerta_risco_auth_select` em `alerta_risco_clinico`,
      // que nenhuma outra migração recria. Sem ela, a leitura do painel de
      // Super Admin por `iris_auth` devolve zero linhas em silêncio (os
      // GRANT de coluna já vinham da versão original). Fecha por migração
      // nova, nunca editando esta. Ver
      // `docs/arquitetura/diagnostico-deriva-hash-migracoes.md` §5.2.
      motivo: "editada in-place pós-aplicação (fix f6e0884)",
    },
  ],
  [
    "0073_conta_somente_leitura",
    {
      hashAplicado:
        "5f52882de5864bee1896e96427e512651537a851e2ded7895abc2e9a90f32628",
      hashDiscoAtual:
        "1c261ad1e19f63047349146d42a411f2d00a11a26a4b6b5d18e05e298c36be23",
      motivo: "#215 — edição b53b294 nunca rodou; remediada pela 0082",
    },
  ],
  [
    "0097_billing_cycle_devido",
    {
      hashAplicado:
        "16112a1aa2d49e0e31b8336759040d41f6220b36e9a1b192644e39bd4668f0df",
      hashDiscoAtual:
        "4e51d527d7de5edd09526ca6569a1d9a368185e00de1d6751616493e55315b6c",
      // Deriva por RENUMERAÇÃO, não por edição de conteúdo: o merge `0bca538`
      // moveu `0096_billing_cycle_devido` para `0097_...` para caber depois da
      // `0096_patient_clinical_modality` de main, e trocou junto as duas
      // ocorrências do número dentro do arquivo. O `when` (1786731685223) ficou
      // igual de propósito — nada reaplica —, mas é por ele que este guard casa
      // `created_at` com tag, então a linha que prod rodou como `0096_...`
      // passou a ser conferida contra o arquivo `0097_...`.
      //
      // `hashAplicado` é o sha256 LF do blob `83fcd27:0096_billing_cycle_devido.sql`
      // (o que rodou em prod); `hashDiscoAtual`, o do arquivo renumerado. O delta
      // é 2 linhas de comentário: o cabeçalho e o número citado dentro do texto
      // do `COMMENT ON TYPE`. Nenhum DDL mudou — o `ALTER TYPE ... ADD VALUE
      // 'devido'` é byte a byte o mesmo.
      //
      // O único efeito real é o texto do comentário do tipo em prod, que ficou
      // dizendo "(0096)"; a `0104_comentario_billing_cycle_status_0097` reemite
      // o `COMMENT ON TYPE` com o número certo, em vez de editar esta tag.
      motivo: "renumerada 0096→0097 no merge 0bca538; delta só no comentário",
    },
  ],
]);

/**
 * Função pura: recebe as entradas do journal e as linhas já aplicadas no
 * banco (`{ hash, created_at }`), devolve as que divergem. `lerConteudo` é
 * injetável para o teste unitário não depender de arquivo em disco.
 */
export function encontrarMigracoesComHashDivergente(
  journalEntries,
  linhasAplicadas,
  lerConteudo,
) {
  const tagPorWhen = new Map(
    journalEntries.map((entry) => [Number(entry.when), entry.tag]),
  );
  const divergentes = [];

  for (const linha of linhasAplicadas) {
    const tag = tagPorWhen.get(Number(linha.created_at));
    // Sem entrada correspondente no journal: fora do escopo deste guard —
    // é o `_journal.json` órfão que o D2 (`src/db/migrations.test.ts`) cobre.
    if (!tag) continue;

    const hashEsperado = calcularHashMigracao(lerConteudo(tag));
    if (hashEsperado !== linha.hash) {
      const deriva = DERIVAS_CONHECIDAS.get(tag);
      if (
        deriva &&
        deriva.hashAplicado === linha.hash &&
        deriva.hashDiscoAtual === hashEsperado
      ) {
        continue;
      }
      divergentes.push({ tag, hashAplicado: linha.hash, hashEsperado });
    }
  }

  return divergentes;
}

/**
 * Efeito colateral: lê `db/migrations/meta/_journal.json` e
 * `drizzle.__drizzle_migrations` de verdade e aplica o comparador puro
 * acima. Devolve `[]` quando a tabela ainda não existe (primeiro deploy,
 * nada aplicado ainda) — não é divergência, é ausência de histórico.
 */
export async function verificarHashesAplicadas(
  sql,
  migrationsDir = path.resolve(process.cwd(), "db/migrations"),
) {
  const journalPath = path.join(migrationsDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));

  let linhasAplicadas;
  try {
    linhasAplicadas =
      await sql`select hash, created_at from drizzle.__drizzle_migrations`;
  } catch (err) {
    if (err?.code === "42P01") return []; // relation does not exist
    throw err;
  }

  return encontrarMigracoesComHashDivergente(
    journal.entries,
    linhasAplicadas,
    (tag) => readFileSync(path.join(migrationsDir, `${tag}.sql`), "utf8"),
  );
}
