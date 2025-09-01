import { Injectable } from '@nestjs/common';

type Worker = { id: string; orgId: string; concurrency: number; lastSeen: number; running: number; };
type Job = { jobId: string; target: string; difficulty: number; status: 'REQUESTED'|'SCHEDULED'|'PROCESSING'|'DONE'|'FAILED'; workerId?: string; };

@Injectable()
export class WorkerService {
  private workers = new Map<string, Worker>();
  private jobQueue: Job[] = [];
  private jobs = new Map<string, Job>();

  register(w: Worker) { this.workers.set(w.id, { ...w, lastSeen: Date.now() }); }
  heartbeat(id: string, running: number) {
    const w = this.workers.get(id); if (!w) return false;
    w.lastSeen = Date.now(); w.running = running; return true;
  }
  enqueue(job: Job) { this.jobQueue.push(job); this.jobs.set(job.jobId, job); }
  pullJob(workerId: string): Job | undefined {
    const w = this.workers.get(workerId); if (!w) return;
    const idx = this.jobQueue.findIndex(j => !j.workerId);
    if (idx < 0) return;
    const j = this.jobQueue.splice(idx, 1)[0];
    j.workerId = workerId; j.status = 'SCHEDULED';
    this.jobs.set(j.jobId, j);
    return j;
  }
  report(jobId: string, ok: boolean) {
    const j = this.jobs.get(jobId); if (!j) return false;
    j.status = ok ? 'DONE' : 'FAILED'; this.jobs.set(jobId, j); return true;
  }

  listWorkers() { return [...this.workers.values()]; }
  listJobs() { return [...this.jobs.values()]; }
}
