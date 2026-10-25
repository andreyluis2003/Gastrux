-- Tutorial videos a person watched (spec 2026-10-25 tutoriais-em-video)
CREATE TABLE "tutorial_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutorial_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tutorial_views_userId_slug_key" ON "tutorial_views"("userId", "slug");

ALTER TABLE "tutorial_views" ADD CONSTRAINT "tutorial_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
