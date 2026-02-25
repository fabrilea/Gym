import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('checkins')
export class Checkin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** The actual check-in timestamp (defaults to now if not provided) */
  @Index()
  @Column({ type: 'timestamptz' })
  checkinAt: Date;

  /** Operator who registered this check-in */
  @Column()
  createdByUserId: string;

  @CreateDateColumn()
  createdAt: Date;
}
