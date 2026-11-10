import { Controller, Get, Query } from '@nestjs/common';
import { TeamVacationsQueryDto } from './dto/team-vacations-query.dto';
import { VacationRequestsService } from './vacation-requests.service';

/** Team vacation planning, open to every authenticated role. */
@Controller('team')
export class TeamController {
  constructor(private readonly service: VacationRequestsService) {}

  @Get('vacations')
  vacations(@Query() query: TeamVacationsQueryDto) {
    return this.service.teamCalendar(query);
  }
}
