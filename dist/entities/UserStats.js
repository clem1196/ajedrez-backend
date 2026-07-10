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
exports.UserStats = void 0;
// src/entities/UserStats.ts
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
let UserStats = class UserStats {
    id;
    elo; // 🏆 Puntaje competitivo global
    wins;
    losses;
    draws;
    user;
};
exports.UserStats = UserStats;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], UserStats.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1200 }),
    __metadata("design:type", Number)
], UserStats.prototype, "elo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], UserStats.prototype, "wins", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], UserStats.prototype, "losses", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], UserStats.prototype, "draws", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => User_1.User, (user) => user.stats, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", User_1.User)
], UserStats.prototype, "user", void 0);
exports.UserStats = UserStats = __decorate([
    (0, typeorm_1.Entity)('user_stats')
], UserStats);
