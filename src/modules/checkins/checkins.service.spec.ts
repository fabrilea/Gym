/// <reference types="jest" />
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CheckinsService } from './checkins.service';
import { Checkin } from './entities/checkin.entity';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';

const mockCheckinRepo = {
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const mockUsersService = {
  findOne: jest.fn(),
  findByDni: jest.fn(),
  findByMemberNumber: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

describe('CheckinsService', () => {
  let service: CheckinsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinsService,
        { provide: getRepositoryToken(Checkin), useValue: mockCheckinRepo },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CheckinsService>(CheckinsService);
    jest.clearAllMocks();
  });

  it('registra asistencia cuando el socio existe y no superó el límite semanal', async () => {
    mockUsersService.findByMemberNumber.mockResolvedValue({
      id: 'user-1',
      plan: '2_DIAS',
    });
    mockCheckinRepo.count.mockResolvedValue(1);
    mockCheckinRepo.create.mockImplementation((payload: unknown) => ({
      id: 'checkin-1',
      ...(payload as object),
    }));
    mockCheckinRepo.save.mockImplementation(async (payload: any) => payload);
    mockAuditService.log.mockResolvedValue(undefined);

    const result = await service.create(
      {
        memberNumber: '000001',
        checkinAt: '2026-03-10T15:00:00.000Z',
      },
      'operator-1',
    );

    expect(result.id).toBe('checkin-1');
    expect(mockCheckinRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza asistencia cuando se supera el límite semanal del plan', async () => {
    mockUsersService.findByMemberNumber.mockResolvedValue({
      id: 'user-2',
      plan: '2_DIAS',
    });
    mockCheckinRepo.count.mockResolvedValue(2);

    await expect(
      service.create(
        {
          memberNumber: '000002',
          checkinAt: '2026-03-10T15:00:00.000Z',
        },
        'operator-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('permite asistencias ilimitadas para plan pase libre', async () => {
    mockUsersService.findByMemberNumber.mockResolvedValue({
      id: 'user-3',
      plan: 'PASE_LIBRE',
    });
    mockCheckinRepo.create.mockImplementation((payload: unknown) => ({
      id: 'checkin-2',
      ...(payload as object),
    }));
    mockCheckinRepo.save.mockImplementation(async (payload: any) => payload);
    mockAuditService.log.mockResolvedValue(undefined);

    const result = await service.create(
      {
        memberNumber: '000003',
        checkinAt: '2026-03-10T15:00:00.000Z',
      },
      'operator-1',
    );

    expect(mockCheckinRepo.count).not.toHaveBeenCalled();
    expect(result.id).toBe('checkin-2');
  });
});
