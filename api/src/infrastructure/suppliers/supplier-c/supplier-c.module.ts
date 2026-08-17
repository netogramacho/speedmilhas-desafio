import { Module } from '@nestjs/common';

import { SuppliersHttpModule } from '../suppliers-http.module';
import { SupplierCClient } from './supplier-c.client';

@Module({
  imports: [SuppliersHttpModule],
  providers: [SupplierCClient],
  exports: [SupplierCClient],
})
export class SupplierCModule {}
