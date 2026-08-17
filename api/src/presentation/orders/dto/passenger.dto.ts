import { IsNotEmpty, IsString, Validate } from 'class-validator';

import { IsValidCpf } from './validators/is-valid-cpf.validator';

export class PassengerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Validate(IsValidCpf)
  document!: string;
}
