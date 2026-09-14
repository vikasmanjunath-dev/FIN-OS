"""
Automated ingestion scheduler — Phase 7 (July 2026).

Wraps APScheduler's BackgroundScheduler so ingestion jobs run on a clock
rather than requiring a manual POST trigger. The scheduler enqueues jobs
into the existing RQ queue (`rag-ingestion`) instead of running ingestion
inline — same isolation as the existing async endpoints, same SimpleWorker
macOS fork-crash fix already in start-all.sh.

Schedule:
  News RSS      — every 2 hours (financial news is stale within hours)
  SEBI/RBI      — every Sunday 2:00am IST (regulators publish weekly batches)
  IRDAI/PFRDA   — every Sunday 2:30am IST (offset 30min to avoid Qdrant contention)

The scheduler is started in server.py's @app.on_event("startup") and stopped
on shutdown. It is deliberately NOT started when this module is imported
standalone (e.g. from evaluation scripts) — only start_scheduler() triggers it.

Health: get_scheduler_status() returns next_run times, surfaced in GET /api/health.
"""
from __future__ import annotations
import logging

import redis
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
import pytz

import config
import jobs

logger = logging.getLogger(__name__)

IST = pytz.timezone("Asia/Kolkata")

_scheduler: BackgroundScheduler | None = None
_rq_redis: redis.Redis | None = None


def _get_rq_redis() -> redis.Redis:
    global _rq_redis
    if _rq_redis is None:
        _rq_redis = redis.Redis(host=config.REDIS_HOST, port=config.REDIS_PORT)
    return _rq_redis


def _enqueue(job_func, *args, **kwargs):
    from rq import Queue
    q = Queue("rag-ingestion", connection=_get_rq_redis())
    try:
        q.enqueue(job_func, *args, **kwargs, job_timeout="10m")
        logger.info(f"[scheduler] enqueued {job_func.__name__}")
    except Exception as e:
        logger.error(f"[scheduler] failed to enqueue {job_func.__name__}: {e}")


# ── Scheduled job wrappers ───────────────────────────────────────────────────
# All scheduled runs use incremental=True: skip re-embedding unchanged chunks.
# Manual POST /api/ingest/* triggers use incremental=False (default) for a
# clean full re-index.

def _news_job():        _enqueue(jobs.ingest_news_job)  # news is always incremental
def _sebi_job():        _enqueue(jobs.ingest_sebi_circulars_job,  10, incremental=True)
def _rbi_job():         _enqueue(jobs.ingest_rbi_notifications_job, 10, incremental=True)
def _irdai_job():       _enqueue(jobs.ingest_irdai_circulars_job,  10, incremental=True)
def _pfrda_job():       _enqueue(jobs.ingest_pfrda_circulars_job,  10, incremental=True)
def _finos_pages_job(): _enqueue(jobs.ingest_finos_pages_job, incremental=True)


def start_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        return

    _scheduler = BackgroundScheduler(timezone=IST)

    # News every 2 hours — financial news is meaningfully stale after a few hours.
    # No immediate first-run: boot is already slow (~15-25s for model warmup);
    # the first scheduled run fires 2h after startup, which is fine for a dev machine.
    _scheduler.add_job(
        _news_job,
        trigger=IntervalTrigger(hours=2),
        id="sched_news",
        replace_existing=True,
    )

    # SEBI + RBI — Sunday 2:00am IST
    for job_id, func in [("sched_sebi", _sebi_job), ("sched_rbi", _rbi_job)]:
        _scheduler.add_job(
            func,
            trigger=CronTrigger(day_of_week="sun", hour=2, minute=0, timezone=IST),
            id=job_id,
            replace_existing=True,
        )

    # IRDAI + PFRDA — Sunday 2:30am IST (30-min offset to avoid Qdrant contention)
    for job_id, func in [("sched_irdai", _irdai_job), ("sched_pfrda", _pfrda_job)]:
        _scheduler.add_job(
            func,
            trigger=CronTrigger(day_of_week="sun", hour=2, minute=30, timezone=IST),
            id=job_id,
            replace_existing=True,
        )

    # FIN-OS pages — Sunday 3:00am IST (after regulatory batch)
    _scheduler.add_job(
        _finos_pages_job,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=0, timezone=IST),
        id="sched_finos_pages",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("[scheduler] started — news every 2h, regulations Sunday 2-3am IST")
    print("[scheduler] started — news every 2h, regulations Sunday 2-3am IST")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[scheduler] stopped")


def get_scheduler_status() -> dict:
    """Returns next scheduled run times for each job — surfaced in /api/health."""
    if not _scheduler or not _scheduler.running:
        return {"running": False}

    jobs_status = {}
    for job in _scheduler.get_jobs():
        next_run = job.next_run_time
        jobs_status[job.id] = next_run.isoformat() if next_run else None

    return {"running": True, "next_runs": jobs_status}
