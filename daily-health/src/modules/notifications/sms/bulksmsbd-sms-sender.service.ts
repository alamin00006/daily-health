import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service.js';
import { bulkSmsRequest } from './bulksmsbd-request.js';
import { SmsSender, type SmsResult } from './sms-sender.js';

/** BulkSMSBD answers 202 when the SMS is accepted for delivery. */
const ACCEPTED_CODE = 202;
/** Anything outside 7-bit ASCII (Bangla) has to go as a unicode SMS. */
const NON_ASCII = /[^\u0000-\u007f]/;

interface BulkSmsBdResponse {
  response_code?: number | string;
  message_id?: number | string | null;
  success_message?: string;
  error_message?: string;
}

/**
 * BulkSMSBD (bulksmsbd.net): POST `/api/smsapi?api_key&type&number&senderid&message`
 * on SMS_API_HOST_SITE. `number` is 8801XXXXXXXXX; `type` is unicode for Bangla.
 *
 * Never throws: a network error or a rejected SMS comes back as `{ ok: false }` with a
 * reason such as `BULKSMSBD_1007` (the gateway's code), so the Notification row records
 * why. The phone number and the text are never logged.
 */
@Injectable()
export class BulkSmsBdSenderService extends SmsSender {
  private readonly logger = new Logger(BulkSmsBdSenderService.name);
  private readonly settings: { host: string; apiKey: string; senderId: string };

  constructor(config: AppConfigService) {
    super();
    const sms = config.sms;
    if (!sms) throw new Error('BulkSmsBdSenderService needs SMS_API_KEY_VALUE and SMS_SENDER_ID');
    this.settings = sms;
  }

  async send(phone: string, text: string): Promise<SmsResult> {
    const query = new URLSearchParams({
      api_key: this.settings.apiKey,
      type: NON_ASCII.test(text) ? 'unicode' : 'text',
      // The gateway wants the number without the leading "+".
      number: phone.replace(/^\+/, ''),
      senderid: this.settings.senderId,
      message: text,
    });

    let raw: string;
    try {
      raw = await bulkSmsRequest(this.settings.host, `/api/smsapi?${query.toString()}`);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      this.logger.warn(`BulkSMSBD request failed (${name})`);
      return { ok: false, reason: name === 'TimeoutError' ? 'BULKSMSBD_TIMEOUT' : 'BULKSMSBD_UNREACHABLE' };
    }

    let answer: BulkSmsBdResponse;
    try {
      answer = JSON.parse(raw) as BulkSmsBdResponse;
    } catch {
      this.logger.warn('BulkSMSBD answered with something that is not JSON');
      return { ok: false, reason: 'BULKSMSBD_BAD_RESPONSE' };
    }

    const code = Number(answer.response_code);
    if (code === ACCEPTED_CODE) {
      const id = answer.message_id;
      return { ok: true, providerMsgId: id === null || id === undefined || id === '' ? null : String(id) };
    }
    // The gateway's own error text names the problem (balance, sender ID...), never the number.
    this.logger.warn(`BulkSMSBD rejected the SMS: ${answer.response_code} ${answer.error_message ?? ''}`.trim());
    return { ok: false, reason: `BULKSMSBD_${Number.isFinite(code) ? code : 'BAD_RESPONSE'}` };
  }
}
