import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { VacationStatus } from './vacation-status.enum';

/**
 * Mirrors db/init/01-schema.sql, which also enforces the date check, the overlap exclusion
 * constraint and the "approved is frozen" trigger. Dates are plain `YYYY-MM-DD` strings.
 */
@Entity('vacation_requests')
export class VacationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({
    type: 'enum',
    enum: VacationStatus,
    enumName: 'vacation_status',
    default: VacationStatus.Pending,
  })
  status: VacationStatus;

  /** Validator's comment; mandatory when rejecting. */
  @Column({ type: 'text', nullable: true })
  comments: string | null;

  /** Set once by the expiry job when the request was still Pending after its start date. */
  @Column({ name: 'expired_at', type: 'timestamptz', nullable: true })
  expiredAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
