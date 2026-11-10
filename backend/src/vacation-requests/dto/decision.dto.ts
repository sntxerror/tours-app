import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ApproveVacationRequestDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RejectVacationRequestDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'A comment is required when rejecting a request' })
  @MaxLength(1000)
  comment: string;
}
