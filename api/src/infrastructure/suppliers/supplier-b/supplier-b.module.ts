import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SuppliersHttpModule } from '../suppliers-http.module';
import { SupplierBClient } from './supplier-b.client';

@Module({
  imports: [SuppliersHttpModule, ConfigModule],
  providers: [SupplierBClient],
  exports: [SupplierBClient],
})
export class SupplierBModule {}
