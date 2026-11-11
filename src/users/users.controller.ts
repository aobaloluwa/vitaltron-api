import { Controller, Get, Patch, Post, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { UpdateClinicianProfileDto } from './dto/update-clinician-profile.dto';
import { AddDependentDto } from './dto/add-dependent.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@Request() req: any) {
    return this.usersService.getUserProfile(req.user.id);
  }

  @Patch('me')
  async updateUserInfo(
    @Request() req: any,
    @Body() body: { displayName?: string; avatarUrl?: string; preferredLanguage?: string },
  ) {
    return this.usersService.updateUserInfo(req.user.id, body);
  }

  @Patch('me/patient-profile')
  async updatePatientProfile(@Request() req: any, @Body() dto: UpdatePatientProfileDto) {
    return this.usersService.updatePatientProfile(req.user.id, dto);
  }

  @Patch('me/clinician-profile')
  async updateClinicianProfile(@Request() req: any, @Body() dto: UpdateClinicianProfileDto) {
    return this.usersService.updateClinicianProfile(req.user.id, dto);
  }

  @Post('me/dependents')
  async addDependent(@Request() req: any, @Body() dto: AddDependentDto) {
    return this.usersService.addDependent(req.user.id, dto);
  }

  @Get('me/dependents')
  async getDependents(@Request() req: any) {
    return this.usersService.getDependents(req.user.id);
  }
}
