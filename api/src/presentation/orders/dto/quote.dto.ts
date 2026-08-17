import { IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class QuoteDto {
  @IsInt()
  @Min(1)
  miles!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxesBrl!: number;

  @IsString()
  @IsNotEmpty()
  carrier!: string;
}
