import { ConfigService } from '@nestjs/config';

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

class FakePrismaClient {
  options: unknown;

  constructor(options: unknown) {
    this.options = options;
  }

  $connect = mockConnect;
  $disconnect = mockDisconnect;
}

const mockPrismaPg = jest.fn();

jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: FakePrismaClient,
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: mockPrismaPg,
}));

// Import depois dos mocks acima, para que `PrismaService` extenda a classe fake.
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const databaseUrl = 'postgresql://user:pass@localhost:5432/db';
  let configService: { get: jest.Mock };
  let service: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService = {
      get: jest.fn().mockReturnValue(databaseUrl),
    };
    service = new PrismaService(configService as unknown as ConfigService);
  });

  it('constrói o adapter PrismaPg com a connectionString vinda do ConfigService (DATABASE_URL)', () => {
    expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
    expect(mockPrismaPg).toHaveBeenCalledTimes(1);
    expect(mockPrismaPg).toHaveBeenCalledWith({
      connectionString: databaseUrl,
    });
  });

  it('onModuleInit chama $connect exatamente uma vez', async () => {
    await service.onModuleInit();

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('onModuleDestroy chama $disconnect exatamente uma vez', async () => {
    await service.onModuleDestroy();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
