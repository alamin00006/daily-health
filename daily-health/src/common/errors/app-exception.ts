import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Throw this from services/controllers to control the error `code` the app sees.
 * `message` is for developers (English); the app shows Bangla text by `code`.
 * `details` must never contain health data, phone numbers or secrets.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details: unknown = null,
  ) {
    super({ code, message, details }, status);
  }
}
