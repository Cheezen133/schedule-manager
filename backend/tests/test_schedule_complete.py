from datetime import datetime, timedelta
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401 - register all tables
from app.models.schedule import Schedule
from app.models.user import User
from app.routers.schedules import complete


class ScheduleCompleteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = User(username='complete-owner', nickname='日程主人', password_hash='x', role='writer')
        self.outsider = User(username='complete-outsider', nickname='其他人', password_hash='x', role='writer')
        self.db.add_all([self.owner, self.outsider])
        self.db.flush()
        start = datetime(2026, 10, 2, 1, 0)
        self.schedule = Schedule(title='完成状态', start_time=start, end_time=start + timedelta(hours=1), status='confirmed', created_by=self.owner.id, visibility='private')
        self.db.add(self.schedule)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_completion_can_be_toggled_and_restores_unfinished_state(self):
        completed = complete(self.schedule.id, self.db, self.owner)['data']
        self.assertTrue(completed['is_completed'])
        self.assertIsNotNone(completed['completed_at'])
        unfinished = complete(self.schedule.id, self.db, self.owner)['data']
        self.assertFalse(unfinished['is_completed'])
        self.assertIsNone(unfinished['completed_at'])

    def test_pending_or_unrelated_user_cannot_change_completion(self):
        with self.assertRaises(HTTPException) as outsider_error:
            complete(self.schedule.id, self.db, self.outsider)
        self.assertEqual(outsider_error.exception.status_code, 403)
        self.schedule.status = 'pending'
        self.db.commit()
        with self.assertRaises(HTTPException) as pending_error:
            complete(self.schedule.id, self.db, self.owner)
        self.assertEqual(pending_error.exception.status_code, 400)
        self.assertFalse(self.schedule.is_completed)


if __name__ == '__main__':
    unittest.main()
