// src/entities/User.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne } from 'typeorm';
import { UserStats } from './UserStats';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  nick!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password!: string | null;

  @Column({ type: 'boolean', default: false })
  isAdmin!: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  googleId!: string | null;
  
   @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  githubId!: string | null;

   @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  lichessId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  facebookId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  microsoftId!: string | null;

  @Column({ 
    type: 'enum', 
    enum: ['local', 'google', 'github', 'lichess','facebook', 'microsoft'],
    default: 'local'
  })
  authProvider!: string;

  @Column({ type: 'timestamp', nullable: true })
  lastLogin!: Date | null;

  @OneToOne(() => UserStats, (stats) => stats.user, { cascade: true })
  stats!: UserStats;
}