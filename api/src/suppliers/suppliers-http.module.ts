import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Registra o `HttpModule` (`@nestjs/axios`) uma única vez, com `baseURL` e `timeout` lidos do
 * `ConfigService` (`SUPPLIERS_BASE_URL` / `SUPPLIER_TIMEOUT_MS`). Reaproveitado por
 * `supplier-a`/`supplier-b`/`supplier-c`.
 */
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get<string>('SUPPLIERS_BASE_URL'),
        timeout: configService.get<number>('SUPPLIER_TIMEOUT_MS'),
      }),
    }),
  ],
  exports: [HttpModule],
})
export class SuppliersHttpModule {}
