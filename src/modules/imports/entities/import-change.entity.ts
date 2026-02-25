import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImportJob } from './import-job.entity';

export enum ImportChangeType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  NOOP = 'NOOP',
}

@Entity('import_changes')
export class ImportChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  importJobId: string;

  @ManyToOne(() => ImportJob, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'importJobId' })
  importJob: ImportJob;

  /** Set after apply for CREATE changes */
  @Column({ nullable: true })
  userId: string | null;

  @Column({ type: 'enum', enum: ImportChangeType })
  changeType: ImportChangeType;

  /** Key field so the UI can identify the row */
  @Column()
  memberNumber: string;

  @Column({ type: 'jsonb', nullable: true })
  beforeJson: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterJson: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
