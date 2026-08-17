import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Constraint de campo cruzado, usada via `@Validate(IsDifferentFrom, ['origin'])` — valida que o
 * campo decorado é diferente de outro campo do mesmo objeto (`origin`/`destination` em
 * `SearchRequestDto`) — mesma regra que o mock já aplica
 * (`mock-suppliers/src/index.js:118-120`).
 */
@ValidatorConstraint({ name: 'isDifferentFrom', async: false })
export class IsDifferentFrom implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [otherProperty] = args.constraints as [string];
    const otherValue = (args.object as Record<string, unknown>)[otherProperty];

    return value !== otherValue;
  }

  defaultMessage(args: ValidationArguments): string {
    const [otherProperty] = args.constraints as [string];
    return `${args.property} deve ser diferente de ${otherProperty}`;
  }
}
