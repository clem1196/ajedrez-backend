// src/entities/User.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne } from 'typeorm';
import { UserStats } from './UserStats';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 50 })
  nick!: string;

  @Column({ unique: true, length: 100 })
  email!: string;

  @Column({ length: 255 })
  password!: string;

  @Column({ default: false }) // ✅ Nuevo campo
  isAdmin!: boolean;
  @CreateDateColumn()
  createdAt!: Date;

  // ✅ CORREGIDO: Relación 1 a 1 con UserStats
  @OneToOne(() => UserStats, (stats) => stats.user, { cascade: true })
  stats!: UserStats;
}