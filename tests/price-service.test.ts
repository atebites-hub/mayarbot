import { PriceService } from '../src/services/price-service';
import { MayaService } from '../src/services/maya-service';
import { UniswapService } from '../src/services/uniswap-service';
import { Logger } from '../src/utils/logger';
import { MayaPool } from '../src/types';

// Mock the logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Create partial mock implementations
const mockMayaService = {
  isChainHalted: jest.fn(),
  getPool: jest.fn(),
  getPools: jest.fn(),
  getInboundAddresses: jest.fn(),
  getCacaoUsdPrice: jest.fn(),
} as unknown as MayaService;

const mockUniswapService = {
  isPoolActive: jest.fn(),
  getTokenPrice: jest.fn(),
  getPool: jest.fn(),
  getCurrentGasPrice: jest.fn(),
} as unknown as UniswapService;

describe('PriceService', () => {
  let priceService: PriceService;

  beforeEach(() => {
    jest.clearAllMocks();
    priceService = new PriceService(mockMayaService, mockUniswapService, mockLogger);
  });

  it('should return null when trading is halted on Maya', async () => {
    // Arrange
    (mockMayaService.isChainHalted as jest.Mock).mockResolvedValue(true);
    (mockUniswapService.isPoolActive as jest.Mock).mockResolvedValue(true);

    // Act
    const result = await priceService.checkArbitrageOpportunity('ARB');

    // Assert
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Trading not active'));
  });

  it('should return null when trading is not active on Uniswap', async () => {
    // Arrange
    (mockMayaService.isChainHalted as jest.Mock).mockResolvedValue(false);
    (mockUniswapService.isPoolActive as jest.Mock).mockResolvedValue(false);

    // Act
    const result = await priceService.checkArbitrageOpportunity('ARB');

    // Assert
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Trading not active'));
  });

  it('should return null when price difference is below threshold', async () => {
    // Arrange
    (mockMayaService.isChainHalted as jest.Mock).mockResolvedValue(false);
    (mockUniswapService.isPoolActive as jest.Mock).mockResolvedValue(true);
    
    const mockPool: MayaPool = {
      asset: 'ARB.ARB',
      assetDepth: '1000',
      cacaoDepth: '1000',
      assetPrice: '1.0',
      assetPriceUSD: 1.0,
      status: 'available',
      units: '1000',
      volume24h: '10000',
    };
    
    (mockMayaService.getPool as jest.Mock).mockResolvedValue(mockPool);
    (mockUniswapService.getTokenPrice as jest.Mock).mockResolvedValue(1.01); // 1% difference, below default threshold

    // Act
    const result = await priceService.checkArbitrageOpportunity('ARB');

    // Assert
    expect(result).toBeNull();
  });

  it('should return arbitrage opportunity when price difference exceeds threshold', async () => {
    // Arrange
    (mockMayaService.isChainHalted as jest.Mock).mockResolvedValue(false);
    (mockUniswapService.isPoolActive as jest.Mock).mockResolvedValue(true);
    
    const mockPool: MayaPool = {
      asset: 'ARB.ARB',
      assetDepth: '1000',
      cacaoDepth: '1000',
      assetPrice: '1.0',
      assetPriceUSD: 1.0,
      status: 'available',
      units: '1000',
      volume24h: '10000',
    };
    
    (mockMayaService.getPool as jest.Mock).mockResolvedValue(mockPool);
    (mockUniswapService.getTokenPrice as jest.Mock).mockResolvedValue(1.05); // 5% difference, above default threshold

    // Act
    const result = await priceService.checkArbitrageOpportunity('ARB');

    // Assert
    expect(result).not.toBeNull();
    expect(result?.direction).toBe('MAYA_TO_UNISWAP');
    expect(result?.priceDifferencePercent).toBeCloseTo(-4.76, 1); // (1.0 - 1.05) / 1.05 * 100
  });
}); 