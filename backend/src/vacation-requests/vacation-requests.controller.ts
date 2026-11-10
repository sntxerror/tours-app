import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { CreateVacationRequestDto } from './dto/create-vacation-request.dto';
import { ApproveVacationRequestDto, RejectVacationRequestDto } from './dto/decision.dto';
import {
  ListMyVacationRequestsQueryDto,
  ListVacationRequestsQueryDto,
} from './dto/list-vacation-requests-query.dto';
import { UpdateVacationRequestDto } from './dto/update-vacation-request.dto';
import { VacationRequestsService } from './vacation-requests.service';

@Controller('vacation-requests')
export class VacationRequestsController {
  constructor(private readonly service: VacationRequestsService) {}

  @Post()
  @Roles(UserRole.Requester)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVacationRequestDto) {
    return this.service.create(user, dto);
  }

  /** Declared before `:id` so "me" is not parsed as an id. */
  @Get('me')
  @Roles(UserRole.Requester)
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMyVacationRequestsQueryDto) {
    return this.service.listMine(user, query);
  }

  @Patch(':id')
  @Roles(UserRole.Requester)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateVacationRequestDto,
  ) {
    return this.service.update(id, user, dto);
  }

  @Delete(':id')
  @Roles(UserRole.Requester)
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }

  @Get()
  @Roles(UserRole.Validator)
  listAll(@Query() query: ListVacationRequestsQueryDto) {
    return this.service.listAll(query);
  }

  @Post(':id/approve')
  @Roles(UserRole.Validator)
  @HttpCode(200)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApproveVacationRequestDto,
  ) {
    return this.service.approve(id, user, dto.comment);
  }

  @Post(':id/reject')
  @Roles(UserRole.Validator)
  @HttpCode(200)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectVacationRequestDto,
  ) {
    return this.service.reject(id, user, dto.comment);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }
}
