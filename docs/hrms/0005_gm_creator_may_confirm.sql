-- =====================================================================
-- 0005: the gameMaster who added a new gameMaster may also confirm them.
-- Still refused: the person confirming themselves, and a confirmer who is
-- not an active gameMaster (trg_gm_confirmer_active).
-- =====================================================================
BEGIN;
SET search_path = hrms, public;

ALTER TABLE game_masters DROP CONSTRAINT game_masters_check;

COMMIT;
