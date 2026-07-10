// src/entities/GameHistory.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

@Entity('game_history')
export class GameHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  roomId!: string;

  // Guardamos nombres por si juegan invitados contra registrados, 
  // pero enlazamos al objeto User si están autenticados (opcional)
  @Column()
  whiteNick!: string;

  @Column()
  blackNick!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'whiteUserId' })
  whiteUser!: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'blackUserId' })
  blackUser!: User | null;

  @Column({ length: 50 })
  result!: 'white_win' | 'black_win' | 'draw' | 'abort'; // Resultado final

  @Column({ length: 255 })
  reason!: string; // 'checkmate', 'surrender', 'timeout', 'abort_by_inactivity'

  @Column({ default: 0 })
  whiteEloChange!: number; // Cuántos puntos ganó/perdió (+15, -12, etc)

  @Column({ default: 0 })
  blackEloChange!: number;

  @CreateDateColumn()
  playedAt!: Date;
}