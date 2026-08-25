-- reaplicar-tombstones.sql — reaplica, num banco recém-restaurado, os expurgos
-- de titular (LGPD Art. 18) que aconteceram DEPOIS do dump restaurado.
--
-- POR QUE ISTO EXISTE (issue #89):
-- Um dump é a fotografia de um instante. Se o titular exerceu o direito ao
-- esquecimento depois da fotografia, o dump ainda contém o prontuário dele, e
-- restaurá-lo desfaz o expurgo. Consultar o `audit_log` restaurado não resolve:
-- o tombstone da purga nasceu depois do dump e, por construção, não está lá
-- dentro. Por isso o ledger viaja FORA do dump (`backup.sh` gera
-- `tombstones-<TS>.csv` a cada ciclo) e quem manda é o ledger MAIS RECENTE.
--
-- Invocado por `infra/backup/restore.sh`, com o CSV chegando por STDIN:
--   psql -v ON_ERROR_STOP=1 -f infra/backup/reaplicar-tombstones.sql \
--        < /caminho/tombstones-<TS>.csv
--
-- O caminho NÃO entra por variável do psql: `\copy ... FROM :'ledger'` NÃO
-- interpola — o psql passa `:'ledger'` literal para o parser do \copy e o erro
-- é `:: No such file or directory`, medido num restore de ponta a ponta. Com
-- `-f`, o `\copy ... FROM PSTDIN` lê o stream de verdade e o arquivo entra por
-- redirecionamento.
--
-- O bloco `DO $reaplicar$` abaixo é o ÚNICO lugar onde a regra mora. O teste
-- `db/tests/fase6-tombstone-restauracao.int.test.ts` lê ESTE arquivo e executa
-- este mesmo bloco — reescrevê-lo no teste garantiria que os dois divergissem
-- em silêncio na primeira mudança.

BEGIN;

CREATE TEMP TABLE _tombstone (
  patient_id uuid,
  clinic_id  uuid,
  ator_id    uuid,
  criado_em  timestamptz
) ON COMMIT DROP;

-- PSTDIN, não STDIN: dentro de um script rodado com `-f`, `\copy ... FROM
-- STDIN` lê as linhas SEGUINTES DO PRÓPRIO SCRIPT como dados (é assim que um
-- dump do pg_dump embute o COPY), e a primeira linha do bloco DO vira "valor"
-- — `invalid input syntax for type uuid: "DO $reaplicar$"`. `PSTDIN` é o
-- keyword que manda ler a entrada padrão de verdade do psql. Ambos os erros
-- só apareceram num restore de ponta a ponta.
\copy _tombstone FROM PSTDIN WITH (FORMAT csv, HEADER true)

DO $reaplicar$
DECLARE
  r            record;
  v_ator       uuid;
  n_repurgado  int := 0;
  n_ausente    int := 0;
BEGIN
  FOR r IN SELECT * FROM _tombstone ORDER BY criado_em LOOP
    -- Ausente = ou este dump é anterior ao cadastro do paciente, ou já é
    -- posterior à purga. Nos dois casos não há o que re-eliminar. Note que
    -- `app_purgar_paciente` LEVANTA EXCEÇÃO para paciente inexistente, então
    -- este guard não é cosmético: sem ele, o primeiro titular já ausente
    -- aborta a transação inteira e nenhum dos seguintes é re-eliminado.
    IF NOT EXISTS (SELECT 1 FROM patient WHERE id = r.patient_id) THEN
      n_ausente := n_ausente + 1;
      CONTINUE;
    END IF;

    -- A função grava o tombstone novo com FK para `app_user`, então o ator
    -- precisa EXISTIR neste banco. O original pode ter sido desligado da
    -- clínica desde então; nesse caso assina um coordenador da clínica.
    SELECT id INTO v_ator FROM app_user WHERE id = r.ator_id;

    IF v_ator IS NULL THEN
      SELECT u.id INTO v_ator
        FROM app_user u
        JOIN user_role ur ON ur.user_id = u.id
       WHERE ur.clinic_id = r.clinic_id
         AND ur.papel = 'coordenador'
       ORDER BY u.id
       LIMIT 1;
    END IF;

    -- Fail-closed: sem ator não dá para gravar a trilha da re-eliminação, e
    -- expurgo sem trilha é exatamente o que a LGPD cobra de volta. Abortar é
    -- melhor que expurgar sem registro ou, pior, seguir sem expurgar.
    IF v_ator IS NULL THEN
      RAISE EXCEPTION 'tombstone %: paciente presente no restore, mas nao ha ator para assinar a re-eliminacao (nem o original % nem coordenador da clinica %)',
        r.patient_id, r.ator_id, r.clinic_id;
    END IF;

    -- Contexto de tenant/papel que os guards de `app_purgar_paciente` exigem.
    -- Terceiro argumento `true` = LOCAL: morre no fim desta transação, nunca
    -- vaza para a próxima sessão do pool.
    PERFORM set_config('app.clinic_id', r.clinic_id::text, true);
    PERFORM set_config('app.user_id',   v_ator::text,      true);
    PERFORM set_config('app.user_role', 'coordenador',     true);

    -- Via EXCEPCIONAL, e isto não é detalhe (#352): desde a 0128 a via normal
    -- exige que o prazo de guarda tenha vencido, e um titular expurgado por
    -- ordem judicial (Art. 18) e' POR DEFINICAO inelegivel. Pela via normal o
    -- gate recusaria, este script roda com ON_ERROR_STOP=1, e o restore.sh
    -- abortaria a restauracao inteira mandando nao liberar o banco para uso.
    -- Se alguem contornasse, o titular expurgado ressuscitaria em definitivo.
    -- A `acao` gravada continua sendo 'paciente_purgado' nas duas vias — e o
    -- backup.sh depende dessa string literal para extrair o ledger.
    PERFORM app_purgar_paciente_excepcional(
      r.patient_id,
      'reaplicacao de expurgo apos restauracao de backup (LGPD Art. 18)',
      'reaplicacao pos-restore'
    );

    n_repurgado := n_repurgado + 1;
  END LOOP;

  RAISE NOTICE 'tombstones: % titular(es) re-eliminado(s), % ja ausente(s) neste dump', n_repurgado, n_ausente;
END
$reaplicar$;

COMMIT;
