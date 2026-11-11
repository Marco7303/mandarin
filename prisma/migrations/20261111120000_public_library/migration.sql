-- Existing shares remain unlisted. Personal user_state is never changed.
ALTER TABLE "shared_deck"
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "creator_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "word_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "suppressed" BOOLEAN NOT NULL DEFAULT false;
UPDATE "shared_deck" SET "word_count" = jsonb_array_length("entries");
CREATE INDEX "shared_deck_is_public_suppressed_updated_at_id_idx"
  ON "shared_deck"("is_public", "suppressed", "updated_at", "id");
CREATE TABLE "creator_profile" (
  "user_id" TEXT PRIMARY KEY,
  "display_name" TEXT NOT NULL
);
CREATE TABLE "deck_report" (
  "deck_id" TEXT NOT NULL REFERENCES "shared_deck"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "reporter_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("deck_id", "reporter_id")
);
