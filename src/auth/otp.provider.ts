import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export abstract class OtpProvider {
  abstract issueLoginCode(phone: string): { code: string; devCode?: string };
}

@Injectable()
export class DevOtpProvider extends OtpProvider {
  private readonly logger = new Logger(DevOtpProvider.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  issueLoginCode(phone: string): { code: string; devCode?: string } {
    const code = this.config.getOrThrow<string>('DEV_OTP_CODE');
    this.logger.warn(`Development OTP for ${phone}: ${code}. This adapter must not run in production.`);
    const devCode = this.config.get<string>('NODE_ENV') === 'production' ? undefined : code;
    return { code, devCode };
  }
}
