import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1740000000000 implements MigrationInterface {
  name = 'InitialSchema1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── ENUMS ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "operator_role_enum" AS ENUM ('ADMIN', 'OPERATOR')
    `);
    await queryRunner.query(`
      CREATE TYPE "member_status_enum" AS ENUM ('ACTIVE', 'INACTIVE')
    `);
    await queryRunner.query(`
      CREATE TYPE "import_job_status_enum" AS ENUM ('VALIDATED', 'APPLIED', 'FAILED')
    `);
    await queryRunner.query(`
      CREATE TYPE "import_change_type_enum" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'NOOP')
    `);

    // ── OPERATORS ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "operators" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "dni"              VARCHAR UNIQUE,
        "firstName"        VARCHAR NOT NULL,
        "lastName"         VARCHAR NOT NULL,
        "role"             "operator_role_enum" NOT NULL DEFAULT 'OPERATOR',
        "passwordHash"     VARCHAR NOT NULL,
        "refreshTokenHash" VARCHAR,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"        TIMESTAMPTZ
      )
    `);

    // ── USERS (gym members) ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "memberNumber"   VARCHAR NOT NULL UNIQUE,
        "dni"            VARCHAR,
        "firstName"      VARCHAR NOT NULL,
        "lastName"       VARCHAR NOT NULL,
        "phone"          VARCHAR,
        "plan"           VARCHAR,
        "planExpiresAt"  DATE,
        "status"         "member_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt"      TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_memberNumber" ON "users" ("memberNumber")`);

    // ── CHECKINS ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "checkins" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"           UUID NOT NULL,
        "checkinAt"        TIMESTAMPTZ NOT NULL,
        "createdByUserId"  UUID NOT NULL,
        "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_checkins_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_checkins_userId"    ON "checkins" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_checkins_checkinAt" ON "checkins" ("checkinAt")`);

    // ── IMPORT JOBS ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "import_jobs" (
        "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "originalFileName"  VARCHAR NOT NULL,
        "storagePath"       VARCHAR NOT NULL,
        "monthKey"          VARCHAR NOT NULL,
        "uploadedByUserId"  UUID NOT NULL,
        "status"            "import_job_status_enum" NOT NULL DEFAULT 'VALIDATED',
        "summaryJson"       JSONB,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_import_jobs_monthKey" ON "import_jobs" ("monthKey")`,
    );

    // ── IMPORT CHANGES ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "import_changes" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "importJobId"   UUID NOT NULL,
        "userId"        UUID,
        "changeType"    "import_change_type_enum" NOT NULL,
        "memberNumber"  VARCHAR NOT NULL,
        "beforeJson"    JSONB,
        "afterJson"     JSONB,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_import_changes_importJobId"
          FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_import_changes_importJobId" ON "import_changes" ("importJobId")`,
    );

    // ── EXPORT JOBS ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "export_jobs" (
        "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "monthKey"            VARCHAR NOT NULL,
        "generatedByUserId"   UUID NOT NULL,
        "filePath"            VARCHAR NOT NULL,
        "fileHash"            VARCHAR NOT NULL,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_export_jobs_monthKey" ON "export_jobs" ("monthKey")`,
    );

    // ── AUDIT LOGS ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "actorUserId"  UUID NOT NULL,
        "action"       VARCHAR NOT NULL,
        "entity"       VARCHAR NOT NULL,
        "entityId"     UUID NOT NULL,
        "beforeJson"   JSONB,
        "afterJson"    JSONB,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actorUserId" ON "audit_logs" ("actorUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entityId"    ON "audit_logs" ("entityId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "export_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "import_changes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "import_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "checkins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "operators"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "import_change_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "import_job_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "member_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "operator_role_enum"`);
  }
}
