import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SupplierAModule } from '../suppliers/supplier-a/supplier-a.module';
import { SupplierBModule } from '../suppliers/supplier-b/supplier-b.module';
import { SupplierCModule } from '../suppliers/supplier-c/supplier-c.module';
import { SearchController } from '../../presentation/search/search.controller';
import { SearchAggregatorService } from './search-aggregator.service';

@Module({
  imports: [SupplierAModule, SupplierBModule, SupplierCModule, ConfigModule],
  controllers: [SearchController],
  providers: [SearchAggregatorService],
  exports: [SearchAggregatorService],
})
export class SearchModule {}
