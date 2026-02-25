import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingHistory1741000000000 implements MigrationInterface {
  name = 'AddBillingHistory1741000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "plan_period_status_enum" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED')
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM ('PAID', 'PARTIAL', 'UNPAID')
    `);

    await queryRunner.query(`
      CREATE TABLE "member_plan_periods" (
        "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"     UUID NOT NULL,
        "planName"   VARCHAR(80) NOT NULL,
        "startDate"  DATE NOT NULL,
        "endDate"    DATE NOT NULL,
        "status"     "plan_period_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_member_plan_periods_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_member_plan_periods_user_start"
      ON "member_plan_periods" ("userId", "startDate")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_member_plan_periods_user_end"
      ON "member_plan_periods" ("userId", "endDate")
    `);

    await queryRunner.query(`
      CREATE TABLE "member_payments" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"      UUID NOT NULL,
        "monthKey"    VARCHAR(7) NOT NULL,
        "amountDue"   NUMERIC(12,2) NOT NULL,
        "amountPaid"  NUMERIC(12,2) NOT NULL DEFAULT 0,
        "status"      "payment_status_enum" NOT NULL DEFAULT 'UNPAID',
        "paidAt"      TIMESTAMPTZ,
        "method"      VARCHAR(40),
        "reference"   VARCHAR(120),
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_member_payments_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_member_payments_user_month" UNIQUE ("userId", "monthKey")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_member_payments_monthKey"
      ON "member_payments" ("monthKey")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "member_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "member_plan_periods"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plan_period_status_enum"`);
  }
}
