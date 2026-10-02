import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401 - register all tables
from app.models.notification import Notification
from app.models.user import User
from app.services.notification_service import get_notifications, get_unread_count, mark_all_as_read


class NotificationBulkReadTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = User(username='bulk-owner', password_hash='x', nickname='通知主人', role='writer')
        self.other = User(username='bulk-other', password_hash='x', nickname='其他人', role='writer')
        self.db.add_all([self.owner, self.other])
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_read_all_updates_every_unread_record_only_for_owner(self):
        self.db.add_all([Notification(user_id=self.owner.id, title=f'提醒 {index}', is_read=index == 0) for index in range(251)])
        self.db.add(Notification(user_id=self.other.id, title='别人的通知', is_read=False))
        self.db.commit()
        self.assertEqual(len(get_notifications(self.db, self.owner.id, limit=200)), 200)
        self.assertEqual(get_unread_count(self.db, self.owner.id), 250)
        self.assertEqual(mark_all_as_read(self.db, self.owner.id), 250)
        self.assertEqual(get_unread_count(self.db, self.owner.id), 0)
        self.assertEqual(get_unread_count(self.db, self.other.id), 1)
        self.assertEqual(self.db.query(Notification).filter_by(user_id=self.owner.id).count(), 251)
        self.assertEqual(mark_all_as_read(self.db, self.owner.id), 0)


if __name__ == '__main__':
    unittest.main()
