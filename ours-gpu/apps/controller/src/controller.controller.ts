import { Controller, Get } from '@nestjs/common';
import { ChainService } from '@ours-gpu/shared';
import { ControllerService } from './controller.service';

@Controller()
export class ControllerController {
  constructor(
    private readonly controllerService: ControllerService,
    private readonly chain: ChainService,
  ) {}

  @Get()
  getHello(): string {
    return this.controllerService.getHello();
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('wallet')
  async wallet() {
    const address = this.chain.getAddress();
    const chainId = await this.chain.getPublicClient().getChainId();
    return { address, chainId };
  }
}
