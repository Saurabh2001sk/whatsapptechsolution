import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { BillingService } from './billing.service';
import { DripsService } from './drips.service';

type ContactImportRow = {
  name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  contactTypeName?: string;
  optedIn?: boolean;
  optInSource?: string;
};

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

constructor(
  private readonly prisma: PrismaService,
  private readonly billingService: BillingService,
  private readonly dripsService: DripsService,
) {}

  listContacts(tenantId: string, search?: string) {
    const cleanSearch = String(search || '').trim();
    const normalizedPhoneSearch = this.normalizeWhatsAppPhone(cleanSearch);

    const where: Prisma.ContactWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (cleanSearch) {
      where.OR = [
        {
          name: {
            contains: cleanSearch,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: cleanSearch,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: cleanSearch,
            mode: 'insensitive',
          },
        },
      ];

      if (normalizedPhoneSearch) {
        where.OR.push({
          phone: {
            contains: normalizedPhoneSearch,
            mode: 'insensitive',
          },
        });
      }
    }

    return this.prisma.contact.findMany({
      where,
      include: {
        contactType: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createContact(
    tenantId: string,
    input: {
      name?: string;
      phone?: string;
      email?: string;
      tags?: string[];
      contactTypeId?: string;
      optedIn?: boolean;
      optInSource?: string;
    },
  ) {
    const name = String(input.name || '').trim();
    const phone = this.normalizeWhatsAppPhone(input.phone);
    const email = String(input.email || '').trim().toLowerCase();
    const tags = this.cleanTags(input.tags);
    const optedIn = Boolean(input.optedIn);
    const optInSource = String(input.optInSource || '').trim();
    const contactTypeId = String(input.contactTypeId || '').trim();

    if (!name) {
      throw new BadRequestException('Contact name is required');
    }

    this.validateWhatsAppPhone(phone);
    this.validateEmail(email);

    if (optedIn && !optInSource) {
      throw new BadRequestException(
        'Opt-in source is required when contact is opted in',
      );
    }

 if (contactTypeId) {
   await this.ensureContactTypeBelongsToTenant(tenantId, contactTypeId);
 }

 try {
   const contact = await this.prisma.$transaction(
     async (tx) => {
       const existingActiveContact = await tx.contact.findFirst({
         where: {
           tenantId,
           phone,
           deletedAt: null,
         },
       });

       if (existingActiveContact) {
         throw new ConflictException('Contact phone already exists');
       }

       await this.billingService.assertCanCreateContactsInTransaction(
         tx,
         tenantId,
         1,
       );

       const deletedContact = await tx.contact.findFirst({
         where: {
           tenantId,
           phone,
           deletedAt: {
             not: null,
           },
         },
       });

       if (deletedContact) {
         return tx.contact.update({
           where: {
             id: deletedContact.id,
           },
           data: {
             name,
             email: email || null,
             tags,
             contactTypeId: contactTypeId || null,
             optedIn,
             optInSource: optedIn ? optInSource : null,
             optInAt: optedIn ? new Date() : null,
             optOutAt: null,
             deletedAt: null,
           },
           include: {
             contactType: true,
           },
         });
       }

       return tx.contact.create({
         data: {
           tenantId,
           name,
           phone,
           email: email || null,
           tags,
           contactTypeId: contactTypeId || null,
           optedIn,
           optInSource: optedIn ? optInSource : null,
           optInAt: optedIn ? new Date() : null,
           optOutAt: null,
         },
         include: {
           contactType: true,
         },
       });
     },
     {
       isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
     },
   );

   try {
     await this.dripsService.autoEnrollNewContact({
       tenantId,
       contactId: contact.id,
       trigger: 'NEW_CONTACT',
     });
   } catch (error) {
     this.logger.error(
       `New contact drip auto-enrolment failed for contact ${contact.id}: ${
         error instanceof Error ? error.message : 'Unknown error'
       }`,
     );
   }

   return contact;
 } catch (error) {
   if (error instanceof ConflictException) {
     throw error;
   }

   if (
     error instanceof Prisma.PrismaClientKnownRequestError &&
     error.code === 'P2002'
   ) {
     throw new ConflictException('Contact phone already exists');
   }

   throw error;
 }
}

  async updateContact(
    tenantId: string,
    contactId: string,
    input: {
      name?: string;
      phone?: string;
      email?: string;
      tags?: string[];
      contactTypeId?: string | null;
    },
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const data: Prisma.ContactUpdateInput = {};

    if (input.name !== undefined) {
      const name = String(input.name || '').trim();

      if (!name) {
        throw new BadRequestException('Contact name cannot be empty');
      }

      data.name = name;
    }

    if (input.phone !== undefined) {
      const phone = this.normalizeWhatsAppPhone(input.phone);

      this.validateWhatsAppPhone(phone);

      data.phone = phone;
    }

    if (input.email !== undefined) {
      const email = String(input.email || '').trim().toLowerCase();

      this.validateEmail(email);

      data.email = email || null;
    }

    if (input.tags !== undefined) {
      data.tags = this.cleanTags(input.tags);
    }

    if (input.contactTypeId !== undefined) {
      const contactTypeId = String(input.contactTypeId || '').trim();

      if (contactTypeId) {
        await this.ensureContactTypeBelongsToTenant(tenantId, contactTypeId);
      }

      data.contactType = contactTypeId
        ? {
            connect: {
              id: contactTypeId,
            },
          }
        : {
            disconnect: true,
          };
    }

    try {
      return await this.prisma.contact.update({
        where: {
          id: contact.id,
        },
        data,
        include: {
          contactType: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Contact phone already exists');
      }

      throw error;
    }
  }

  async optOutContact(tenantId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const updatedContact = await this.prisma.contact.update({
      where: {
        id: contact.id,
      },
      data: {
        optedIn: false,
        optInSource: null,
        optOutAt: new Date(),
      },
      include: {
        contactType: true,
      },
    });

    await this.dripsService.stopContactDripEnrollments({
      tenantId,
      contactId: contact.id,
      reason: 'CONTACT_OPTED_OUT',
    });

    return updatedContact;
  }

  async optInContact(
    tenantId: string,
    contactId: string,
    input: {
      optInSource?: string;
    },
  ) {
    const optInSource = String(input.optInSource || '').trim();

    if (!optInSource) {
      throw new BadRequestException('Opt-in source is required');
    }

    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return this.prisma.contact.update({
      where: {
        id: contact.id,
      },
      data: {
        optedIn: true,
        optInSource,
        optInAt: new Date(),
        optOutAt: null,
      },
      include: {
        contactType: true,
      },
    });
  }

  async deleteContact(tenantId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    await this.prisma.contact.update({
      where: {
        id: contact.id,
      },
      data: {
        deletedAt: new Date(),
        optedIn: false,
        optInSource: null,
        optOutAt: new Date(),
      },
    });

    await this.dripsService.stopContactDripEnrollments({
      tenantId,
      contactId: contact.id,
      reason: 'CONTACT_DELETED',
    });

    return {
      ok: true,
    };
  }

async importContacts(tenantId: string, rows: ContactImportRow[]) {

  
 if (rows.length > 1000) {
   throw new BadRequestException('CSV import limit is 1000 contacts at a time');
 }

  const transactionResult = await this.prisma.$transaction(

   async (tx) => {
     const validPhonesToImport = new Set<string>();

     for (const row of rows) {
       const name = String(row.name || '').trim();
       const phone = this.normalizeWhatsAppPhone(row.phone);
       const email = String(row.email || '').trim().toLowerCase();
       const optedIn = Boolean(row.optedIn);
       const optInSource = String(row.optInSource || '').trim();

       if (!name) {
         continue;
       }

       try {
         this.validateWhatsAppPhone(phone);
         this.validateEmail(email);
       } catch {
         continue;
       }

       if (optedIn && !optInSource) {
         continue;
       }

       validPhonesToImport.add(phone);
     }

     if (validPhonesToImport.size > 0) {
       const existingActiveContacts = await tx.contact.findMany({
         where: {
           tenantId,
           phone: {
             in: [...validPhonesToImport],
           },
           deletedAt: null,
         },
         select: {
           phone: true,
         },
       });

       const existingActivePhones = new Set(
         existingActiveContacts.map((contact) => contact.phone),
       );

       const contactsToActivateCount = [...validPhonesToImport].filter(
         (phone) => !existingActivePhones.has(phone),
       ).length;

       await this.billingService.assertCanCreateContactsInTransaction(
         tx,
         tenantId,
         contactsToActivateCount,
       );
     }

     let imported = 0;
     let skipped = 0;
     const errors: string[] = [];
     const importedContactIds: string[] = [];

     for (const [index, row] of rows.entries()) {
       const rowNumber = index + 1;
       const name = String(row.name || '').trim();
       const phone = this.normalizeWhatsAppPhone(row.phone);
       const email = String(row.email || '').trim().toLowerCase();
       const tags = this.cleanTags(row.tags);
       const contactTypeName = String(row.contactTypeName || '').trim();
       const optedIn = Boolean(row.optedIn);
       const optInSource = String(row.optInSource || '').trim();

       if (!name) {
         errors.push(`Row ${rowNumber}: name is required`);
         continue;
       }

       try {
         this.validateWhatsAppPhone(phone);
         this.validateEmail(email);
       } catch (error) {
         errors.push(
           `Row ${rowNumber}: ${
             error instanceof Error ? error.message : 'Invalid contact data'
           }`,
         );
         continue;
       }

       if (optedIn && !optInSource) {
         errors.push(
           `Row ${rowNumber}: optInSource is required when optedIn is true`,
         );
         continue;
       }

       let contactTypeId: string | null = null;

       if (contactTypeName) {
         const contactType = await tx.contactType.findFirst({
           where: {
             tenantId,
             name: {
               equals: contactTypeName,
               mode: 'insensitive',
             },
           },
         });

         if (!contactType) {
           errors.push(
             `Row ${rowNumber}: contact type "${contactTypeName}" not found`,
           );
           continue;
         }

         contactTypeId = contactType.id;
       }

       const existingActiveContact = await tx.contact.findFirst({
         where: {
           tenantId,
           phone,
           deletedAt: null,
         },
       });

       if (existingActiveContact) {
         skipped += 1;
         continue;
       }

       const deletedContact = await tx.contact.findFirst({
         where: {
           tenantId,
           phone,
           deletedAt: {
             not: null,
           },
         },
       });

       if (deletedContact) {
         const restoredContact = await tx.contact.update({
           where: {
             id: deletedContact.id,
           },
           data: {
             name,
             email: email || null,
             tags,
             contactTypeId,
             optedIn,
             optInSource: optedIn ? optInSource : null,
             optInAt: optedIn ? new Date() : null,
             optOutAt: null,
             deletedAt: null,
           },
           select: {
             id: true,
           },
         });

         importedContactIds.push(restoredContact.id);
         imported += 1;
         continue;
       }

       const createdContact = await tx.contact.create({
         data: {
           tenantId,
           name,
           phone,
           email: email || null,
           tags,
           contactTypeId,
           optedIn,
           optInSource: optedIn ? optInSource : null,
           optInAt: optedIn ? new Date() : null,
           optOutAt: null,
         },
         select: {
           id: true,
         },
       });

       importedContactIds.push(createdContact.id);
       imported += 1;
     }

     return {
       imported,
       skipped,
       importedContactIds,
       errors,
     };
   },
   {
     isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
   },
 );

 for (const contactId of transactionResult.importedContactIds) {
   try {
     await this.dripsService.autoEnrollNewContact({
       tenantId,
       contactId,
       trigger: 'CSV_IMPORT',
     });
   } catch (error) {
     this.logger.error(
       `Imported contact drip auto-enrolment failed for contact ${contactId}: ${
         error instanceof Error ? error.message : 'Unknown error'
       }`,
     );
   }
 }

 return {
   imported: transactionResult.imported,
   skipped: transactionResult.skipped,
   errors: transactionResult.errors,
 };
}

  async exportContactsCsv(tenantId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      include: {
        contactType: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const header = [
      'name',
      'phone',
      'email',
      'tags',
      'contactType',
      'optedIn',
      'optInSource',
    ];

    const lines = contacts.map((contact) =>
      [
        contact.name,
        contact.phone,
        contact.email || '',
        contact.tags.join('|'),
        contact.contactType?.name || '',
        contact.optedIn ? 'true' : 'false',
        contact.optInSource || '',
      ]
        .map((value) => this.escapeCsvValue(value))
        .join(','),
    );

    return [header.join(','), ...lines].join('\n');
  }

  private normalizeWhatsAppPhone(value?: string) {
    const digits = String(value || '').replace(/\D/g, '');

    if (!digits) {
      return '';
    }

    if (digits.length === 10) {
      return `91${digits}`;
    }

    return digits;
  }

  private validateWhatsAppPhone(phone: string) {
    if (!phone) {
      throw new BadRequestException('Contact phone is required');
    }

    if (phone.length < 11 || phone.length > 15) {
      throw new BadRequestException(
        'Contact phone must include country code and be 11 to 15 digits',
      );
    }
  }

  private validateEmail(email: string) {
    if (!email) {
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Contact email is invalid');
    }
  }

  private cleanTags(tags?: string[]) {
    if (!Array.isArray(tags)) {
      return [];
    }

    return tags
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .slice(0, 20);
  }

private escapeCsvValue(value: string) {
 const rawValue = String(value ?? '');
 const safeValue = /^[=+\-@\t\r]/.test(rawValue)
   ? `'${rawValue}`
   : rawValue;

 return `"${safeValue.replace(/"/g, '""')}"`;
}

  private async ensureContactTypeBelongsToTenant(
    tenantId: string,
    contactTypeId: string,
  ) {
    const contactType = await this.prisma.contactType.findFirst({
      where: {
        id: contactTypeId,
        tenantId,
      },
    });

    if (!contactType) {
      throw new BadRequestException('Invalid contact type');
    }
  }
}