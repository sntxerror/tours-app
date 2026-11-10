import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from './user-role.enum';

/** Mirrors db/init/01-schema.sql (schema is owned by SQL, TypeORM never synchronises it). */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  /** bcrypt hash. Never selected by default, never serialised. */
  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.Requester })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
