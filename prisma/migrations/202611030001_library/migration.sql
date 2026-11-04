CREATE TABLE "user_state" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "state" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
