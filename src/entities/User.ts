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

  @Column({ length: 255, nullable: true }) // ✅ Ahora nullable (para login social)
  password!: string | null;

  @Column({ default: false })
  isAdmin!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  // ✅ NUEVOS CAMPOS PARA AUTH SOCIAL
  @Column({ nullable: true, unique: true })
  googleId!: string | null;

  @Column({ nullable: true, unique: true })
  facebookId!: string | null;

  @Column({ nullable: true, unique: true })
  microsoftId!: string | null;

  @Column({ 
    type: 'enum', 
    enum: ['local', 'google', 'facebook', 'microsoft'],
    default: 'local'
  })
  authProvider!: string;

  @Column({ nullable: true })
  lastLogin!: Date;

  // ✅ Relación con stats (sin cambios)
  @OneToOne(() => UserStats, (stats) => stats.user, { cascade: true })
  stats!: UserStats;
}