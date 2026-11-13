export interface AppEnv {
  NODE_ENV: string;
  PORT: number;
  MONGODB_URI: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  OTP_PROVIDER: 'dev';
  PAYMENT_PROVIDER: 'dev' | 'razorpay';
  DEV_OTP_CODE: string;
  DEV_WEBHOOK_SECRET: string;
  OTP_PEPPER: string;
  WEB_ORIGIN: string;
  API_ORIGIN?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const nodeEnv = String(config.NODE_ENV || 'development');
  const required = [
    'MONGODB_URI',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'DEV_WEBHOOK_SECRET',
    'OTP_PEPPER',
  ];
  for (const key of required) {
    if (!config[key] || String(config[key]).trim() === '') {
      throw new Error(`Missing environment variable ${key}`);
    }
  }
  const otpProvider = String(config.OTP_PROVIDER || 'dev');
  const paymentProvider = String(config.PAYMENT_PROVIDER || 'dev');
  if (otpProvider !== 'dev') {
    throw new Error('OTP_PROVIDER must be dev until a production SMS adapter is configured');
  }
  if (paymentProvider !== 'dev' && paymentProvider !== 'razorpay') {
    throw new Error('PAYMENT_PROVIDER must be dev or razorpay');
  }
  if (nodeEnv === 'production' && otpProvider === 'dev') {
    console.warn('OTP_PROVIDER=dev is running in production. Login uses DEV_OTP_CODE until an SMS adapter is configured.');
  }
  if (nodeEnv === 'production' && paymentProvider === 'dev') {
    throw new Error('Refusing to boot: PAYMENT_PROVIDER=dev is not allowed in production');
  }
  if (paymentProvider === 'razorpay') {
    if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay keys are required when PAYMENT_PROVIDER=razorpay');
    }
  }
  const devCode = String(config.DEV_OTP_CODE || '482913');
  if (!/^\d{6}$/.test(devCode)) {
    throw new Error('DEV_OTP_CODE must be 6 digits');
  }
  return {
    NODE_ENV: nodeEnv,
    PORT: Number(config.PORT || 3000),
    MONGODB_URI: String(config.MONGODB_URI),
    JWT_ACCESS_SECRET: String(config.JWT_ACCESS_SECRET),
    JWT_REFRESH_SECRET: String(config.JWT_REFRESH_SECRET),
    JWT_ACCESS_TTL: String(config.JWT_ACCESS_TTL || '15m'),
    JWT_REFRESH_TTL: String(config.JWT_REFRESH_TTL || '7d'),
    OTP_PROVIDER: 'dev',
    PAYMENT_PROVIDER: paymentProvider as 'dev' | 'razorpay',
    DEV_OTP_CODE: devCode,
    DEV_WEBHOOK_SECRET: String(config.DEV_WEBHOOK_SECRET),
    OTP_PEPPER: String(config.OTP_PEPPER),
    WEB_ORIGIN: String(config.WEB_ORIGIN || 'http://localhost:5173'),
    API_ORIGIN: config.API_ORIGIN ? String(config.API_ORIGIN).replace(/\/$/, '') : undefined,
    RAZORPAY_KEY_ID: config.RAZORPAY_KEY_ID ? String(config.RAZORPAY_KEY_ID) : undefined,
    RAZORPAY_KEY_SECRET: config.RAZORPAY_KEY_SECRET ? String(config.RAZORPAY_KEY_SECRET) : undefined,
    RAZORPAY_WEBHOOK_SECRET: config.RAZORPAY_WEBHOOK_SECRET ? String(config.RAZORPAY_WEBHOOK_SECRET) : undefined,
  };
}
