import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception.js';
import { afterCursor, toKeysetPage } from '../../common/pagination/keyset-cursor.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StoredUploadsService } from '../../core/uploads/stored-uploads.service.js';
import { UploadedFileProcessorService } from '../../core/uploads/uploaded-file-processor.service.js';
import type { HealthTip } from '../../generated/prisma/client.js';
import type { PaginatedResponse } from '../../shared-contracts/common-fields.contract.js';
import type {
  CreateHealthTipRequest,
  HealthTipResponse,
  ListHealthTipsQuery,
  ListStaffHealthTipsQuery,
  StaffHealthTipResponse,
  UpdateHealthTipRequest,
} from '../../shared-contracts/content.contract.js';
import { StaffDirectoryService } from '../admin/staff-directory.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { ContentErrorCode } from './content-error-codes.js';

const TIP_IMAGE_MIME = 'image/webp';

/** স্বাস্থ্য টিপস: staff write drafts, publish them; everyone reads published ones. */
@Injectable()
export class HealthTipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: StoredUploadsService,
    private readonly processor: UploadedFileProcessorService,
    private readonly directory: ProviderDirectoryService,
    private readonly staff: StaffDirectoryService,
  ) {}

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  async listPublished(query: ListHealthTipsQuery): Promise<PaginatedResponse<HealthTipResponse>> {
    const rows = await this.prisma.healthTip.findMany({
      where: {
        status: 'PUBLISHED',
        ...(query.category ? { category: query.category } : {}),
        ...afterCursor('publishedAt', query.cursor),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.publishedAt!, (r) => r);
    return { data: await this.views(page.data), meta: page.meta };
  }

  async getPublished(tipId: string): Promise<HealthTipResponse> {
    const row = await this.prisma.healthTip.findFirst({ where: { id: tipId, status: 'PUBLISHED' } });
    if (!row) throw tipNotFound();
    return (await this.views([row]))[0];
  }

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  async staffList(query: ListStaffHealthTipsQuery): Promise<PaginatedResponse<StaffHealthTipResponse>> {
    const rows = await this.prisma.healthTip.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...afterCursor('updatedAt', query.cursor),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = toKeysetPage(rows, query.limit, (r) => r.updatedAt, (r) => r);
    return { data: await this.staffViews(page.data), meta: page.meta };
  }

  async staffGet(tipId: string): Promise<StaffHealthTipResponse> {
    return (await this.staffViews([await this.require(tipId)]))[0];
  }

  async create(userId: string, input: CreateHealthTipRequest): Promise<StaffHealthTipResponse> {
    await this.checkAuthor(input.authorProviderId);
    const row = await this.prisma.healthTip.create({
      data: {
        title: input.title,
        body: input.body,
        category: input.category,
        authorProviderId: input.authorProviderId ?? null,
        createdByUserId: userId,
      },
    });
    return this.staffGet(row.id);
  }

  async update(tipId: string, input: UpdateHealthTipRequest): Promise<StaffHealthTipResponse> {
    await this.require(tipId);
    if (input.authorProviderId !== undefined) await this.checkAuthor(input.authorProviderId);
    await this.prisma.healthTip.update({
      where: { id: tipId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.authorProviderId !== undefined ? { authorProviderId: input.authorProviderId } : {}),
      },
    });
    return this.staffGet(tipId);
  }

  /** Publishing again keeps the first publish time (the tip does not jump to the top). */
  async setPublished(tipId: string, published: boolean): Promise<StaffHealthTipResponse> {
    const row = await this.require(tipId);
    await this.prisma.healthTip.update({
      where: { id: tipId },
      data: published
        ? { status: 'PUBLISHED', publishedAt: row.publishedAt ?? new Date() }
        : { status: 'DRAFT' },
    });
    return this.staffGet(tipId);
  }

  async setImage(tipId: string, file: Buffer): Promise<StaffHealthTipResponse> {
    const row = await this.require(tipId);
    const processed = await this.processor.process(file, { allowPdf: false });
    const storageKey = await this.uploads.store(processed, 'public');
    try {
      await this.prisma.healthTip.update({ where: { id: tipId }, data: { imageStorageKey: storageKey } });
    } catch (error) {
      await this.uploads.remove(storageKey, processed.mimeType);
      throw error;
    }
    if (row.imageStorageKey) await this.uploads.remove(row.imageStorageKey, TIP_IMAGE_MIME);
    return this.staffGet(tipId);
  }

  async removeImage(tipId: string): Promise<StaffHealthTipResponse> {
    const row = await this.require(tipId);
    if (row.imageStorageKey) {
      await this.prisma.healthTip.update({ where: { id: tipId }, data: { imageStorageKey: null } });
      await this.uploads.remove(row.imageStorageKey, TIP_IMAGE_MIME);
    }
    return this.staffGet(tipId);
  }

  async remove(tipId: string): Promise<void> {
    const row = await this.require(tipId);
    await this.prisma.healthTip.delete({ where: { id: tipId } });
    if (row.imageStorageKey) await this.uploads.remove(row.imageStorageKey, TIP_IMAGE_MIME);
  }

  async countPublished(): Promise<number> {
    return this.prisma.healthTip.count({ where: { status: 'PUBLISHED' } });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async checkAuthor(providerId: string | null | undefined): Promise<void> {
    if (!providerId) return;
    const provider = await this.directory.findById(providerId);
    if (!provider || provider.verificationStatus !== 'VERIFIED') {
      throw new AppException(ContentErrorCode.TIP_AUTHOR_INVALID, 'Credit only a verified provider');
    }
  }

  private async require(tipId: string): Promise<HealthTip> {
    const row = await this.prisma.healthTip.findUnique({ where: { id: tipId } });
    if (!row) throw tipNotFound();
    return row;
  }

  private async views(rows: HealthTip[]): Promise<HealthTipResponse[]> {
    const authors = await this.directory.summariesByIds(
      rows.flatMap((r) => (r.authorProviderId ? [r.authorProviderId] : [])),
    );
    return rows.map((row) => {
      const author = row.authorProviderId ? authors.get(row.authorProviderId) : undefined;
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        category: row.category,
        imageUrl: row.imageStorageKey ? this.uploads.thumbnailUrl(row.imageStorageKey, 800) : null,
        imageThumbnailUrl: row.imageStorageKey ? this.uploads.thumbnailUrl(row.imageStorageKey, 200) : null,
        author: author
          ? {
              id: author.id,
              type: author.type,
              displayName: author.displayName,
              designation: author.designation,
              avatarThumbnailUrl: author.avatarThumbnailUrl,
            }
          : null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
      };
    });
  }

  private async staffViews(rows: HealthTip[]): Promise<StaffHealthTipResponse[]> {
    const [base, names] = await Promise.all([
      this.views(rows),
      this.staff.namesByUserIds(rows.map((r) => r.createdByUserId)),
    ]);
    return rows.map((row, i) => ({
      ...base[i],
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdByName: names.get(row.createdByUserId) ?? null,
    }));
  }
}

function tipNotFound(): AppException {
  return new AppException(ContentErrorCode.HEALTH_TIP_NOT_FOUND, 'Health tip not found', HttpStatus.NOT_FOUND);
}
