CREATE TABLE "shared_deck" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "set_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shared_deck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shared_deck_owner_id_set_id_key" ON "shared_deck"("owner_id", "set_id");
