import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { BillingService } from './billing.service';
import { MediaService } from './media.service';
import { MetaAccountsService } from './meta-accounts.service';
import { env } from '../env';

type TemplateFilters = {
  status?: string;
  category?: string;
  search?: string;
};

type TemplateButton = {
  type: string;
  text: string;
  url?: string;
  phoneNumber?: string;
  otpType?: string;
  flowId?: string;
  flowAction?: string;
  navigateScreen?: string;
};

@Injectable()
export class TemplatesService {
private readonly graphApiVersion =
  env.metaGraphApiVersion;
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAccountsService: MetaAccountsService,
    private readonly mediaService: MediaService,
    private readonly billingService: BillingService,
  ) {}

  listTemplates(tenantId: string, filters: TemplateFilters) {
    const status = String(filters.status || '').trim().toUpperCase();
    const category = String(filters.category || '').trim().toUpperCase();
    const search = String(filters.search || '').trim();

    const where: Prisma.WhatsappTemplateWhereInput = {
      tenantId,
    };

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          bodyText: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          language: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

return this.prisma.whatsappTemplate.findMany({
  where,
  include: {
    headerMediaFile: {
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        mediaType: true,
        sizeBytes: true,
        createdAt: true,
      },
    },
  },
  orderBy: {
    updatedAt: 'desc',
  },
});
  }

async syncTemplatesFromMeta(tenantId: string) {
 await this.billingService.assertSubscriptionCanUseWorkspace(
   tenantId,
   'syncing templates from Meta',
 );

 const connection =
   await this.metaAccountsService.getActiveConnectionSecret(tenantId);

    const syncedTemplates: unknown[] = [];
    let afterCursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const url = new URL(
        `https://graph.facebook.com/${this.graphApiVersion}/${connection.wabaId}/message_templates`,
      );

      url.searchParams.set(
        'fields',
        'id,name,language,status,category,components,quality_score,rejected_reason',
      );
      url.searchParams.set('limit', '100');

      if (afterCursor) {
        url.searchParams.set('after', afterCursor);
      }

      const response: Response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
        },
      });

      const data: {
        data?: unknown[];
        paging?: {
          cursors?: {
            after?: string;
          };
          next?: string;
        };
        error?: unknown;
      } = await response.json();

      if (!response.ok) {
        throw new BadRequestException({
          message: 'Failed to sync templates from Meta',
          metaError: data,
        });
      }

      const templates = Array.isArray(data.data) ? data.data : [];
      syncedTemplates.push(...templates);

      afterCursor =
        typeof data.paging?.cursors?.after === 'string'
          ? data.paging.cursors.after
          : null;

      hasNextPage = Boolean(data.paging?.next && afterCursor);
    }

    const savedTemplates = [];

    for (const rawTemplate of syncedTemplates) {
      const savedTemplate = await this.saveMetaTemplateFromRaw(
        tenantId,
        rawTemplate,
      );

      if (savedTemplate) {
        savedTemplates.push(savedTemplate);
      }
    }

    return {
      ok: true,
      synced: savedTemplates.length,
      templates: savedTemplates,
    };
  }

async refreshTemplateFromMeta(tenantId: string, templateId: string) {
 await this.billingService.assertSubscriptionCanUseWorkspace(
   tenantId,
   'refreshing templates from Meta',
 );

 const template = await this.prisma.whatsappTemplate.findFirst({
      where: {
        id: templateId,
        tenantId,
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.status === 'DRAFT' || !template.metaTemplateId) {
      throw new BadRequestException(
        'Only submitted or synced Meta templates can be refreshed',
      );
    }

    const connection =
      await this.metaAccountsService.getActiveConnectionSecret(tenantId);

    const url = new URL(
      `https://graph.facebook.com/${this.graphApiVersion}/${connection.wabaId}/message_templates`,
    );

    url.searchParams.set(
      'fields',
      'id,name,language,status,category,components,quality_score,rejected_reason',
    );
    url.searchParams.set('name', template.name);
    url.searchParams.set('limit', '100');

    const response: Response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
    });

    const data: {
      data?: unknown[];
      error?: unknown;
    } = await response.json();

    if (!response.ok) {
      throw new BadRequestException({
        message: 'Failed to refresh template from Meta',
        metaError: data,
      });
    }

    const metaTemplates = Array.isArray(data.data) ? data.data : [];

    const matchedTemplate = metaTemplates.find((rawTemplate) => {
      const metaTemplate = rawTemplate as Record<string, unknown>;

      return (
        String(metaTemplate.id || '') === template.metaTemplateId ||
        (String(metaTemplate.name || '') === template.name &&
          String(metaTemplate.language || '') === template.language)
      );
    });

    if (!matchedTemplate) {
      throw new NotFoundException(
        'Template was not found in Meta. Try Sync Meta to refresh the full list.',
      );
    }

    const savedTemplate = await this.saveMetaTemplateFromRaw(
      tenantId,
      matchedTemplate,
    );

    return {
      ok: true,
      template: savedTemplate,
      meta: matchedTemplate,
    };
  }

 async listMetaFlows(tenantId: string) {
 await this.billingService.assertSubscriptionCanUseWorkspace(
   tenantId,
   'listing Meta Flows',
 );

 const connection =
   await this.metaAccountsService.getActiveConnectionSecret(tenantId);

    const url = new URL(
      `https://graph.facebook.com/${this.graphApiVersion}/${connection.wabaId}/flows`,
    );

    url.searchParams.set(
      'fields',
      'id,name,status,categories,validation_errors',
    );
    url.searchParams.set('limit', '100');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
      },
    });

    const data: {
      data?: unknown[];
      error?: unknown;
    } = await response.json();

    if (!response.ok) {
      throw new BadRequestException({
        message: 'Failed to fetch Meta Flows',
        metaError: data,
      });
    }

    const flows = Array.isArray(data.data) ? data.data : [];

    return {
      ok: true,
      flows: flows.map((flow) => {
        const rawFlow = flow as Record<string, unknown>;

        return {
          id: String(rawFlow.id || ''),
          name: String(rawFlow.name || ''),
          status: String(rawFlow.status || ''),
          categories: Array.isArray(rawFlow.categories)
            ? rawFlow.categories.map((category) => String(category))
            : [],
          hasValidationErrors:
            Array.isArray(rawFlow.validation_errors) &&
            rawFlow.validation_errors.length > 0,
        };
      }),
    };
  }

  async createTemplate(tenantId: string, input: Record<string, unknown>) {
    const cleaned = this.cleanTemplateInput(input);
    const components = this.buildComponents(cleaned);

    try {
      return await this.prisma.whatsappTemplate.create({
        data: {
          tenantId,
          metaTemplateId: null,
          name: cleaned.name,
          language: cleaned.language,
          category: cleaned.category,
          status: 'DRAFT',
          headerType: cleaned.headerType,
          headerText: cleaned.headerText,
          bodyText: cleaned.bodyText,
          footerText: cleaned.footerText,
          buttons: cleaned.buttons as Prisma.InputJsonValue,
          components: components as Prisma.InputJsonValue,
          variableCount: cleaned.variableCount,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Template with same name and language already exists',
        );
      }

      throw error;
    }
  }

 async uploadTemplateMediaToMeta(
 tenantId: string,
 input: Record<string, unknown>,
) {
 await this.billingService.assertSubscriptionCanUseWorkspace(
   tenantId,
   'uploading template media to Meta',
 );

 const mediaId = String(input.mediaId || '').trim();

    if (!mediaId) {
      throw new BadRequestException('Media ID is required');
    }

    const media = await this.mediaService.getMediaForMetaUpload(tenantId, mediaId);

    if (!['IMAGE', 'VIDEO'].includes(media.mediaType)) {
      throw new BadRequestException(
        'Carousel card media must be image or video',
      );
    }

    const connection =
      await this.metaAccountsService.getActiveConnectionSecret(tenantId);

    if (!connection.metaAppId) {
      throw new BadRequestException(
        'Meta App ID is required before uploading template media',
      );
    }

    const createUploadResponse = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${connection.metaAppId}/uploads`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_length: media.sizeBytes,
          file_type: media.mimeType,
        }),
      },
    );

    const uploadSession: {
      id?: string;
      error?: unknown;
    } = await createUploadResponse.json();

    if (!createUploadResponse.ok || !uploadSession.id) {
      throw new BadRequestException({
        message: 'Failed to create Meta media upload session',
        metaError: uploadSession,
      });
    }

    const uploadFileResponse = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${uploadSession.id}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${connection.accessToken}`,
          file_offset: '0',
          'Content-Type': 'application/octet-stream',
        },
        body: media.buffer as unknown as BodyInit,
      },
    );

    const uploadResult: {
      h?: string;
      handle?: string;
      error?: unknown;
    } = await uploadFileResponse.json();

    const metaHeaderHandle = uploadResult.h || uploadResult.handle || '';

    if (!uploadFileResponse.ok || !metaHeaderHandle) {
      throw new BadRequestException({
        message: 'Failed to upload template media to Meta',
        metaError: uploadResult,
      });
    }

    return {
      ok: true,
      media: {
        id: media.id,
        originalName: media.originalName,
        mediaType: media.mediaType,
        mimeType: media.mimeType,
      },
      metaHeaderHandle,
    };
  }

async uploadHeaderMediaSampleToMeta(
 tenantId: string,
 templateId: string,
 input: Record<string, unknown>,
) {
 await this.billingService.assertSubscriptionCanUseWorkspace(
   tenantId,
   'uploading header media samples to Meta',
 );

 const mediaId = String(input.mediaId || '').trim();

    if (!mediaId) {
      throw new BadRequestException('Media ID is required');
    }

    const template = await this.prisma.whatsappTemplate.findFirst({
      where: {
        id: templateId,
        tenantId,
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.status !== 'DRAFT') {
      throw new BadRequestException('Only draft templates can use media samples');
    }

    if (
      !template.headerType ||
      !['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)
    ) {
      throw new BadRequestException(
        'Header media sample is only allowed for image, video, or document headers',
      );
    }

    const media = await this.mediaService.getMediaForMetaUpload(tenantId, mediaId);

    if (template.headerType !== media.mediaType) {
      throw new BadRequestException(
        `Selected media must be ${template.headerType.toLowerCase()}`,
      );
    }

    const connection =
      await this.metaAccountsService.getActiveConnectionSecret(tenantId);

    if (!connection.metaAppId) {
      throw new BadRequestException(
        'Meta App ID is required before uploading media header samples',
      );
    }

    const createUploadResponse = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${connection.metaAppId}/uploads`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_length: media.sizeBytes,
          file_type: media.mimeType,
        }),
      },
    );

    const uploadSession: {
      id?: string;
      error?: unknown;
    } = await createUploadResponse.json();

    if (!createUploadResponse.ok || !uploadSession.id) {
      throw new BadRequestException({
        message: 'Failed to create Meta media upload session',
        metaError: uploadSession,
      });
    }

    const uploadFileResponse = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${uploadSession.id}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${connection.accessToken}`,
          file_offset: '0',
          'Content-Type': 'application/octet-stream',
        },
        body: media.buffer as unknown as BodyInit,
      },
    );

    const uploadResult: {
      h?: string;
      handle?: string;
      error?: unknown;
    } = await uploadFileResponse.json();

    const metaHeaderHandle = uploadResult.h || uploadResult.handle || '';

    if (!uploadFileResponse.ok || !metaHeaderHandle) {
      throw new BadRequestException({
        message: 'Failed to upload media sample to Meta',
        metaError: uploadResult,
      });
    }

const updatedTemplate = await this.prisma.whatsappTemplate.update({
  where: {
    id: template.id,
  },
  data: {
    headerMediaFileId: media.id,
    metaHeaderHandle,
  },
  include: {
    headerMediaFile: {
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        mediaType: true,
        sizeBytes: true,
        createdAt: true,
      },
    },
  },
});

    return {
      ok: true,
      template: updatedTemplate,
      media: {
        id: media.id,
        originalName: media.originalName,
        mediaType: media.mediaType,
        mimeType: media.mimeType,
      },
    };
  }

async submitTemplateToMeta(
 tenantId: string,
 templateId: string,
 input: Record<string, unknown>,
) {
 await this.billingService.assertSubscriptionCanUseWorkspace(
   tenantId,
   'submitting templates to Meta',
 );

 const template = await this.prisma.whatsappTemplate.findFirst({
      where: {
        id: templateId,
        tenantId,
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.status !== 'DRAFT') {
      throw new BadRequestException('Only draft templates can be submitted');
    }

    if (
      template.headerType &&
      ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType) &&
      !template.metaHeaderHandle
    ) {
      throw new BadRequestException(
        'Upload header media sample to Meta before submitting this template',
      );
    }

    const connection =
      await this.metaAccountsService.getActiveConnectionSecret(tenantId);

    const storedComponents = Array.isArray(template.components)
      ? (template.components as Array<Record<string, unknown>>)
      : [];

    const isAdvancedTemplate = storedComponents.some(
      (component) =>
        String(component.type || '').trim().toUpperCase() === 'CAROUSEL',
    );

    const bodyExamples = isAdvancedTemplate
      ? []
      : this.cleanExampleValues(
          input.bodyExamples,
          this.getVariableNumbers(template.bodyText),
          'Body examples',
        );

    const headerExamples = isAdvancedTemplate
      ? []
      : this.cleanExampleValues(
          input.headerExamples,
          this.getVariableNumbers(template.headerText || ''),
          'Header examples',
        );

 const components = isAdvancedTemplate
   ? this.cleanAdvancedComponents(storedComponents)
   : this.buildMetaSubmitComponents({
       headerType: template.headerType,
       headerText: template.headerText,
       metaHeaderHandle: template.metaHeaderHandle,
       bodyText: template.bodyText,
       footerText: template.footerText,
       buttons: this.normalizeStoredButtons(template.buttons),
       bodyExamples,
       headerExamples,
     });

    const response = await fetch(
      `https://graph.facebook.com/${this.graphApiVersion}/${connection.wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: template.name,
          language: template.language,
          category: template.category,
          components,
        }),
      },
    );

    const data: {
      id?: string;
      status?: string;
      category?: string;
      error?: unknown;
    } = await response.json();

    if (!response.ok) {
      throw new BadRequestException({
        message: 'Failed to submit template to Meta',
        metaError: data,
      });
    }

    const updatedTemplate = await this.prisma.whatsappTemplate.update({
      where: {
        id: template.id,
      },
      data: {
        metaTemplateId: data.id || template.metaTemplateId,
        status: data.status ? data.status.toUpperCase() : 'PENDING',
        category: data.category ? data.category.toUpperCase() : template.category,
        qualityScore: null,
        rejectedReason: null,
        components: components as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
      include: {
        headerMediaFile: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            mediaType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      ok: true,
      template: updatedTemplate,
      meta: data,
    };
  }

  async updateTemplate(
    tenantId: string,
    templateId: string,
    input: Record<string, unknown>,
  ) {
    const template = await this.prisma.whatsappTemplate.findFirst({
      where: {
        id: templateId,
        tenantId,
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.status !== 'DRAFT') {
      throw new BadRequestException('Only draft templates can be edited');
    }

 const mergedInput = {
   name: input.name ?? template.name,
   language: input.language ?? template.language,
   category: input.category ?? template.category,
   headerType: input.headerType ?? template.headerType,
   headerText: input.headerText ?? template.headerText,
   bodyText: input.bodyText ?? template.bodyText,
   footerText: input.footerText ?? template.footerText,
   buttons: input.buttons ?? template.buttons,
   ...(input.advancedComponents !== undefined
     ? { advancedComponents: input.advancedComponents }
     : {}),
 };

    const cleaned = this.cleanTemplateInput(mergedInput);
    const components = this.buildComponents(cleaned);

    try {
      return await this.prisma.whatsappTemplate.update({
        where: {
          id: template.id,
        },
        data: {
          name: cleaned.name,
          language: cleaned.language,
          category: cleaned.category,
          headerType: cleaned.headerType,
          headerText: cleaned.headerText,
          bodyText: cleaned.bodyText,
          footerText: cleaned.footerText,
          buttons: cleaned.buttons as Prisma.InputJsonValue,
          components: components as Prisma.InputJsonValue,
          variableCount: cleaned.variableCount,
          headerMediaFileId:
            cleaned.headerType === template.headerType
              ? template.headerMediaFileId
              : null,
          metaHeaderHandle:
            cleaned.headerType === template.headerType
              ? template.metaHeaderHandle
              : null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Template with same name and language already exists',
        );
      }

      throw error;
    }
  }

  async copyTemplateAsDraft(
  tenantId: string,
  templateId: string,
  input: Record<string, unknown>,
) {
  const sourceTemplate = await this.prisma.whatsappTemplate.findFirst({
    where: {
      id: templateId,
      tenantId,
    },
  });

  if (!sourceTemplate) {
    throw new NotFoundException('Template not found');
  }

  const name = String(input.name || '').trim().toLowerCase();

  if (!name) {
    throw new BadRequestException('New template name is required');
  }

  if (!/^[a-z0-9_]{3,80}$/.test(name)) {
    throw new BadRequestException(
      'Template name must be 3 to 80 characters and only use lowercase letters, numbers, and underscores',
    );
  }

  try {
    return await this.prisma.whatsappTemplate.create({
      data: {
        tenantId,
        metaTemplateId: null,
        name,
        language: sourceTemplate.language,
        category: sourceTemplate.category,
        status: 'DRAFT',
        headerType: sourceTemplate.headerType,
        headerText: sourceTemplate.headerText,
        headerMediaFileId: null,
        metaHeaderHandle: null,
        bodyText: sourceTemplate.bodyText,
        footerText: sourceTemplate.footerText,
        buttons: sourceTemplate.buttons as Prisma.InputJsonValue,
        components: sourceTemplate.components as Prisma.InputJsonValue,
        variableCount: sourceTemplate.variableCount,
        qualityScore: null,
        rejectedReason: null,
        lastSyncedAt: null,
      },
      include: {
        headerMediaFile: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            mediaType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Template with same name and language already exists',
      );
    }

    throw error;
  }
}

async deleteTemplateFromMeta(tenantId: string, templateId: string) {
await this.billingService.assertSubscriptionCanUseWorkspace(
tenantId,
'deleting templates from Meta',
);

const template = await this.prisma.whatsappTemplate.findFirst({
   where: {
     id: templateId,
     tenantId,
   },
 });

 if (!template) {
   throw new NotFoundException('Template not found');
 }

 if (template.status === 'DRAFT' || !template.metaTemplateId) {
   throw new BadRequestException(
     'Only submitted or synced Meta templates can be deleted from Meta',
   );
 }

 const connection =
   await this.metaAccountsService.getActiveConnectionSecret(tenantId);

 const url = new URL(
   `https://graph.facebook.com/${this.graphApiVersion}/${connection.wabaId}/message_templates`,
 );

 url.searchParams.set('name', template.name);
 url.searchParams.set('hsm_id', template.metaTemplateId);

 const response = await fetch(url.toString(), {
   method: 'DELETE',
   headers: {
     Authorization: `Bearer ${connection.accessToken}`,
   },
 });

 const data: {
   success?: boolean;
   error?: unknown;
 } = await response.json();

 if (!response.ok) {
   throw new BadRequestException({
     message: 'Failed to delete template from Meta',
     metaError: data,
   });
 }

 await this.prisma.whatsappTemplate.delete({
   where: {
     id: template.id,
   },
 });

 return {
   ok: true,
   deletedFromMeta: true,
   meta: data,
 };
}

async deleteTemplate(tenantId: string, templateId: string) {
 const template = await this.prisma.whatsappTemplate.findFirst({
   where: {
     id: templateId,
     tenantId,
   },
 });

 if (!template) {
   throw new NotFoundException('Template not found');
 }

 if (template.status !== 'DRAFT') {
   throw new BadRequestException(
     'Only draft templates can be deleted locally. Use Meta delete for submitted templates.',
   );
 }

 await this.prisma.whatsappTemplate.delete({
   where: {
     id: template.id,
   },
 });

 return {
   ok: true,
   deletedFromMeta: false,
 };
}

  private cleanTemplateInput(input: Record<string, unknown>) {
    const name = String(input.name || '').trim().toLowerCase();
    const language = String(input.language || 'en_US').trim();
    const category = String(input.category || '').trim().toUpperCase();
    const headerType = this.cleanHeaderType(input.headerType);
    const headerText = String(input.headerText || '').trim();
    const bodyText = String(input.bodyText || '').trim();
    const footerText = String(input.footerText || '').trim();
    const buttons = this.cleanButtons(input.buttons);
    const advancedComponents = this.cleanAdvancedComponents(
      input.advancedComponents,
    );
    const variableCount = this.countVariables([headerText, bodyText]);

    if (!name) {
      throw new BadRequestException('Template name is required');
    }

    if (!/^[a-z0-9_]{3,80}$/.test(name)) {
      throw new BadRequestException(
        'Template name must be 3 to 80 characters and only use lowercase letters, numbers, and underscores',
      );
    }

    if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) {
      throw new BadRequestException('Template language is invalid');
    }

    if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) {
      throw new BadRequestException(
        'Template category must be MARKETING, UTILITY, or AUTHENTICATION',
      );
    }

    if (!bodyText) {
      throw new BadRequestException('Template body is required');
    }

    if (bodyText.length > 1024) {
      throw new BadRequestException('Template body cannot exceed 1024 characters');
    }

    if (headerType === 'TEXT' && !headerText) {
      throw new BadRequestException('Header text is required for text header');
    }

    if (headerType !== 'TEXT' && headerText) {
      throw new BadRequestException('Header text is only allowed for text header');
    }

    if (headerText.length > 60) {
      throw new BadRequestException('Header text cannot exceed 60 characters');
    }

    if (footerText.length > 60) {
      throw new BadRequestException('Footer text cannot exceed 60 characters');
    }

    if (advancedComponents.length > 0 && buttons.length > 0) {
      throw new BadRequestException(
        'Advanced carousel components cannot be mixed with normal buttons',
      );
    }

    if (advancedComponents.length > 0 && category === 'AUTHENTICATION') {
      throw new BadRequestException(
        'Carousel templates cannot use AUTHENTICATION category',
      );
    }

    if (
      buttons.some((button) => button.type === 'OTP') &&
      category !== 'AUTHENTICATION'
    ) {
      throw new BadRequestException(
        'OTP buttons are only allowed for AUTHENTICATION templates',
      );
    }

    if (buttons.some((button) => button.type === 'OTP') && buttons.length > 1) {
      throw new BadRequestException('OTP templates can only have one OTP button');
    }

    if (
      buttons.some((button) => button.type === 'FLOW') &&
      category === 'AUTHENTICATION'
    ) {
      throw new BadRequestException(
        'Flow buttons are not allowed for AUTHENTICATION templates',
      );
    }

    this.validateVariables([headerText], 'Header');
    this.validateVariables([bodyText], 'Body');

    return {
      name,
      language,
      category,
      headerType,
      headerText: headerText || null,
      bodyText,
      footerText: footerText || null,
      buttons,
      advancedComponents,
      variableCount,
    };
  }

  private cleanHeaderType(value: unknown) {
    const headerType = String(value || '').trim().toUpperCase();

    if (!headerType) {
      return null;
    }

    if (!['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
      throw new BadRequestException(
        'Header type must be TEXT, IMAGE, VIDEO, or DOCUMENT',
      );
    }

    return headerType;
  }

  private cleanButtons(value: unknown): TemplateButton[] {
    if (value === undefined || value === null || value === '') {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('Template buttons must be an array');
    }

    if (value.length > 10) {
      throw new BadRequestException('Template can have maximum 10 buttons');
    }

    const buttonCounts = value.reduce(
      (counts, button) => {
        const rawButton = button as Record<string, unknown>;
        const type = String(rawButton.type || '').trim().toUpperCase();

        if (type === 'URL') {
          counts.url += 1;
        }

        if (type === 'PHONE_NUMBER') {
          counts.phone += 1;
        }

        if (type === 'OTP') {
          counts.otp += 1;
        }

        if (type === 'FLOW') {
          counts.flow += 1;
        }

        return counts;
      },
      {
        url: 0,
        phone: 0,
        otp: 0,
        flow: 0,
      },
    );

    if (buttonCounts.url > 2) {
      throw new BadRequestException('Template can have maximum 2 URL buttons');
    }

    if (buttonCounts.phone > 1) {
      throw new BadRequestException(
        'Template can have maximum 1 phone number button',
      );
    }

    if (buttonCounts.otp > 1) {
      throw new BadRequestException('Template can have maximum 1 OTP button');
    }

    if (buttonCounts.flow > 1) {
      throw new BadRequestException('Template can have maximum 1 Flow button');
    }

    return value.map((button, index) => {
      const rawButton = button as Record<string, unknown>;
      const type = String(rawButton.type || '').trim().toUpperCase();
      const text = String(rawButton.text || '').trim();
      const url = String(rawButton.url || '').trim();
      const phoneNumber = String(rawButton.phoneNumber || '').trim();
      const otpType = String(rawButton.otpType || 'COPY_CODE')
        .trim()
        .toUpperCase();
      const flowId = String(rawButton.flowId || '').trim();
      const flowAction = String(rawButton.flowAction || 'NAVIGATE')
        .trim()
        .toUpperCase();
      const navigateScreen = String(rawButton.navigateScreen || '').trim();

      if (
        !['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'OTP', 'FLOW'].includes(type)
      ) {
        throw new BadRequestException(
          `Button ${index + 1}: type must be QUICK_REPLY, URL, PHONE_NUMBER, OTP, or FLOW`,
        );
      }

      if (type !== 'OTP' && !text) {
        throw new BadRequestException(`Button ${index + 1}: text is required`);
      }

      if (text.length > 25) {
        throw new BadRequestException(
          `Button ${index + 1}: text cannot exceed 25 characters`,
        );
      }

      if (type === 'URL') {
        if (!url) {
          throw new BadRequestException(`Button ${index + 1}: URL is required`);
        }

        if (!/^https:\/\/[^\s]+\.[^\s]+/.test(url)) {
          throw new BadRequestException(
            `Button ${index + 1}: URL must start with https://`,
          );
        }
      }

      if (type === 'PHONE_NUMBER') {
        if (!phoneNumber) {
          throw new BadRequestException(
            `Button ${index + 1}: phone number is required`,
          );
        }

        if (!/^\+?[1-9]\d{7,14}$/.test(phoneNumber)) {
          throw new BadRequestException(
            `Button ${index + 1}: phone number must be in international format`,
          );
        }
      }

      if (
        type === 'OTP' &&
        !['COPY_CODE', 'ONE_TAP', 'ZERO_TAP'].includes(otpType)
      ) {
        throw new BadRequestException(
          `Button ${index + 1}: OTP type must be COPY_CODE, ONE_TAP, or ZERO_TAP`,
        );
      }

      if (type === 'FLOW') {
        if (!flowId) {
          throw new BadRequestException(
            `Button ${index + 1}: Flow ID is required`,
          );
        }

        if (!/^[a-zA-Z0-9_-]{3,128}$/.test(flowId)) {
          throw new BadRequestException(
            `Button ${index + 1}: Flow ID is invalid`,
          );
        }

        if (!['NAVIGATE', 'DATA_EXCHANGE'].includes(flowAction)) {
          throw new BadRequestException(
            `Button ${index + 1}: Flow action must be NAVIGATE or DATA_EXCHANGE`,
          );
        }
      }

      return {
        type,
        text: type === 'OTP' ? text || 'Copy code' : text,
        ...(type === 'URL' ? { url } : {}),
        ...(type === 'PHONE_NUMBER' ? { phoneNumber } : {}),
        ...(type === 'OTP' ? { otpType } : {}),
        ...(type === 'FLOW'
          ? {
              flowId,
              flowAction,
              ...(navigateScreen ? { navigateScreen } : {}),
            }
          : {}),
      };
    });
  }

private cleanAdvancedComponents(value: unknown) {
if (value === undefined || value === null || value === '') {
return [];
}

if (!Array.isArray(value)) {
throw new BadRequestException('Advanced components must be an array');
}

if (value.length === 0) {
return [];
}

const jsonText = JSON.stringify(value);

 if (jsonText.length > 25000) {
   throw new BadRequestException('Advanced components JSON is too large');
 }

 this.assertNoUnsafeTemplateJson(value);

 const components = value.map((component) =>
   this.cleanAdvancedComponent(component),
 );

 const componentTypes = components.map((component) =>
   String(component.type || '').toUpperCase(),
 );

 if (!componentTypes.includes('BODY')) {
   throw new BadRequestException(
     'Carousel template must include a main BODY component',
   );
 }

 if (!componentTypes.includes('CAROUSEL')) {
   throw new BadRequestException(
     'Advanced components currently support CAROUSEL templates only',
   );
 }

 const carouselComponent = components.find(
   (component) => String(component.type || '').toUpperCase() === 'CAROUSEL',
 );

 const cards = Array.isArray(carouselComponent?.cards)
   ? carouselComponent.cards
   : [];

 if (cards.length < 2 || cards.length > 5) {
   throw new BadRequestException('Carousel templates must have 2 to 5 cards');
 }

 return components;
}

private cleanAdvancedComponent(component: unknown) {
 const rawComponent = component as Record<string, unknown>;
 const type = String(rawComponent.type || '').trim().toUpperCase();

 if (!type) {
   throw new BadRequestException('Advanced component type is required');
 }

 if (!['BODY', 'CAROUSEL'].includes(type)) {
   throw new BadRequestException(
     'Advanced components can only include BODY and CAROUSEL',
   );
 }

 if (type === 'BODY') {
   const text = String(rawComponent.text || '').trim();

   if (!text) {
     throw new BadRequestException('Carousel main body text is required');
   }

   if (text.length > 1024) {
     throw new BadRequestException(
       'Carousel main body cannot exceed 1024 characters',
     );
   }

   if (/{{\s*\d+\s*}}/.test(text)) {
     throw new BadRequestException(
       'Carousel main body cannot use variables yet',
     );
   }

   return {
     type: 'BODY',
     text,
   };
 }

 const cards = Array.isArray(rawComponent.cards) ? rawComponent.cards : [];

 if (cards.length < 2 || cards.length > 5) {
   throw new BadRequestException('Carousel templates must have 2 to 5 cards');
 }

 return {
   type: 'CAROUSEL',
   cards: cards.map((card, index) => this.cleanCarouselCard(card, index)),
 };
}

private cleanCarouselCard(card: unknown, index: number) {
 const rawCard = card as Record<string, unknown>;
 const components = Array.isArray(rawCard.components)
   ? rawCard.components
   : [];

 if (components.length === 0) {
   throw new BadRequestException(
     `Carousel card ${index + 1} must include components`,
   );
 }

 const cleanedComponents = components.map((component) =>
   this.cleanCarouselCardComponent(component, index),
 );

 const componentTypes = cleanedComponents.map((component) =>
   String(component.type || '').toUpperCase(),
 );

 if (!componentTypes.includes('HEADER')) {
   throw new BadRequestException(
     `Carousel card ${index + 1} must include image or video header`,
   );
 }

 if (!componentTypes.includes('BODY')) {
   throw new BadRequestException(
     `Carousel card ${index + 1} must include body text`,
   );
 }

 if (!componentTypes.includes('BUTTONS')) {
   throw new BadRequestException(
     `Carousel card ${index + 1} must include at least one button`,
   );
 }

 return {
   components: cleanedComponents,
 };
}

private cleanCarouselCardComponent(component: unknown, cardIndex: number) {
 const rawComponent = component as Record<string, unknown>;
 const type = String(rawComponent.type || '').trim().toUpperCase();

 if (!['HEADER', 'BODY', 'BUTTONS'].includes(type)) {
   throw new BadRequestException(
     `Carousel card ${cardIndex + 1}: component must be HEADER, BODY, or BUTTONS`,
   );
 }

 if (type === 'HEADER') {
   const format = String(rawComponent.format || '').trim().toUpperCase();
   const example = rawComponent.example as Record<string, unknown> | undefined;
   const headerHandle = Array.isArray(example?.header_handle)
     ? String(example?.header_handle[0] || '').trim()
     : '';

   if (!['IMAGE', 'VIDEO'].includes(format)) {
     throw new BadRequestException(
       `Carousel card ${cardIndex + 1}: header must be IMAGE or VIDEO`,
     );
   }

   if (!headerHandle || headerHandle.includes('uploaded_media_handle_')) {
     throw new BadRequestException(
       `Carousel card ${cardIndex + 1}: valid Meta media handle is required`,
     );
   }

   return {
     type: 'HEADER',
     format,
     example: {
       header_handle: [headerHandle],
     },
   };
 }

 if (type === 'BODY') {
   const text = String(rawComponent.text || '').trim();

   if (!text) {
     throw new BadRequestException(
       `Carousel card ${cardIndex + 1}: body text is required`,
     );
   }

   if (text.length > 160) {
     throw new BadRequestException(
       `Carousel card ${cardIndex + 1}: body text cannot exceed 160 characters`,
     );
   }

   if (/{{\s*\d+\s*}}/.test(text)) {
     throw new BadRequestException(
       `Carousel card ${cardIndex + 1}: body text cannot use variables yet`,
     );
   }

   return {
     type: 'BODY',
     text,
   };
 }

 const buttons = Array.isArray(rawComponent.buttons)
   ? rawComponent.buttons
   : [];

 if (buttons.length < 1 || buttons.length > 2) {
   throw new BadRequestException(
     `Carousel card ${cardIndex + 1}: add 1 to 2 buttons`,
   );
 }

 return {
   type: 'BUTTONS',
   buttons: buttons.map((button, buttonIndex) =>
     this.cleanCarouselButton(button, cardIndex, buttonIndex),
   ),
 };
}

private cleanCarouselButton(
 button: unknown,
 cardIndex: number,
 buttonIndex: number,
) {
 const rawButton = button as Record<string, unknown>;
 const type = String(rawButton.type || '').trim().toUpperCase();
 const text = String(rawButton.text || '').trim();
 const url = String(rawButton.url || '').trim();
 const phoneNumber = String(rawButton.phone_number || rawButton.phoneNumber || '')
   .trim();

 if (!['QUICK_REPLY', 'URL', 'PHONE_NUMBER'].includes(type)) {
   throw new BadRequestException(
     `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: type must be QUICK_REPLY, URL, or PHONE_NUMBER`,
   );
 }

 if (!text) {
   throw new BadRequestException(
     `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: text is required`,
   );
 }

 if (text.length > 25) {
   throw new BadRequestException(
     `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: text cannot exceed 25 characters`,
   );
 }

 if (type === 'URL') {
   if (!/^https:\/\/[^\s]+\.[^\s]+/.test(url)) {
     throw new BadRequestException(
       `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: URL must start with https://`,
     );
   }

   return {
     type,
     text,
     url,
   };
 }

 if (type === 'PHONE_NUMBER') {
   if (!/^\+?[1-9]\d{7,14}$/.test(phoneNumber)) {
     throw new BadRequestException(
       `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: phone number must be in international format`,
     );
   }

   return {
     type,
     text,
     phone_number: phoneNumber,
   };
 }

 return {
   type,
   text,
 };
}

private assertNoUnsafeTemplateJson(value: unknown) {
 const forbiddenKeys = [
   'accessToken',
   'access_token',
   'authorization',
   'password',
   'secret',
   'tenantId',
   'tenant_id',
   'token',
 ];

 const checkValue = (currentValue: unknown) => {
   if (Array.isArray(currentValue)) {
     currentValue.forEach(checkValue);
     return;
   }

   if (!currentValue || typeof currentValue !== 'object') {
     return;
   }

   for (const [key, nestedValue] of Object.entries(
     currentValue as Record<string, unknown>,
   )) {
     if (
       forbiddenKeys.some(
         (forbiddenKey) =>
           key.toLowerCase() === forbiddenKey.toLowerCase(),
       )
     ) {
       throw new BadRequestException(
         `Template JSON cannot include unsafe key: ${key}`,
       );
     }

     checkValue(nestedValue);
   }
 };

 checkValue(value);
}

    private async saveMetaTemplateFromRaw(
    tenantId: string,
    rawTemplate: unknown,
  ) {
    const template = rawTemplate as Record<string, unknown>;
    const metaTemplateId = String(template.id || '').trim();
    const name = String(template.name || '').trim();
    const language = String(template.language || '').trim();
    const category = String(template.category || '').trim().toUpperCase();
    const status = String(template.status || '').trim().toUpperCase();
    const components = Array.isArray(template.components)
      ? template.components
      : [];

    if (!metaTemplateId || !name || !language) {
      return null;
    }

    const parsed = this.parseMetaComponents(components);

    return this.prisma.whatsappTemplate.upsert({
      where: {
        tenantId_name_language: {
          tenantId,
          name,
          language,
        },
      },
      update: {
        metaTemplateId,
        category: category || 'UTILITY',
        status: status || 'UNKNOWN',
        headerType: parsed.headerType,
        headerText: parsed.headerText,
        bodyText: parsed.bodyText,
        footerText: parsed.footerText,
        buttons: parsed.buttons as Prisma.InputJsonValue,
        components: components as Prisma.InputJsonValue,
        variableCount: parsed.variableCount,
        qualityScore: this.cleanMetaText(template.quality_score, 120),
        rejectedReason: this.cleanMetaText(template.rejected_reason, 1000),
        lastSyncedAt: new Date(),
      },
      create: {
        tenantId,
        metaTemplateId,
        name,
        language,
        category: category || 'UTILITY',
        status: status || 'UNKNOWN',
        headerType: parsed.headerType,
        headerText: parsed.headerText,
        bodyText: parsed.bodyText,
        footerText: parsed.footerText,
        buttons: parsed.buttons as Prisma.InputJsonValue,
        components: components as Prisma.InputJsonValue,
        variableCount: parsed.variableCount,
        qualityScore: this.cleanMetaText(template.quality_score, 120),
        rejectedReason: this.cleanMetaText(template.rejected_reason, 1000),
        lastSyncedAt: new Date(),
      },
      include: {
        headerMediaFile: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            mediaType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });
  }

  private cleanMetaText(value: unknown, maxLength: number) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'string') {
      return value.slice(0, maxLength);
    }

    if (typeof value === 'object') {
      const rawValue = value as Record<string, unknown>;

      if (typeof rawValue.reason === 'string') {
        return rawValue.reason.slice(0, maxLength);
      }

      if (typeof rawValue.message === 'string') {
        return rawValue.message.slice(0, maxLength);
      }

      if (typeof rawValue.score === 'string') {
        return rawValue.score.slice(0, maxLength);
      }
    }

    return JSON.stringify(value).slice(0, maxLength);
  }

  private parseMetaComponents(components: unknown[]) {
    let headerType: string | null = null;
    let headerText: string | null = null;
    let bodyText = '';
    let footerText: string | null = null;
    let buttons: TemplateButton[] = [];

    for (const rawComponent of components) {
      const component = rawComponent as Record<string, unknown>;
      const type = String(component.type || '').trim().toUpperCase();

      if (type === 'HEADER') {
        headerType = String(component.format || '').trim().toUpperCase() || null;
        headerText =
          typeof component.text === 'string' && component.text.trim()
            ? component.text.trim()
            : null;
      }

      if (type === 'BODY') {
        bodyText =
          typeof component.text === 'string' && component.text.trim()
            ? component.text.trim()
            : '';
      }

      if (type === 'FOOTER') {
        footerText =
          typeof component.text === 'string' && component.text.trim()
            ? component.text.trim()
            : null;
      }

      if (type === 'BUTTONS' && Array.isArray(component.buttons)) {
        buttons = component.buttons.map((rawButton) => {
          const button = rawButton as Record<string, unknown>;
          const buttonType = String(button.type || '').trim().toUpperCase();

          return {
            type: buttonType,
            text: String(button.text || '').trim(),
            ...(typeof button.url === 'string' ? { url: button.url } : {}),
            ...(typeof button.phone_number === 'string'
              ? { phoneNumber: button.phone_number }
              : {}),
          };
        });
      }
    }

    return {
      headerType,
      headerText,
      bodyText: bodyText || 'Synced Meta template body unavailable',
      footerText,
      buttons,
      variableCount: this.countVariables([
        headerText || '',
        bodyText,
      ]),
    };
  }

  private countVariables(textParts: string[]) {
    const variables = new Set<number>();

    for (const text of textParts) {
      for (const match of text.matchAll(/{{\s*(\d+)\s*}}/g)) {
        variables.add(Number(match[1]));
      }
    }

    return variables.size;
  }

  private validateVariables(textParts: string[], label = 'Template') {
    const variables = Array.from(
      new Set(
        textParts.flatMap((text) =>
          Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g)).map((match) =>
            Number(match[1]),
          ),
        ),
      ),
    ).sort((a, b) => a - b);

    for (const variable of variables) {
      if (!Number.isInteger(variable) || variable < 1) {
        throw new BadRequestException(`${label} variables must start from {{1}}`);
      }
    }

    for (let index = 0; index < variables.length; index += 1) {
      if (variables[index] !== index + 1) {
        throw new BadRequestException(
          `${label} variables must be sequential like {{1}}, {{2}}, {{3}}`,
        );
      }
    }
  }

  private buildComponents(cleaned: {
    headerType: string | null;
    headerText: string | null;
    bodyText: string;
    footerText: string | null;
    buttons: TemplateButton[];
    advancedComponents: Array<Record<string, unknown>>;
  }) {
    if (cleaned.advancedComponents.length > 0) {
      return cleaned.advancedComponents;
    }

    const components: Array<Record<string, unknown>> = [];

    if (cleaned.headerType) {
      components.push({
        type: 'HEADER',
        format: cleaned.headerType,
        ...(cleaned.headerType === 'TEXT' ? { text: cleaned.headerText } : {}),
      });
    }

    components.push({
      type: 'BODY',
      text: cleaned.bodyText,
    });

    if (cleaned.footerText) {
      components.push({
        type: 'FOOTER',
        text: cleaned.footerText,
      });
    }

    if (cleaned.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: cleaned.buttons,
      });
    }

    return components;
  }

  private getVariableNumbers(text: string) {
    return Array.from(
      new Set(
        Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g)).map((match) =>
          Number(match[1]),
        ),
      ),
    ).sort((a, b) => a - b);
  }

  private cleanExampleValues(
    value: unknown,
    variables: number[],
    label: string,
  ) {
    if (variables.length === 0) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException(
        `${label} are required for variables ${variables
          .map((variable) => `{{${variable}}}`)
          .join(', ')}`,
      );
    }

    const examples = value.map((example) => String(example || '').trim());

    if (examples.length !== variables.length) {
      throw new BadRequestException(
        `${label} count must match template variables count`,
      );
    }

    if (examples.some((example) => !example)) {
      throw new BadRequestException(`${label} cannot contain empty values`);
    }

    return examples;
  }

  private normalizeStoredButtons(value: unknown): TemplateButton[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((button) => {
      const rawButton = button as Record<string, unknown>;

      return {
        type: String(rawButton.type || '').trim().toUpperCase(),
        text: String(rawButton.text || '').trim(),
        ...(typeof rawButton.url === 'string' ? { url: rawButton.url } : {}),
        ...(typeof rawButton.phoneNumber === 'string'
          ? { phoneNumber: rawButton.phoneNumber }
          : {}),
        ...(typeof rawButton.otpType === 'string'
          ? { otpType: rawButton.otpType }
          : {}),
        ...(typeof rawButton.flowId === 'string'
          ? { flowId: rawButton.flowId }
          : {}),
        ...(typeof rawButton.flowAction === 'string'
          ? { flowAction: rawButton.flowAction }
          : {}),
        ...(typeof rawButton.navigateScreen === 'string'
          ? { navigateScreen: rawButton.navigateScreen }
          : {}),
      };
    });
  }

  private buildMetaSubmitComponents(input: {
    headerType: string | null;
    headerText: string | null;
    metaHeaderHandle?: string | null;
    bodyText: string;
    footerText: string | null;
    buttons: TemplateButton[];
    bodyExamples: string[];
    headerExamples: string[];
  }) {
    const components: Array<Record<string, unknown>> = [];

    if (input.headerType === 'TEXT' && input.headerText) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: input.headerText,
        ...(input.headerExamples.length > 0
          ? {
              example: {
                header_text: input.headerExamples,
              },
            }
          : {}),
      });
    }

    if (
      input.headerType &&
      ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(input.headerType) &&
      input.metaHeaderHandle
    ) {
      components.push({
        type: 'HEADER',
        format: input.headerType,
        example: {
          header_handle: [input.metaHeaderHandle],
        },
      });
    }

    components.push({
      type: 'BODY',
      text: input.bodyText,
      ...(input.bodyExamples.length > 0
        ? {
            example: {
              body_text: [input.bodyExamples],
            },
          }
        : {}),
    });

    if (input.footerText) {
      components.push({
        type: 'FOOTER',
        text: input.footerText,
      });
    }

    if (input.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
buttons: input.buttons.map((button) => ({
  type: button.type,
  text: button.text,
  ...(button.type === 'URL' ? { url: button.url } : {}),
  ...(button.type === 'PHONE_NUMBER'
    ? { phone_number: button.phoneNumber }
    : {}),
  ...(button.type === 'OTP'
    ? { otp_type: button.otpType || 'COPY_CODE' }
    : {}),
  ...(button.type === 'FLOW'
    ? {
        flow_id: button.flowId,
        flow_action: button.flowAction || 'NAVIGATE',
        ...(button.navigateScreen
          ? { navigate_screen: button.navigateScreen }
          : {}),
      }
    : {}),
})),
      });
    }

    return components;
  }
}