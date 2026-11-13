import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcryptjs';
import { Model } from 'mongoose';
import { UserStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { sha256 } from '../common/utils/hash';
import { normalizePhone } from '../common/utils/phone';
import { toPublic } from '../common/utils/public';
import { LoginDto, OtpRequestDto, OtpVerifyDto, RegisterDto } from './auth.dto';
import { OtpProvider } from './otp.provider';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel('User') private readonly users: Model<MongoDoc>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpProvider,
  ) {}

  async register(dto: RegisterDto) {
    const phone = normalizePhone(dto.phone);
    const passwordHash = await hash(dto.password, 10);
    const user = await this.users.create({
      name: dto.name.trim(),
      phone,
      email: dto.email?.trim().toLowerCase() || undefined,
      passwordHash,
      role: dto.role,
      status: UserStatus.ACTIVE,
    });
    return this.issueSession(user);
  }

  async login(dto: LoginDto) {
    const phone = normalizePhone(dto.phone);
    const user = await this.users.findOne({ phone });
    if (!user || !user.passwordHash || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Mobile number or password is incorrect');
    }
    const ok = await compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Mobile number or password is incorrect');
    return this.issueSession(user);
  }

  async requestOtp(dto: OtpRequestDto) {
    const phone = normalizePhone(dto.phone);
    const user = await this.users.findOne({ phone, status: UserStatus.ACTIVE });
    if (!user) {
      return { sent: true };
    }
    const issued = this.otp.issueLoginCode(phone);
    user.otpHash = sha256(`${issued.code}:${this.config.getOrThrow<string>('OTP_PEPPER')}`);
    user.otpExpiresAt = new Date(Date.now() + 3 * 60 * 1000);
    await user.save();
    return { sent: true, devCode: issued.devCode };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const phone = normalizePhone(dto.phone);
    const user = await this.users.findOne({ phone, status: UserStatus.ACTIVE });
    if (!user || !user.otpHash || !user.otpExpiresAt || user.otpExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('OTP is invalid or expired');
    }
    const digest = sha256(`${dto.code}:${this.config.getOrThrow<string>('OTP_PEPPER')}`);
    if (digest !== user.otpHash) {
      throw new UnauthorizedException('OTP is invalid or expired');
    }
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    await user.save();
    return this.issueSession(user);
  }

  async refresh(refreshToken: string) {
    let payload: AuthUser;
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token is invalid');
    }
    const matches = await compare(refreshToken, user.refreshTokenHash);
    if (!matches) throw new UnauthorizedException('Refresh token is invalid');
    return this.issueSession(user);
  }

  async logout(userId: string) {
    await this.users.findByIdAndUpdate(userId, { $unset: { refreshTokenHash: 1 } });
    return { loggedOut: true };
  }

  private async issueSession(user: MongoDoc) {
    const payload: AuthUser = { sub: user._id, role: user.role, phone: user.phone };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL') || '15m',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_TTL') || '7d',
    });
    user.refreshTokenHash = await hash(refreshToken, 10);
    await user.save();
    return { accessToken, refreshToken, user: toPublic(user) };
  }
}
