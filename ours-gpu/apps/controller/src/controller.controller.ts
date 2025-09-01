import { Controller, Get } from '@nestjs/common';
import { ControllerService } from './controller.service';

@Controller()
export class ControllerController {
  constructor(private readonly controllerService: ControllerService) {}

  @Get()
  getHello(): string {
    return this.controllerService.getHello();
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
