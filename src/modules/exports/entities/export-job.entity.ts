import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('export_jobs')
export class ExportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  monthKey: string;

  @Column()
  generatedByUserId: string;

  /** Relative path inside storage/ so the app can serve it */
  @Column()
  filePath: string;

  /** SHA-256 hex digest for integrity check */
  @Column()
  fileHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
