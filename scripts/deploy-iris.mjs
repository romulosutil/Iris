/**
 * Dispara deploy dos serviços Iris no Easypanel via "Deployment Trigger URL"
 * (aba Deployments de cada serviço) — substitui clicar "Implantar" um a um
 * nos ~10 serviços que buildam deste repo (infra/<nome>/Dockerfile).
 *
 * Mantém o gate de schema (infra/README.md, decisão LGPD "nunca migração
 * automática"): a fase `migrate` dispara SÓ o iris-migrate e para — confirmar
 * "Migrações aplicadas — schema em dia." no log e clicar Stop no painel (é
 * job, não serviço; sem Stop reinicia em loop) antes de rodar a fase `rest`.
 *
 *   node scripts/deploy-iris.mjs migrate   # dispara iris-migrate, para aqui
 *   node scripts/deploy-iris.mjs rest      # dispara os demais serviços
 *   node scripts/deploy-iris.mjs list      # mostra o que está configurado
 *
 * Config em infra/deploy/services.json (gitignored — copiar de
 * services.example.json e preencher as URLs, cada uma já carrega um token).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const CONFIG_PATH = path.join(
  import.meta.dirname,
  "..",
  "infra",
  "deploy",
  "services.json",
);

async function loadConfig() {
  let raw;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch {
    throw new Error(
      `Config não encontrada em ${CONFIG_PATH}.\n` +
        "Copie infra/deploy/services.example.json para infra/deploy/services.json e preencha as URLs (aba Deployments de cada serviço no Easypanel).",
    );
  }
  const config = JSON.parse(raw);
  for (const group of ["gate", "rest"]) {
    for (const svc of config[group] ?? []) {
      if (!svc.url || svc.url === "SET_ME") {
        throw new Error(
          `Serviço "${svc.name}" (grupo ${group}) sem url configurada em services.json.`,
        );
      }
    }
  }
  return config;
}

async function trigger(svc) {
  try {
    const res = await fetch(svc.url, { method: "POST" });
    const ok = res.ok;
    console.log(`${ok ? "OK  " : "FAIL"} ${svc.name} (HTTP ${res.status})`);
    return ok;
  } catch (err) {
    console.log(`FAIL ${svc.name} — ${err.message}`);
    return false;
  }
}

async function main() {
  const cmd = process.argv[2];
  const config = await loadConfig();

  if (cmd === "list") {
    console.log("gate:", config.gate.map((s) => s.name).join(", "));
    console.log("rest:", config.rest.map((s) => s.name).join(", "));
    return;
  }

  if (cmd === "migrate") {
    console.log("Disparando build do gate de schema...\n");
    const results = await Promise.all(config.gate.map(trigger));
    console.log(
      "\nAcompanhe o log no painel (aba Deployments do iris-migrate) até" +
        ' "Migrações aplicadas — schema em dia.", depois clique Stop' +
        " (é job — sem Stop reinicia em loop).\n" +
        "Só então rode: node scripts/deploy-iris.mjs rest",
    );
    process.exit(results.every(Boolean) ? 0 : 1);
  }

  if (cmd === "rest") {
    console.log(`Disparando ${config.rest.length} serviços...\n`);
    const results = await Promise.all(config.rest.map(trigger));
    process.exit(results.every(Boolean) ? 0 : 1);
  }

  console.error(
    "Uso: node scripts/deploy-iris.mjs <migrate|rest|list>\n\n" +
      "  migrate  dispara o gate de schema (iris-migrate) — confirmar no painel antes de seguir\n" +
      "  rest     dispara os demais serviços do repo\n" +
      "  list     mostra os serviços configurados",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
