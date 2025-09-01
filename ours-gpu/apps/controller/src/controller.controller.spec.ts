import { Test, TestingModule } from '@nestjs/testing';
import { ControllerController } from './controller.controller';
import { ControllerService } from './controller.service';

describe('ControllerController', () => {
  let controllerController: ControllerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ControllerController],
      providers: [ControllerService],
    }).compile();

    controllerController = app.get<ControllerController>(ControllerController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(controllerController.getHello()).toBe('Hello World!');
    });
  });
});
