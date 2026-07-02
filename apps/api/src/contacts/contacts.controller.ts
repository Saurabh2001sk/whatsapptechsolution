import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import type { CurrentUser } from '../auth/current-user';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listContacts(@Req() request: Request, @Query('search') search?: string) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.contactsService.listContacts(user.tenantId, search);
  }

  @Get('export.csv')
  async exportContactsCsv(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    const csv = await this.contactsService.exportContactsCsv(user.tenantId);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="contacts-export.csv"',
    );

    return csv;
  }

  @Post('import')
  async importContacts(
    @Req() request: Request,
    @Body()
    body: {
      rows?: Array<{
        name?: string;
        phone?: string;
        email?: string;
        tags?: string[];
        contactTypeName?: string;
        optedIn?: boolean;
        optInSource?: string;
      }>;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'import contacts');

    const rows = Array.isArray(body.rows) ? body.rows : [];

    return this.contactsService.importContacts(user.tenantId, rows);
  }

  @Post()
  async createContact(
    @Req() request: Request,
    @Body()
    body: {
      name?: string;
      phone?: string;
      email?: string;
      tags?: string[];
      contactTypeId?: string;
      optedIn?: boolean;
      optInSource?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'create contacts');

    return this.contactsService.createContact(user.tenantId, body);
  }

  @Patch(':id')
  async updateContact(
    @Req() request: Request,
    @Param('id') contactId: string,
    @Body()
    body: {
      name?: string;
      phone?: string;
      email?: string;
      tags?: string[];
      contactTypeId?: string | null;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'update contacts');

    return this.contactsService.updateContact(user.tenantId, contactId, body);
  }

  @Patch(':id/opt-out')
  async optOutContact(@Req() request: Request, @Param('id') contactId: string) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'opt out contacts');

    return this.contactsService.optOutContact(user.tenantId, contactId);
  }

  @Patch(':id/opt-in')
  async optInContact(
    @Req() request: Request,
    @Param('id') contactId: string,
    @Body() body: { optInSource?: string },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'opt in contacts');

    return this.contactsService.optInContact(user.tenantId, contactId, body);
  }

  @Delete(':id')
  async deleteContact(@Req() request: Request, @Param('id') contactId: string) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'delete contacts');

    return this.contactsService.deleteContact(user.tenantId, contactId);
  }

  private blockImpersonationWrites(user: CurrentUser, action: string) {
    if (user.impersonating) {
      throw new ForbiddenException(`Impersonation cannot ${action}.`);
    }
  }
}