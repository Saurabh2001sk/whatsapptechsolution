import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import type { CurrentUser } from '../auth/current-user';
import { ContactTypesService } from './contact-types.service';

@Controller('contact-types')
export class ContactTypesController {
  constructor(
    private readonly contactTypesService: ContactTypesService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listContactTypes(@Req() request: Request) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.contactTypesService.listContactTypes(user.tenantId);
  }

  @Post()
  async createContactType(
    @Req() request: Request,
    @Body()
    body: {
      name?: string;
      color?: string;
    },
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'create contact types');

    return this.contactTypesService.createContactType(user.tenantId, body);
  }

  @Delete(':id')
  async deleteContactType(
    @Req() request: Request,
    @Param('id') contactTypeId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    this.blockImpersonationWrites(user, 'delete contact types');

    return this.contactTypesService.deleteContactType(
      user.tenantId,
      contactTypeId,
    );
  }

  private blockImpersonationWrites(user: CurrentUser, action: string) {
    if (user.impersonating) {
      throw new ForbiddenException(`Impersonation cannot ${action}.`);
    }
  }
}