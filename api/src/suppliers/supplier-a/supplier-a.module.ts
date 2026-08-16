import { Module } from '@nestjs/common';

import { SuppliersHttpModule } from '../suppliers-http.module';
import { SupplierAClient } from './supplier-a.client';

@Module({
  imports: [SuppliersHttpModule],
  providers: [SupplierAClient],
  exports: [SupplierAClient],
})
export class SupplierAModule {}
