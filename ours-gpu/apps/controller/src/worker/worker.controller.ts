import { Controller, Get } from '@nestjs/common';
import { WorkerService } from './worker.service';

@Controller('worker')
export class WorkerController {
    constructor(private readonly WorkerService: WorkerService) {}

    @Get('workers')
    getWorkers() {
        return this.WorkerService.listWorkers();
    }

}
