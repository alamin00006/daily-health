import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RegisteredUsersOnly,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { UuidParam } from '../../common/pipes/uuid-param.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  requireUploadedFile,
  SingleFileUpload,
  type UploadedMultipartFile,
} from '../../core/uploads/single-file-upload.decorator.js';
import {
  listMessagesQuerySchema,
  sendImageFieldsSchema,
  sendMessageRequestSchema,
  type ConversationResponse,
  type ListMessagesQuery,
  type MessageResponse,
  type SendImageFields,
  type SendMessageRequest,
} from '../../shared-contracts/chat.contract.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import { ChatService } from './chat.service.js';

@ApiTags('chat')
@ApiBearerAuth()
@RegisteredUsersOnly()
@Controller('conversations/:conversationId')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'The conversation, participants and my unread count (participants only)' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('conversationId') conversationId: string,
  ): Promise<ConversationResponse> {
    return this.chat.get(user.userId, conversationId);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Messages, newest first (cursor pagination)' })
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('conversationId') conversationId: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ): Promise<PaginatedResponse<MessageResponse>> {
    return this.chat.messages(user.userId, conversationId, query);
  }

  @Post('messages')
  @ApiOperation({
    summary: 'Send a text message; resending the same clientMsgId returns the first one',
  })
  @ApiZodBody(sendMessageRequestSchema)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(sendMessageRequestSchema)) body: SendMessageRequest,
  ): Promise<MessageResponse> {
    return this.chat.send(user.userId, conversationId, body);
  }

  @Post('images')
  @SingleFileUpload(sendImageFieldsSchema)
  @ApiOperation({ summary: 'Send a photo (JPEG/PNG/WebP, stored privately as WebP)' })
  sendImage(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('conversationId') conversationId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body(new ZodValidationPipe(sendImageFieldsSchema)) fields: SendImageFields,
  ): Promise<MessageResponse> {
    return this.chat.sendImage(user.userId, conversationId, requireUploadedFile(file).buffer, fields);
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark everything up to now as read' })
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @UuidParam('conversationId') conversationId: string,
  ): Promise<void> {
    await this.chat.markRead(user.userId, conversationId);
  }
}
