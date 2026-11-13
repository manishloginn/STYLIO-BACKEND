import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel('User') private readonly users: Model<MongoDoc>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AuthUser): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub).lean();
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    return { sub: user._id, role: user.role, phone: user.phone };
  }
}
