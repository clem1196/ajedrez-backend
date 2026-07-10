// src/entities/UserStats.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from './User';

@Entity('user_stats')
export class UserStats {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ default: 1200 })
  elo!: number;

  @Column({ default: 0 })
  wins!: number;

  @Column({ default: 0 })
  losses!: number;

  @Column({ default: 0 })
  draws!: number;

  // ✅ CORREGIDO: La relación inversa debe coincidir con la de User
  @OneToOne(() => User, (user) => user.stats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}