/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Operator, OperatorRole } from './entities/operator.entity';

const mockRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mocked_token'),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test_value'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(Operator), useValue: mockRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should throw UnauthorizedException when operator not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.login({ dni: '30123456', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hash = await bcrypt.hash('correct', 10);
      mockRepo.findOne.mockResolvedValue({
        id: '1',
        dni: '30123456',
        role: OperatorRole.ADMIN,
        passwordHash: hash,
      });
      await expect(service.login({ dni: '30123456', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return tokens on valid credentials', async () => {
      const hash = await bcrypt.hash('correct', 10);
      const op = { id: '1', dni: '30123456', role: OperatorRole.ADMIN, passwordHash: hash };
      mockRepo.findOne.mockResolvedValue(op);
      mockRepo.update.mockResolvedValue({});

      const result = await service.login({ dni: '30123456', password: 'correct' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });
});
