import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';

export enum OperatorRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
}

/**
 * Operator – staff members that log into the system.
 * Distinct from gym members (User entity).
 */
@Entity('operators')
export class Operator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  dni: string | null;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'enum', enum: OperatorRole, default: OperatorRole.OPERATOR })
  role: OperatorRole;

  @Column()
  @Exclude() // never serialise the hash
  passwordHash: string;

  /** Opaque token stored to allow refresh-token rotation & revocation */
  @Column({ nullable: true })
  @Exclude()
  refreshTokenHash: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
