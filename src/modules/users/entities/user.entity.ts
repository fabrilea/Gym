import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MemberStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Unique membership number (nro_socio) */
  @Column({ unique: true })
  @Index()
  memberNumber: string;

  @Column({ nullable: true })
  dni: string | null;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ nullable: true })
  plan: string | null;

  @Column({ type: 'date', nullable: true })
  planExpiresAt: Date | null;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.ACTIVE })
  status: MemberStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Soft-delete */
  @DeleteDateColumn()
  deletedAt: Date | null;
}
