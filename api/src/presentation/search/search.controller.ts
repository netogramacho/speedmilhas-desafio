import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { SearchAggregatorService } from '../../infrastructure/search/search-aggregator.service';
import { SearchRequestDto } from './dto/search-request.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { mapAggregatedResultToResponse } from './search-response.mapper';

@Controller()
export class SearchController {
  constructor(
    private readonly searchAggregatorService: SearchAggregatorService,
  ) {}

  /**
   * `ValidationPipe` global (`app.module.ts`) já validou `dto` antes deste método ser chamado —
   * se algum campo fosse inválido, a requisição nunca chegaria aqui, e nenhum fornecedor teria
   * sido chamado. `@HttpCode(HttpStatus.OK)` sobrescreve o 201 padrão de POST.
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(@Body() dto: SearchRequestDto): Promise<SearchResponseDto> {
    const result = await this.searchAggregatorService.search({
      origin: dto.origin,
      destination: dto.destination,
      date: dto.date,
    });

    return mapAggregatedResultToResponse(result);
  }
}
