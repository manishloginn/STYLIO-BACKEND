import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        const raw = record.message;
        message = Array.isArray(raw) ? raw.join(', ') : String(raw || message);
        if (typeof record.code === 'string') code = record.code;
      }
      if (code === 'INTERNAL_ERROR') {
        code =
          status === 400
            ? 'BAD_REQUEST'
            : status === 401
              ? 'UNAUTHORIZED'
              : status === 403
                ? 'FORBIDDEN'
                : status === 404
                  ? 'NOT_FOUND'
                  : status === 409
                    ? 'CONFLICT'
                    : 'HTTP_ERROR';
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      if (exception.message.includes('E11000')) {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'This record already exists';
      }
    }

    response.status(status).json({
      success: false,
      error: { code, message },
    });
  }
}
