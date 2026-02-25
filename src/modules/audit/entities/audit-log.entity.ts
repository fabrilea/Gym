import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  actorUserId: string;

  /** e.g. USER_CREATE, USER_UPDATE, USER_DELETE, IMPORT_APPLY, EXPORT_GENERATE, CHECKIN_CREATE */
  @Column()
  action: string;

  /** e.g. User, ImportJob, ExportJob, Checkin */
  @Column()
  entity: string;

  @Index()
  @Column()
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  beforeJson: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterJson: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
