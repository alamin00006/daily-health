import { HttpStatus, Injectable } from '@nestjs/common';
import agoraToken from 'agora-token';
import { AppException } from '../../../common/errors/app-exception.js';
import { AppConfigService } from '../../../core/config/app-config.service.js';
import { ConsultationErrorCode } from '../consultation-error-codes.js';
import { VideoProvider, type VideoRoom, type VideoToken } from './video-provider.js';

const { RtcRole, RtcTokenBuilder } = agoraToken;

/**
 * Agora RTC: calls run on Agora's network (no TURN server of our own). The App
 * Certificate stays here; the apps only get tokens that expire after
 * AGORA_TOKEN_TTL_SECONDS and work for one channel and uid.
 */
@Injectable()
export class AgoraVideoProvider extends VideoProvider {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  get isConfigured(): boolean {
    return this.config.agora !== null;
  }

  createRoom(consultationId: string): VideoRoom {
    // Agora channel names: up to 64 bytes of letters, digits and a few symbols.
    return { channel: `ds-${consultationId.replaceAll('-', '')}` };
  }

  issueToken(channel: string, uid: number): VideoToken {
    const agora = this.config.agora;
    if (!agora) {
      throw new AppException(
        ConsultationErrorCode.VIDEO_NOT_CONFIGURED,
        'Video calls are not set up on this server',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const token = RtcTokenBuilder.buildTokenWithUid(
      agora.appId,
      agora.appCertificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      agora.tokenTtlSeconds,
      agora.tokenTtlSeconds,
    );
    return {
      appId: agora.appId,
      channel,
      token,
      uid,
      expiresAt: new Date(Date.now() + agora.tokenTtlSeconds * 1000),
    };
  }

  async endRoom(): Promise<void> {
    // Nothing to close: the channel empties when both sides leave, and the
    // tokens expire. Kicking users needs Agora's REST credentials (not used).
  }
}
