import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNotEmptyObject,
  IsString,
  ValidateNested,
} from 'class-validator';

import { PassengerDto } from './passenger.dto';
import { QuoteDto } from './quote.dto';

export class CreateOrderRequestDto {
  @IsString()
  @IsNotEmpty()
  quoteId!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => PassengerDto)
  passenger!: PassengerDto;

  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => QuoteDto)
  quote!: QuoteDto;
}
