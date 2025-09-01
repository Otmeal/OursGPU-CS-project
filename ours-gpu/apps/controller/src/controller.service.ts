import { Injectable } from '@nestjs/common';

@Injectable()
export class ControllerService {
  getHello(): string {
    return 'Hello World!';
  }
}
