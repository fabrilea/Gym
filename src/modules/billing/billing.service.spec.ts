/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { MemberPayment, PaymentStatus } from './entities/member-payment.entity';
import { MemberPlanPeriod, PlanPeriodStatus } from './entities/member-plan-period.entity';
import { User, MemberStatus } from '../users/entities/user.entity';
import { Checkin } from '../checkins/entities/checkin.entity';
import { ExportJob } from '../exports/entities/export-job.entity';
import { AuditService } from '../audit/audit.service';

const mockPaymentRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const planPeriodQb = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
};

const mockPlanPeriodRepo = {
  createQueryBuilder: jest.fn(() => planPeriodQb),
  create: jest.fn(),
  save: jest.fn(),
};

const userQb = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(),
};

const mockUserRepo = {
  createQueryBuilder: jest.fn(() => userQb),
  findOne: jest.fn(),
};

const mockCheckinRepo = {
  find: jest.fn(),
};

const mockExportJobRepo = {
  create: jest.fn(),
  save: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getRepositoryToken(MemberPayment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(MemberPlanPeriod), useValue: mockPlanPeriodRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Checkin), useValue: mockCheckinRepo },
        { provide: getRepositoryToken(ExportJob), useValue: mockExportJobRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    jest.clearAllMocks();
  });

  it('mantiene alumnos al consultar un nuevo mes sin pagos previos', async () => {
    userQb.getManyAndCount.mockResolvedValue([
      [
        {
          id: 'user-1',
          memberNumber: '000001',
          firstName: 'Ana',
          lastName: 'Perez',
          dni: '12345678',
          status: MemberStatus.ACTIVE,
          plan: '2_DIAS',
          planExpiresAt: new Date('2026-02-28T00:00:00.000Z'),
        },
      ],
      1,
    ]);
    mockPaymentRepo.find.mockResolvedValue([]);
    planPeriodQb.getMany.mockResolvedValue([]);
    mockCheckinRepo.find.mockResolvedValue([]);

    const result = await service.getMonthlyStatus({ monthKey: '2026-03', page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].memberNumber).toBe('000001');
    expect(result.data[0].monthKey).toBe('2026-03');
    expect(result.data[0].paymentStatus).toBe(PaymentStatus.UNPAID);
  });

  it('permite renovar plan con un nuevo período luego del vencimiento', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'user-1' });
    mockPlanPeriodRepo.create.mockImplementation((payload: unknown) => payload);
    mockPlanPeriodRepo.save.mockImplementation(async (payload: any) => ({
      id: 'period-1',
      ...payload,
    }));
    mockAuditService.log.mockResolvedValue(undefined);

    const result = await service.createPlanPeriod(
      {
        userId: 'user-1',
        planName: 'Mensual',
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        status: PlanPeriodStatus.ACTIVE,
      },
      'operator-1',
    );

    expect(mockPlanPeriodRepo.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('period-1');
    expect(result.userId).toBe('user-1');
    expect(result.status).toBe(PlanPeriodStatus.ACTIVE);
  });
});
