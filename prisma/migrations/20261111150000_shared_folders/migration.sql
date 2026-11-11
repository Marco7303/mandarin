-- Add folder snapshots without changing personal libraries or existing URLs.
ALTER TABLE "shared_deck"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'set',
  ADD COLUMN "sets" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "set_count" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "shared_deck_owner_id_set_id_key";
CREATE UNIQUE INDEX "shared_deck_owner_id_set_id_kind_key"
  ON "shared_deck"("owner_id", "set_id", "kind");
