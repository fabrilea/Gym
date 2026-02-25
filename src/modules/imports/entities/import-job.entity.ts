import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ImportJobStatus {
  VALIDATED = 'VALIDATED',
  APPLIED = 'APPLIED',
  FAILED = 'FAILED',
}

@Entity('import_jobs')
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  originalFileName: string;

  @Column()
  storagePath: string;

  /** YYYY-MM – the month this import targets */
  @Index()
  @Column()
  monthKey: string;

  @Column()
  uploadedByUserId: string;

  @Column({ type: 'enum', enum: ImportJobStatus, default: ImportJobStatus.VALIDATED })
  status: ImportJobStatus;

  /**
   * Preview / result summary (counts, errors, warnings).
   * Populated on validate; updated to final counts on apply.
   */
  @Column({ type: 'jsonb', nullable: true })
  summaryJson: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
