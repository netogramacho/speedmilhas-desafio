import { Test } from '@nestjs/testing';

import { AggregatedSearchResult } from '../../domain/search/types';
import { SearchAggregatorService } from '../../infrastructure/search/search-aggregator.service';
import { SearchRequestDto } from './dto/search-request.dto';
import { mapAggregatedResultToResponse } from './search-response.mapper';
import { SearchController } from './search.controller';

describe('SearchController', () => {
  let searchAggregatorService: { search: jest.Mock };
  let controller: SearchController;

  const dto: SearchRequestDto = Object.assign(new SearchRequestDto(), {
    origin: 'GRU',
    destination: 'GIG',
    date: '2026-08-15',
  });

  const aggregatedResult: AggregatedSearchResult = {
    quotes: [
      { miles: 18500, taxesBrl: 75.51, carrier: 'GOL', supplier: 'supplier-a' },
    ],
    outcomes: [
      { supplier: 'supplier-a', status: 'ok', quotesCount: 1 },
      { supplier: 'supplier-b', status: 'ok', quotesCount: 0 },
      { supplier: 'supplier-c', status: 'ok', quotesCount: 0 },
    ],
  };

  beforeEach(async () => {
    searchAggregatorService = {
      search: jest.fn().mockResolvedValue(aggregatedResult),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        {
          provide: SearchAggregatorService,
          useValue: searchAggregatorService,
        },
      ],
    }).compile();

    controller = moduleRef.get(SearchController);
  });

  it('chama searchAggregatorService.search com { origin, destination, date } extraídos do dto', async () => {
    await controller.search(dto);

    expect(searchAggregatorService.search).toHaveBeenCalledWith({
      origin: 'GRU',
      destination: 'GIG',
      date: '2026-08-15',
    });
  });

  it('resposta é exatamente mapAggregatedResultToResponse(resultado agregado)', async () => {
    const response = await controller.search(dto);

    expect(response).toEqual(mapAggregatedResultToResponse(aggregatedResult));
  });
});
