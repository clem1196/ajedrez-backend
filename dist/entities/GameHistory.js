"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameHistory = void 0;
// src/entities/GameHistory.ts
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
let GameHistory = class GameHistory {
    id;
    roomId;
    // Guardamos nombres por si juegan invitados contra registrados, 
    // pero enlazamos al objeto User si están autenticados (opcional)
    whiteNick;
    blackNick;
    whiteUser;
    blackUser;
    result; // Resultado final
    reason; // 'checkmate', 'surrender', 'timeout', 'abort_by_inactivity'
    whiteEloChange; // Cuántos puntos ganó/perdió (+15, -12, etc)
    blackEloChange;
    playedAt;
};
exports.GameHistory = GameHistory;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], GameHistory.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], GameHistory.prototype, "roomId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], GameHistory.prototype, "whiteNick", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], GameHistory.prototype, "blackNick", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'whiteUserId' }),
    __metadata("design:type", Object)
], GameHistory.prototype, "whiteUser", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'blackUserId' }),
    __metadata("design:type", Object)
], GameHistory.prototype, "blackUser", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 50 }),
    __metadata("design:type", String)
], GameHistory.prototype, "result", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255 }),
    __metadata("design:type", String)
], GameHistory.prototype, "reason", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], GameHistory.prototype, "whiteEloChange", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], GameHistory.prototype, "blackEloChange", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], GameHistory.prototype, "playedAt", void 0);
exports.GameHistory = GameHistory = __decorate([
    (0, typeorm_1.Entity)('game_history')
], GameHistory);
