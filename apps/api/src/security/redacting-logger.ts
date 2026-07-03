import { ConsoleLogger, Injectable } from '@nestjs/common';

const sensitiveKeys = [
  'access_token',
  'accesstoken',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'jwt',
  'otp',
  'password',
  'passwordhash',
  'refresh_token',
  'refreshtoken',
  'secret',
  'token',
  'twofactortoken',
];

@Injectable()
export class RedactingLogger extends ConsoleLogger {
log(message: unknown, context?: string) {
 const cleanMessage = this.redact(message);

 if (context) {
   super.log(cleanMessage, context);
   return;
 }

 super.log(cleanMessage);
}

error(message: unknown, stack?: string, context?: string) {
 const cleanMessage = this.redact(message);
 const cleanStack = stack ? this.redact(stack) : undefined;

 if (context) {
   super.error(cleanMessage, cleanStack, context);
   return;
 }

 if (cleanStack) {
   super.error(cleanMessage, cleanStack);
   return;
 }

 super.error(cleanMessage);
}

warn(message: unknown, context?: string) {
 const cleanMessage = this.redact(message);

 if (context) {
   super.warn(cleanMessage, context);
   return;
 }

 super.warn(cleanMessage);
}

debug(message: unknown, context?: string) {
 const cleanMessage = this.redact(message);

 if (context) {
   super.debug(cleanMessage, context);
   return;
 }

 super.debug(cleanMessage);
}

verbose(message: unknown, context?: string) {
 const cleanMessage = this.redact(message);

 if (context) {
   super.verbose(cleanMessage, context);
   return;
 }

 super.verbose(cleanMessage);
}

  private redact(value: unknown): string {
    if (value === undefined || value === null) {
      return String(value);
    }

    if (typeof value === 'string') {
      return this.redactText(value);
    }

    try {
      return this.redactText(JSON.stringify(this.redactObject(value)));
    } catch {
      return '[REDACTED_LOG_VALUE]';
    }
  }

  private redactObject(value: unknown): unknown {
    if (!value) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactObject(item));
    }

    if (typeof value === 'object') {
      const output: Record<string, unknown> = {};

      for (const [key, childValue] of Object.entries(value)) {
        if (this.isSensitiveKey(key)) {
          output[key] = '[REDACTED]';
          continue;
        }

        output[key] = this.redactObject(childValue);
      }

      return output;
    }

    if (typeof value === 'string') {
      return this.redactText(value);
    }

    return value;
  }

  private isSensitiveKey(key: string) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

    return sensitiveKeys.some((sensitiveKey) =>
      normalizedKey.includes(sensitiveKey),
    );
  }

  private redactText(value: string) {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/authorization["']?\s*[:=]\s*["']?[^"',\s}]+/gi, 'authorization: [REDACTED]')
      .replace(/cookie["']?\s*[:=]\s*["']?[^"',}]+/gi, 'cookie: [REDACTED]')
      .replace(/access_token=([^&\s]+)/gi, 'access_token=[REDACTED]')
      .replace(/refresh_token=([^&\s]+)/gi, 'refresh_token=[REDACTED]')
      .replace(/token=([^&\s]+)/gi, 'token=[REDACTED]')
      .replace(/password=([^&\s]+)/gi, 'password=[REDACTED]')
      .replace(/secret=([^&\s]+)/gi, 'secret=[REDACTED]')
      .replace(/api_key=([^&\s]+)/gi, 'api_key=[REDACTED]');
  }
}