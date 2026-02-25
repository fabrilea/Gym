/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User, MemberStatus } from './entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { QueryFailedError } from 'typeorm';

const mockUser: Partial<User> = {
  id: 'uuid-1',
  memberNumber: '001',
  firstName: 'John',
  lastName: 'Doe',
  status: MemberStatus.ACTIVE,
};

const queryBuilderMock = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  withDeleted: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[mockUser], 1]),
  getRawOne: jest.fn().mockResolvedValue({ maxNumber: '1' }),
};

const mockRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softRemove: jest.fn(),
};

const mockAuditService = { log: jest.fn() };

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    queryBuilderMock.getManyAndCount.mockResolvedValue([[mockUser], 1]);
    queryBuilderMock.getRawOne.mockResolvedValue({ maxNumber: '1' });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when user does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('uuid-999')).rejects.toThrow(NotFoundException);
    });

    it('should return a user when found', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findOne('uuid-1');
      expect(result).toEqual(mockUser);
    });
  });

  describe('create', () => {
    it('should throw ConflictException when cannot generate unique memberNumber', async () => {
      const uniqueViolation = new QueryFailedError(
        'INSERT INTO users ...',
        [],
        { code: '23505', detail: 'Key (memberNumber)=(000001) already exists.' } as any,
      );
      mockRepo.create.mockImplementation((payload: unknown) => payload);
      mockRepo.save.mockRejectedValue(uniqueViolation);

      await expect(service.create({ firstName: 'A', lastName: 'B' }, 'actor-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.save).toHaveBeenCalledTimes(5);
    });

    it('should create a user with auto-generated memberNumber', async () => {
      const createdUser = { ...mockUser, memberNumber: '000002' };
      mockRepo.create.mockImplementation((payload: unknown) => payload);
      mockRepo.save.mockResolvedValue(createdUser);
      mockAuditService.log.mockResolvedValue(undefined);

      const result = await service.create({ firstName: 'A', lastName: 'B' }, 'actor-1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'A', lastName: 'B', memberNumber: '000002' }),
      );
      expect(result).toEqual(createdUser);
    });
  });
});
