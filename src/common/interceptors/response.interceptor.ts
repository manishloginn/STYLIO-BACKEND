import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { toPublic } from '../utils/public';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<{ headersSent?: boolean }>();
    return next.handle().pipe(
      map((value) => {
        if (response?.headersSent) return value;
        if (value && typeof value === 'object' && 'data' in value && 'meta' in value) {
          const wrapped = value as { data: unknown; meta: unknown };
          return { success: true, data: toPublic(wrapped.data), meta: wrapped.meta };
        }
        return { success: true, data: toPublic(value) };
      }),
    );
  }
}
