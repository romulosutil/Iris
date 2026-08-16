import fs from "fs";
import path from "path";

async function main() {
  const twaPath = path.join(process.cwd(), "twa-manifest.json");
  if (!fs.existsSync(twaPath)) {
    throw new Error("twa-manifest.json não encontrado para empacotamento TWA.");
  }
  console.log(
    "Configuração TWA verificada com sucesso para empacotamento via Bubblewrap.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
