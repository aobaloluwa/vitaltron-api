import { Controller, Get, Post, Body, Param, UseGuards, Request, Ip, Headers } from '@nestjs/common';
import { ControlledSharingService } from './controlled-sharing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto';
import { AccessGrantRequestDto } from './dto/access-grant-request.dto';

@Controller('sharing')
export class ControlledSharingController {
  constructor(private readonly sharingService: ControlledSharingService) {}

  @Post('grants')
  @UseGuards(JwtAuthGuard)
  async createGrant(@Request() req: any, @Body() dto: CreateAccessGrantDto) {
    return this.sharingService.createAccessGrant(req.user.id, dto);
  }

  @Get('grants')
  @UseGuards(JwtAuthGuard)
  async getUserGrants(@Request() req: any) {
    return this.sharingService.getUserGrants(req.user.id);
  }

  @Post('grants/:id/revoke')
  @UseGuards(JwtAuthGuard)
  async revokeGrant(@Request() req: any, @Param('id') id: string) {
    return this.sharingService.revokeGrant(req.user.id, id);
  }

  // Public / Clinician Portal Access Endpoint (no auth required, protected by token & optional passcode)
  @Post('access/:token')
  async accessGrantByToken(
    @Param('token') token: string,
    @Body() dto: AccessGrantRequestDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.sharingService.accessGrantByToken(token, dto, ip, userAgent);
  }
}
