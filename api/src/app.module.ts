import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { validateEnv } from './common/config/validate-env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validationExceptionFactory } from './common/validation/validation-exception-factory';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { SearchModule } from './infrastructure/search/search.module';
import { SupplierAModule } from './infrastructure/suppliers/supplier-a/supplier-a.module';
import { SupplierBModule } from './infrastructure/suppliers/supplier-b/supplier-b.module';
import { SupplierCModule } from './infrastructure/suppliers/supplier-c/supplier-c.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    SupplierAModule,
    SupplierBModule,
    SupplierCModule,
    SearchModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          exceptionFactory: validationExceptionFactory,
        }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
