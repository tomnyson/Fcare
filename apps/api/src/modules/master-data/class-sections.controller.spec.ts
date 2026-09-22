import { Test, TestingModule } from '@nestjs/testing';
import { ClassSectionsController } from './master-data.controller';
import { ClassSectionsService } from './class-sections.service';
import type { AuthUser } from '../../common/types/auth-user';

describe('ClassSectionsController — bổ sung sinh viên', () => {
  let controller: ClassSectionsController;
  const mockService = {
    addStudentsToSection: jest.fn().mockResolvedValue({ addedCount: 2 }),
    addStudentsFromExcel: jest.fn().mockResolvedValue({ addedCount: 2 }),
  };

  const mockUser: AuthUser = {
    id: 'user-1',
    roles: ['ADMIN'],
    departmentId: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassSectionsController],
      providers: [{ provide: ClassSectionsService, useValue: mockService }],
    }).compile();

    controller = module.get<ClassSectionsController>(ClassSectionsController);
  });

  it('gọi service.addStudentsToSection khi gọi POST :id/students', async () => {
    const dto = {
      students: [{ studentCode: 'PK04346', fullName: 'Hoàng Lê Minh Sang' }],
    };
    const res = await controller.addStudents(mockUser, 'sec-1', dto);
    expect(mockService.addStudentsToSection).toHaveBeenCalledWith(
      mockUser,
      'sec-1',
      dto.students,
    );
    expect(res).toEqual({ addedCount: 2 });
  });

  it('gọi service.addStudentsFromExcel khi upload file excel', async () => {
    const mockFile = {
      buffer: Buffer.from('test'),
      originalname: 'test.xlsx',
    } as Express.Multer.File;
    const res = await controller.uploadStudentsExcel(mockUser, 'sec-1', mockFile);
    expect(mockService.addStudentsFromExcel).toHaveBeenCalledWith(
      mockUser,
      'sec-1',
      mockFile.buffer,
    );
    expect(res).toEqual({ addedCount: 2 });
  });
});
