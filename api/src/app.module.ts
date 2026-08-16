import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './common/config/validate-env';
import { SupplierAModule } from './suppliers/supplier-a/supplier-a.module';
import { SupplierBModule } from './suppliers/supplier-b/supplier-b.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    SupplierAModule,
    SupplierBModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
