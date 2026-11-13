import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAuditEvent } from '../../common/events/audit-event.js';
import { AppException } from '../../common/errors/app-exception.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type EmergencyContact } from '../../generated/prisma/client.js';
import {
  EMERGENCY_CONTACTS_MAX,
  type CreateEmergencyContactRequest,
  type EmergencyContactResponse,
  type UpdateEmergencyContactRequest,
} from '../../shared-contracts/emergency.contract.js';
import type { ProfileAccess } from '../users/profile-access.service.js';
import { EmergencyErrorCode } from './emergency-error-codes.js';

/** People to call or SMS when the SOS button is pressed. */
@Injectable()
export class EmergencyContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(access: ProfileAccess): Promise<EmergencyContactResponse[]> {
    const rows = await this.listFor(access.profile.id);
    return rows.map(toResponse);
  }

  listFor(patientId: string): Promise<EmergencyContact[]> {
    return this.prisma.emergencyContact.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    userId: string,
    access: ProfileAccess,
    input: CreateEmergencyContactRequest,
  ): Promise<EmergencyContactResponse> {
    const patientId = access.profile.id;
    const count = await this.prisma.emergencyContact.count({ where: { patientId } });
    if (count >= EMERGENCY_CONTACTS_MAX) {
      throw new AppException(
        EmergencyErrorCode.EMERGENCY_CONTACTS_LIMIT,
        `At most ${EMERGENCY_CONTACTS_MAX} emergency contacts`,
        HttpStatus.CONFLICT,
      );
    }
    const row = await this.prisma.emergencyContact
      .create({
        data: {
          patientId,
          name: input.name,
          phone: input.phone,
          relation: input.relation ?? null,
          notifyOnSos: input.notifyOnSos ?? true,
        },
      })
      .catch(rethrowDuplicate);
    this.audit(userId, access, 'emergency.contact.create', row.id);
    return toResponse(row);
  }

  async update(
    userId: string,
    access: ProfileAccess,
    contactId: string,
    input: UpdateEmergencyContactRequest,
  ): Promise<EmergencyContactResponse> {
    await this.findOwned(access, contactId);
    const row = await this.prisma.emergencyContact
      .update({
        where: { id: contactId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.relation !== undefined ? { relation: input.relation } : {}),
          ...(input.notifyOnSos !== undefined ? { notifyOnSos: input.notifyOnSos } : {}),
        },
      })
      .catch(rethrowDuplicate);
    this.audit(userId, access, 'emergency.contact.update', contactId);
    return toResponse(row);
  }

  async remove(userId: string, access: ProfileAccess, contactId: string): Promise<void> {
    const { count } = await this.prisma.emergencyContact.deleteMany({
      where: { id: contactId, patientId: access.profile.id },
    });
    if (count === 0) throw contactNotFound();
    this.audit(userId, access, 'emergency.contact.delete', contactId);
  }

  private async findOwned(access: ProfileAccess, contactId: string): Promise<EmergencyContact> {
    const row = await this.prisma.emergencyContact.findFirst({
      where: { id: contactId, patientId: access.profile.id },
    });
    if (!row) throw contactNotFound();
    return row;
  }

  private audit(userId: string, access: ProfileAccess, action: string, entityId: string): void {
    emitAuditEvent(this.events, {
      actorUserId: userId,
      patientId: access.profile.id,
      action,
      entityType: 'EmergencyContact',
      entityId,
    });
  }
}

export function toResponse(row: EmergencyContact): EmergencyContactResponse {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    relation: row.relation,
    notifyOnSos: row.notifyOnSos,
  };
}

function rethrowDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppException(
      EmergencyErrorCode.EMERGENCY_CONTACT_DUPLICATE,
      'This number is already a contact',
      HttpStatus.CONFLICT,
    );
  }
  throw error;
}

function contactNotFound(): AppException {
  return new AppException(
    EmergencyErrorCode.EMERGENCY_CONTACT_NOT_FOUND,
    'Emergency contact not found',
    HttpStatus.NOT_FOUND,
  );
}
